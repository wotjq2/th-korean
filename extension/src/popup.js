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

// 번역 도우미 — background.js 가 네이티브 메시징으로 도우미 exe 에 묻고 시킨다.
function showHelper(r) {
  const st = $('#hstate');
  if (!r || !r.ok) {
    st.className = 'bad';
    st.textContent = /not found/i.test((r && r.error) || '')
      ? '설치 안 됨 — 설치한 뒤 한 번 켜 주세요'
      : '연결 실패: ' + ((r && r.error) || '?');
    $('#hon').disabled = true;
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

$('#hon').addEventListener('click', () => helper('start'));
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
