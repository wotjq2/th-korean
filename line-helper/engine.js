// 번역 도우미(예전 LINE 도우미)의 번역 엔진. th-korean.user.js 를 그대로 불러 메신저 모드와 같은 길
// (용어집 → 무료 번역)로 옮긴다. 번역도우미.exe 가 node 로 띄우고, 한 줄에 JSON 하나씩 주고받는다.
//   {"id":1,"op":"to","lang":"th","text":"내일 봐"} → {"id":1,"ok":true,"out":"เจอกันพรุ่งนี้","via":"용어집"}
//   {"id":2,"op":"ko","text":"ว่างไหมคะ"}           → {"id":2,"ok":true,"out":"시간 있어요?","via":"표"}
// 스크립트는 GitHub 에 올린 판을 받아 쓴다(크롬과 같은 판). 못 받으면 지난번 사본, 그것도 없으면 옆 폴더의 파일.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA, 'store.json');
const SCRIPT_CACHE = path.join(DATA, 'th-korean.user.js');
const SCRIPT_URL = 'https://raw.githubusercontent.com/wotjq2/th-korean/main/th-korean.user.js';
const LOCAL_SCRIPT = path.join(__dirname, '..', 'th-korean.user.js');
fs.mkdirSync(DATA, { recursive: true });
const realSetInterval = setInterval; // 스크립트용 흉내(아래 installStubs)가 setInterval 을 막기 전에 받아 둔다

// 스크립트의 console.log 가 답 줄에 섞이지 않게 모두 stderr 로 돌린다.
console.log = console.info = (...a) => console.error(...a);

let store = {};
try {
  store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
} catch {
  /* 처음 실행 */
}
// 내 언어(크롬 '통합 번역' 창에서 고른 기준 언어) — 도우미가 data\mylang.txt 에 받아 둔다(ChromeLink → MyLang.Save).
// 스크립트는 띄울 때 GM_getValue('myLang') 로 한 번 읽으므로 바뀌면 도우미가 엔진을 다시 띄운다(MyLang.Poll).
try {
  const my = fs.readFileSync(path.join(DATA, 'mylang.txt'), 'utf8').trim();
  store.myLang = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(my) ? my : 'ko';
} catch {
  store.myLang = 'ko';
}
let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(STORE_FILE, JSON.stringify(store), () => {}), 500);
}

async function loadScript() {
  const env = process.env.TH_KOREAN_SRC; // 개발: 고친 스크립트로 시험할 때
  if (env) return fs.readFileSync(env, 'utf8');
  try {
    const r = await fetch(SCRIPT_URL, { signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    if (r.ok && text.includes('==UserScript==')) {
      fs.writeFileSync(SCRIPT_CACHE, text);
      return text;
    }
  } catch (e) {
    console.error('스크립트 받기 실패:', e.message);
  }
  if (fs.existsSync(SCRIPT_CACHE)) return fs.readFileSync(SCRIPT_CACHE, 'utf8');
  return fs.readFileSync(LOCAL_SCRIPT, 'utf8');
}

function installStubs(version) {
  global.GM_info = { script: { version } };
  global.GM_getValue = (k, d) => (k in store ? store[k] : d);
  global.GM_setValue = (k, v) => {
    store[k] = v;
    saveStore();
  };
  global.GM_addStyle = () => {};
  global.GM_registerMenuCommand = () => {};
  global.GM_xmlhttpRequest = (o) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o.timeout || 20000);
    fetch(o.url, { method: o.method || 'GET', headers: o.headers, body: o.data, signal: ac.signal })
      .then(async (r) => {
        const responseText = await r.text();
        clearTimeout(timer);
        const responseHeaders = [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n');
        o.onload && o.onload({ status: r.status, responseText, responseHeaders });
      })
      .catch((e) => {
        clearTimeout(timer);
        const cb = e.name === 'AbortError' ? o.ontimeout : o.onerror;
        cb && cb(e);
      });
    return { abort: () => ac.abort() };
  };
  // 라자다 주소로 두면 스크립트는 페이지가 다 뜨기를 기다리기만 한다(이 문서는 영영 안 뜬다).
  global.location = { hostname: 'www.lazada.co.th', search: '', pathname: '/', href: 'https://www.lazada.co.th/' };
  global.window = { addEventListener() {} };
  global.document = { readyState: 'loading', addEventListener() {}, documentElement: { lang: '' } };
  global.history = {};
  global.MutationObserver = class {
    observe() {}
  };
  global.setInterval = () => 0;
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}

const NAMES = [
  'ensureGlossary', 'chatKoreanToThai', 'koEnZhLookup', 'freeTranslateOne', 'TYPE_LANGS',
  'chatPrepThai', 'chatThaiWhole', 'TH_SHORT_REPLY', 'translateToKorean', 'chatFixKorean',
  'thaiSpeakerGender', 'HANGUL', 'THAI', 'refreshGlossary', 'koreanToLang', 'rcRefresh',
  'MY', 'freeTranslateMany', 'SCRIPT_OF', 'langGlossaryMap', 'parseGlossary', 'crossLookup', 'chatScriptLang',
];
// 스크립트가 내 언어를 알면(1.29.0~) 그 값, 아니면 한국어.
const myLang = () => (T && T.MY) || 'ko';
const myKo = () => myLang() === 'ko';
const configText = () => (store.remoteConfig && store.remoteConfig.text) || ''; // 스크립트의 RC_STORE 사본

let T = null;
const ready = (async () => {
  let src = await loadScript();
  const version = (src.match(/@version\s+(\S+)/) || [])[1] || 'line';
  installStubs(version);
  const tail = src.lastIndexOf('})();');
  const exp = NAMES.map((n) => `${n}: typeof ${n} === 'undefined' ? null : ${n}`).join(', ');
  src = src.slice(0, tail) + `globalThis.__t = { ${exp} };\n` + src.slice(tail);
  const builtConfig = configText();
  eval(src);
  T = globalThis.__t;
  console.error(`엔진 준비: 스크립트 ${version}`);
  T.ensureGlossary().catch(() => {});
  // 용어집 사본이 10분 지나면 다음 번역이 새로 받기를 1.5초까지 기다린다. 9분마다 뒤에서 미리 받아
  // 보내기·말풍선 번역이 기다리지 않게 한다(바뀐 게 없으면 GitHub 이 304 만 준다).
  realSetInterval(() => T.refreshGlossary && T.refreshGlossary().catch(() => {}), 9 * 60 * 1000).unref();
  // 번역은 크롬과 같은 스크립트 하나로 한다. 새 판이 올라오면 받아 두고 하던 번역을 마친 뒤 끝낸다 —
  // LineHelper 가 다음 요청 때 엔진을 다시 띄우면서 새 판을 쓴다(Tampermonkey 자동 업데이트와 같은 셈).
  realSetInterval(async () => {
    if (process.env.TH_KOREAN_SRC) return;
    try {
      const r = await fetch(SCRIPT_URL, { signal: AbortSignal.timeout(8000) });
      const text = await r.text();
      const v = (text.match(/@version\s+(\S+)/) || [])[1];
      if (!r.ok || !v || v === version || !text.includes('==UserScript==')) return;
      fs.writeFileSync(SCRIPT_CACHE, text);
      console.error(`스크립트 새 판 ${v} — 엔진을 다시 띄웁니다`);
      updateReady = true;
      if (!pending) finish();
    } catch {
      /* 다음에 다시 본다 */
    }
  }, 20 * 60 * 1000).unref();
  // 원격 설정(config.json — 언어 목록·언어별 용어집 파일)도 같은 셈. 스크립트는 띄울 때 읽은 사본을 끝까지 쓰고
  // 새 사본은 띄우고 3초 뒤 한 번만 받는다 — 페이지는 금방 닫히지만 엔진은 며칠 켜져 있어, 언어 21개에 용어집을
  // 붙인 뒤에도(2026-11-04) 도우미는 옛 목록으로 구글 번역만 했다. 10분마다 사본을 새로 받아 보고(1시간 넘은 것만
  // 받는다) 띄울 때와 달라졌으면 하던 번역을 마치고 끝낸다 — 다음 요청 때 새 설정으로 뜬다.
  realSetInterval(() => {
    if (T.rcRefresh) T.rcRefresh();
    const now = configText();
    if (!now || now === builtConfig || updateReady) return;
    console.error('원격 설정(config.json)이 바뀌었습니다 — 엔진을 다시 띄웁니다');
    updateReady = true;
    if (!pending) finish();
  }, 10 * 60 * 1000).unref();
})();

// 한국어 → 고른 언어. 태국어는 메신저 보내기와 같은 길(용어집 → 문장 번역).
async function toLang(text, lang) {
  if (lang === 'th') {
    const { thai, via } = await T.chatKoreanToThai(text);
    return { out: thai, via };
  }
  // 언어 목록·언어별 용어집은 스크립트의 원격 설정(config.json languages)을 그대로 따른다. 목록에 없는 코드는
  // 그 코드로 구글 번역만(도우미의 언어 막대가 먼저 새 목록을 받았을 때).
  const info = (T.TYPE_LANGS || []).find((l) => l.id === lang) || { id: lang, mt: lang };
  if (T.koreanToLang) {
    const r = await T.koreanToLang(text, info);
    return { out: r.thai, via: r.via };
  }
  const hit = (lang === 'en' || lang === 'zh') && T.koEnZhLookup && T.koEnZhLookup(text, lang);
  if (hit) return { out: hit, via: '용어집' };
  return { out: await T.freeTranslateOne(text, 'ko', info.mt), via: '번역' };
}

// 받은 말 → 한국어. 태국어는 메신저 받기(scanChat)와 같은 손질·표·번역. 누가 보낸 말인지 모르니 상대 말로 본다.
// 태국어가 아닌 말(영어·일본어 …)은 손질 없이 구글로(원문 언어는 구글이 알아본다).
async function toKorean(src) {
  if (!myKo() || !T.THAI.test(src)) return toMine(src);
  const partner = T.thaiSpeakerGender(src);
  const s = T.chatPrepThai(src, false, partner);
  const whole = T.chatThaiWhole(s);
  if (whole) return { out: whole, via: '표' };
  if (T.TH_SHORT_REPLY.test(s)) return { out: '네', via: '표' };
  const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const dict = await crossOneLine(lines, 'th');
  if (dict) return dict;
  const got = await T.translateToKorean(lines);
  if (!got.every(Boolean)) throw new Error('번역 결과가 비어 있습니다');
  return { out: T.chatFixKorean(got.join('\n'), s), via: '번역' };
}

// 한 줄짜리 낱말이 언어 교차 표(기초사전)에 있으면 구글 대신. LINE 은 상대 언어를 모르니 글자로 정해지는 언어만(로마자·키릴은 안 씀).
async function crossOneLine(lines, from) {
  if (lines.length !== 1 || !T.crossLookup || !from) return null;
  const out = await T.crossLookup(lines[0], from, myKo() ? 'ko' : myLang());
  return out ? { out, via: '사전' } : null;
}

// 크롬 실시간 자막 한 줄(LiveCaption.cs). 영상은 나에게 하는 말이 아니라서 호칭(พี่→오빠)은 바꾸지 않는다(mine).
// 태국어가 아니어도(영어·일본어 자막) 그대로 번역으로 간다.
async function captionKorean(src) {
  if (!myKo()) return toMine(src);
  const s = T.chatPrepThai(src, true, '');
  const whole = T.chatThaiWhole(s);
  if (whole) return { out: whole, via: '표' };
  const [ko] = await T.translateToKorean([s]);
  if (!ko) throw new Error('번역 결과가 비어 있습니다');
  return { out: T.chatFixKorean(ko, s), via: '번역' };
}

// 내 언어가 한국어가 아니면: 손질(พี่→오빠)·표·말투 다듬기는 한국어용이라 빼고 줄마다 구글로 내 언어에.
async function toMine(src) {
  const lines = src.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const dict = await crossOneLine(lines, T.chatScriptLang && lines.length === 1 ? T.chatScriptLang(lines[0]) : '');
  if (dict) return dict;
  const got = await T.translateToKorean(lines);
  if (!got.every(Boolean)) throw new Error('번역 결과가 비어 있습니다');
  return { out: got.join('\n'), via: '번역' };
}

// LINE 말풍선 글자 읽기. LINE 은 메시지 글자를 다른 프로그램에 주지 않아 화면에서 읽는다.
// LineHelper 가 말풍선 안쪽만 잘라 흰 바탕 검은 글자로 3배 키워 준다. 한국어 말풍선도 알아봐야
// (한국 친구 방, 태국어+한국어로 보낸 말) 엉뚱한 태국어로 읽지 않는다.
let ocrThread = null;
let ocrNext = 0;
const ocrWaiting = new Map();
function ocr(file, opts) {
  if (!ocrThread) {
    const { Worker } = require('worker_threads');
    ocrThread = new Worker(path.join(__dirname, 'ocr-worker.js'), { workerData: { cachePath: DATA } });
    ocrThread.on('message', ({ id, text, conf, lines, err }) => {
      const w = ocrWaiting.get(id);
      ocrWaiting.delete(id);
      if (w) (err ? w.reject(new Error(err)) : w.resolve({ text, conf, lines }));
    });
    ocrThread.on('error', (e) => {
      for (const w of ocrWaiting.values()) w.reject(e);
      ocrWaiting.clear();
      ocrThread = null;
    });
  }
  const id = ++ocrNext;
  return new Promise((resolve, reject) => {
    ocrWaiting.set(id, { resolve, reject });
    ocrThread.postMessage({ id, file, ...opts });
  });
}

const THAI_CH = '฀-๿';
// 줄마다 테두리 부스러기(| ) 를 떼고, 글자가 하나뿐인 부스러기 줄은 버린다. 말풍선 안에서 접힌 줄은 잇는다.
function cleanOcr(text) {
  const lines = text
    .split('\n')
    // 멀리 떨어진 한두 글자 조각(말풍선 양쪽 테두리를 읽은 것)은 버린다.
    .map((l) => l.split(/ {6,}/).filter((f, i, all) => all.length === 1 || (f.match(/\p{L}/gu) || []).length >= 2).join(' '))
    .map((l) => l.replace(/^[\s|!\[\](){}_~'"`.,]+|[\s|\[\](){}_~'"`]+$/g, '').replace(/\s+/g, ' '))
    .filter((l) => l.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 || /^[\p{L}\p{N}]$/u.test(l) && text.trim().length <= 2);
  let out = '';
  for (const l of lines) {
    const glue = out && new RegExp(`[${THAI_CH}]$`).test(out) && new RegExp(`^[${THAI_CH}]`).test(l) ? '' : ' ';
    out += (out ? glue : '') + l;
  }
  // 태국어 글자 사이에 끼운 띄어쓰기(낱말마다 띄워 읽는다)는 지운다.
  return out.replace(new RegExp(`(?<=[${THAI_CH}]) (?=[${THAI_CH}])`, 'g'), '').trim();
}

// 화면 번역(ScreenKorean.cs, Ctrl+Alt+K): 아무 프로그램 창의 글줄 → 한국어. 글줄과 자리는 윈도우에 들어 있는
// OCR 이 찾는다. 이 PC 의 윈도우 OCR 은 한국어판이라 영어를 대체로 읽지만 0/O·l/I 를 헷갈리고 한자·한글 조각을
// 끼운다(Welcome → WeIcome, to → t0, All-in-One → AI卜in-One 시, 2026-10-24 Cherry Studio). 그래서 줄마다
// 잘라 둔 그림을 영어 OCR 로 다시 읽고, 남은 헷갈림은 글자 모양으로 바로잡아 페이지 번역과 같은 길로 옮긴다.
const latinCount = (s) => (s.match(/[A-Za-z]/g) || []).length;
const hangulCount = (s) => (s.match(/[가-힣]/g) || []).length;

// 윈도우 OCR 이 헷갈렸을 법한 줄: 0/1 섞인 낱말, 소문자 사이·옆의 대문자 I/O, II, |, 영어 밖 글자.
function uiSuspect(s) {
  return /[A-Za-z][01]|[01][A-Za-z]|[a-z]I|I[a-z]{2}|II|[a-z]O\b|[a-z]l[A-Z]|\bl[A-Z]|\|/.test(s) || /[^\x00-\x7F]/.test(s);
}

const UI_SHORT = { t0: 'to', tO: 'to', '0f': 'of', '0n': 'on', '0r': 'or', '1n': 'in', '1s': 'is', '1t': 'it', '0K': 'OK', Al: 'AI' };
function uiFix(s) {
  s = s.replace(/\s+/g, ' ').trim();
  // 영어 줄에 끼어든 한자(영어 글자를 잘못 읽은 것)와 한두 글자짜리 한글 조각은 뺀다.
  if (latinCount(s) >= 3 && latinCount(s) >= hangulCount(s) * 3) {
    s = s.replace(/[一-鿿]+/g, '').replace(/(^| )[^A-Za-z0-9가-힣 ]*[ㄱ-ㆎ가-힣]{1,2}[^A-Za-z0-9가-힣 ]*(?= |$)/g, ' ');
  }
  s = s.replace(/[•·]+$/, '');
  let toks = s.split(' ').filter(Boolean).map((w, i, all) => {
    if (w === '|' && i + 1 < all.length && /^[a-z]/.test(all[i + 1])) return 'I'; // | have → I have
    const m = /^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/.exec(w);
    let core = m[2];
    if (UI_SHORT[core]) core = UI_SHORT[core];
    else if (/^[A-Za-z01]+$/.test(core) && /[01]/.test(core) && latinCount(core) >= 2) {
      const upper = core.replace(/[01]/g, '') === core.replace(/[01]/g, '').toUpperCase();
      core = core.replace(/0/g, upper ? 'O' : 'o').replace(/1/g, upper ? 'I' : 'l'); // Studi0 → Studio, P01icy → Policy
    }
    core = core.replace(/(?<=[a-z])I(?=[a-z])/g, 'l').replace(/(?<=[a-z])O(?=[a-z]|$)/g, 'o').replace(/(?<=[a-z])l(?=[A-Z])/g, 'I');
    return m[1] + core + m[3];
  });
  // 줄 양 끝의 기호 조각(아이콘을 글자로 읽은 것: £ @ `/ -)은 뗀다.
  const junk = (t) => !/[A-Za-z0-9가-힣]/.test(t);
  while (toks.length && junk(toks[0])) toks.shift();
  while (toks.length && junk(toks[toks.length - 1])) toks.pop();
  return toks.join(' ');
}

const thaiCount = (s) => (s.match(new RegExp(`[${THAI_CH}]`, 'g')) || []).length;

// 옮기지 않는 줄: 내 언어가 아닌 글자가 거의 없거나(이미 내 말), 주소·경로·메일.
// 예전에는 영어·태국어 글자만 셌다 — 윈도우 인식 언어(일본어·중국어·아랍어 …)로 읽은 줄도, 한국어가 아닌 내 언어 사용자가
// 보는 한국어 줄도 옮기도록 모든 글자를 센다(2026-11-05).
function myScriptCount(s) {
  if (myKo()) return hangulCount(s);
  const re = T.SCRIPT_OF && T.SCRIPT_OF[myLang().split('-')[0].toLowerCase()];
  return re ? (s.match(new RegExp(re.source, 'g')) || []).length : 0;
}
// 메뉴의 단축키 칸(Enter, Del, F2, Ctrl+N, Alt+Enter, Shift+F10): 'Enter' 가 '입력하다' 로 덮였다(SoftEther 메뉴, 2026-11-06).
const KEY_NAME = /^((ctrl|alt|shift|win|cmd)\s*\+\s*)*(enter|del|delete|ins|insert|esc|tab|space|home|end|pgup|pgdn|pageup|pagedown|backspace|f\d{1,2}|[a-z0-9]|up|down|left|right)$/i;
function uiSkip(s) {
  if (/https?:\/\/|www\.|^[A-Za-z]:\\|\S@\S+\.\S/.test(s)) return true;
  // 'Delete' 처럼 메뉴 이름이기도 한 낱말은 혼자 있으면 옮긴다 — 조합(Ctrl+…)이거나 단축키로만 쓰는 이름일 때만 건너뛴다.
  const key = s.trim();
  if (KEY_NAME.test(key) && (/\+/.test(key) || !/^(delete|insert|home|end|space|tab|up|down|left|right)$/i.test(key))) return true;
  // 상표·모델 번호(Apeos C3071…, zip24#, Windows 11): 로마자 낱말 둘 아래에 숫자 낱말 — 구글이 Apeos 를 '소품' 으로 옮겼다.
  const toks = s.split(/[\s,]+/).filter(Boolean);
  if (/^[\x20-\x7E]+$/.test(s) && toks.length <= 3 && toks.some((t) => /\d/.test(t)) && toks.filter((t) => /[A-Za-z]{2}/.test(t) && !/\d/.test(t)).length <= 1) return true;
  const letters = (s.match(/\p{L}/gu) || []).length;
  const mine = myScriptCount(s);
  // 한자·가나는 한 글자도 낱말이다('開'·'閉').
  const least = /[぀-ヿ㐀-鿿]/.test(s) ? 1 : 2;
  return letters - mine < least || mine >= letters - mine;
}

// 윈도우 OCR 이 제대로 읽은 한국어 줄(한글·숫자·흔한 기호뿐). 태국어를 읽으면 '11.]Li하EJ가1다益ff%' 처럼
// 로마자·한자·기호가 섞여 나온다(2026-11-01 시험 창).
const cleanKorean = (s) => /[가-힣]/.test(s) && /^[가-힣ㄱ-ㆎ0-9\s.,!?~·:;()[\]<>\-'"/%+&@#*=…]+$/.test(s);

// 태국어 OCR 로 다시 읽기. 낱말 사이에 끼운 띄어쓰기는 지운다.
async function readThai(it) {
  const r = await ocr(it.f, { langs: ['tha'], psm: it.n > 1 ? '6' : '7' });
  const t = r.text
    .replace(/\s*\n\s*/g, ' ')
    .replace(new RegExp(`(?<=[${THAI_CH}]) (?=[${THAI_CH}])`, 'g'), '')
    .trim();
  return { t, conf: r.conf };
}

// 한자·가나. 한국어 윈도우 OCR 은 중국어를 한자·한글·로마자 뒤범벅으로 읽는다(我的收藏 → 후흘存和iT月, 最近文件 →
// 뮶近文件, 2026-11-06 바이두 넷디스크). 그 뒤범벅을 구글이 한국어로 보고 한자만 한글 음으로 바꿔 '후유존화 iT월' 같은
// 엉뚱한 글이 덮였다. 그래서 그런 줄은 Tesseract 중국어(간체 → 번체 → 일본어)로 다시 읽어 가장 확신하는 쪽을 쓴다.
// 시험(그린 글줄): 간체 줄은 간체 인식기 74~96, 번체 줄은 번체 91~94, 일본어 줄은 일본어 95~96, 태국어 줄은 셋 모두 31 아래.
const CJK_CH = '぀-ヿ㐀-鿿豈-﫿';
const cjkCount = (s) => (s.match(new RegExp(`[${CJK_CH}]`, 'g')) || []).length;
const letterCount = (s) => (s.match(/\p{L}/gu) || []).length;
const CJK_LANGS = ['chi_sim', 'chi_tra', 'jpn'];

// 작은 글씨에서 Tesseract 중국어가 늘 틀리는 글자(文件夹 → 文件来·文件夫 — 바이두 넷디스크에서 세 번).
const CJK_FIX = [[/文件[来夫]/g, '文件夹']];

function cjkClean(text) {
  // 양 끝의 아이콘 조각: 글자 없는 토막(《 * <), 앞에 떨어진 한 글자(아이콘을 '包'·'心'·'由' 로 읽은 것) — 띄어쓰기를
  // 지우기 전에 뗀다(지운 뒤에는 '由新建文件来' 처럼 붙어 버렸다).
  const toks = text.replace(/\s*\n\s*/g, ' ').trim().split(' ').filter(Boolean);
  const junk = (w) => !/[\p{L}\p{N}]/u.test(w);
  while (toks.length > 1 && (junk(toks[0]) || (toks[0].length === 1 && cjkCount(toks.slice(1).join('')) >= 2))) toks.shift();
  while (toks.length > 1 && junk(toks[toks.length - 1])) toks.pop();
  let t = toks
    .join(' ')
    .replace(new RegExp(`(?<=[${CJK_CH}]) (?=[${CJK_CH}])`, 'g'), '')
    .replace(/[\s《〈<>〉》*•·]+$/u, '');
  for (const [re, to] of CJK_FIX) t = t.replace(re, to);
  return t;
}

// 한자·가나가 둘 넘고 글자의 절반 넘게(영어가 섞인 'Apeos …维修手册.zip' 은 아주 확신할 때), 한 글자 줄('开')은 아주 확신할 때만.
function cjkOk(r) {
  const n = cjkCount(r.t);
  const letters = letterCount(r.t);
  if (!n || r.conf < 55) return false;
  if (n >= 2) return n * 2 >= letters || r.conf >= 75;
  return letters === 1 && r.conf >= 85;
}

// 용어집(거꾸로)에 있는 낱말로 읽혔으면 그 읽기를 믿는다 — 작은 글씨에서 인식기마다 한두 글자씩 틀렸다(最近文件 → 最近交件,
// 传输 → 傳給). 윈도우 한국어 인식기가 한자로 그대로 읽은 줄(最近·同步·回收站)도 먼저 본다. 짧은 줄(한자 6자 이하)은
// 용어집에 없으면 세 인식기를 다 돌려 가장 확신하는 쪽, 긴 줄은 또렷하면(88) 거기서 그만.
const inGlossary = async (t) => !!(await reverseGlossary(t).catch(() => ''));
async function readCjk(it) {
  const own = cjkClean(String(it.t || ''));
  if (cjkCount(own) >= 2 && cjkCount(own) === letterCount(own) && (await inGlossary(own))) return { t: own, conf: 99 };
  let best = null;
  const reads = [];
  for (const lang of CJK_LANGS) {
    const r = await ocr(it.f, { langs: [lang], psm: it.n > 1 ? '6' : '7' });
    const got = { t: cjkClean(r.text), conf: r.conf };
    if (!cjkOk(got)) continue;
    if (await inGlossary(got.t)) return { t: got.t, conf: Math.max(got.conf, 90) };
    reads.push(got);
    if (!best || got.conf > best.conf) best = got;
    if (best.conf >= 88 && cjkCount(best.t) > 6) break;
  }
  // 증거: 윈도우 인식기의 글과 다른 인식기들이 읽은 글.
  for (const g of reads.sort((a, b) => b.conf - a.conf)) {
    const others = reads.filter((x) => x !== g).map((x) => x.t).join('');
    const near = await nearGlossary(g.t, String(it.t || '') + others).catch(() => '');
    if (near) return { t: near, conf: Math.max(g.conf, 90) };
  }
  return best;
}

// 모든 줄을 영어 OCR 로 한 번 더 읽는다. 헷갈린 표시가 없어도 윈도우 OCR 은 글자를 빠뜨리거나 바꾼다
// (typing → vping, Spell → SpeII, Use → lJse — 표시만 보고 다시 읽던 때 그대로 번역됐다, 2026-10-24).
// 글자만 같고 띄어쓰기만 다르면 윈도우 쪽을 쓴다(Setup later ↔ Set up later). 다르면 영어 OCR 이 충분히
// 확신할 때만 — 윈도우 쪽이 수상하면 덜 확신해도 영어 OCR 을 믿는다.
// mode(트레이 '화면 번역 글자'): auto = 영어로 안 읽히고 한국어도 아니면 태국어로 읽어 본다, th = 한국어가
// 아니면 태국어로 먼저, latin = 영어·로마자만(예전처럼).
// 영어로 안 읽히는 줄(2026-11-06): 태국어·한자·가나 인식기로 읽어 받아들일 만한 것 중 가장 확신하는 쪽. 윈도우 OCR 이 한자를
// 보았으면 한자 쪽부터, 아니면 태국어부터 — 아주 또렷하면(태국어 85, 한자 88) 다른 쪽은 건너뛴다. 아무것도 못 읽은 뒤범벅 줄은
// 덮지 않는다('' — 원문이 보이게). 엉뚱한 한국어로 덮는 것보다 낫다.
async function uiLine(it, mode = 'auto') {
  // 그 언어의 윈도우 인식기가 읽은 줄(w) — 영어 손질(uiFix 는 영어 줄의 한자를 지운다)·다시 읽기 없이 그대로.
  if (it.w) return String(it.t || '').replace(/\s+/g, ' ').trim();
  const win = uiFix(it.t);
  if (!it.f) return win;
  const lat = latinCount(it.t);
  const cjk = cjkCount(it.t);
  const letters = letterCount(it.t);
  // 아이콘 줄: 한 글자씩 떨어진 토막뿐('覓• 哿' — 게임·달력·선물 아이콘을 한자로 읽었고 중국어 OCR 은 '时过' → '시간이 지났다').
  const toks = String(it.t).split(/\s+/).filter(Boolean);
  if (toks.length >= 2 && toks.every((w) => letterCount(w) <= 1)) return '';
  const cands = [];
  try {
    // 로마자가 하나도 없는 줄은 영어로 다시 읽지 않는다(한자 줄을 영어 OCR 로 읽으면 'BHATIA' 같은 부스러기).
    if (mode !== 'th' && (lat > 0 || mode === 'latin')) {
      const r = await ocr(it.f, { langs: ['eng'], psm: it.n > 1 ? '6' : '7' });
      const tess = uiFix(r.text.replace(/\s*\n\s*/g, ' '));
      const bare = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
      const ascii = /^[\x20-\x7E]+$/.test(it.t);
      if (bare(tess) === bare(win) && (ascii || mode === 'latin')) return win;
      const engOk = r.conf >= (uiSuspect(it.t) ? 60 : 80) && latinCount(tess) >= latinCount(win) * 0.7;
      if (mode === 'latin') return engOk ? tess : win;
      if (engOk && !cjk) return tess;
      if (engOk) cands.push({ t: tess, conf: r.conf }); // 한자가 섞였다 — 한자 인식기와 겨룬다
    }
    if (mode === 'latin') return win;
    if (cleanKorean(it.t)) return win;
    const thai = async () => {
      const th = await readThai(it);
      // 태국 숫자(๐-๙)는 세지 않는다 — 'ApeosC2450S.' 를 '2๒๑0๐ร624505.' 로 읽고 태국어 줄로 받아들였다.
      // 윈도우 OCR 이 깨끗한 로마자로 읽은 줄('EEAI' = 库库AI)은 태국어로 아주 또렷할 때만 — 'ธรม' 으로 읽고 '공정한' 이 덮였다.
      const n = thaiCount(th.t.replace(/[๐-๙]/g, ''));
      const ascii = /^[\x20-\x7E]+$/.test(it.t) && mode !== 'th';
      const ok = ascii ? n >= 5 && th.conf >= 80 : n >= 3 && th.conf >= (mode === 'th' ? 45 : 60);
      if (ok) cands.push(th);
      return ok ? th.conf : 0;
    };
    const han = async () => {
      const c = await readCjk(it);
      if (c) cands.push(c);
      return c ? c.conf : 0;
    };
    if (mode === 'th') await thai();
    else if (cjk) {
      if ((await han()) < 88) await thai();
    } else if ((await thai()) < 85 && lat * 2 < letters) await han(); // 로마자 줄은 영어 아니면 태국어 뒤범벅
  } catch (e) {
    console.error('화면 글줄 다시 읽기 실패:', e.message);
  }
  if (cands.length) return cands.sort((a, b) => b.conf - a.conf)[0].t;
  if (lat >= 2 && lat * 2 >= letters) return win; // 로마자 줄 — 예전처럼 윈도우 글로
  if (cjk && cjk === letters) return win; // 한자만 — 한국어 인식기가 한자로 읽은 그대로
  if (!cjk && hangulCount(it.t) * 10 >= letters * 7) return win; // 한국어 줄(부스러기 섞임)
  return '';
}

// 그 언어 용어집(th-korean-glossary 의 glossary-zh.txt·glossary-ja.txt, '한국어=그 언어')을 거꾸로: 화면의 중국어·일본어 줄
// 전체가 어떤 줄의 값과 같으면 그 한국어. 가나가 있으면 일본어, 아니면 중국어 파일. 같은 값이 여러 줄이면 아래 줄.
const revMaps = new Map(); // 파일 → { text, map: Map(값 → 한국어) }
const KRDICT_END = '# === 한국어기초사전 끝'; // 이 줄 위는 사전에서 온 낱말, 아래는 직접 고른 말
// 번체로 읽힌 메뉴 글자도 간체 값과 맞게(번체 인식기가 首页 를 首頁 로 읽었다). 열쇠만 바꾼다 — 화면 글은 그대로.
const T2S_MAP = new Map(
  ('頁页 檔档 傳传 輸输 開开 關关 設设 進进 圖图 視视 頻频 訊讯 錄录 紀纪 載载 個个 時时 間间 類类 夾夹 總总 動动 備备 ' +
    '雲云 網网 盤盘 員员 會会 書书 庫库 識识 問问 轉转 換换 單单 學学 習习 線线 隱隐 訪访 創创 業业 刪删 復复 貼贴 幫帮 ' +
    '閉闭 儲储 鍵键 級级 與与 為为 這这 說说 點点 擊击 發发 讀读 寫写 錯错 誤误 標标 題题 頭头 條条 號号 碼码 帳账 戶户 務务')
    .split(' ')
    .map((p) => [p[0], p[1]])
);
const revKey = (s) =>
  String(s)
    .replace(/[\s。．.!！?？:：,，、·•]+/g, '')
    .replace(/./gu, (c) => T2S_MAP.get(c) || c);
async function reverseGlossary(line) {
  const m = await revMap(line);
  return (m && m.get(revKey(line))) || '';
}

// 한 글자만 틀리게 읽은 메뉴 낱말: 용어집 값과 길이가 같고(네 자 넘게) 한 글자만 다른 값이 하나뿐이며, 네 자 낱말은 그 글자를
// 윈도우 인식기나 다른 인식기도 이 줄에서 읽었으면 그 값(最近交件 → 最近文件: 윈도우가 '믒近文件' 으로 文 을 읽었다).
// 고친 중국어를 돌려준다.
async function nearGlossary(line, win) {
  const m = await revMap(line);
  const key = [...revKey(line)];
  if (!m || key.length < 4) return '';
  const seen = new Set(revKey(win));
  let found = '';
  for (const v of m.keys()) {
    const cand = [...v];
    if (cand.length !== key.length) continue;
    const diff = cand.map((c, i) => (c === key[i] ? -1 : i)).filter((i) => i >= 0);
    // 다섯 자 넘는 낱말은 한 글자 차이면 그대로 믿는다(文件来备份 → 文件夹备份), 네 자는 증거가 있어야.
    if (diff.length !== 1 || (key.length < 5 && !seen.has(cand[diff[0]]))) continue;
    if (found) return ''; // 둘 넘게 맞으면 모른다
    found = v;
  }
  return found;
}

async function revMap(line) {
  if (!T.langGlossaryMap || !T.parseGlossary) return null;
  const id = /[぀-ヿ]/.test(line) ? 'ja' : 'zh';
  let file = `glossary-${id}.txt`;
  try {
    const l = (JSON.parse(configText()).languages || []).find((x) => x.id === id);
    if (l && l.glossary) file = l.glossary;
  } catch {
    /* 설정 사본이 없으면 기본 이름 */
  }
  await T.langGlossaryMap(file); // 사본이 없거나 1시간 지났으면 새로 받는다
  const st = store[`langGlossary:${file}`];
  if (!st || !st.text) return null;
  let r = revMaps.get(file);
  if (!r || r.text !== st.text) {
    const map = new Map();
    // 파일 위쪽의 기초사전 낱말(3만 줄)은 거꾸로 쓰지 않는다 — 뜻이 비슷한 표제어가 같은 값을 가져(시작·개시 = 开始) 드문 말이
    // 나오고, 글자 교정(nearGlossary)도 엉뚱한 낱말로 맞춘다. 화면 번역은 직접 고른 말(표시 아래쪽)만.
    const cut = st.text.lastIndexOf(KRDICT_END);
    // '# --- 대화 …' 칸(메신저 말투: 넵=はい, 오키=好的)도 거꾸로 쓰지 않는다 — 프로그램 화면의 はい 가 '넵' 으로 나왔다.
    let chat = false;
    const own = (cut < 0 ? st.text : st.text.slice(cut))
      .split('\n')
      .filter((l) => {
        if (l.startsWith('# ---')) chat = l.startsWith('# --- 대화');
        return !chat;
      })
      .join('\n');
    for (const [ko, v] of Object.entries(T.parseGlossary(own).map)) map.set(revKey(v), ko);
    r = { text: st.text, map };
    revMaps.set(file, r);
  }
  return r.map;
}

// 줄 묶음 번역. 구글은 한 묶음의 말을 한 언어로 보고 옮겨서, 영어 줄과 섞인 필리핀어 줄은 그대로 돌아왔다
// (2026-11-01). 태국어 줄은 따로 묶고(메신저 받는 쪽과 같은 손질), 그래도 그대로 돌아온 로마자 줄은 한 줄씩 다시 묻는다.
async function uiTranslate(lines) {
  const out = new Array(lines.length).fill('');
  const thai = [];
  const latin = [];
  const cjk = []; // 한자·가나 줄은 따로 묶는다 — 한글 부스러기가 섞인 묶음은 구글이 한국어로 보고 한자를 한글 음으로만 바꿨다
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    // 메뉴 낱말은 그 언어 용어집에서 먼저(구글: 首页 → 첫 페이지, 同步 → 동기식, 我的分享 → 내 몫). 图片转Excel 처럼
    // 로마자가 섞인 낱말도.
    const hit = myKo() && cjkCount(s) ? await reverseGlossary(s).catch(() => '') : '';
    if (hit) out[i] = hit;
    else (thaiCount(s) >= 2 ? thai : cjkCount(s) && cjkCount(s) >= latinCount(s) ? cjk : latin).push(i);
  }
  if (cjk.length) {
    const got = await T.translateToKorean(cjk.map((i) => lines[i]));
    cjk.forEach((i, k) => (out[i] = String(got[k] || '')));
    const same = (i) => (myKo() ? !T.HANGUL.test(out[i]) : out[i].trim() === lines[i].trim());
    for (const i of cjk.filter(same).slice(0, 8)) {
      const [one] = await T.translateToKorean([lines[i]]);
      if (one) out[i] = one;
    }
  }
  if (thai.length && !myKo()) {
    const got = await T.translateToKorean(thai.map((i) => lines[i]));
    thai.forEach((i, k) => (out[i] = String(got[k] || '')));
  } else if (thai.length) {
    const prep = thai.map((i) => T.chatPrepThai(lines[i], true, ''));
    const ask = [];
    prep.forEach((p, k) => {
      const whole = T.chatThaiWhole(p);
      if (whole) out[thai[k]] = whole;
      else ask.push(k);
    });
    const got = ask.length ? await T.translateToKorean(ask.map((k) => prep[k])) : [];
    ask.forEach((k, j) => {
      if (got[j]) out[thai[k]] = T.chatFixKorean(got[j], prep[k]);
    });
  }
  if (latin.length) {
    const got = await T.translateToKorean(latin.map((i) => lines[i]));
    latin.forEach((i, k) => (out[i] = String(got[k] || '')));
    const same = (i) => (myKo() ? !T.HANGUL.test(out[i]) : out[i].trim().toLowerCase() === lines[i].trim().toLowerCase());
    // 구글이 묶음의 언어를 잘못 알아보면 묶음째 그대로(또는 비어) 돌아온다 — 한 줄씩 다시 묻는 것은 8줄까지라 줄이 많은 창일수록
    // 영어로 남는 줄이 늘었다(2026-11-06 "영어 갯수가 많으면 번역이 안되는거 같아요"). 그대로 온 로마자 줄은 먼저 '영어에서' 로
    // 못 박아 한 번에 다시 묻는다(로마자 화면 글은 대부분 영어). 그래도 남은 줄만 한 줄씩(자동 알아보기).
    const stuck = latin.filter(same);
    if (stuck.length && T.freeTranslateMany) {
      const en = await T.freeTranslateMany(stuck.map((i) => lines[i]), 'en', myLang()).catch(() => null);
      stuck.forEach((i, k) => {
        const v = en && String(en[k] || '').trim();
        if (v && v.toLowerCase() !== lines[i].trim().toLowerCase() && (!myKo() || T.HANGUL.test(v))) out[i] = v;
      });
    }
    const again = latin.filter((i) => same(i) && /\S+\s+\S+/.test(lines[i])).slice(0, 8);
    for (const i of again) {
      const [one] = await T.translateToKorean([lines[i]]);
      if (one) out[i] = one;
    }
  }
  return out;
}

// items: [{t: 윈도우 OCR 글자, f: 잘라 낸 그림(흰 바탕 검은 글자), n: 줄 수}] → [{s: 옮긴 원문, k: 한국어 또는 ''}]
async function screenLines(items, mode) {
  const src = [];
  for (const it of items) src.push(await uiLine(it, mode));
  const todo = src.map((s, i) => (uiSkip(s) ? -1 : i)).filter((i) => i >= 0);
  const got = todo.length ? await uiTranslate(todo.map((i) => src[i])) : [];
  const out = src.map((s) => ({ s, k: '' }));
  todo.forEach((i, k) => {
    const ko = String(got[k] || '').trim();
    // 바뀌지 않은 것(상표·이름)은 덮지 않는다.
    if ((myKo() ? T.HANGUL.test(ko) : !!ko) && ko.toLowerCase() !== src[i].toLowerCase()) out[i].k = ko;
  });
  return out;
}

async function handle(req) {
  await ready;
  if (req.op === 'ocr') {
    const { text, conf, lines } = await ocr(req.text);
    // 여러 줄이면 확신도 낮은 줄(테두리 부스러기)은 뺀다.
    const good = lines && lines.length > 1 ? lines.filter((l) => l.conf >= 60).map((l) => l.text.trim()).join('\n') : text;
    return { out: cleanOcr(good), via: String(Math.round(conf)) };
  }
  if (req.op === 'warm') {
    await T.ensureGlossary();
    return { out: '', via: '' };
  }
  // 번역 도우미의 메뉴·알림 글(한국어) → 내 언어(MyLang.T). text = JSON 배열, 답도 같은 차례의 JSON 배열.
  if (req.op === 'ui') {
    const list = JSON.parse(req.text || '[]');
    const to = req.lang || myLang();
    const got = to === 'ko' || !T.freeTranslateMany ? list : await T.freeTranslateMany(list, 'ko', to);
    return { out: JSON.stringify(list.map((s, i) => String((got && got[i]) || s))), via: '번역' };
  }
  if (req.op === 'screen') {
    const out = await screenLines(JSON.parse(req.text), req.lang || 'auto');
    return { out: JSON.stringify(out), via: String(out.filter((o) => o.k).length) };
  }
  const text = String(req.text || '').replace(/\r\n?/g, '\n').trim();
  if (req.op === 'to') {
    const r = await toLang(text, req.lang);
    if (!r.out || (myKo() ? T.HANGUL.test(r.out) : r.out.trim() === text)) throw new Error('번역 결과가 비어 있습니다');
    return r;
  }
  if (req.op === 'ko') {
    const r = await toKorean(text);
    if (!r.out || T.THAI.test(r.out)) throw new Error('번역 결과가 비어 있습니다');
    return r;
  }
  if (req.op === 'caption') {
    const r = await captionKorean(text);
    if (!r.out || T.THAI.test(r.out)) throw new Error('번역 결과가 비어 있습니다');
    return r;
  }
  throw new Error(`모르는 요청: ${req.op}`);
}

let pending = 0;
let closed = false;
let updateReady = false; // 새 스크립트를 받아 두었다 — 하던 번역이 끝나면 끝낸다

function finish() {
  clearTimeout(saveTimer);
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store));
  } catch {
    /* 저장 실패는 다음에 다시 받으면 된다 */
  }
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  pending++;
  handle(req)
    .then(
      (r) => process.stdout.write(JSON.stringify({ id: req.id, ok: true, ...r }) + '\n'),
      (e) => process.stdout.write(JSON.stringify({ id: req.id, ok: false, err: String(e.message || e) }) + '\n')
    )
    .finally(() => {
      if (--pending === 0 && (closed || updateReady)) finish();
    });
});
// LineHelper.exe 가 꺼지면 입력이 닫힌다 — 하던 번역을 마치고 같이 끝낸다.
rl.on('close', () => {
  closed = true;
  if (!pending) finish();
});
