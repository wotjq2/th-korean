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
    ocrThread.on('message', ({ id, text, conf, lines, words, err }) => {
      const w = ocrWaiting.get(id);
      ocrWaiting.delete(id);
      if (w) (err ? w.reject(new Error(err)) : w.resolve({ text, conf, lines, words }));
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

// ---- 화면에 박힌 자막(하드 자막) 읽기 ----
// 사용자(2026-11-18, 중국 드라마 vrGIeGBPXwc): 자막 파일이 없어 크롬 실시간 자막(소리 → 번역)이 한 문장씩 늦게 나와
// 화면에 박힌 중국어 자막과 엇갈렸다. 확장이 영상에서 자막 줄을 찾아 원본 크기(줄 높이 72 화소 안쪽)로 잘라 보내면
// (RGBA), 여기서 '획'만 남긴 흑백으로 바꿔 Tesseract 로 읽는다. 글자 고르기를 여기(엔진)에 둔 것은 손볼 때 스토어에
// 다시 올리지 않으려고 — engine.js 는 번역 도우미가 GitHub 에서 6시간마다 받아 엔진만 다시 띄운다.
// 시험(5개 드라마 64장, 자막 25줄): 획 고르기 + psm 13 = 20줄 정확, 글자 오류 4.7%. 한 줄 30~90ms.

// 획: 밝은 무채색 화소가 짧게(획 두께 안) 이어지고 그 양 끝 가까이에 어두운 테두리가 있는 곳. 가로·세로 두 방향.
// 넓게 밝은 배경(하늘·흰 옷)은 끝이 어둡지 않거나 너무 길어 빠진다.
function hsInk(px, w, h, o) {
  const { white, satMax, drop, maxS, edge } = o;
  const lum = new Uint8Array(w * h);
  const ok = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (r * 299 + g * 587 + b * 114) / 1000;
    lum[i] = l;
    ok[i] = l >= white && mx - mn <= satMax ? 1 : 0;
  }
  const ink = new Uint8Array(w * h);
  const scan = (start, n, step) => {
    let a = -1;
    for (let k = 0; k <= n; k++) {
      const on = k < n && ok[start + k * step];
      if (on && a < 0) a = k;
      if (!on && a >= 0) {
        if (k - a <= maxS) {
          let peak = 0;
          for (let t = a; t < k; t++) peak = Math.max(peak, lum[start + t * step]);
          const lim = peak - drop;
          let L = false, R = false;
          for (let d = 1; d <= edge && !L; d++) if (a - d >= 0 && lum[start + (a - d) * step] <= lim) L = true;
          for (let d = 0; d < edge && !R; d++) if (k + d < n && lum[start + (k + d) * step] <= lim) R = true;
          if (L && R) for (let t = a; t < k; t++) ink[start + t * step] = 1;
        }
        a = -1;
      }
    }
  };
  for (let y = 0; y < h; y++) scan(y * w, w, 1);
  for (let x = 0; x < w; x++) scan(x, h, w);
  return ink;
}

// 자막 흰색은 그 줄에서 가장 밝은 무채색(위 2%) — 그보다 28 어두운 것까지만 글자로 본다(흰 옷·밝은 배경이 글자 사이를 메우지 않게).
// 시험에서 고른 값: 획 두께 한계 = 영상 높이 × 0.045, 테두리 거리 = 영상 높이 × 0.004(최소 2).
// rows = 글줄(위아래 부호까지), core = 획이 몰린 띠(1.33 확장부터). 흰색 기준은 띠에서 잰다. 답: 그 줄 범위만 남긴 흑백
// 그림을 만드는 함수 — 한자·가나·한글은 띠만(1.32 와 같은 범위), 다른 글자는 글줄 전체.
function hsBinarize(px, w, h, rows, vh, core, margin = 0) {
  const hist = new Array(256).fill(0);
  let n = 0;
  const hr = core || rows;
  for (let y = hr[0]; y < hr[1]; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const r = px[p], g = px[p + 1], b = px[p + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 70) continue;
      hist[Math.round((r * 299 + g * 587 + b * 114) / 1000)]++;
      n++;
    }
  let acc = 0, top = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= n * 0.02) {
      top = v;
      break;
    }
  }
  const ink = hsInk(px, w, h, {
    white: Math.max(150, Math.min(235, top - 28)),
    satMax: 70,
    drop: 70,
    maxS: Math.max(3, Math.round(vh * 0.045)),
    edge: Math.max(2, Math.round(vh * 0.004)),
  });
  const made = new Map();
  // r = 잉크를 남길 줄 범위. tight(한자): 그 범위의 잉크 둘레에서 tight 화소만 남기고 자른다 — psm 13(통째로 한 줄)은 그림
  // 높이를 글줄 높이로 보아, 위아래 빈 곳이 크면 망가졌다(1.32 시험 크기: 둘레 0.3줄). 아니면 그림 전체 + 둘레 흰 여백
  // margin — 위 부호가 그림 끝에 닿으면 Tesseract 가 부호를 버렸다. gaps = 잉크 없는 세로 틈(빈칸 정하기에 씀).
  return (r, tight = 0) => {
    const key = r.join('-') + '/' + tight;
    if (made.has(key)) return made.get(key);
    let x0 = w, x1 = 0;
    const perRow = new Array(h).fill(0);
    const perCol = new Array(w).fill(0);
    for (let y = r[0]; y < r[1]; y++)
      for (let x = 0; x < w; x++)
        if (ink[y * w + x]) {
          perRow[y]++;
          perCol[x]++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
    const T = tight | 0;
    const ox = T ? Math.max(0, x0 - T) : 0;
    const oy = T ? Math.max(0, r[0] - T) : 0;
    const ow = T ? Math.min(w, x1 + 1 + T) - ox : w;
    const oh = T ? Math.min(h, r[1] + T) - oy : h;
    const M = T ? 0 : margin | 0;
    const W2 = Math.max(1, ow) + 2 * M;
    const H2 = Math.max(1, oh) + 2 * M;
    const out = Buffer.alloc(W2 * H2, 255);
    for (let y = r[0]; y < r[1]; y++)
      for (let x = ox; x < ox + ow; x++) if (ink[y * w + x] && y >= oy && y < oy + oh) out[(y - oy + M) * W2 + x - ox + M] = 0;
    const gaps = [];
    for (let x = x0, a = -1; x <= x1 + 1; x++) {
      const empty = x <= x1 && !perCol[x];
      if (empty && a < 0) a = x;
      if (!empty && a >= 0) {
        gaps.push([a - ox + M, x - ox + M]);
        a = -1;
      }
    }
    const pgm = Buffer.concat([Buffer.from(`P5\n${W2} ${H2}\n255\n`), out]); // PGM — Tesseract(Leptonica)가 바로 읽는다
    if (process.env.TH_HS_DEBUG) fs.writeFileSync(path.join(require('os').tmpdir(), `hs-${Date.now()}-${key.replace('/', '_')}.pgm`), pgm);
    const bands = hsLineBands(perRow, r);
    const got = { file: `data:image/pgm;base64,${pgm.toString('base64')}`, lines: bands.length, bands, gaps };
    made.set(key, got);
    return got;
  };
}

// 글줄 수 — 두 줄 자막(영어·스페인어 드라마에 흔하다)은 한 줄로 읽으면(psm 7·13) 두 줄이 뒤섞인다.
// 잉크가 거의 없는 가로줄로 끊긴 덩어리 가운데 큰 것(가장 큰 덩어리 높이의 60% 넘게)만 센다 — 태국어·라오어의 위아래
// 부호(성조·모음)는 작은 덩어리라 세지 않는다. 사이가 덩어리 높이의 15% 아래면 붙어 있는 것으로 본다.
// 글줄마다의 줄 범위(위·아래 줄과의 사이 한가운데까지 — 그 사이의 위아래 부호도 그 줄에 든다).
function hsLineBands(perRow, rows) {
  let max = 0;
  for (let y = rows[0]; y < rows[1]; y++) max = Math.max(max, perRow[y]);
  if (!max) return [];
  const runs = [];
  let a = -1;
  for (let y = rows[0]; y <= rows[1]; y++) {
    const on = y < rows[1] && perRow[y] > max * 0.04;
    if (on && a < 0) a = y;
    if (!on && a >= 0) {
      runs.push([a, y]);
      a = -1;
    }
  }
  const tall = Math.max(...runs.map(([s, e]) => e - s));
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < tall * 0.15) last[1] = r[1];
    else merged.push([...r]);
  }
  const big = Math.max(...merged.map(([s, e]) => e - s));
  const lines = merged.filter(([s, e]) => e - s >= big * 0.6); // 0.45 로는 라오어 위 부호 줄이 한 줄로 셌다
  return lines.map(([s, e], i) => [
    i ? Math.ceil((lines[i - 1][1] + s) / 2) : rows[0],
    i < lines.length - 1 ? Math.floor((e + lines[i + 1][0]) / 2) : rows[1],
  ]);
}

// 읽은 줄 손질: 한자 사이 띄어쓰기를 지우고 양 끝 부스러기(따옴표·쉼표·> 등)를 뗀다.
function hsClean(t) {
  return String(t || '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(new RegExp(`(?<=[${CJK_CH}，。？！、]) +(?=[${CJK_CH}，。？！、])`, 'g'), '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}？！。…]+$/gu, '')
    .trim();
}

// 낱말 자리로 줄을 다시 잇는다. 사용자(2026-11-19 캡처): 구절을 띄어 쓴 자막의 빈칸을 지우고 붙이니 구글이 뜻을 뭉갰다 —
// '谁说的你们俩谁说的' → '너희 둘은 누가 그랬어?', 쉼표로 두면 '누가 말했어? 둘 중 누가 말했나요?'. 그래서 한자 사이가 한 글자
// 크기(em)의 75% 넘게 벌어졌으면 '，' — 시험(28줄): 보통 글자 사이는 em 의 0.71 까지, 구절 사이 빈칸은 0.77~1.25. 양 끝의 한자 없는 부스러기(자른 가장자리를 읽은 '1')는 떨어져 있거나 흐리면 버린다
// ('1扒衣服吧把他衣服脱了1' → '1옷을 벗으세요 1' 이었다).
function hsJoin(words, fallback) {
  const isCjk = (t) => new RegExp(`[${CJK_CH}]`).test(t);
  const ws = (words || []).map((w) => ({ ...w, t: String(w.t || '').trim() })).filter((w) => w.t);
  // 글자 크기(em) = 한자 낱말 높이 중 큰 쪽(一·二 처럼 납작한 글자는 낮다)
  const hs = ws.filter((w) => isCjk(w.t)).map((w) => w.h || 0).sort((a, b) => a - b);
  if (hs.length < 2) return hsClean(fallback);
  const cw = hs[Math.floor((hs.length - 1) * 0.8)];
  if (process.env.TH_HS_DEBUG) console.error(`[hs] em ${cw} ` + ws.map((w, i) => (i ? `(${w.x0 - ws[i - 1].x1})` : '') + w.t).join(''));
  const junk = (w, gap) => !isCjk(w.t) && [...w.t].length <= 2 && (gap > cw * 0.4 || w.c < 50);
  while (ws.length > 1 && junk(ws[0], ws[1].x0 - ws[0].x1)) ws.shift();
  while (ws.length > 1 && junk(ws[ws.length - 1], ws[ws.length - 1].x0 - ws[ws.length - 2].x1)) ws.pop();
  let out = '';
  ws.forEach((w, i) => {
    if (i) {
      const a = isCjk(ws[i - 1].t);
      const b = isCjk(w.t);
      if (a && b && w.x0 - ws[i - 1].x1 > cw * 0.75 && !/[，。？！、…：；,.?!]$/.test(out)) out += '，';
      else if (!a || !b) out += ' ';
    }
    out += w.t;
  });
  return hsClean(out);
}

// ---- 30개 언어(2026-11-19, 사용자: '30개 언어 모두 자막이 있으면 중국어 영상과 동일하게') ----
// 언어(구글 코드) → [Tesseract 모델, 글자 갈래]. 모델은 처음 쓸 때 jsdelivr(@tesseract.js-data)에서 받아 data\ 에 둔다.
// 필리핀어는 tgl 이 그 저장소에 없어 fil(필리핀어). 광둥어 자막은 번체 한자로 쓴다.
const HS_LANGS = {
  'zh-CN': ['chi_sim', 'han'], 'zh-TW': ['chi_tra', 'han'], yue: ['chi_tra', 'han'], ja: ['jpn', 'ja'], ko: ['kor', 'ko'],
  th: ['tha', 'th'], en: ['eng', 'lat'], vi: ['vie', 'lat'], id: ['ind', 'lat'], ms: ['msa', 'lat'], tl: ['fil', 'lat'],
  pt: ['por', 'lat'], es: ['spa', 'lat'], fr: ['fra', 'lat'], de: ['deu', 'lat'], tr: ['tur', 'lat'], pl: ['pol', 'lat'],
  it: ['ita', 'lat'], ru: ['rus', 'cyr'], mn: ['mon', 'cyr'], ar: ['ara', 'arab'], ur: ['urd', 'arab'], hi: ['hin', 'deva'],
  mr: ['mar', 'deva'], bn: ['ben', 'beng'], ta: ['tam', 'taml'], te: ['tel', 'telu'], he: ['heb', 'hebr'], km: ['khm', 'khmr'],
  lo: ['lao', 'laoo'], my: ['mya', 'mymr'],
};
const HS_SCRIPT = {
  han: /[㐀-鿿豈-﫿]/, ja: /[぀-ヿㇰ-ㇿ㐀-鿿豈-﫿ー]/, ko: /[가-힣ㄱ-ㆎ]/, th: /[฀-๿]/, lat: /[A-Za-zÀ-ɏḀ-ỿ]/,
  cyr: /[Ѐ-ԯ]/, arab: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/, deva: /[ऀ-ॿ]/, beng: /[ঀ-৿]/, taml: /[஀-௿]/, telu: /[ఀ-౿]/,
  hebr: /[֐-׿]/, khmr: /[ក-៿᧠-᧿]/, laoo: /[຀-໿]/, mymr: /[က-႟ꩠ-ꩿ]/,
};
// 낱말 사이를 띄지 않는 글자(빈칸은 구절 사이에만) — 낱말 상자 사이가 벌어진 곳에만 빈칸을 둔다.
const HS_NOSPACE = new Set(['th', 'khmr', 'laoo', 'mymr', 'ja']);

const hsCount = (s, re) => (String(s).match(new RegExp(re.source, re.flags.replace('g', '') + 'g')) || []).length; // u 깃발(p{L})을 살린다
// 읽은 글이 그 언어의 자막인가. 자막이 아닌 곳(흰 간판·옷 무늬)을 읽으면 확신도가 낮거나 다른 글자·기호가 섞인다.
// 한자: 둘 넘고 글자·숫자의 80% 넘게 한자, 확신도 40(1.32.0 과 같은 셈). 일본어는 가나가 하나는 있어야 한다(한자만이면
// 중국어 자막). 나머지 글자: 그 글자가 셋 넘고(로마자는 넷, 세 글자 넘는 낱말 하나) 80% 넘게, 확신도 55(로마자 60).
// 다른 글자를 이 글자 모델로 읽은 뒤범벅의 표: 글자에 붙은 숫자(ส่อท1, 6ร0อเล, ௧8), 태국·라오 앞 모음이 자음 없이
// 끝나거나 연달아(โไล, ไโน), 낱말 첫머리의 뒤 모음·성조, 같은 글자 셋(วววร). 시험(영어·인도네시아어·포르투갈어를 태국어
// 모델로): 확신도 72~85 인데 모두 이런 꼴이 둘 넘게 있었다. 진짜 자막은 0~1.
function hsJunkMarks(t, kind) {
  // 대괄호·중괄호는 이런 글자 자막에 거의 없다(영어 자막을 태국어로 읽으면 '[ไห[เทย [เจ')
  let n = (t.match(/\p{L}\p{N}|\p{N}\p{L}/gu) || []).length + (t.match(/[[\]{}]/g) || []).length;
  if (kind === 'th') n += (t.match(/[เแโใไ](?=[\sเแโใไ]|$)|(^|\s)[ะาำิีึืุู่้๊๋็์ั]/g) || []).length;
  if (kind === 'laoo') n += (t.match(/[ເແໂໃໄ](?=[\sເແໂໃໄ]|$)/g) || []).length;
  n += (t.match(/(\p{L})\1\1/gu) || []).length;
  return n;
}

function hsOk(text, conf, kind) {
  const t = String(text || '');
  const all = hsCount(t, /[\p{L}\p{N}]/u);
  const mine = hsCount(t, HS_SCRIPT[kind]);
  if (!all || mine < all * 0.8) return false;
  if (kind !== 'han' && kind !== 'lat' && hsJunkMarks(t, kind) >= 2) return false;
  if (kind !== 'han' && kind !== 'lat' && hsCount(t, /\p{N}/u) >= 3 && conf < 70) return false; // 숫자 뒤범벅('28:௧8')
  if (kind === 'han') return mine >= 2 && conf >= 40;
  if (kind === 'ja') return mine >= 2 && /[぀-ヿ]/.test(t) && conf >= 40;
  if (kind === 'lat') return mine >= 4 && /[A-Za-zÀ-ɏḀ-ỿ]{3}/.test(t) && conf >= 60;
  // Tesseract 의 크메르·미얀마·라오 모델은 바르게 읽어도 확신도가 낮다(시험: 크메르 29~54, 미얀마 40~48, 라오 53~67).
  if (kind === 'khmr') return mine >= 6 && conf >= 25;
  if (kind === 'mymr') return mine >= 4 && conf >= 35;
  if (kind === 'laoo') return mine >= 3 && conf >= 30;
  return mine >= 3 && conf >= 55;
}

// 글줄 손질(로마자·키릴·아랍 …): 줄끝 '-' 로 잘린 낱말은 잇고, 줄은 빈칸으로, 양 끝 부스러기(| _ ~ 따옴표 조각)는 뗀다.
// 대화 표시 '-' 와 끝 문장부호는 남긴다.
function hsTidy(lines) {
  return lines
    // 타밀어 등에서 Tesseract 가 비라마 뒤에 붙이는 ZWNJ·ZWSP 는 지운다(ZWJ 는 둔다)
    .map((l) => String(l).replace(/[​‌﻿]/g, '').replace(/[|_~`^]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => /[\p{L}\p{N}]/u.test(l))
    .join('\n')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/\n/g, ' ')
    .replace(/^[^\p{L}\p{N}¿¡"'«“(-]+|[^\p{L}\p{N}.?!…"'»”)؟।။។]+$/gu, '')
    .trim();
}

// 낱말 상자로 잇기(빈칸 없는 글자): 상자 사이가 글자 크기(낱말 높이 중간값)의 gap 배 넘게 벌어졌으면 빈칸, 아니면 붙인다.
// 줄이 바뀌면 빈칸.
// Tesseract 는 태국어·라오어 등을 부호(่ ้ ี — \p{M})에서 낱말로 쪼개 돌려준다. 부호만 든 낱말은 앞 낱말에 붙이고(전에는
// 글자가 없다고 버려 'เด ยว ก อน' 이 됐다), 낱말 사이 빈칸은 그림에 실제로 빈 세로 틈(gaps)이 em × gap 넘게 있을 때만.
// 다음 줄로 넘어가면(왼쪽으로 돌아감) 빈칸.
function hsGapJoin(words, gaps, em, gap) {
  // 확신도 30 아래인 짧은 낱말(글자 넷까지)은 줄 사이·가장자리 부스러기(태국어 두 줄 자막 사이에서 'ซ่๓๑'). 긴 낱말은
  // 확신도가 낮아도 둔다 — psm 13 의 미얀마어 '-သူဘယံသွားလဲ' 는 맞게 읽고도 30 아래였다.
  const short = (w) => (w.t.match(/[\p{L}\p{N}]/gu) || []).length <= 4;
  const junk = (w) => short(w) && ((w.c != null && w.c < 30) || /[๐-๙]/.test(w.t)); // 자막에 태국 숫자는 거의 없다
  const ws = (words || [])
    .map((w) => ({ ...w, t: String(w.t || '').trim() }))
    .filter((w) => w.t && /[\p{L}\p{N}\p{M}]/u.test(w.t) && (!junk(w) || /^\p{M}+$/u.test(w.t)));
  if (!ws.length) return '';
  let out = '';
  let prev = null;
  for (const w of ws) {
    if (prev && /^\p{M}+$/u.test(w.t)) {
      out += w.t;
      continue;
    }
    if (prev) {
      const wide = w.x0 < prev.x0 || (gaps || []).some(([a, b]) => b - a >= em * gap && a >= prev.x0 && b <= w.x1);
      out += wide ? ' ' : '';
    }
    out += w.t;
    prev = w;
  }
  if (process.env.TH_HS_DEBUG) console.error(`[hs] em ${em} gaps ${JSON.stringify((gaps || []).filter(([a, b]) => b - a >= em * gap * 0.5))} ${ws.map((w) => `${w.t}[${w.x0}-${w.x1}]`).join(' ')}`);
  return out.trim();
}

// 작은 자막(480p 영상 등)은 Tesseract 에 너무 작다 — 띠 한 줄이 40 화소 아래면 48 이 되게(3배까지) 부드럽게 키운다.
function hsUpscale(px, w, h, u) {
  const W = Math.round(w * u);
  const H = Math.round(h * u);
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, (y + 0.5) / u - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.max(0, (x + 0.5) / u - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const a = px[(y0 * w + x0) * 4 + c] * (1 - fx) + px[(y0 * w + x1) * 4 + c] * fx;
        const b = px[(y1 * w + x0) * 4 + c] * (1 - fx) + px[(y1 * w + x1) * 4 + c] * fx;
        out[(y * W + x) * 4 + c] = Math.round(a * (1 - fy) + b * fy);
      }
    }
  }
  return { px: out, w: W, h: H };
}

// 한 언어로 읽기. 한자 자막은 1.32 그대로: 원래 크기, 띠만, 둘레 0.3줄로 잘라 psm 13 — 간체로 읽고 덜 확신하면(70 아래)
// 번체로도, 번체는 간체보다 6 넘게 더 확신할 때만(간체 자막을 번체로 읽으면 엉뚱한 글자가 섞였다: 枪毙了我我也不干 →
// 槍緒了…不千). 번체·광둥어로 고르면 번체 먼저. 다른 글자: 키운 그림(작으면) 전체 높이 + 흰 여백, psm 7(두 줄이면 6).
async function hsReadAs(view, lang) {
  const [model, kind] = HS_LANGS[lang];
  const whole = kind === 'han' ? view.han() : view.wide(kind === 'ja' || kind === 'ko');
  // 여러 줄이면 줄마다 따로 읽어 이 언어로 받아들일 만한 줄만 잇는다 — '태국어 두 줄 + 중국어 한 줄' 처럼 두 언어를 같이
  // 박은 영화에서 태국어 모델이 중국어 줄을 부스러기('ร1แทาพเศแนแพ')로 읽어 붙였다(2026-11-19 ifiV89ROboY).
  if (whole.bands.length > 1) {
    const parts = [];
    for (const r of whole.bands) {
      const one = kind === 'han' ? view.han(r) : view.wide(false, r);
      parts.push(await hsReadLine(one, model, kind, lang));
    }
    const good = parts.filter((p) => p.ok);
    if (!good.length) {
      const top = parts.sort((x, y) => y.conf - x.conf)[0];
      return { ...top, ok: false, lines: whole.bands.length };
    }
    const n = good.reduce((t, p) => t + p.text.length, 0) || 1;
    const conf = Math.round(good.reduce((t, p) => t + p.conf * p.text.length, 0) / n);
    const join = kind === 'han' ? '，' : ' ';
    return { text: good.map((p) => p.text).join(join), conf, lang: good[0].lang, ok: true, lines: good.length };
  }
  return { ...(await hsReadLine(whole, model, kind, lang)), lines: whole.lines };
}

// 한 줄 읽기. 한자: 간체로 읽고 덜 확신하면(70 아래) 번체로도 — 번체는 간체보다 6 넘게 더 확신할 때만. 크메르·라오·미얀마는
// psm 13(통째로 한 줄)이 위아래 부호를 덜 버렸다(시험: 크메르 7 은 뒤범벅, 13 은 거의 맞음). 태국어·로마자 등은 psm 7.
async function hsReadLine(v, model, kind, lang) {
  if (kind === 'han') {
    const order = model === 'chi_sim' ? ['chi_sim', 'chi_tra'] : ['chi_tra', 'chi_sim'];
    let best = null;
    for (const m of order) {
      const r = await ocr(v.file, { langs: [m], psm: '13' });
      const code = lang === 'yue' ? 'yue' : m === 'chi_sim' ? 'zh-CN' : 'zh-TW';
      const got = { text: hsJoin(r.words, r.text), conf: Math.round(r.conf), lang: code };
      if (!best || got.conf > best.conf + 6) best = got;
      if (best.conf >= 70) break;
    }
    return { ...best, ok: hsOk(best.text, best.conf, kind) };
  }
  const raw = kind === 'khmr' || kind === 'laoo' || kind === 'mymr';
  const r = await ocr(v.file, { langs: [model], psm: raw ? '13' : '7' });
  // 빈칸: 태국·라오·크메르·미얀마 글자는 띠 높이의 0.33 넘는 틈, 일본어(띠 = 글자 높이)는 0.5
  const text = hsTidy([HS_NOSPACE.has(kind) ? hsGapJoin(r.words, v.gaps, v.em, kind === 'ja' ? 0.5 : 0.33) : hsTidy((r.lines || []).map((l) => l.text))]);
  const conf = Math.round(r.conf);
  return { text, conf, lang, ok: hsOk(text, conf, kind) };
}

// text = JSON {w, h, vh(줄을 자른 그림 기준 영상 높이), rows:[줄 위, 줄 아래], core?:[띠 위, 띠 아래], n?: 글줄 수,
//              px: RGBA base64, langs?: [언어 후보…]}
// langs = 확장이 영상(말 언어·제목 글자)으로 가늠한 언어 순서. 없으면(1.32.x 확장) 중국어만 — 예전과 같다.
// 앞에서부터 읽어 그 언어 자막으로 받아들일 만하고 아주 또렷하면(88) 거기서 그만, 아니면 받아들일 만한 것 중 가장 확신하는 쪽
// (첫 후보는 +8 — 영상이 그 언어라는 증거가 있다).
// 답: {ocr: 1, text, conf, lang, ok, lines}
async function hardsub(text) {
  const j = JSON.parse(text);
  const w = j.w | 0, h = j.h | 0;
  const px = Buffer.from(String(j.px || ''), 'base64');
  if (!(w > 0 && h > 0 && w * h <= 4e6 && px.length === w * h * 4)) throw new Error('자막 그림이 잘못되었습니다');
  const vh = Number(j.vh) || h * 8;
  const n = Math.max(1, j.n | 0);
  const span = (r, u, H) => (Array.isArray(r) ? [Math.max(0, Math.floor(r[0] * u)), Math.min(H, Math.ceil(r[1] * u))] : null);
  const rows1 = span(j.rows, 1, h) || [0, h];
  const core1 = span(j.core, 1, h);
  const band = core1 || rows1;
  const lh1 = Math.max(1, (band[1] - band[0]) / n); // 띠 한 줄 높이
  let native = null;
  let big = null;
  const view = {
    // 한자: 원래 크기, 띠(없으면 줄)만, 둘레 0.3줄
    han: (r) => {
      native = native || hsBinarize(px, w, h, rows1, vh, core1);
      return native(r || band, Math.max(2, Math.round(lh1 * 0.3)));
    },
    // 다른 글자: 띠 한 줄이 40 화소 아래면 키우고, 그림 전체(가나·한글은 띠만) + 흰 여백 0.4줄
    wide: (coreOnly, r) => {
      if (!big) {
        const u = lh1 < 40 ? Math.min(3, 48 / lh1) : 1;
        const up = u > 1 ? hsUpscale(px, w, h, u) : { px, w, h };
        const core = span(j.core, u, up.h);
        big = { u, H: up.h, core, bin: hsBinarize(up.px, up.w, up.h, span(j.rows, u, up.h) || [0, up.h], vh * u, core, lh1 * u * 0.4) };
      }
      const got = big.bin(r || (coreOnly && big.core ? big.core : [0, big.H]));
      return { ...got, em: lh1 * big.u };
    },
  };
  const langs = [...new Set((Array.isArray(j.langs) ? j.langs : []).map(String).filter((l) => HS_LANGS[l]))].slice(0, 4);
  if (!langs.length) langs.push('zh-CN');
  let best = null;
  let latin = null; // 받아들일 만한 로마자 읽기
  const score = (g, i) => g.conf + (i === 0 ? 8 : 0);
  for (let i = 0; i < langs.length; i++) {
    const got = await hsReadAs(view, langs[i]);
    got.i = i;
    if (process.env.TH_HS_DEBUG) console.error(`[hs] ${langs[i]} L${got.lines} ${got.conf} ${got.ok ? 'ok' : '--'} ${got.text}`);
    if (got.ok && HS_LANGS[langs[i]][1] === 'lat' && (!latin || got.conf > latin.conf)) latin = got;
    if (!best || (got.ok && !best.ok) || (got.ok === best.ok && score(got, i) > score(best, best.i))) best = got;
    if (best.ok && best.conf >= 88) break; // 아주 또렷할 때만 그만 — 태국어 모델이 영어 줄을 확신도 85 로 읽기도 했다
  }
  // 로마자 자막을 다른 글자 모델(태국어 등)로 읽으면 뒤범벅인데도 확신도가 60~80 이다. 진짜 태국어 줄을 영어 모델로 읽으면
  // 확신도가 낮거나 로마자 비율에서 걸린다. 그래서 로마자 읽기가 받아들일 만하고 12 안쪽으로 뒤지면 로마자를 고른다.
  // 한자·가나·한글·키릴(로마자와 닮은 글자)은 빼고 — 그 모델들은 로마자 줄을 이렇게 읽지 않았고, 영어 모델이 그 줄을 읽은
  // 뒤범벅이 오히려 받아들여질 수 있다.
  const far = (l) => HS_LANGS[l] && !['lat', 'han', 'ja', 'ko', 'cyr'].includes(HS_LANGS[l][1]);
  if (latin && best !== latin && best.ok && far(best.lang) && latin.conf >= best.conf - 12) best = latin;
  const { i: _i, ...ans } = best;
  return { out: JSON.stringify({ ocr: 1, ...ans }), via: String(best.conf) };
}

async function handle(req) {
  // 하드 자막은 스크립트·용어집이 필요 없다 — 엔진이 막 뜬 참이어도 기다리지 않는다.
  if (req.op === 'hardsub') return hardsub(req.text);
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
