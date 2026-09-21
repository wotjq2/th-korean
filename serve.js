// th-korean.user.js 를 로컬에서만 제공하는 최소 서버.
// Tampermonkey 는 .user.js 로 끝나는 URL 을 열면 설치 화면을 띄운다.
const http = require('http');
const fs = require('fs');

const FILE = 'E:\\Production program\\web translator\\th-korean.user.js';
const PORT = 8765;

// 예전 주소(lazada-korean.user.js)로 들어와도 같은 파일을 준다.
// 통합 스크립트로 이름을 바꾸기 전에 설치한 것이 이 주소로 업데이트를 확인한다.
const PATHS = ['/th-korean.user.js', '/lazada-korean.user.js'];

http
  .createServer((req, res) => {
    if (!PATHS.some((p) => req.url.startsWith(p))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    let body;
    try {
      body = fs.readFileSync(FILE);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('파일을 읽을 수 없습니다: ' + e.message);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(body);
    console.log(new Date().toLocaleTimeString() + '  제공: ' + body.length + ' 바이트');
  })
  // 127.0.0.1 에만 바인딩 — 외부에서는 접근할 수 없다.
  .listen(PORT, '127.0.0.1', () => {
    console.log('http://localhost:' + PORT + '/th-korean.user.js 에서 대기 중');
  });
