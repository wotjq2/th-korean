// 스크립트(th-korean.user.js)를 브라우저 없이 불러온다. 시험마다 새 칸(vm)이라 서로 섞이지 않는다.
//
//   const s = load({ host: 'shopee.vn', myLang: 'ko', config: {...}, glossary: '...' });
//   s.peek('shopMarket')('shopee')   ← 스크립트 안쪽 이름을 그대로 꺼내 쓴다
//
// 네트워크는 쓰지 않는다: 용어집 주소는 glossary 글을, 구글 번역은 가짜 답('<원문>?API')을 돌려준다.
// 스크립트를 일부러 망가뜨려 시험이 잡는지 볼 때는 TEST_SCRIPT=<다른 파일> 로 바꿔 부른다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = process.env.TEST_SCRIPT ? path.resolve(process.env.TEST_SCRIPT) : path.join(ROOT, 'th-korean.user.js');

let compiled = null;
function script() {
  if (compiled) return compiled;
  let src = fs.readFileSync(SCRIPT, 'utf8');
  const tail = src.lastIndexOf('})();');
  if (tail < 0) throw new Error('스크립트 끝(})();)을 못 찾음');
  // 맨 바깥 함수 안에서 이름으로 값을 꺼내는 구멍 하나만 낸다(엄격 모드의 직접 eval 은 바깥 이름을 읽는다).
  src = src.slice(0, tail) + '\nglobalThis.__peek = (n) => eval(n);\n' + src.slice(tail);
  compiled = new vm.Script(src, { filename: path.basename(SCRIPT) });
  return compiled;
}

// 구글 번역 가짜 답. translate_a/t 는 q 마다 한 칸, translate_a/single 은 [[[번역, 원문]]] 꼴.
function fakeMt(url) {
  const qs = [...url.matchAll(/[?&]q=([^&]*)/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, ' ')));
  if (url.includes('translate_a/t')) return JSON.stringify(qs.map((q) => q + '?API'));
  const q = qs[0] || '';
  return JSON.stringify([[[q.split('\n').map((l) => l + '?API').join('\n'), q]]]);
}

function load(opt = {}) {
  const host = opt.host || 'www.example.com';
  const store = { myLang: opt.myLang || 'ko', ...(opt.store || {}) };
  if (opt.config) store.remoteConfig = { text: typeof opt.config === 'string' ? opt.config : JSON.stringify(opt.config), at: Date.now() };
  const requests = [];
  const calls = []; // { method, url, headers, data } — 가짜 서버 시험이 요청 꼴을 본다
  const glossaryText = opt.glossary || '';

  const timers = [];
  const intervals = []; // 스크립트가 건 setInterval — 돌리지 않고 모아 둔다(시험이 tick() 으로 한 번씩 돌린다)
  const later = (fn, ms, ...a) => {
    const t = setTimeout(fn, ms, ...a);
    if (t.unref) t.unref(); // 스크립트가 걸어 둔 타이머 때문에 시험이 끝나지 않는 일이 없게
    timers.push(t);
    return t;
  };
  const noop = () => {};
  // 페이지에 붙인 요소(id 로 찾는다). 안내(lzk-toast)에 쓴 글은 toasts 에 차례로 남는다.
  const attached = new Map();
  const toasts = [];
  const el = () => {
    let text = '';
    const e = { style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop }, setAttribute: noop,
      getAttribute: () => null, appendChild: noop, append: noop, addEventListener: noop, removeEventListener: noop,
      querySelector: () => null, querySelectorAll: () => [], dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
      remove() { if (e.id) attached.delete(e.id); } };
    Object.defineProperty(e, 'textContent', {
      get: () => text,
      set: (v) => { text = String(v); if (e.id === 'lzk-toast') toasts.push(text); },
    });
    return e;
  };
  const body = el();
  body.appendChild = (n) => { if (n && n.id) attached.set(n.id, n); return n; };

  // 구글 번역 가짜: opt.mt = 'blocked'(429 + HTML 'Sorry' — 2026-10-27 처럼) | 'offline'(인터넷 끊김) | 없으면 정상
  const mtReply = (url) => (opt.mt === 'blocked' ? { status: 429, text: '<html><body>Sorry...</body></html>' } : opt.mt === 'offline' ? null : { status: 200, text: fakeMt(url) });

  // 크롬 내장 번역기 가짜: opt.translator = { 'ko>th': 'available' | 'downloadable' | 'unavailable', … }.
  // 켜지 않은(downloadable) 쌍은 누름 중(opt.activation)에만 만들 수 있다 — 진짜 크롬과 같게. 답은 '내장(쌍):원문'.
  const builtinCalls = [];
  const userActivation = { isActive: !!opt.activation };

  const sb = {
    console,
    URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, structuredClone,
    setTimeout: later, clearTimeout, setInterval: (fn) => intervals.push(fn), clearInterval: noop, queueMicrotask,
    GM_info: { script: { version: 'test' } },
    GM_getValue: (k, d) => (k in store ? store[k] : d),
    GM_setValue: (k, v) => { store[k] = v; },
    GM_deleteValue: (k) => { delete store[k]; },
    GM_addStyle: noop, GM_registerMenuCommand: noop, GM_openInTab: noop,
    GM_xmlhttpRequest: (o) => {
      requests.push(o.url);
      calls.push({ method: o.method || 'GET', url: o.url, headers: o.headers || {}, data: o.data });
      let text;
      let status = 200;
      let delay = 0; // { delay: ms } — 이 답만 늦게(받는 중에 다른 일이 끼는 경우를 만든다)
      // opt.http(url, 요청) 이 먼저 — 글(200) 또는 { status, text } 를 돌려주면 그 답, undefined 면 아래 기본 길.
      const own = opt.http ? opt.http(o.url, o) : undefined;
      if (own !== undefined) {
        if (own === null) text = null;
        else if (typeof own === 'object') ({ status = 200, text, delay = 0 } = own);
        else text = own;
      }
      // opt.glossaryFiles = { 'glossary-vi.txt': 글, … } 이면 파일 이름으로 고른다(없으면 glossary 글)
      else if (/th-korean-glossary/.test(o.url)) {
        const file = decodeURIComponent((o.url.split('?')[0].match(/\/([^/]+\.txt)$/) || [])[1] || '');
        text = opt.glossaryFiles && file in opt.glossaryFiles ? opt.glossaryFiles[file] : glossaryText;
      }
      else if (/translate\.googleapis\.com/.test(o.url)) {
        const r = mtReply(o.url);
        if (r) ({ status, text } = r);
      }
      (delay ? (fn) => setTimeout(fn, delay) : queueMicrotask)(() => { // 늦춘 답은 시험이 기다리는 동안 살아 있게(unref 아님)
        if (text == null) o.onerror && o.onerror({ status: 0, error: 'test: 네트워크 없음' });
        else o.onload && o.onload({ status, responseText: text, responseHeaders: '', finalUrl: o.url });
      });
      return { abort: noop };
    },
    location: { hostname: host, host, href: `https://${host}/`, origin: `https://${host}`, search: '', pathname: '/', hash: '' },
    history: { pushState: noop, replaceState: noop },
    navigator: { language: 'ko-KR', languages: ['ko-KR'], userAgent: 'node-test', platform: 'Win32', userActivation },
    document: {
      readyState: 'loading', addEventListener: noop, removeEventListener: noop,
      documentElement: Object.assign(el(), { lang: opt.pageLang || '' }), head: el(), body, createElement: el, createTextNode: () => ({}),
      querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => attached.get(id) || null,
      createDocumentFragment: () => ({ querySelector: () => null }),
      visibilityState: 'visible', title: '',
    },
    MutationObserver: class { observe() {} disconnect() {} },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    requestAnimationFrame: noop,
    atob: (s) => Buffer.from(String(s), 'base64').toString('latin1'),
    btoa: (s) => Buffer.from(String(s), 'latin1').toString('base64'),
    // 창의 fetch(Vision 이 쓴다): opt.fetch(url, init) → { ok, status, json } 흉내. 없으면 네트워크 없음.
    fetch: async (url, init = {}) => { calls.push({ method: init.method || 'GET', url: String(url), headers: init.headers || {}, data: init.body, via: 'fetch' }); if (!opt.fetch) throw new TypeError('test: 네트워크 없음'); return opt.fetch(String(url), init); },
  };
  // 확장처럼(extension/src/gm.js) 큰 값은 미리 안 읽고 GM_lazyGet 으로 읽는 판. 무엇을 읽었는지 lazyReads 에 남는다.
  const lazyReads = [];
  if (opt.lazy) {
    sb.GM_lazyGet = (k, d) => {
      lazyReads.push(k);
      return Promise.resolve(k in store ? structuredClone(store[k]) : d);
    };
  }
  // 확장의 공유 번역 캐시(gm.js GM_tmLoad·GM_tmAdd·GM_tmReplace, 1.35.9) 흉내: opt.sharedCache = { '언어|원문': 번역 }.
  // 보낸 것은 tmCalls 에 ['add', 항목] / ['replace', 값] 으로 남는다.
  const tmCalls = [];
  if (opt.sharedCache) {
    sb.GM_tmLoad = () => Promise.resolve(structuredClone(opt.sharedCache));
    sb.GM_tmAdd = (e) => tmCalls.push(['add', structuredClone(e)]);
    sb.GM_tmReplace = (v) => tmCalls.push(['replace', structuredClone(v)]);
  }
  if (opt.translator) {
    const state = (s, t) => opt.translator[`${s}>${t}`] || 'unavailable';
    sb.Translator = {
      availability: async ({ sourceLanguage: s, targetLanguage: t }) => state(s, t),
      create: async ({ sourceLanguage: s, targetLanguage: t }) => {
        const st = state(s, t);
        if (st === 'unavailable') throw new Error('NotSupportedError');
        if (st !== 'available' && !userActivation.isActive) throw new Error('NotAllowedError: Requires a user gesture');
        opt.translator[`${s}>${t}`] = 'available'; // 한 번 켜면 이 사이트에서는 계속
        return { translate: async (x) => { builtinCalls.push(`${s}>${t}|${x}`); return `내장(${s}>${t}):${x}`; } };
      },
    };
  }
  sb.window = sb;
  sb.self = sb;
  sb.top = sb;
  sb.addEventListener = noop;
  sb.removeEventListener = noop;
  vm.createContext(sb);
  script().runInContext(sb);
  if (typeof sb.__peek !== 'function') throw new Error('스크립트를 불러오지 못함(__peek 없음)');
  const tick = () => intervals.forEach((fn) => fn());
  return { peek: sb.__peek, store, requests, calls, lazyReads, toasts, builtinCalls, userActivation, attached, sandbox: sb, tmCalls, tick };
}

module.exports = { load, ROOT, SCRIPT };

// 스크립트 칸(vm)에서 만든 객체는 뿌리(prototype)가 달라 deepStrictEqual 이 '다르다' 고 한다 → 평범한 값으로 바꿔 견준다.
const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const same = (actual, expected, msg) => require('node:assert/strict').deepStrictEqual(plain(actual), plain(expected), msg);
module.exports.same = same;
module.exports.plain = plain;
