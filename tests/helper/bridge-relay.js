// 번역 다리(1.36.0) — 번역 도우미 exe 의 호스트 모드(ChromeLink.cs MtBridge) 시험. 크롬처럼 exe 를 네이티브 메시징 호스트로
// 띄우고, 엔진처럼 named pipe 에 붙어 물음이 크롬 쪽으로 그대로 가고 답이 물은 쪽으로 돌아오는지 본다.
//   node tests/helper/bridge-relay.js "<번역도우미.exe 경로>"
// 도우미 트레이 앱이 켜져 있어야 한다(꺼져 있으면 다리를 열지 않는다 — 그것도 답으로 확인). GitHub Actions 새 PC 설치 시험이
// 설치 직후 이것을 돌린다(.github/workflows/helper-install.yml). 실패가 하나라도 있으면 끝 코드 1.
'use strict';
const { spawn, execSync } = require('child_process');
const net = require('net');

const exe = process.argv[2];
if (!exe) {
  console.error('쓰는 법: node tests/helper/bridge-relay.js <번역도우미.exe>');
  process.exit(2);
}
const sid = execSync('powershell -NoProfile -c "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"').toString().trim();
// 이 PC 의 크롬이 이미 다리를 열어 두었으면(같은 이름의 pipe) 엔진 쪽 연결이 그 다리에 붙을 수 있다 — 시험 물음이 사용자의
// 크롬으로 간다(2026-11-23 실제로 그랬다). 그때는 시험하지 않고 알린다(크롬을 끄고 다시). 새 PC(GitHub Actions)에는 없다.
const procs = JSON.parse(
  execSync(
    'powershell -NoProfile -c "[Console]::OutputEncoding = [Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match \'chrome-extension://\' } | Select-Object ProcessId, Name) | ConvertTo-Json -Compress"'
  ).toString('utf8').trim() || '[]'
);
const others = [].concat(procs).filter((x) => x && /번역도우미|LineHelper/i.test(String(x.Name)));
if (others.length) {
  console.log(`건너뜀: 이 PC 의 크롬이 연 번역 다리(프로세스 ${others.map((x) => x.ProcessId).join(', ')})가 이미 있어 시험이 그쪽에 붙을 수 있습니다 — 크롬을 끄고 다시 돌리세요.`);
  process.exit(3);
}
const PIPE = '\\\\.\\pipe\\th-korean-mt-' + sid;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}`);
  if (!ok) fail++;
};

// 크롬 쪽(호스트의 stdin/stdout): 앞 4바이트 길이 + UTF-8 JSON
const p = spawn(exe, ['chrome-extension://agcbmglciepeobcgkniefahkaiigjkjk/', '--parent-window=0'], { stdio: ['pipe', 'pipe', 'inherit'] });
let acc = Buffer.alloc(0);
const fromHost = [];
let onHost = null;
p.stdout.on('data', (d) => {
  acc = Buffer.concat([acc, d]);
  while (acc.length >= 4) {
    const n = acc.readUInt32LE(0);
    if (acc.length < 4 + n) break;
    const m = JSON.parse(acc.subarray(4, 4 + n).toString('utf8'));
    acc = acc.subarray(4 + n);
    fromHost.push(m);
    if (onHost) onHost(m);
  }
});
const toHost = (o) => {
  const b = Buffer.from(JSON.stringify(o), 'utf8');
  const h = Buffer.alloc(4);
  h.writeUInt32LE(b.length);
  p.stdin.write(Buffer.concat([h, b]));
};
const nextHost = (ms = 10000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('호스트 답 없음')), ms);
    onHost = (m) => {
      clearTimeout(t);
      onHost = null;
      res(m);
    };
  });

// 엔진 쪽(pipe): 한 줄에 JSON 하나
function engine() {
  const s = net.connect(PIPE);
  let buf = '';
  const lines = [];
  let onLine = null;
  s.setEncoding('utf8');
  s.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      lines.push(l);
      if (onLine) onLine(l);
    }
  });
  const ready = new Promise((res, rej) => {
    s.once('connect', res);
    s.once('error', rej);
  });
  const next = (ms = 10000) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('pipe 답 없음')), ms);
      onLine = (m) => {
        clearTimeout(t);
        onLine = null;
        res(m);
      };
    });
  return { s, lines, ready, next, send: (o) => s.write((typeof o === 'string' ? o : JSON.stringify(o)) + '\n') };
}

(async () => {
  try {
    toHost({ cmd: 'mt-bridge' });
    const r = await nextHost(20000);
    console.log('호스트 답', JSON.stringify(r));
    check(r.bridge === 1, "새 도우미는 'mt-bridge' 를 안다(bridge:1)");
    check(r.running === true, '트레이 앱이 켜져 있어 다리를 연다(running:true)');
    if (!r.running) throw new Error('트레이 앱이 꺼져 있음 — 다리를 시험할 수 없음');
    let e1 = null;
    for (let i = 0; i < 20 && !e1; i++) {
      try {
        const e = engine();
        await e.ready;
        e1 = e;
      } catch {
        await sleep(250);
      }
    }
    check(!!e1, '엔진이 pipe 에 붙는다(이 사용자만 여는 통로)');
    if (!e1) throw new Error('pipe 없음');
    // 틀린 일·JSON 아닌 줄은 크롬에 가지 않는다
    e1.send({ id: 9, op: 'eval', text: 'x' });
    e1.send('not json');
    e1.send({ id: 1, op: 'tr', from: 'th', to: 'ko', text: 'สวัสดี "따옴표" \\ 줄\n바꿈', extra: 'drop' });
    const m = await nextHost();
    check(m.t === 'mt' && m.op === 'tr' && m.from === 'th' && m.to === 'ko' && m.text === 'สวัสดี "따옴표" \\ 줄\n바꿈' && !('extra' in m), '물음이 그대로 크롬에(틀린 일·JSON 아닌 줄은 버림, 모르는 칸 빠짐)');
    toHost({ t: 'mt-res', id: m.id, ok: true, out: '안녕하세요' });
    const a = await e1.next();
    check(a.id === 1 && a.ok === true && a.out === '안녕하세요' && !('t' in a), '답이 물은 번호로 돌아온다');
    // 실패 답의 까닭(1.36.3)도 그대로
    e1.send({ id: 2, op: 'tr', from: 'ko', to: 'vi', text: '내일 만나요' });
    const m2 = await nextHost();
    toHost({ t: 'mt-res', id: m2.id, ok: false, error: 'english' });
    const a2 = await e1.next();
    check(a2.id === 2 && a2.ok === false && a2.error === 'english', '실패 답의 까닭(english)도 그대로 돌아온다');
    // 두 물음을 거꾸로 답해도 짝이 맞는다 + 언어 알아보기 목록
    e1.send({ id: 'a', op: 'detect', text: 'Xin chào' });
    const q1 = await nextHost();
    e1.send({ id: 'b', op: 'avail', from: 'ko', to: 'lo' });
    const q2 = await nextHost();
    toHost({ t: 'mt-res', id: q2.id, ok: true, avail: 'unavailable' });
    toHost({ t: 'mt-res', id: q1.id, ok: true, list: [{ detectedLanguage: 'vi', confidence: 0.99 }] });
    const b1 = await e1.next();
    const b2 = await e1.next();
    check(b1.id === 'b' && b1.avail === 'unavailable' && b2.id === 'a' && b2.list[0].detectedLanguage === 'vi', '거꾸로 온 답도 짝이 맞는다');
    toHost({ t: 'mt-res', id: 123456, ok: true, out: 'x' });
    await sleep(300);
    check(e1.lines.length === 4, `모르는 번호의 답은 아무에게도 안 간다(${e1.lines.length})`);
    // 두 번째 엔진(다른 연결)
    const e2 = engine();
    await e2.ready;
    e2.send({ id: 1, op: 'tr', from: 'ko', to: 'th', text: '고양이' });
    const m3 = await nextHost();
    toHost({ t: 'mt-res', id: m3.id, ok: true, out: 'แมว' });
    const c2 = await e2.next();
    check(c2.id === 1 && c2.out === 'แมว' && e1.lines.length === 4, '두 번째 연결도 제 답만 받는다');
    e1.s.destroy();
    e2.s.destroy();
    p.stdin.end(); // 크롬이 통로를 닫았다
    for (let i = 0; i < 30 && p.exitCode === null; i++) await sleep(100);
    check(p.exitCode !== null, `크롬이 통로를 닫으면 호스트도 끝난다(끝 코드 ${p.exitCode})`);
  } catch (e) {
    console.log('FAIL', e.message);
    fail++;
  } finally {
    if (p.exitCode === null) p.kill();
    console.log(fail ? `실패 ${fail}` : '모두 통과');
    process.exit(fail ? 1 : 0);
  }
})();
