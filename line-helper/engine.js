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
  'thaiSpeakerGender', 'HANGUL', 'THAI', 'refreshGlossary',
];

let T = null;
const ready = (async () => {
  let src = await loadScript();
  const version = (src.match(/@version\s+(\S+)/) || [])[1] || 'line';
  installStubs(version);
  const tail = src.lastIndexOf('})();');
  const exp = NAMES.map((n) => `${n}: typeof ${n} === 'undefined' ? null : ${n}`).join(', ');
  src = src.slice(0, tail) + `globalThis.__t = { ${exp} };\n` + src.slice(tail);
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
})();

// 한국어 → 고른 언어. 태국어는 메신저 보내기와 같은 길(용어집 → 문장 번역).
async function toLang(text, lang) {
  if (lang === 'th') {
    const { thai, via } = await T.chatKoreanToThai(text);
    return { out: thai, via };
  }
  const info = (T.TYPE_LANGS || []).find((l) => l.id === lang);
  if (!info) throw new Error(`모르는 언어: ${lang}`);
  const hit = (lang === 'en' || lang === 'zh') && T.koEnZhLookup && T.koEnZhLookup(text, lang);
  if (hit) return { out: hit, via: '용어집' };
  return { out: await T.freeTranslateOne(text, 'ko', info.mt), via: '번역' };
}

// 받은 태국어 → 한국어. 메신저 받기(scanChat)와 같은 손질·표·번역. 누가 보낸 말인지 모르니 상대 말로 본다.
async function toKorean(src) {
  const partner = T.thaiSpeakerGender(src);
  const s = T.chatPrepThai(src, false, partner);
  const whole = T.chatThaiWhole(s);
  if (whole) return { out: whole, via: '표' };
  if (T.TH_SHORT_REPLY.test(s)) return { out: '네', via: '표' };
  const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const got = await T.translateToKorean(lines);
  if (!got.every(Boolean)) throw new Error('번역 결과가 비어 있습니다');
  return { out: T.chatFixKorean(got.join('\n'), s), via: '번역' };
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

// 옮기지 않는 줄: 영어 글자가 거의 없거나, 이미 한국어거나, 주소·경로·메일.
function uiSkip(s) {
  return latinCount(s) < 2 || hangulCount(s) >= latinCount(s) || /https?:\/\/|www\.|^[A-Za-z]:\\|\S@\S+\.\S/.test(s);
}

// 모든 줄을 영어 OCR 로 한 번 더 읽는다. 헷갈린 표시가 없어도 윈도우 OCR 은 글자를 빠뜨리거나 바꾼다
// (typing → vping, Spell → SpeII, Use → lJse — 표시만 보고 다시 읽던 때 그대로 번역됐다, 2026-10-24).
// 글자만 같고 띄어쓰기만 다르면 윈도우 쪽을 쓴다(Setup later ↔ Set up later). 다르면 영어 OCR 이 충분히
// 확신할 때만 — 윈도우 쪽이 수상하면 덜 확신해도 영어 OCR 을 믿는다.
async function uiLine(it) {
  const win = uiFix(it.t);
  if (!it.f) return win;
  try {
    const r = await ocr(it.f, { langs: ['eng'], psm: it.n > 1 ? '6' : '7' });
    const tess = uiFix(r.text.replace(/\s*\n\s*/g, ' '));
    const bare = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
    if (bare(tess) === bare(win)) return win;
    if (r.conf >= (uiSuspect(it.t) ? 60 : 80) && latinCount(tess) >= latinCount(win) * 0.7) return tess;
  } catch (e) {
    console.error('화면 글줄 다시 읽기 실패:', e.message);
  }
  return win;
}

// items: [{t: 윈도우 OCR 글자, f: 잘라 낸 그림(흰 바탕 검은 글자), n: 줄 수}] → [{s: 옮긴 원문, k: 한국어 또는 ''}]
async function screenLines(items) {
  const src = [];
  for (const it of items) src.push(await uiLine(it));
  const todo = src.map((s, i) => (uiSkip(s) ? -1 : i)).filter((i) => i >= 0);
  const got = todo.length ? await T.translateToKorean(todo.map((i) => src[i])) : [];
  const out = src.map((s) => ({ s, k: '' }));
  todo.forEach((i, k) => {
    const ko = String(got[k] || '').trim();
    // 바뀌지 않은 것(상표·이름)은 덮지 않는다.
    if (T.HANGUL.test(ko) && ko.toLowerCase() !== src[i].toLowerCase()) out[i].k = ko;
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
  if (req.op === 'screen') {
    const out = await screenLines(JSON.parse(req.text));
    return { out: JSON.stringify(out), via: String(out.filter((o) => o.k).length) };
  }
  const text = String(req.text || '').replace(/\r\n?/g, '\n').trim();
  if (req.op === 'to') {
    const r = await toLang(text, req.lang);
    if (!r.out || T.HANGUL.test(r.out)) throw new Error('번역 결과가 비어 있습니다');
    return r;
  }
  if (req.op === 'ko') {
    const r = await toKorean(text);
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
