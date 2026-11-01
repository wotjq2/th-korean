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

const gmReady = chrome.storage.local.get(null).then((all) => {
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(GM_PREFIX)) gmStore.set(k.slice(GM_PREFIX.length), v);
  }
});

// 다른 탭에서 바꾼 값(설정·대화방 켜기 등)도 바로 따라간다. 몽키도 그렇게 한다.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [k, { newValue }] of Object.entries(changes)) {
    if (!k.startsWith(GM_PREFIX)) continue;
    const key = k.slice(GM_PREFIX.length);
    if (newValue === undefined) gmStore.delete(key);
    else gmStore.set(key, newValue);
  }
});

// 몽키는 읽을 때마다 새 사본을 준다. 받은 객체를 고쳐도 저장값은 그대로여야 한다.
function GM_getValue(key, def) {
  if (!gmStore.has(key)) return def;
  const v = gmStore.get(key);
  return v !== null && typeof v === 'object' ? structuredClone(v) : v;
}

function GM_setValue(key, value) {
  gmStore.set(key, value);
  chrome.storage.local.set({ [GM_PREFIX + key]: value }).catch((e) => {
    console.warn('[통합 번역] 저장 실패:', key, e && e.message);
  });
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
  chrome.runtime.sendMessage(msg).then(
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
      // 확장을 새로 고친 뒤 예전 탭에서 부르면 'Extension context invalidated' 가 난다.
      if (!aborted && d.onerror) d.onerror({ status: 0, error: String((e && e.message) || e) });
    }
  );
  return {
    abort() {
      aborted = true;
    },
  };
}

// 새 탭 열기. 크롬 설정(chrome://settings/…)은 페이지에서 못 열어 background.js 가 연다.
function GM_openInTab(url) {
  chrome.runtime.sendMessage({ t: 'open-tab', url }).catch(() => {});
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
