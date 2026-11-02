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
