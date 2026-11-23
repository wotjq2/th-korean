// ---------------------------------------------------------------------------
// 통합 번역 — 뒤에서 도는 부분(service worker).
// 번역 스크립트의 인터넷 요청(GM_xmlhttpRequest)을 대신 보낸다. 페이지 안에서는 다른 사이트 주소가
// 막히지만(CORS), 확장은 manifest 의 host_permissions 에 적은 주소에 그대로 닿는다.
// ---------------------------------------------------------------------------

/* global chrome */

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  mtBridgeOpen(false); // 번역 다리가 닫혀 있으면 가끔(10분에 한 번) 다시 열어 본다
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
    helperCall(m.cmd, m.manual).then((r) => {
      if (r && r.running) mtBridgeOpen(true); // 켰다(또는 켜져 있다) — 번역 다리를 바로
      else if (m.cmd === 'stop' && mtPort) mtClose(mtPort);
      reply(r);
    });
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
  if (m && m.t === 'mt') {
    // 이 확장 탭의 크롬 내장 번역기(gm.js) — 페이지에서는 사이트마다 누름이 필요해 여기서 만든다(1.36.0)
    mtHandle(m, sender).then(reply);
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
  if (helperAuto) {
    const r = await helperCall('start', false);
    if (r && r.running) mtBridgeOpen(true);
  }
}

chrome.runtime.onStartup.addListener(helperAutoStart);
chrome.runtime.onInstalled.addListener(helperAutoStart);

// ---------------------------------------------------------------------------
// 번역 다리(1.36.0) — 번역 도우미(LINE·화면 번역·자막)가 구글이 막히거나 인터넷이 안 될 때 이 크롬의 내장 번역기를 빌려 쓴다.
// 도우미의 엔진은 node 라 Translator 가 없어 구글만 썼다. 확장의 service worker 에서는 내장 번역기를 누름 없이 만들 수 있다
// (2026-11-23 크롬 157: 한↔태·영 등, 사이트마다 누름이 필요한 페이지와 다르다. 처음 쓰는 쌍은 모델을 받는다 — 약 9초).
// 도우미가 켜져 있으면 connectNative 로 통로를 열어 둔다 — 크롬이 번역도우미.exe 를 하나 띄우고, 그것이 이 PC 사용자만 여는
// pipe 로 엔진의 물음을 넘긴다(ChromeLink.cs MtBridge). 통로가 열려 있는 동안은 이 service worker 가 잠들지 않는다.
// 구글이 되는 동안에는 물음이 오지 않는다. 도우미가 꺼져 있거나 없으면 10분에 한 번만 다시 본다(그 사이 켜면 바로).
// 받는 일: avail·create·tr(번역), avail-ld·create-ld·detect(언어 알아보기) — 언어 코드와 글 길이를 본다.
// 이 확장의 탭(gm.js 의 Translator·LanguageDetector)도 같은 일을 여기에 맡긴다({t:'mt'}) — 페이지에서는 크롬이 사이트마다
// 누름이 있어야 언어 쌍을 켜 줘서 막힘 안내를 눌러야 했다. 모델을 받는 정도는 그 탭에 알린다(mt-progress).
// ---------------------------------------------------------------------------

let mtPort = null;
let mtNextTry = 0; // 이 시각 전에는 다시 열어 보지 않는다(service worker 가 다시 떠도 이어지게 storage.session 에도)
const MT_RETRY = 10 * 60 * 1000;
const MT_LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const MT_MAX_TEXT = 20000;
const mtTr = new Map(); // '쌍' → { p: 번역기 약속, used, … } (mtEntry)
let mtSweep = 0;

async function mtBridgeOpen(force) {
  if (mtPort) return;
  const now = Date.now();
  if (!force) {
    if (now < mtNextTry) return;
    const s = await chrome.storage.session.get('mtNextTry').catch(() => ({}));
    if (s.mtNextTry && now < s.mtNextTry) {
      mtNextTry = s.mtNextTry;
      return;
    }
  }
  const lang = await myLang();
  if (mtPort) return; // 기다리는 사이 다른 쪽이 열었다
  mtRetryAt(now + MT_RETRY);
  let port;
  try {
    port = chrome.runtime.connectNative(HELPER_HOST);
  } catch {
    return;
  }
  mtPort = port;
  let up = 0; // 이은 때
  port.onMessage.addListener((m) => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'mt') {
      mtHandle(m).then((r) => {
        try {
          port.postMessage({ t: 'mt-res', id: m.id, ...r });
        } catch {
          /* 통로가 닫혔다 */
        }
      });
      return;
    }
    if (m.bridge === 1) {
      if (m.running) up = Date.now();
      else mtClose(port); // 도우미 트레이가 꺼져 있다 — 10분 뒤 또는 켤 때 다시
      return;
    }
    if ('running' in m) {
      // 다리를 모르는 옛 도우미 — 스스로 새 판으로 바뀔 때까지(6시간마다 본다) 열지 않는다
      mtRetryAt(Date.now() + 6 * 3600 * 1000);
      mtClose(port);
    }
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // 'Specified native messaging host not found.' = 도우미가 없다
    const wasUp = up && mtPort === port;
    mtClose(port);
    // 쓰다가 끊겼다(도우미를 다시 깔았다 등) — 조금 뒤 한 번 더
    if (wasUp) setTimeout(() => mtBridgeOpen(true), 15000);
  });
  try {
    port.postMessage({ cmd: 'mt-bridge', lang });
  } catch {
    mtClose(port);
  }
}

function mtRetryAt(t) {
  mtNextTry = t;
  chrome.storage.session.set({ mtNextTry: t }).catch(() => {});
}

function mtClose(port) {
  if (mtPort !== port) return;
  mtPort = null;
  try {
    port.disconnect();
  } catch {
    /* 이미 닫혔다 */
  }
  // 번역기는 내려놓지 않는다 — 이 확장의 탭도 같이 쓴다(쓰던 번역이 끊긴다). 안 쓰면 mtSweepSoon 이 치운다.
}

// 10분 동안 안 쓴 번역기는 내려놓는다(언어 모델이 메모리를 차지한다)
function mtSweepSoon() {
  if (mtSweep) return;
  mtSweep = setInterval(() => {
    const old = Date.now() - 10 * 60 * 1000;
    for (const map of [mtTr, mtLdMap]) {
      for (const [k, v] of map) {
        if (v.used < old) {
          map.delete(k);
          v.p.then((t) => t && t.destroy && t.destroy(), () => {});
        }
      }
    }
  }, 60 * 1000);
}

// 인터넷이 끊겨 모델을 못 받으면 크롬은 실패하지 않고 끝없이 기다린다(2026-11-23 크롬 157: 받은 적 없는 쌍, 60초 넘게 진척 0).
// 그대로 두면 검색어 바꾸기가 말없이 멈추고, 메신저 말풍선은 '번역 중' 으로 남아 인터넷이 돌아와도 다시 옮기지 않았다.
// 그래서 받는 정도가 MT_STALL 동안 그대로면 기다리던 쪽은 실패로 끝내고(스크립트는 구글 막힘 안내로 간다), 그 쌍은 1분 동안
// 새로 만들지 않고 바로 실패한다. 1분 뒤 다시 물으면 새로 만들어 본다(인터넷이 돌아왔으면 받는다).
const MT_STALL = self.__mtStallMs || 30000; // __mtStallMs: 2단계 시험만(tests/browser/lib/fake-translator-sw.js)
const MT_STALL_PAUSE = self.__mtStallPauseMs || 60000;
const mtStalled = new Map(); // 쌍 → 멈춘 것으로 본 때

// 모델을 받는 동안의 정도(0~1)를 기다리는 쪽(탭)에 알린다 — watchers. kicks = 기다리는 쪽마다 멈춤 시계를 다시 맞춘다.
function mtEntry(make) {
  const v = { p: null, used: 0, done: false, watchers: new Set(), kicks: new Set() };
  v.p = make((mon) => mon.addEventListener('downloadprogress', (e) => {
    for (const kick of v.kicks) kick();
    for (const cb of v.watchers) {
      try {
        cb(e.loaded);
      } catch {
        /* 탭이 닫혔다 */
      }
    }
  }));
  v.p.then(() => (v.done = true), () => {});
  return v;
}

function mtWatch(key, map, v, onProgress) {
  v.used = Date.now();
  if (v.done) return v.p;
  if (onProgress) v.watchers.add(onProgress);
  return new Promise((resolve, reject) => {
    let timer = 0;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        mtStalled.set(key, Date.now());
        if (map.get(key) === v) map.delete(key); // 멈춘 받기는 버린다(1분 뒤 새로)
        reject(new Error('크롬 내장 번역기 언어 모델을 받지 못합니다(인터넷 연결 확인)'));
      }, MT_STALL);
    };
    v.kicks.add(arm);
    arm();
    v.p.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      v.kicks.delete(arm);
      if (onProgress) v.watchers.delete(onProgress);
    });
  });
}

function mtGetEntry(key, map, make) {
  let v = map.get(key);
  if (!v) {
    const at = mtStalled.get(key);
    if (at && Date.now() - at < MT_STALL_PAUSE) return null;
    mtStalled.delete(key);
    v = mtEntry(make);
    const mine = v;
    v.p.then(
      (t) => map.get(key) !== mine && t && t.destroy && t.destroy(), // 멈춤으로 버린 받기가 나중에 끝났다 — 안 쓰니 내려놓는다
      () => map.get(key) === mine && map.delete(key) // 못 만들었으면 다음에 다시
    );
    map.set(key, v);
    mtSweepSoon();
  }
  return v;
}

function mtTranslator(from, to, onProgress) {
  const k = `${from}>${to}`;
  const v = mtGetEntry(k, mtTr, (monitor) => Translator.create({ sourceLanguage: from, targetLanguage: to, monitor }));
  if (!v) return Promise.reject(new Error('크롬 내장 번역기 언어 모델을 받지 못했습니다 — 잠시 뒤 다시'));
  return mtWatch(k, mtTr, v, onProgress);
}

const mtLdMap = new Map(); // 언어 알아보기는 하나뿐 — 같은 멈춤 규칙을 쓰려고 칸 하나짜리 표로
function mtDetector(onProgress) {
  const v = mtGetEntry('ld', mtLdMap, (monitor) => LanguageDetector.create({ monitor }));
  if (!v) return Promise.reject(new Error('크롬 언어 알아보기 모델을 받지 못했습니다 — 잠시 뒤 다시'));
  return mtWatch('ld', mtLdMap, v, onProgress);
}

// 크롬은 새 언어 모델을 깔 때 번역 서비스를 다시 띄워, 그 전에 만든 번역기가 고장 난다('Other generic failures occurred.' —
// 2026-11-23 크롬 157: 베트남어·중국어·일본어·태국어·영어 순으로 만들면 앞의 셋이 고장, 다시 만들면 다섯 모두 계속 된다).
// 그래서 번역·알아보기가 실패하면 그 번역기를 버리고 한 번만 새로 만들어 다시 한다. 다시도 안 되면 실패로(스크립트는 다음 길로).
async function mtRetry(key, map, get, use) {
  const v = await get();
  try {
    return await use(v);
  } catch {
    const e = map.get(key);
    if (e && e.done) {
      map.delete(key);
      e.p.then((x) => x && x.destroy && x.destroy(), () => {});
    }
    return use(await get());
  }
}

// 크롬 내장 번역기는 영어를 거쳐 옮기는데, 어떤 짧은 말은 영어로 그대로 내놓는다(2026-11-23 크롬 157: 한→베 '내일 만나요' →
// 'See you tomorrow.' — 영→베 도 그대로. 다른 짧은 말과 다른 14개 언어는 제대로). 메신저·LINE 상대에게 영어가 나가지 않게,
// 영어가 아닌 언어끼리 옮겼는데 답이 악센트 없는 로마자뿐이고 크롬 언어 알아보기가 영어로 95% 넘게 보면 실패로 돌린다(스크립트는
// 다음 길로 — 구글도 막혔으면 '번역 실패' 안내). 잰 것: 'See you tomorrow.' en 0.997, 'Thank you' 0.961, 'Bis morgen.' de,
// 'A demain.' fr, 'Sampai jumpa besok.' id — 다른 언어의 로마자 답은 걸리지 않는다. 언어 알아보기를 못 쓰면(없음·8초 넘음) 통과.
async function mtEnglishLeak(from, to, text, out) {
  const base = (c) => String(c).split('-')[0].toLowerCase();
  if (base(to) === 'en' || base(from) === 'en' || typeof LanguageDetector === 'undefined') return false;
  const o = String(out || '').trim();
  if (!o || o === String(text).trim() || !/^[\x20-\x7E]+$/.test(o) || !/[A-Za-z]{2}/.test(o)) return false;
  try {
    const got = await Promise.race([
      mtRetry('ld', mtLdMap, () => mtDetector(null), (d) => d.detect(o)),
      new Promise((r) => setTimeout(() => r(null), 8000)),
    ]);
    const top = got && got[0];
    return !!top && top.detectedLanguage === 'en' && top.confidence >= 0.95;
  } catch {
    return false;
  }
}

// m: 번역 도우미(번역 다리)의 물음 또는 이 확장 탭(gm.js)의 물음. sender 는 탭일 때만 — 모델을 받는 정도를 그 탭에 알린다.
async function mtHandle(m, sender) {
  try {
    const op = m.op;
    const tab = sender && sender.tab;
    const watch = Number(m.watch) || 0;
    const onProgress =
      tab && watch
        ? (loaded) => chrome.tabs.sendMessage(tab.id, { t: 'mt-progress', watch, loaded }, { frameId: sender.frameId || 0 }).catch(() => {})
        : null;
    const text = typeof m.text === 'string' ? m.text : '';
    if (text.length > MT_MAX_TEXT) return { ok: false, error: 'too long' };
    if (op === 'avail' || op === 'create' || op === 'tr') {
      if (!MT_LANG.test(String(m.from)) || !MT_LANG.test(String(m.to))) return { ok: false, error: 'lang' };
      if (typeof Translator === 'undefined') return op === 'avail' ? { ok: true, avail: 'unavailable' } : { ok: false, error: 'no Translator' };
      if (op === 'avail') return { ok: true, avail: await Translator.availability({ sourceLanguage: m.from, targetLanguage: m.to }) };
      if (op === 'create') {
        await mtTranslator(m.from, m.to, onProgress);
        return { ok: true };
      }
      const out = await mtRetry(`${m.from}>${m.to}`, mtTr, () => mtTranslator(m.from, m.to, null), (t) => t.translate(text));
      if (await mtEnglishLeak(m.from, m.to, text, out)) return { ok: false, error: 'english' };
      return { ok: true, out };
    }
    if (op === 'avail-ld' || op === 'create-ld' || op === 'detect') {
      if (typeof LanguageDetector === 'undefined') return op === 'avail-ld' ? { ok: true, avail: 'unavailable' } : { ok: false, error: 'no LanguageDetector' };
      if (op === 'avail-ld') return { ok: true, avail: await LanguageDetector.availability() };
      if (op === 'create-ld') {
        await mtDetector(onProgress);
        return { ok: true };
      }
      const got = await mtRetry('ld', mtLdMap, () => mtDetector(null), (d) => d.detect(text));
      const list = got.slice(0, 3).map((x) => ({ detectedLanguage: x.detectedLanguage, confidence: x.confidence }));
      return { ok: true, list };
    }
    return { ok: false, error: 'op' };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

mtBridgeOpen(false);

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
