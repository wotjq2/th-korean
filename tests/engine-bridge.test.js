// 번역 다리(1.36.0) — 구글이 막히면 번역 도우미 엔진이 크롬 내장 번역기를 빌려 쓴다.
// 엔진(line-helper/engine.js)을 임시 폴더에 복사해 진짜로 띄우고(-r tests/lib/engine-net.js 로 인터넷을 막는다),
// 크롬 쪽(ChromeLink.cs MtBridge + background.js)은 같은 꼴로 답하는 가짜 pipe 로 대신한다.
// 진짜 크롬·exe 로 잇는 시험은 손으로(2026-11-23 크롬 157).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { ROOT } = require('./lib/load');

const SCRIPT = process.env.TEST_SCRIPT ? path.resolve(process.env.TEST_SCRIPT) : path.join(ROOT, 'th-korean.user.js');
const WIN = process.platform === 'win32';

// 가짜 크롬 내장 번역기 — 진짜처럼 한국어 답에는 원문 글자가 남지 않고, 한국어가 아닌 답에는 한글이 남지 않는다.
function fakeBridge(opt = {}) {
  const name = `th-korean-mt-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const calls = [];
  const server = net.createServer((sock) => {
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const q = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        calls.push(q.op + (q.from ? ` ${q.from}>${q.to}` : '') + (q.text ? `|${q.text}` : ''));
        const pair = `${q.from}>${q.to}`;
        let r;
        if (q.op === 'avail') r = { ok: true, avail: (opt.pairs || {})[pair] || 'unavailable' };
        else if (q.op === 'create') r = (opt.pairs || {})[pair] ? { ok: true } : { ok: false, error: 'unavailable' };
        else if (q.op === 'tr') {
          r = { ok: true, out: q.to === 'ko' ? `내장${q.from}${q.text.length}` : `[BI-${q.to}]` + q.text.replace(/[ㄱ-ㆎ가-힣]+/g, (m) => `k${m.length}`) };
        } else if (q.op === 'avail-ld') r = { ok: true, avail: 'available' };
        else if (q.op === 'create-ld') r = { ok: true };
        else if (q.op === 'detect') r = { ok: true, list: [{ detectedLanguage: opt.detect || 'vi', confidence: 0.99 }] };
        else r = { ok: false, error: 'op' };
        sock.write(JSON.stringify({ id: q.id, ...r }) + '\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(`\\\\.\\pipe\\${name}`, () => resolve({ name, calls, close: () => new Promise((r) => server.close(r)) })));
}

// 엔진을 임시 폴더에서(그 폴더의 data\ 에 저장한다 — 이 저장소의 도우미 사본을 건드리지 않게)
function startEngine(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-bridge-'));
  fs.copyFileSync(process.env.TEST_ENGINE ? path.resolve(process.env.TEST_ENGINE) : path.join(ROOT, 'line-helper/engine.js'), path.join(dir, 'engine.js')); // TEST_ENGINE = 망가뜨린 사본
  const p = spawn(process.execPath, ['-r', path.join(__dirname, 'lib/engine-net.js'), path.join(dir, 'engine.js')], {
    env: { ...process.env, TH_KOREAN_SRC: SCRIPT, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  let next = 0;
  const wait = new Map();
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    out += d;
    let i;
    while ((i = out.indexOf('\n')) >= 0) {
      const r = JSON.parse(out.slice(0, i));
      out = out.slice(i + 1);
      const w = wait.get(r.id);
      if (w) w(r);
    }
  });
  p.stderr.setEncoding('utf8');
  p.stderr.on('data', (d) => (err += d));
  const call = (op, lang, text, ms = 20000) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const t = setTimeout(() => reject(new Error(`엔진 답 없음(${op}): ${err.slice(-500)}`)), ms);
      wait.set(id, (r) => {
        clearTimeout(t);
        wait.delete(id);
        resolve(r);
      });
      p.stdin.write(JSON.stringify({ id, op, lang, text }) + '\n');
    });
  const stop = () =>
    new Promise((resolve) => {
      p.once('exit', () => {
        fs.rmSync(dir, { recursive: true, force: true });
        resolve();
      });
      p.stdin.end();
      setTimeout(() => p.kill(), 3000).unref();
    });
  return { call, stop, stderr: () => err };
}

const skip = WIN ? false : 'named pipe 는 윈도우 시험';

test('구글이 막히면 크롬 내장 번역기로 보낸다(LINE 보내기 한→태)', { skip }, async () => {
  const b = await fakeBridge({ pairs: { 'ko>th': 'downloadable' } });
  const e = startEngine({ TH_MT_PIPE: b.name });
  try {
    const r = await e.call('to', 'th', '다음 주 회의 자료를 이메일로 보내 주세요');
    assert.equal(r.ok, true, `실패: ${r.err} / ${e.stderr().slice(-400)}`);
    assert.match(r.out, /^\[BI-th\]/, r.out);
    assert.doesNotMatch(r.out, /[가-힣]/);
    // 확장 service worker 는 누름 없이 모델을 받는다 — 'downloadable' 이어도 만든다
    assert.ok(b.calls.includes('create ko>th'), b.calls.join(' / '));
    // 화면 안내(toast)는 페이지가 없는 엔진에서 기록 한 줄로만 — 오류로 번역을 버리지 않는다
    assert.match(e.stderr(), /\[알림\] 구글 번역이 잠시 막혀 크롬 내장 번역기로/);
  } finally {
    await e.stop();
    await b.close();
  }
});

test('받은 말(태→한)도, 글자로 언어를 모르면 크롬 언어 알아보기로(베트남어)', { skip }, async () => {
  const b = await fakeBridge({ pairs: { 'th>ko': 'available', 'vi>ko': 'available' } });
  const e = startEngine({ TH_MT_PIPE: b.name });
  try {
    const th = await e.call('ko', '', 'พรุ่งนี้ส่งเอกสารการประชุมทางอีเมลให้หน่อยนะ');
    assert.equal(th.ok, true, `실패: ${th.err}`);
    assert.match(th.out, /내장th\d+/);
    const vi = await e.call('ko', '', 'Ngày mai gửi tài liệu cuộc họp qua email nhé');
    assert.equal(vi.ok, true, `실패: ${vi.err}`);
    assert.match(vi.out, /내장vi\d+/);
    assert.ok(b.calls.some((c) => c.startsWith('detect|')), b.calls.join(' / '));
  } finally {
    await e.stop();
    await b.close();
  }
});

test('구글이 되면 다리에 묻지도 않는다', { skip }, async () => {
  const b = await fakeBridge({ pairs: { 'ko>th': 'available' } });
  const e = startEngine({ TH_MT_PIPE: b.name, ENGINE_MT: 'ok' });
  try {
    const r = await e.call('to', 'en', '다음 주 회의 자료를 이메일로 보내 주세요');
    assert.equal(r.ok, true, `실패: ${r.err}`);
    assert.match(r.out, /\?API/);
    assert.deepEqual(b.calls, []);
  } finally {
    await e.stop();
    await b.close();
  }
});

test('내장 번역기에 없는 언어(라오어)·크롬이 꺼져 있으면 예전처럼 실패만 — 엔진은 그대로 돈다', { skip }, async () => {
  const b = await fakeBridge({ pairs: {} });
  const e = startEngine({ TH_MT_PIPE: b.name });
  try {
    const lo = await e.call('to', 'lo', '다음 주 회의 자료를 이메일로 보내 주세요');
    assert.equal(lo.ok, false);
    assert.ok(b.calls.includes('avail ko>lo'), b.calls.join(' / '));
    assert.ok(!b.calls.some((c) => c.startsWith('create')), '없는 쌍을 만들려 함');
  } finally {
    await e.stop();
    await b.close();
  }
  const off = startEngine({ TH_MT_PIPE: 'th-korean-mt-test-nobody-here' });
  try {
    const t0 = Date.now();
    const r = await off.call('to', 'th', '다음 주 회의 자료를 이메일로 보내 주세요');
    assert.equal(r.ok, false);
    assert.ok(Date.now() - t0 < 15000, `너무 오래 기다림 ${Date.now() - t0} ms`);
    const again = await off.call('to', 'vi', '고맙습니다 내일 봐요');
    assert.equal(typeof again.ok, 'boolean', '엔진이 멈춤');
  } finally {
    await off.stop();
  }
});
