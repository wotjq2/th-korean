// 시험용: 번역 도우미 엔진(line-helper/engine.js)을 띄울 때 `node -r` 로 먼저 불러 인터넷을 막는다.
// 구글 번역은 ENGINE_MT=ok 면 가짜 답('<원문>?API', load.js 와 같은 꼴), 아니면 막힌 구글(429 'Sorry' 쪽).
// 그 밖의 주소(GitHub 스크립트·용어집·설정)는 404 — 엔진은 TH_KOREAN_SRC 의 스크립트를 쓴다.
'use strict';

// 진짜 구글처럼 한국어가 아닌 말로 옮긴 답에는 한글이 남지 않게('k글자수')
function fakeMt(url) {
  const ko = /[?&]tl=ko(&|$)/.test(url);
  const qs = [...url.matchAll(/[?&]q=([^&]*)/g)]
    .map((m) => decodeURIComponent(m[1].replace(/\+/g, ' ')))
    .map((q) => (ko ? q : q.replace(/[ㄱ-ㆎ가-힣]+/g, (h) => `k${h.length}`)));
  if (url.includes('translate_a/t')) return JSON.stringify(qs.map((q) => q + '?API'));
  const q = qs[0] || '';
  return JSON.stringify([[[q.split('\n').map((l) => l + '?API').join('\n'), q]]]);
}

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('translate.googleapis.com')) {
    if (process.env.ENGINE_MT === 'ok') return new Response(fakeMt(u), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('<html><body>Sorry... your computer may be sending automated queries.</body></html>', {
      status: 429,
      headers: { 'content-type': 'text/html' },
    });
  }
  return new Response('not found', { status: 404 });
};
