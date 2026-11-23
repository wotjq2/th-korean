// ---------------------------------------------------------------------------
// 몽키(Tampermonkey) 대신 — 번역 스크립트(th-korean.user.js)가 쓰는 GM_* 기능을 확장 기능으로 흉내 낸다.
//
// 스크립트는 고치지 않고 그대로 쓴다(LINE 번역 도우미의 엔진도 같은 파일을 쓴다). build.js 가
// 이 파일 + 스크립트를 이어 붙여 content.js 하나로 만든다. 스크립트는 저장값을 기다리지 않고 바로
// 읽으므로(GM_getValue), 저장값을 모두 읽어 둔 뒤(gmReady)에 스크립트를 시작한다.
// ---------------------------------------------------------------------------

/* global chrome */
/* eslint-disable no-unused-vars */

const GM_PREFIX = 'gm:'; // 확장 저장소 안에서 스크립트 값과 확장 자신의 값을 나눈다
const gmStore = new Map();

// 큰 값(용어집 글 — 언어마다 수십만~백만 글자)은 탭을 열 때 미리 읽지 않는다. 스크립트가 쓸 때 GM_lazyGet 으로 읽는다.
// 2026-11-21 잰 것: 저장값 전체(5 MB)를 탭마다 읽어 한국어 뉴스 탭 하나도 15~25 MB 를 더 쓰고 확장 준비가 60 ms 늦었다.
// tmCache(번역 캐시)는 storage 에 두지 않는다 — 아래 GM_tmLoad(1.35.9). 옮기기 전의 옛 값도 탭마다 읽지 않게 여기에 둔다.
const GM_LAZY = /^(remoteGlossary|langGlossary:|tmCache$)/;

const gmReady = (async () => {
  // 이름만 먼저 받아(크롬 130+) 큰 값은 빼고 읽는다. 이름 목록을 못 받으면 예전처럼 전부.
  let want = null;
  try {
    const keys = await chrome.storage.local.getKeys();
    want = keys.filter((k) => k.startsWith(GM_PREFIX) && !GM_LAZY.test(k.slice(GM_PREFIX.length)));
  } catch {
    want = null;
  }
  const all = await chrome.storage.local.get(want);
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(GM_PREFIX)) gmStore.set(k.slice(GM_PREFIX.length), v);
  }
})();

// 큰 값 읽기(약속). 한 번 읽으면 이 탭에 둔다 — 다른 탭에서 바뀌면 아래 onChanged 가 따라간다.
function GM_lazyGet(key, def) {
  if (gmStore.has(key) || !GM_LAZY.test(key)) return Promise.resolve(GM_getValue(key, def));
  if (!gmAlive()) return Promise.resolve(def);
  return chrome.storage.local
    .get(GM_PREFIX + key)
    .then((o) => {
      const v = o[GM_PREFIX + key];
      if (v !== undefined && !gmStore.has(key)) gmStore.set(key, v);
      return GM_getValue(key, def);
    })
    .catch(() => def);
}

// 다른 탭에서 바꾼 값(설정·대화방 켜기 등)도 바로 따라간다. 몽키도 그렇게 한다.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [k, { newValue }] of Object.entries(changes)) {
    if (!k.startsWith(GM_PREFIX)) continue;
    const key = k.slice(GM_PREFIX.length);
    if (newValue === undefined) gmStore.delete(key);
    else if (GM_LAZY.test(key) && !gmStore.has(key)) continue; // 이 탭이 아직 안 읽은 큰 값은 들고 있지 않는다
    else gmStore.set(key, newValue);
  }
});

// 몽키는 읽을 때마다 새 사본을 준다. 받은 객체를 고쳐도 저장값은 그대로여야 한다.
function GM_getValue(key, def) {
  if (!gmStore.has(key)) return def;
  const v = gmStore.get(key);
  return v !== null && typeof v === 'object' ? structuredClone(v) : v;
}

// 확장을 새로 고치거나 업데이트하면 이미 열려 있던 탭의 이 스크립트는 확장과 끊긴다('Extension context
// invalidated'). 끊긴 뒤에도 확장에 물으면 오류만 쌓인다 — 2026-11-01 쇼츠 탭이 넘길 때마다 '용어집 받기 실패'
// 를 수십 줄 남겼다. 그래서 끊긴 것을 알면 더 묻지 않고, 이 탭을 새로 고치라고 한 번만 알린다.
let gmDead = false;

function gmAlive() {
  if (gmDead) return false;
  try {
    if (chrome.runtime && chrome.runtime.id) return true;
  } catch {
    /* 끊겼다 */
  }
  gmDead = true;
  gmDeadNotice();
  return false;
}

function gmDeadNotice() {
  const show = () => {
    const box = document.createElement('div');
    box.className = 'notranslate';
    box.setAttribute('translate', 'no');
    box.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:10px 34px 10px 14px;' +
      'border-radius:8px;background:#202124;color:#fff;font:500 13px/1.5 system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.35)';
    box.textContent = '통합 번역이 새로 고쳐졌습니다. 이 탭을 새로 고침(F5)하면 다시 번역합니다.';
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = '닫기';
    x.style.cssText = 'position:absolute;right:6px;top:4px;border:none;background:none;color:#bbb;font-size:18px;cursor:pointer';
    x.addEventListener('click', () => box.remove());
    box.appendChild(x);
    document.body.appendChild(box);
  };
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show, { once: true });
}

function GM_setValue(key, value) {
  gmStore.set(key, value);
  if (!gmAlive()) return; // 끊긴 탭 — 이 탭 안에서만 기억한다
  try {
    chrome.storage.local.set({ [GM_PREFIX + key]: value }).catch((e) => {
      if (gmAlive()) console.warn('[통합 번역] 저장 실패:', key, e && e.message);
    });
  } catch {
    gmAlive();
  }
}

function GM_addStyle(css) {
  const s = document.createElement('style');
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
  return s;
}

// 다른 사이트 주소(구글 번역·GitHub·AI·사진 서버)는 페이지 안에서 부르면 막힌다(CORS).
// 확장 권한이 있는 background.js 가 대신 보내고 답을 돌려준다.
function GM_xmlhttpRequest(d) {
  let aborted = false;
  const msg = {
    t: 'gm-xhr',
    method: d.method || 'GET',
    url: d.url,
    headers: d.headers || {},
    data: d.data,
    timeout: d.timeout || 0,
    responseType: d.responseType || '',
  };
  const handle = {
    abort() {
      aborted = true;
    },
  };
  // 끊긴 탭: 답하지 않고 둔다. 실패로 답하면 스크립트가 곧바로 다시 받으려 하며 같은 오류를 계속 남긴다.
  if (!gmAlive()) return handle;
  let sent;
  try {
    sent = chrome.runtime.sendMessage(msg);
  } catch {
    gmAlive();
    return handle;
  }
  sent.then(
    (r) => {
      if (aborted) return;
      if (!r || r.error === 'network') {
        if (d.onerror) d.onerror({ status: 0, error: r && r.message });
        return;
      }
      if (r.error === 'timeout') {
        if (d.ontimeout) d.ontimeout({ status: 0 });
        return;
      }
      let response = r.text;
      if (r.b64 != null) {
        const bytes = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
        response = d.responseType === 'arraybuffer' ? bytes.buffer : new Blob([bytes], { type: r.type || '' });
      } else if (d.responseType === 'json') {
        try {
          response = JSON.parse(r.text);
        } catch {
          response = null;
        }
      }
      if (d.onload) {
        d.onload({
          readyState: 4,
          status: r.status,
          statusText: r.statusText,
          responseText: r.text == null ? '' : r.text,
          response,
          responseHeaders: r.headers,
          finalUrl: r.finalUrl,
        });
      }
    },
    (e) => {
      // 보내는 사이에 확장이 새로 고쳐졌으면 'Extension context invalidated' — 끊긴 탭이라 답하지 않는다.
      if (!gmAlive()) return;
      if (!aborted && d.onerror) d.onerror({ status: 0, error: String((e && e.message) || e) });
    }
  );
  return handle;
}

// 새 탭 열기. 크롬 설정(chrome://settings/…)은 페이지에서 못 열어 background.js 가 연다.
function GM_openInTab(url) {
  if (!gmAlive()) return;
  try {
    chrome.runtime.sendMessage({ t: 'open-tab', url }).catch(() => {});
  } catch {
    gmAlive();
  }
}

// 확장에 함께 넣은 파일의 주소(사진 글자 읽기 엔진 tesseract/…). 크롬 웹스토어는 밖에서 받은 코드를 못 돌리게 해서
// 엔진을 확장 안에 넣었다. 몽키에는 이 함수가 없다 — 스크립트는 그때 예전처럼 CDN 주소를 쓴다.
function GM_extensionURL(path) {
  return chrome.runtime.getURL(path);
}

// 번역 도우미가 꺼져 있을 때 켜 달라고 한다(확장 설정 '크롬과 함께 켜기' 가 켜져 있을 때만 — background.js).
// 도우미가 꺼지면(작업 관리자로 끝내는 등) 크롬 실시간 자막도 영상 위 자막도 멈추므로, 영상이 재생 중인데
// 도우미가 답하지 않으면 스크립트가 부른다.
function GM_helperAutoStart() {
  if (!gmAlive()) return;
  try {
    chrome.runtime.sendMessage({ t: 'helper-auto' }).catch(() => {});
  } catch {
    gmAlive();
  }
}

// 번역 캐시(같은 글을 두 번 번역하지 않게, 최대 8,000개) — 1.35.9. 예전에는 탭마다 통째로 들고 2.5초마다 통째로 저장해
// (1) 두 탭이 함께 번역하면 한쪽 탭의 새 번역이 매번 사라졌고 (2) 저장할 때마다 0.5 MB 가 storage.onChanged 로 열린 모든 탭에
// 갔다(2026-11-22 실측: 아무것도 안 하는 뉴스 탭이 6초에 1 MB). 이제 background.js 가 IndexedDB 에 하나만 두고, 탭은 처음 쓸 때
// 한 번 받아(GM_tmLoad) 새로 번역한 것만 보낸다(GM_tmAdd — background 가 합친다). 몽키·번역 도우미에는 이 함수들이 없다
// (스크립트는 예전처럼 GM_setValue('tmCache')).
function GM_tmLoad() {
  if (!gmAlive()) return Promise.resolve(null);
  try {
    return chrome.runtime.sendMessage({ t: 'tm-load' }).catch(() => null);
  } catch {
    gmAlive();
    return Promise.resolve(null);
  }
}

function GM_tmAdd(entries) {
  if (!gmAlive()) return;
  try {
    chrome.runtime.sendMessage({ t: 'tm-add', e: entries }).catch(() => {});
  } catch {
    gmAlive();
  }
}

// 통째로 바꾸기 — '캐시 비우기'
function GM_tmReplace(obj) {
  if (!gmAlive()) return;
  try {
    chrome.runtime.sendMessage({ t: 'tm-replace', v: obj || {} }).catch(() => {});
  } catch {
    gmAlive();
  }
}

// 번역 도우미가 켜져 있는지(설정 창 '문제 알리기' 의 환경 줄) — { ok, running } 또는 { ok:false, error }. 몽키에는 없다.
function GM_helperStatus() {
  if (!gmAlive()) return Promise.resolve(null);
  try {
    return chrome.runtime.sendMessage({ t: 'helper', cmd: 'status' });
  } catch {
    gmAlive();
    return Promise.resolve(null);
  }
}

// 크롬 '실시간 번역'(설정 › 접근성) 켜기·끄기 — 확장은 크롬 설정을 못 바꿔 background.js 가 설정 창을 작게 열고 번역
// 도우미가 그 단추를 눌러 준다. 답: { ok, state: 'on'/'off'/'', error }. 몽키에는 이 함수가 없다(스크립트는 설정 창만 연다).
function GM_chromeLiveTranslate(on) {
  if (!gmAlive()) return Promise.resolve(null);
  try {
    return chrome.runtime.sendMessage({ t: 'cc-translate', on: !!on });
  } catch {
    gmAlive();
    return Promise.resolve(null);
  }
}

// 크롬 '실시간 자막' 껐다 켜기 — 크롬 자막 창이 닫혀 받아 적기가 멈췄을 때(도우미가 dead 로 알림). 답은 위와 같다
// (state 'on' = 다시 켰다). 몽키에는 이 함수가 없다.
function GM_chromeLiveReset() {
  if (!gmAlive()) return Promise.resolve(null);
  try {
    return chrome.runtime.sendMessage({ t: 'cc-reset' });
  } catch {
    gmAlive();
    return Promise.resolve(null);
  }
}

// ---------------------------------------------------------------------------
// 크롬 내장 번역기(1.36.0) — 구글이 막히거나 인터넷이 안 될 때 스크립트가 쓰는 Translator·LanguageDetector 를 background.js 에
// 맡긴다. 이 탭(페이지)에서 만들면 크롬이 사이트마다 '누름' 이 있어야 언어 쌍을 켜 줬다(개인정보 보호 — 1.35.4~1.35.9 는 막힘
// 안내를 눌러야 했다). 확장 service worker 에서는 누름 없이 만든다(2026-11-23 크롬 157 시험) — 번역 도우미가 빌려 쓰는 것과 같은 곳
// (background.js mtHandle). 그래서 'downloadable'(이 사이트에서 아직 안 켬·아직 안 받음)도 'available' 로 알린다. 처음 쓰는 쌍은
// 크롬이 모델을 받는다(10~20초) — 받는 정도를 background 가 이 탭에 알려 주어(mt-progress) 스크립트의 '받는 중 n%' 안내가 그대로
// 뜬다. 이 크롬에 내장 번역기가 없으면(138 전) 아무것도 바꾸지 않는다. 몽키에서는 예전처럼 페이지의 것을 쓴다.
// ---------------------------------------------------------------------------
const gmMtWatch = new Map(); // 받는 중 알림 번호 → 스크립트가 monitor 로 받은 EventTarget
let gmMtNext = 0;

function gmMt(msg) {
  if (!gmAlive()) return Promise.resolve(null);
  try {
    // 실패 답({ ok:false, error })도 그대로 — 까닭('english' 등)을 스크립트의 실패 안내에 쓴다
    return chrome.runtime.sendMessage({ t: 'mt', ...msg }).then(
      (r) => (r && typeof r === 'object' ? r : null),
      () => null
    );
  } catch {
    gmAlive();
    return Promise.resolve(null);
  }
}

// 답이 없으면(확장이 잠깐 안 받음) 'downloadable' — 스크립트는 그 쌍을 '없음' 으로 기억하지 않는다
const gmMtAvail = (r) => (!r || !r.ok ? 'downloadable' : r.avail === 'unavailable' ? 'unavailable' : 'available');
const gmMtFail = (r, def) => (r && r.error ? String(r.error) : def);

function gmMtMonitor(monitor) {
  if (typeof monitor !== 'function') return 0;
  const watch = ++gmMtNext;
  const target = new EventTarget();
  gmMtWatch.set(watch, target);
  try {
    monitor(target);
  } catch {
    /* 스크립트 쪽 오류 — 받기는 그대로 */
  }
  return watch;
}

if (typeof Translator !== 'undefined') {
  globalThis.Translator = {
    availability: async ({ sourceLanguage: from, targetLanguage: to } = {}) => gmMtAvail(await gmMt({ op: 'avail', from, to })),
    create: async ({ sourceLanguage: from, targetLanguage: to, monitor } = {}) => {
      const watch = gmMtMonitor(monitor);
      const r = await gmMt({ op: 'create', from, to, watch });
      gmMtWatch.delete(watch);
      if (!r || !r.ok) throw new DOMException(gmMtFail(r, '크롬 내장 번역기를 만들지 못했습니다'), 'NotSupportedError');
      return {
        sourceLanguage: from,
        targetLanguage: to,
        // 번역기는 background 에 있다 — 여기는 쌍만 들고 있어 service worker 가 다시 떠도 그대로 쓴다
        translate: async (text) => {
          const a = await gmMt({ op: 'tr', from, to, text: String(text) });
          if (!a || !a.ok || typeof a.out !== 'string') throw new DOMException(gmMtFail(a, '크롬 내장 번역기가 답하지 않습니다'), 'OperationError');
          return a.out;
        },
        destroy() {},
      };
    },
  };
}

if (typeof LanguageDetector !== 'undefined') {
  globalThis.LanguageDetector = {
    availability: async () => gmMtAvail(await gmMt({ op: 'avail-ld' })),
    create: async ({ monitor } = {}) => {
      const watch = gmMtMonitor(monitor);
      const r = await gmMt({ op: 'create-ld', watch });
      gmMtWatch.delete(watch);
      if (!r || !r.ok) throw new DOMException(gmMtFail(r, '크롬 언어 알아보기를 만들지 못했습니다'), 'NotSupportedError');
      return {
        detect: async (text) => {
          const a = await gmMt({ op: 'detect', text: String(text) });
          if (!a || !a.ok || !Array.isArray(a.list)) throw new DOMException(gmMtFail(a, '크롬 언어 알아보기가 답하지 않습니다'), 'OperationError');
          return a.list;
        },
        destroy() {},
      };
    },
  };
}

// 몽키의 확장 메뉴 대신 — 도구 막대의 '통합 번역' 단추(popup)가 이 목록을 보여 주고 누른 것을 실행한다.
const gmMenu = new Map();
let gmMenuId = 0;

function GM_registerMenuCommand(name, fn) {
  const id = ++gmMenuId;
  gmMenu.set(id, { name, fn });
  return id;
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m) return;
  if (m.t === 'gm-menu-list') {
    reply([...gmMenu].map(([id, c]) => ({ id, name: c.name })));
  } else if (m.t === 'mt-progress') {
    // 크롬 내장 번역기 모델을 받는 정도(background.js) → 스크립트의 monitor 로
    const w = gmMtWatch.get(m.watch);
    if (w) {
      const e = new Event('downloadprogress');
      e.loaded = Number(m.loaded) || 0;
      w.dispatchEvent(e);
    }
  } else if (m.t === 'gm-menu-run') {
    const c = gmMenu.get(m.id);
    if (c) setTimeout(() => c.fn(), 0);
    reply(!!c);
  } else if (m.t === 'helper-link') {
    // 아직 확장과 이어지지 않은 번역 도우미를 예전 주소(th-korean-helper://)로 켠다. 스크립트 설정 창의
    // '번역 도우미 켜기' 와 같은 길 — 페이지에서 눌러야 크롬이 '열까요?(항상 허용)' 를 물어 준다.
    const a = document.createElement('a');
    a.href = m.url;
    a.click();
    reply(true);
  }
});
