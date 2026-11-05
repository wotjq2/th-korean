// 도구 막대의 '통합 번역' 단추 — 몽키 메뉴 대신 지금 탭의 번역 메뉴를 보여 주고, 설정을 옮긴다.

/* global chrome */

const GM_PREFIX = 'gm:';
// 내보낼 때 뺀다. 용어집 사본·번역 저장은 크고(몇 MB) 다시 받거나 다시 만들 수 있다.
const SKIP_EXPORT = new Set(['remoteGlossary', 'tmCache', 'ocrCache']);

const $ = (s) => document.querySelector(s);
const note = (t) => {
  $('#note').textContent = t;
};

$('#ver').textContent = chrome.runtime.getManifest().version;

// ---- 내 언어 (2026-11-05) ----
// 고른 언어(구글 번역 코드)를 gm:myLang 에 둔다 — 번역 스크립트(GM_getValue('myLang'))가 페이지를 열 때 읽고,
// background.js 가 번역 도우미에 넘긴다. 'ko' 면 예전과 똑같다.
const MY_LANGS = [
  'ko', 'th', 'en', 'zh-CN', 'zh-TW', 'ja', 'vi', 'id', 'ms', 'tl', 'km', 'lo', 'my', 'hi', 'bn', 'ur', 'ar',
  'he', 'tr', 'ru', 'de', 'fr', 'es', 'pt', 'it', 'pl', 'ta', 'te', 'mr', 'yue',
];
const langNameIn = (code, inLang) => {
  try {
    return new Intl.DisplayNames([inLang], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
};
let MY = 'ko';

const myLangReady = chrome.storage.local.get('gm:myLang').then((v) => {
  const cur = v['gm:myLang'];
  MY = typeof cur === 'string' && MY_LANGS.includes(cur) ? cur : 'ko';
  document.documentElement.lang = MY;
  const sel = $('#lang');
  for (const code of MY_LANGS) {
    const o = document.createElement('option');
    o.value = code;
    let own = langNameIn(code, code); // 그 언어로 쓴 이름(한국어, English, ไทย …)
    // 크롬에 그 언어 이름 자료가 없으면 화면 언어(한국어)로 나온다 — 그럴 때는 영어 이름.
    if (code !== 'ko' && own === langNameIn(code, 'ko')) own = langNameIn(code, 'en');
    const here = langNameIn(code, MY); // 지금 내 언어로 쓴 이름
    o.textContent = own === here ? own : `${own} — ${here}`;
    sel.appendChild(o);
  }
  sel.value = MY;
  // 옵션 글은 이미 각 언어로 썼다 — 화면 글 옮기기에서 뺀다.
  sel.dataset.noi18n = '';
  localize();
});

$('#lang').addEventListener('change', async (e) => {
  const v = e.target.value;
  await chrome.storage.local.set({ 'gm:myLang': v });
  chrome.runtime.sendMessage({ t: 'helper-lang' }).catch(() => {});
  // 창을 새로 그려 바로 그 언어로. 안내는 다시 연 뒤에 보인다.
  await chrome.storage.session.set({ langChanged: v }).catch(() => {});
  location.reload();
});
chrome.storage.session
  .get('langChanged')
  .then(({ langChanged }) => {
    if (!langChanged) return;
    chrome.storage.session.remove('langChanged');
    $('#langnote').textContent = '바꿨습니다 — 열려 있는 페이지도 바로 그 언어로 바뀝니다. 번역 도우미도 몇 초 안에 따라 바뀝니다.';
  })
  .catch(() => {});

// 이 창의 한국어 글을 내 언어로(스크립트의 uiLocalize 와 같은 방식·같은 저장소 gm:uiTr:<언어>).
const UI_RUN = /[ㄱ-ㆎ가-힣](?:[^\n"“”'‘’「」→←<>{}[\]|]*[ㄱ-ㆎ가-힣.…!?])?/g;
const HANGUL = /[ㄱ-ㆎ가-힣]/;
let uiTr = null;
const uiQueue = new Set();
const uiWaiting = new Set();
let uiTimer = 0;

async function uiTranslate(runs) {
  const base = 'https://translate.googleapis.com/translate_a/';
  try {
    const r = await fetch(
      `${base}t?client=dict-chrome-ex&sl=ko&tl=${encodeURIComponent(MY)}&` + runs.map((s) => 'q=' + encodeURIComponent(s)).join('&'),
      { credentials: 'omit' }
    );
    const j = await r.json();
    const arr = Array.isArray(j) ? j.map((x) => (Array.isArray(x) ? x[0] : x)) : [];
    if (arr.length === runs.length && arr.every((x) => typeof x === 'string')) return arr;
  } catch {
    /* 아래 한 줄씩 */
  }
  return Promise.all(
    runs.map(async (s) => {
      try {
        const r = await fetch(`${base}single?client=gtx&sl=ko&tl=${encodeURIComponent(MY)}&dt=t&q=${encodeURIComponent(s)}`, {
          credentials: 'omit',
        });
        const j = await r.json();
        return (j[0] || []).map((x) => x[0]).join('');
      } catch {
        return '';
      }
    })
  );
}

function uiReplace(text) {
  let missing = false;
  const out = text.replace(UI_RUN, (run) => {
    if (uiTr[run] != null) return uiTr[run];
    uiQueue.add(run);
    missing = true;
    return run;
  });
  return missing ? null : out;
}

function uiFix(node) {
  if (node.nodeType === 3) {
    const v = node.nodeValue;
    if (!v || !HANGUL.test(v) || (node.parentElement && node.parentElement.closest('[data-noi18n]'))) return;
    const out = uiReplace(v);
    if (out == null) uiWaiting.add(node);
    else if (out !== v) node.nodeValue = out;
    return;
  }
  for (const a of ['title', 'placeholder']) {
    const v = node.getAttribute(a);
    if (!v || !HANGUL.test(v)) continue;
    const out = uiReplace(v);
    if (out == null) uiWaiting.add(node);
    else if (out !== v) node.setAttribute(a, out);
  }
}

function uiWalk(root) {
  if (root.nodeType === 3) uiFix(root);
  else if (root.nodeType === 1 && !root.closest('[data-noi18n]')) {
    uiFix(root);
    for (const el of root.querySelectorAll('[title],[placeholder]')) uiFix(el);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) uiFix(n);
  }
  if (uiQueue.size && !uiTimer) uiTimer = setTimeout(uiFlush, 30);
}

async function uiFlush() {
  uiTimer = 0;
  const runs = [...uiQueue];
  uiQueue.clear();
  if (runs.length) {
    const got = await uiTranslate(runs);
    runs.forEach((r, i) => (uiTr[r] = got[i] && got[i].trim() ? got[i].trim() : r));
    chrome.storage.local.set({ ['gm:uiTr:' + MY]: uiTr });
  }
  const nodes = [...uiWaiting];
  uiWaiting.clear();
  for (const n of nodes) if (n.isConnected) uiFix(n);
  if (uiQueue.size && !uiTimer) uiTimer = setTimeout(uiFlush, 30);
}

async function localize() {
  if (MY === 'ko') return;
  uiTr = (await chrome.storage.local.get('gm:uiTr:' + MY))['gm:uiTr:' + MY] || {};
  uiWalk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') uiWalk(m.target);
      else if (m.type === 'attributes') uiWalk(m.target);
      else for (const n of m.addedNodes) uiWalk(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
}

(async () => {
  const box = $('#menu');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let list = [];
  try {
    list = await chrome.tabs.sendMessage(tab.id, { t: 'gm-menu-list' });
  } catch {
    // 크롬 설정 화면처럼 확장이 못 들어가는 페이지, 또는 확장을 깐 뒤 아직 새로 고치지 않은 탭
  }
  if (!list || !list.length) {
    const p = document.createElement('div');
    p.className = 'empty';
    p.textContent = '이 탭에는 번역 메뉴가 없습니다. 방금 설치했다면 페이지를 새로 고쳐 주세요.';
    box.appendChild(p);
    return;
  }
  for (const c of list) {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.addEventListener('click', async () => {
      await chrome.tabs.sendMessage(tab.id, { t: 'gm-menu-run', id: c.id });
      window.close();
    });
    box.appendChild(b);
  }
})();

// 검색 Enter 한 번/두 번 — 스크립트 설정 창의 '검색 전 번역된 태국어 확인' 과 같은 값(gm:confirmSearch, 기본 켬).
// 스크립트가 Enter 때마다 다시 읽어 열린 페이지에도 바로 적용된다.
chrome.storage.local.get(GM_PREFIX + 'confirmSearch').then((v) => {
  const on = v[GM_PREFIX + 'confirmSearch'];
  $('#confirm').checked = on === undefined ? true : !!on;
});
$('#confirm').addEventListener('change', (e) => chrome.storage.local.set({ [GM_PREFIX + 'confirmSearch']: e.target.checked }));

// 번역 도우미 — background.js 가 네이티브 메시징으로 도우미 exe 에 묻고 시킨다.
// 크롬에 아직 이어지지 않은 PC(새 판 도우미가 한 번도 켜지지 않았거나 도우미가 없다)에서는 [켜기]가
// 예전부터 있던 th-korean-helper:// 주소로 켠다. 옛 판도 이 주소는 알고, 켜지면 1분 뒤 새 판으로 바뀌며
// 크롬에 자기를 등록한다 — 그다음부터는 [끄기]·'크롬과 함께 켜기' 도 된다.
const HELPER_LINK = 'th-korean-helper://start';
const HELPER_INSTALL =
  'powershell -NoExit -c "irm https://raw.githubusercontent.com/wotjq2/th-korean/main/line-helper/install.ps1 | iex"';
// 위 명령을 담은 설치 파일(더블클릭). 현장 다운로더도 이 주소로 받는다 — 이름·위치를 바꾸지 말 것.
const HELPER_SETUP_URL = encodeURI('https://raw.githubusercontent.com/wotjq2/th-korean/main/번역도우미_설치.cmd');
let helperLinked = true;

function showHelper(r) {
  const st = $('#hstate');
  helperLinked = !!(r && r.ok);
  $('#hsetup').hidden = helperLinked;
  if (!helperLinked) {
    const notFound = /not found/i.test((r && r.error) || '');
    st.className = 'bad';
    st.textContent = notFound ? '아직 연결 안 됨' : '연결 실패: ' + ((r && r.error) || '?');
    $('#hon').disabled = false;
    $('#hoff').disabled = true;
    return;
  }
  st.className = r.running ? 'on' : 'off';
  st.textContent = r.running ? '켜짐' : '꺼짐';
  $('#hon').disabled = r.running;
  $('#hoff').disabled = !r.running;
}

async function helper(cmd) {
  $('#hon').disabled = true;
  $('#hoff').disabled = true;
  if (cmd !== 'status') $('#hstate').textContent = cmd === 'start' ? '켜는 중…' : '끄는 중…';
  showHelper(await chrome.runtime.sendMessage({ t: 'helper', cmd, manual: true }));
}

// 지금 탭의 페이지에서 주소를 누르게 한다. 크롬 설정 화면처럼 확장이 못 들어가는 탭이면 새 탭으로 연다.
async function startByLink() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let sent = false;
  try {
    sent = await chrome.tabs.sendMessage(tab.id, { t: 'helper-link', url: HELPER_LINK });
  } catch {
    sent = false;
  }
  if (!sent) await chrome.tabs.create({ url: HELPER_LINK });
  $('#hstate').className = 'off';
  $('#hstate').textContent = '켜는 중…';
  $('#hnote').textContent =
    '크롬이 "번역 도우미 열기?"를 물으면 "항상 허용"에 체크하고 열기. 처음이면 1분쯤 뒤 새 판으로 바뀌며 여기와 이어집니다.';
}

$('#hon').addEventListener('click', () => (helperLinked ? helper('start') : startByLink()));
// GitHub 에서 설치 파일을 받아 다운로드 폴더를 열어 준다. 크롬 확장은 받은 프로그램을 직접 실행할 수 없다.
$('#hget').addEventListener('click', async () => {
  const hnote = $('#hnote');
  let id;
  try {
    id = await chrome.downloads.download({ url: HELPER_SETUP_URL });
  } catch (e) {
    hnote.textContent = '받기 실패: ' + ((e && e.message) || e);
    return;
  }
  hnote.textContent = '받는 중…';
  // 파일이 작아(수백 바이트) 지켜보기 전에 끝나 있을 수 있다 — 바뀜 알림과 지금 상태를 같이 본다.
  let settled = false;
  const settle = (state, danger) => {
    if (settled) return;
    if (danger && !/^(safe|accepted)$/.test(danger)) {
      hnote.textContent = '크롬이 "위험할 수 있는 파일"이라고 물으면 [유지]를 누르세요.';
    }
    if (state === 'complete') {
      settled = true;
      hnote.textContent = '받았습니다 — 열린 폴더의 번역도우미_설치.cmd 를 더블클릭하세요. 설치가 끝나면 도우미가 켜지고 여기와 이어집니다.';
      chrome.downloads.show(id);
    } else if (state === 'interrupted') {
      settled = true;
      hnote.textContent = '받기가 바로 취소됐습니다 — IDM 같은 다운로드 프로그램이 가로챘을 수 있습니다(잠시 끄고 다시).';
    }
    if (settled) chrome.downloads.onChanged.removeListener(watch);
  };
  const watch = (d) => {
    if (d.id === id) settle(d.state && d.state.current, d.danger && d.danger.current);
  };
  chrome.downloads.onChanged.addListener(watch);
  const [item] = await chrome.downloads.search({ id });
  if (item) settle(item.state, item.danger);
});

$('#hcopy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(HELPER_INSTALL);
  $('#hnote').textContent = '설치 명령을 복사했습니다 — 윈도우 키+R → Ctrl+V → Enter. 설치가 끝나면 도우미가 켜지고 여기와 이어집니다.';
});
$('#hoff').addEventListener('click', () => helper('stop'));
chrome.storage.local.get('helperAuto').then(({ helperAuto = true }) => {
  $('#hauto').checked = helperAuto;
});
$('#hauto').addEventListener('change', (e) => chrome.storage.local.set({ helperAuto: e.target.checked }));
helper('status');

// Tampermonkey 저장소 탭은 { "이름": 값, ... } 꼴이다. 이 확장이 내보낸 것도 같은 꼴.
$('#import').addEventListener('click', async () => {
  let obj;
  try {
    obj = JSON.parse($('#data').value);
  } catch {
    note('읽을 수 없는 내용입니다. 저장소 탭의 내용을 처음부터 끝까지 그대로 붙여 넣어 주세요.');
    return;
  }
  if (obj && typeof obj === 'object' && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) obj = obj.data;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    note('설정 묶음({ … })이 아닙니다.');
    return;
  }
  const items = {};
  for (const [k, v] of Object.entries(obj)) items[GM_PREFIX + k] = v;
  await chrome.storage.local.set(items);
  note(`설정 ${Object.keys(items).length}개를 가져왔습니다. 열려 있는 페이지는 새로 고쳐 주세요.`);
});

$('#export').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(GM_PREFIX)) continue;
    const key = k.slice(GM_PREFIX.length);
    if (!SKIP_EXPORT.has(key)) out[key] = v;
  }
  $('#data').value = JSON.stringify(out, null, 1);
  $('#data').select();
  note(`설정 ${Object.keys(out).length}개 — API 키·토큰이 들어 있으니 GitHub 폴더 밖에 보관하세요.`);
});
