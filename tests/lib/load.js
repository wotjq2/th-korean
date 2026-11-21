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
  const glossaryText = opt.glossary || '';

  const timers = [];
  const later = (fn, ms, ...a) => {
    const t = setTimeout(fn, ms, ...a);
    if (t.unref) t.unref(); // 스크립트가 걸어 둔 타이머 때문에 시험이 끝나지 않는 일이 없게
    timers.push(t);
    return t;
  };
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop }, setAttribute: noop,
    getAttribute: () => null, appendChild: noop, append: noop, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], remove: noop, dataset: {} });

  const sb = {
    console,
    URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, structuredClone,
    setTimeout: later, clearTimeout, setInterval: () => 0, clearInterval: noop, queueMicrotask,
    GM_info: { script: { version: 'test' } },
    GM_getValue: (k, d) => (k in store ? store[k] : d),
    GM_setValue: (k, v) => { store[k] = v; },
    GM_deleteValue: (k) => { delete store[k]; },
    GM_addStyle: noop, GM_registerMenuCommand: noop, GM_openInTab: noop,
    GM_xmlhttpRequest: (o) => {
      requests.push(o.url);
      let text;
      if (/th-korean-glossary/.test(o.url)) text = glossaryText;
      else if (/translate\.googleapis\.com/.test(o.url)) text = fakeMt(o.url);
      else if (opt.http) text = opt.http(o.url);
      queueMicrotask(() => {
        if (text == null) o.onerror && o.onerror({ status: 0, error: 'test: 네트워크 없음' });
        else o.onload && o.onload({ status: 200, responseText: text, responseHeaders: '', finalUrl: o.url });
      });
      return { abort: noop };
    },
    location: { hostname: host, host, href: `https://${host}/`, origin: `https://${host}`, search: '', pathname: '/', hash: '' },
    history: { pushState: noop, replaceState: noop },
    navigator: { language: 'ko-KR', languages: ['ko-KR'], userAgent: 'node-test', platform: 'Win32' },
    document: {
      readyState: 'loading', addEventListener: noop, removeEventListener: noop,
      documentElement: { lang: '', ...el() }, head: el(), body: null, createElement: el, createTextNode: () => ({}),
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      createDocumentFragment: () => ({ querySelector: () => null }),
      visibilityState: 'visible', title: '',
    },
    MutationObserver: class { observe() {} disconnect() {} },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    requestAnimationFrame: noop,
  };
  sb.window = sb;
  sb.self = sb;
  sb.top = sb;
  sb.addEventListener = noop;
  sb.removeEventListener = noop;
  vm.createContext(sb);
  script().runInContext(sb);
  if (typeof sb.__peek !== 'function') throw new Error('스크립트를 불러오지 못함(__peek 없음)');
  return { peek: sb.__peek, store, requests, sandbox: sb };
}

module.exports = { load, ROOT, SCRIPT };

// 스크립트 칸(vm)에서 만든 객체는 뿌리(prototype)가 달라 deepStrictEqual 이 '다르다' 고 한다 → 평범한 값으로 바꿔 견준다.
const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const same = (actual, expected, msg) => require('node:assert/strict').deepStrictEqual(plain(actual), plain(expected), msg);
module.exports.same = same;
module.exports.plain = plain;
