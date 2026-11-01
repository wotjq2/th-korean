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
