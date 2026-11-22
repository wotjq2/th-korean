// ---------------------------------------------------------------------------
// 통합 번역 — 뒤에서 도는 부분(service worker).
// 번역 스크립트의 인터넷 요청(GM_xmlhttpRequest)을 대신 보낸다. 페이지 안에서는 다른 사이트 주소가
// 막히지만(CORS), 확장은 manifest 의 host_permissions 에 적은 주소에 그대로 닿는다.
// ---------------------------------------------------------------------------

/* global chrome */

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m && m.t === 'gm-xhr') {
    gmXhr(m).then(reply);
    return true; // 답을 나중에 보낸다
  }
  if (m && m.t === 'helper-lang') {
    helperCall('lang', false).then(reply);
    return true;
  }
  if (m && m.t === 'helper') {
    // 사람이 창에서 끈 동안(크롬을 다시 켤 때까지)은 영상이 돌아도 저절로 다시 켜지 않는다(helper-auto).
    if (m.manual && (m.cmd === 'stop' || m.cmd === 'start')) chrome.storage.session.set({ helperUserStopped: m.cmd === 'stop' });
    helperCall(m.cmd, m.manual).then(reply);
    return true;
  }
  if (m && m.t === 'helper-auto') {
    // 영상이 재생 중인데 도우미가 답하지 않는다(꺼졌다 — 작업 관리자로 끝내는 등) — '크롬과 함께 켜기' 면 다시 켠다.
    // 1분에 한 번만, 사람이 창에서 끈 뒤에는 켜지 않는다.
    if (Date.now() - helperAutoAt < 60000) {
      reply(false);
      return undefined;
    }
    helperAutoAt = Date.now();
    chrome.storage.session
      .get('helperUserStopped')
      .then(({ helperUserStopped }) => (helperUserStopped ? false : helperAutoStart().then(() => true)))
      .then(reply, () => reply(false));
    return true;
  }
  if (m && m.t === 'cc-translate') {
    ccSettings({ cmd: 'cc-translate', on: !!m.on }, sender).then(reply);
    return true;
  }
  if (m && m.t === 'cc-reset') {
    ccSettings({ cmd: 'cc-reset' }, sender).then(reply);
    return true;
  }
  if (m && m.t === 'tm-load') {
    tmLoad().then(reply, () => reply(null));
    return true;
  }
  if (m && m.t === 'tm-add') {
    tmAdd(m.e).then(() => reply(true), () => reply(false));
    return true;
  }
  if (m && m.t === 'tm-replace') {
    tmReplace(m.v).then(() => reply(true), () => reply(false));
    return true;
  }
  if (m && m.t === 'open-tab' && /^(https:\/\/|chrome:\/\/settings\/)/.test(String(m.url))) {
    chrome.tabs.create({ url: m.url, index: sender.tab ? sender.tab.index + 1 : undefined }).then(
      () => reply(true),
      () => reply(false)
    );
    return true;
  }
  return undefined;
});

// ---------------------------------------------------------------------------
// 번역 도우미(LINE·화면 번역, 윈도우 프로그램) 켜기·끄기 — 크롬의 네이티브 메시징.
// 도우미가 켤 때 크롬에 자기를 등록해 둔다(line-helper/ChromeLink.cs). 크롬을 켜면(onStartup) 또는 이 확장을
// 설치·새로 고치면(onInstalled) '크롬과 함께 켜기'(helperAuto, 기본 켬)일 때 도우미를 켠다.
// ---------------------------------------------------------------------------

const HELPER_HOST = 'com.th_korean.helper';
let helperAutoAt = 0;

// 모든 부름에 '내 언어'(통합 번역 창에서 고른 기준 언어)를 같이 보낸다 — 도우미가 바뀌었으면 받아 두고
// LINE·화면 번역·자막을 그 언어로 옮기고 자기 화면 글도 그 언어로 바꾼다(ChromeLink.cs SaveMyLang). 옛 도우미는 무시한다.
async function myLang() {
  const v = (await chrome.storage.local.get('gm:myLang'))['gm:myLang'];
  return typeof v === 'string' && v ? v : 'ko';
}

async function helperCall(cmd, manual) {
  try {
    return await chrome.runtime.sendNativeMessage(HELPER_HOST, { cmd, manual: !!manual, lang: await myLang() });
  } catch (e) {
    // 'Specified native messaging host not found.' = 도우미가 없거나 아직 한 번도 켜지지 않았다
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// 크롬 설정 › 접근성의 단추 누르기 — cc-translate: '실시간 번역' 켜기·끄기(사용자 2026-11-03: 창에서 껐다 켜게),
// cc-reset: '실시간 자막' 껐다 켜기(자막 창이 닫혀 멈춘 크롬 되살리기). 확장은 크롬 설정을 바꿀 수 없어
// 설정을 보던 탭 옆에 잠깐 열고 번역 도우미가 그 단추를 눌러 준다(UI Automation — ChromeLink.cs ChromeCaptionSwitch).
// 탭은 끝나면 닫고 보던 탭으로 돌아간다. 작은 팝업 창(windows.create type popup)으로 열었더니 크롬이 그 창의 페이지를
// UI Automation 에 내놓지 않아 도우미가 단추를 못 찾았다(2026-11-03 시험). 도우미가 없으면 ok:false(스크립트가 설정을
// 열어 직접 누르게 한다).
async function ccSettings(msg, sender) {
  let tab = null;
  const from = sender && sender.tab;
  const t0 = Date.now();
  try {
    tab = await chrome.tabs.create({
      url: 'chrome://settings/accessibility',
      active: true,
      ...(from ? { index: from.index + 1, openerTabId: from.id, windowId: from.windowId } : {}),
    });
    const opened = Date.now() - t0;
    const r = await chrome.runtime.sendNativeMessage(HELPER_HOST, msg);
    return { ...r, ms: { opened, total: Date.now() - t0 } };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
    if (from) chrome.tabs.update(from.id, { active: true }).catch(() => {});
  }
}

async function helperAutoStart() {
  const { helperAuto = true } = await chrome.storage.local.get('helperAuto');
  if (helperAuto) await helperCall('start', false);
}

chrome.runtime.onStartup.addListener(helperAutoStart);
chrome.runtime.onInstalled.addListener(helperAutoStart);

async function gmXhr(m) {
  const ctl = new AbortController();
  const timer = m.timeout ? setTimeout(() => ctl.abort(), m.timeout) : null;
  try {
    const r = await fetch(m.url, {
      method: m.method,
      headers: m.headers,
      body: m.method === 'GET' || m.method === 'HEAD' ? undefined : m.data,
      signal: ctl.signal,
      // 쿠키는 보내지 않는다 — 번역·용어집·사진·도우미 어느 것도 로그인이 필요 없고, 번역할 글이 사용자의 구글 계정과
      // 이어지지 않게(개인정보 처리방침: 보내는 것은 번역할 글뿐). 용어집 저장은 토큰을 머리글로 보낸다.
      credentials: 'omit',
    });
    const out = {
      status: r.status,
      statusText: r.statusText,
      finalUrl: r.url,
      headers: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n'),
    };
    if (m.responseType === 'blob' || m.responseType === 'arraybuffer') {
      out.b64 = toB64(await r.arrayBuffer());
      out.type = r.headers.get('content-type') || '';
    } else {
      out.text = await r.text();
    }
    return out;
  } catch (e) {
    return { error: ctl.signal.aborted ? 'timeout' : 'network', message: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// 사진처럼 글자가 아닌 답은 메시지로 그대로 못 넘겨 base64 로 바꾼다.
function toB64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------------------
// 번역 캐시(1.35.9) — 탭들이 같이 쓰는 하나. IndexedDB 'th-korean' 의 'kv' 칸에 'tmCache' = { '언어|원문': 번역 }(넣은 차례).
// 예전에는 chrome.storage.local 의 gm:tmCache 를 탭마다 통째로 들고 통째로 저장했다 — 두 탭이 함께 번역하면 한쪽 새 번역이
// 사라지고, 저장할 때마다 0.5 MB 가 열린 모든 탭에 갔다(storage.onChanged). IndexedDB 는 바뀜 알림을 탭에 보내지 않는다.
// 탭은 처음 쓸 때 통째로 한 번 받고(tm-load) 새로 번역한 것만 보낸다(tm-add). 처음 한 번 옛 gm:tmCache 를 옮기고 지운다.
// ---------------------------------------------------------------------------

const TM_KEY = 'tmCache';
const TM_MAX = 8000; // 넘으면 오래된 절반을 버린다(스크립트의 CACHE_MAX 와 같다)
let tmMem = null; // 이 service worker 가 살아 있는 동안의 사본
let tmLoading = null;
let tmTimer = 0;

function tmDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('th-korean', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tmIdb(mode, fn) {
  const db = await tmDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function tmLoad() {
  if (tmMem) return Promise.resolve(tmMem);
  if (!tmLoading) {
    tmLoading = (async () => {
      let v = await tmIdb('readonly', (s) => s.get(TM_KEY)).catch(() => null);
      if (!v || typeof v !== 'object') {
        // 처음: storage 의 옛 캐시를 옮긴다(옮긴 뒤 지운다 — 지우는 알림은 이번 한 번만 탭들에 간다)
        const old = (await chrome.storage.local.get('gm:' + TM_KEY))['gm:' + TM_KEY];
        v = old && typeof old === 'object' && !Array.isArray(old) ? old : {};
        await tmIdb('readwrite', (s) => s.put(v, TM_KEY));
        if (old !== undefined) await chrome.storage.local.remove('gm:' + TM_KEY);
      }
      tmMem = v;
      return v;
    })().finally(() => {
      tmLoading = null;
    });
  }
  return tmLoading;
}

function tmTrim(c) {
  const keys = Object.keys(c);
  if (keys.length <= TM_MAX) return c;
  const out = {};
  for (const k of keys.slice(keys.length - Math.floor(TM_MAX / 2))) out[k] = c[k];
  return out;
}

// 저장은 0.5초 모아서 한 번(번역이 줄마다 잇따른다)
function tmSaveSoon() {
  clearTimeout(tmTimer);
  tmTimer = setTimeout(() => {
    tmTimer = 0;
    const v = tmMem;
    if (v) tmIdb('readwrite', (s) => s.put(v, TM_KEY)).catch((e) => console.warn('[통합 번역] 번역 캐시 저장 실패:', e && e.message));
  }, 500);
}

async function tmAdd(entries) {
  if (!entries || typeof entries !== 'object') return;
  let c = await tmLoad();
  for (const [k, v] of Object.entries(entries)) {
    if (typeof k !== 'string' || typeof v !== 'string') continue;
    delete c[k]; // 새로 넣은 것이 맨 뒤(오래된 것부터 버린다)
    c[k] = v;
  }
  c = tmTrim(c);
  tmMem = c;
  tmSaveSoon();
}

async function tmReplace(obj) {
  await tmLoad();
  tmMem = tmTrim(obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {});
  tmSaveSoon();
}
