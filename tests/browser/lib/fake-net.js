// 시험용 크롬이 닿는 모든 주소를 이 PC 의 https 서버 하나가 받는다(크롬 --host-resolver-rules 로 돌림).
//   쇼핑몰 주소   → tests/browser/pages 의 가짜 페이지
//   구글 번역     → 정해진 답(같은 말이면 늘 같은 답 — 진짜 구글은 부르지 않는다)
//   GitHub        → 이 저장소의 config.json 과 시험용 용어집
//   그 밖의 주소  → 크롬 쪽에서 막힌다(MAP * ~NOTFOUND)
// 인증서는 시험할 때마다 openssl 로 새로 만든다(크롬은 --ignore-certificate-errors).
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('../../lib/load');

function findOpenssl() {
  const list = [
    process.env.OPENSSL_PATH,
    'C:/Program Files/Git/usr/bin/openssl.exe',
    'C:/Program Files/Git/mingw64/bin/openssl.exe',
  ].filter(Boolean);
  for (const p of list) if (fs.existsSync(p)) return p;
  return 'openssl'; // PATH
}

function makeCert(dir) {
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  // 이 PC 의 OPENSSL_CONF 가 없는 파일을 가리켜도 되게 작은 설정을 직접 준다.
  const conf = path.join(dir, 'openssl.cnf');
  fs.writeFileSync(conf, '[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = lzk-test\n');
  execFileSync(findOpenssl(), ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-config', conf], {
    stdio: 'pipe',
    env: { ...process.env, OPENSSL_CONF: conf },
  });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

// 가짜 번역. 표에 있으면 그 답, 없으면 한국어로는 '번역:원문', 다른 말로는 '[언어]원문'.
const MT_TABLE = {
  'vi|무선 이어폰': 'tai nghe không dây',
  'vi|무선이어폰': 'tai nghe không dây',
  'vi|블루투스 스피커': 'loa bluetooth',
  'vi|블루투스스피커': 'loa bluetooth',
};
// 진짜 구글처럼: 같은 말로 옮기라면 그대로 돌려주고, 한국어가 아닌 말로 옮긴 답에는 한글이 남지 않는다.
// (한글을 남기면 확장의 화면 글 옮기기가 끝없이 다시 옮겨 페이지가 멈췄다 — 2026-11-21 시험에서 찾음)
// opts.keepHangul: 한국어 → 다른 말 답에 원래 한국어를 남긴다(구글이 이름 등을 그대로 둘 때) — 멈춤 시험용.
function mtOne(q, sl, tl, opts = {}) {
  const base = tl.split('-')[0];
  const k = `${base}|${q}`;
  if (MT_TABLE[k]) return MT_TABLE[k];
  if (guessLang(q).split('-')[0] === base) return q;
  if (opts.keepHangul && base !== 'ko' && /[가-힣]/.test(q)) return `${q} (${tl})`;
  if (base === 'ko') return `번역:${q}`;
  return `[${tl}]` + q.replace(/[ㄱ-ㆎ가-힣]+/g, (m) => `k${m.length}`);
}
function guessLang(q) {
  if (/[฀-๿]/.test(q)) return 'th';
  if (/[가-힣]/.test(q)) return 'ko';
  if (/[ạảãắằẳẵặấầẩẫậđẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹơưăâêô]/i.test(q)) return 'vi';
  if (/[一-鿿]/.test(q)) return 'zh-CN';
  return 'en';
}

function start({ pages, glossary }) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lzk-net-'));
  let tls;
  try {
    tls = makeCert(dir);
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`시험용 인증서를 못 만듦(openssl — Git 이 깔려 있어야 함): ${String(e.stderr || e.message).slice(0, 300)}`);
  }
  const hits = []; // 쇼핑몰 쪽 요청 (host + path)
  const mt = []; // 번역 요청 { sl, tl, q }
  const other = []; // 그 밖에 받은 요청
  // mtDelay: 구글 답을 이만큼(ms) 늦춘다 — 번역을 기다리는 사이에 페이지가 바뀌는 시험(generic-input)
  const opts = { keepHangul: false, blockMt: false, mtDelay: 0 }; // 시험 중에 바꾼다
  const server = https.createServer(tls, (req, res) => {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    const u = new URL(req.url, `https://${host}`);
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(body);
    };
    if (host === 'translate.googleapis.com') {
      if (opts.mtDelay && !req.lzkDelayed) {
        req.lzkDelayed = true;
        return setTimeout(() => server.emit('request', req, res), opts.mtDelay);
      }
      const qs = u.searchParams.getAll('q');
      const sl = u.searchParams.get('sl') || 'auto';
      const tl = u.searchParams.get('tl') || 'ko';
      for (const q of qs) mt.push({ sl, tl, q, path: u.pathname });
      // opts.blockMt: 구글이 막았을 때처럼(2026-10-27) 429 + HTML 'Sorry…' 안내 페이지
      if (opts.blockMt) return send(429, '<html><body><h1>Sorry...</h1><p>We\'re sorry... but your computer or network may be sending automated queries.</p></body></html>', 'text/html');
      if (u.pathname === '/translate_a/single') {
        const q = qs[0] || '';
        return send(200, JSON.stringify([[[mtOne(q, sl, tl, opts), q]], null, sl === 'auto' ? guessLang(q) : sl]), 'application/json');
      }
      const out = qs.map((q) => (sl === 'auto' ? [mtOne(q, sl, tl, opts), guessLang(q)] : mtOne(q, sl, tl, opts)));
      return send(200, JSON.stringify(out), 'application/json');
    }
    if (host === 'api.github.com' || host === 'raw.githubusercontent.com') {
      const p = decodeURIComponent(u.pathname);
      if (/\/th-korean\/(contents\/|main\/)config\.json$/.test(p)) return send(200, fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
      if (/th-korean-glossary\/(contents\/|main\/)glossary\.txt$/.test(p)) return send(200, glossary);
      if (/th-korean-glossary\//.test(p)) return send(200, '# 시험: 빈 파일\n');
      other.push(`${host}${p}`);
      return send(404, 'not found');
    }
    if (pages[host]) {
      hits.push(`${host}${decodeURIComponent(u.pathname + u.search)}`);
      return send(200, pages[host](u), 'text/html; charset=utf-8');
    }
    other.push(`${host}${u.pathname}`);
    send(404, 'not found');
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const mapped = [...Object.keys(pages), 'translate.googleapis.com', 'api.github.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'];
      // 앞에서부터 맞는 규칙을 쓴다 — 나머지 이름은 모두 '없는 주소'(진짜 인터넷으로 안 나간다)
      const hostRules = [...mapped.map((h) => `MAP ${h} 127.0.0.1:${port}`), 'MAP * ~NOTFOUND'].join(', ');
      resolve({
        port, hostRules, hits, mt, other, opts,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); fs.rmSync(dir, { recursive: true, force: true }); }),
      });
    })
  );
}

module.exports = { start, MT_TABLE };
