// '한' 창 → GitHub 용어집 저장(7번) — 사용자가 고른 단어가 모든 사람의 용어집으로 가는 길. 진짜 저장소 대신 가짜 GitHub.
// saveGlossaryToGitHub: 파일 받기(sha) → 합치기(mergeIntoGlossary) → PUT(sha) — 다른 PC 가 먼저 저장했으면(409) 한 번 더.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./lib/load');

const REPO = 'https://api.github.com/repos/wotjq2/th-korean-glossary/contents/';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64').toString('utf8');

// 가짜 GitHub: files = { 'glossary.txt': 글 }. token 이 다르면 401. big = 1MB 넘는 파일처럼 내용 없이 sha 만.
function fakeGitHub({ files, token = 'ghp_test', conflictOnce = false, big = false, forbid = false }) {
  const st = { files: { ...files }, sha: {}, puts: [], conflictOnce };
  let n = 0;
  for (const f of Object.keys(st.files)) st.sha[f] = `sha${++n}`;
  st.http = (url, o) => {
    if (!url.startsWith('https://api.github.com/')) return undefined;
    const auth = (o.headers || {}).Authorization;
    // 공개 저장소라 읽기는 토큰 없이도 된다(스크립트의 용어집 받기는 토큰을 쓰지 않는다). 토큰을 붙였는데 틀리면 401.
    if ((auth && auth !== `Bearer ${token}`) || (!auth && ((o.method || 'GET') !== 'GET' || url === 'https://api.github.com/user'))) {
      return { status: 401, text: '{"message":"Bad credentials"}' };
    }
    st.gets = (st.gets || 0) + ((o.method || 'GET') === 'GET' ? 1 : 0);
    if (url === 'https://api.github.com/user') return JSON.stringify({ login: 'tester' });
    const file = decodeURIComponent(url.slice(REPO.length).split('?')[0]);
    if (!(file in st.files)) return { status: 404, text: '{"message":"Not Found"}' };
    if ((o.method || 'GET') === 'GET') {
      if ((o.headers || {}).Accept === 'application/vnd.github.raw') return st.files[file];
      return JSON.stringify({ sha: st.sha[file], encoding: big ? 'none' : 'base64', content: big ? '' : b64(st.files[file]) });
    }
    if (o.method === 'PUT') {
      if (forbid) return { status: 403, text: '{"message":"Resource not accessible by personal access token"}' };
      const body = JSON.parse(o.data);
      if (st.conflictOnce) {
        // 다른 PC 가 그 사이에 저장했다 — 파일과 sha 가 바뀐다
        st.conflictOnce = false;
        st.files[file] += '다른PC말=คำจากเครื่องอื่น\n';
        st.sha[file] = `sha${++n}`;
      }
      if (body.sha !== st.sha[file]) return { status: 409, text: '{"message":"is at sha but expected"}' };
      st.files[file] = unb64(body.content);
      st.sha[file] = `sha${++n}`;
      st.puts.push({ file, message: body.message, branch: body.branch });
      return JSON.stringify({ content: { sha: st.sha[file] } });
    }
    return { status: 405, text: '' };
  };
  return st;
}

const GL = '# 시험 용어집\n가방=กระเป๋า\n무선이어폰=หูฟังไร้สาย\n';

function withGitHub(gh, extra = {}) {
  return load({ host: 'www.lazada.co.th', glossary: GL, http: gh.http, store: { githubToken: 'ghp_test', ...(extra.store || {}) }, ...extra });
}

test('새 단어와 고친 단어를 합쳐 올린다 — 기존 줄 자리는 그대로, 새 단어는 맨 끝 칸에', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL } });
  const s = withGitHub(gh);
  const r = await s.peek('saveGlossaryToGitHub')([['고양이사료', 'อาหารแมว'], ['가방', 'กระเป๋าถือ']]);
  assert.deepEqual([...r.added], ['고양이사료']);
  assert.deepEqual([...r.changed], ['가방']);
  assert.equal(gh.puts.length, 1);
  assert.equal(gh.puts[0].branch, 'main');
  assert.match(gh.puts[0].message, /고양이사료/);
  const text = gh.files['glossary.txt'];
  assert.match(text, /^# 시험 용어집\n가방=กระเป๋าถือ\n무선이어폰=หูฟังไร้สาย\n/); // 자리 그대로
  assert.match(text, /# --- 설정 패널에서 추가한 단어 ---\n고양이사료=อาหารแมว\n$/);
});

test('저장한 단어를 바로 쓴다(다시 받지 않아도 이 PC 검색에)', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL } });
  const s = withGitHub(gh);
  await s.peek('saveGlossaryToGitHub')([['고양이사료', 'อาหารแมว']]);
  const r = await s.peek('translateSearchKeyword')('고양이사료');
  assert.deepEqual([r.thai, r.via], ['อาหารแมว', '용어집']);
  assert.match(s.store.remoteGlossary.text, /고양이사료=อาหารแมว/);
});

test('다른 PC 가 먼저 저장했으면(409) 새로 받아 다시 합친다 — 그쪽 단어도 지우지 않는다', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL }, conflictOnce: true });
  const s = withGitHub(gh);
  await s.peek('saveGlossaryToGitHub')([['고양이사료', 'อาหารแมว']]);
  assert.equal(gh.puts.length, 1);
  assert.match(gh.files['glossary.txt'], /다른PC말=คำจากเครื่องอื่น/);
  assert.match(gh.files['glossary.txt'], /고양이사료=อาหารแมว/);
  assert.equal(s.calls.filter((c) => c.method === 'PUT').length, 2); // 첫 PUT 은 409
});

test('1MB 넘는 파일(내용 없이 sha 만)은 원문을 따로 받아 합친다', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL }, big: true });
  const s = withGitHub(gh);
  await s.peek('saveGlossaryToGitHub')([['고양이사료', 'อาหารแมว']]);
  assert.match(gh.files['glossary.txt'], /^# 시험 용어집\n가방=กระเป๋า\n/);
  assert.ok(s.calls.some((c) => c.headers.Accept === 'application/vnd.github.raw'), '원문을 따로 받지 않음');
});

test('바뀐 것이 없으면 올리지 않는다', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL } });
  const s = withGitHub(gh);
  await s.peek('saveGlossaryToGitHub')([['가방', 'กระเป๋า']]);
  assert.equal(gh.puts.length, 0);
});

test('다른 언어 용어집에 저장하면 이 PC 의 그 언어 사본도 바로 바뀐다', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL, 'glossary-vi.txt': '안녕하세요=xin chào\n' } });
  const s = withGitHub(gh);
  await s.peek('saveGlossaryToGitHub')([['고마워요', 'cảm ơn']], 'glossary-vi.txt');
  assert.match(gh.files['glossary-vi.txt'], /고마워요=cảm ơn/);
  assert.match(s.store['langGlossary:glossary-vi.txt'].text, /고마워요=cảm ơn/);
  assert.equal(gh.files['glossary.txt'], GL); // 태국어 용어집은 그대로
});

test('토큰이 없거나 틀리거나 쓰기 권한이 없으면 할 일을 한국어로 알려 준다', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL } });
  const none = load({ host: 'www.lazada.co.th', http: gh.http });
  await assert.rejects(none.peek('saveGlossaryToGitHub')([['a', 'b']]), /GitHub 연결이 필요합니다/);

  const wrong = withGitHub(gh, { store: { githubToken: 'ghp_wrong' } });
  const e1 = await wrong.peek('saveGlossaryToGitHub')([['고양이사료', 'อาหารแมว']]).catch((e) => e);
  assert.match(wrong.peek('githubErrorMessage')(e1), /토큰이 맞지 않거나 기간이 끝났습니다/);

  const ro = fakeGitHub({ files: { 'glossary.txt': GL }, forbid: true });
  const s = withGitHub(ro);
  const e2 = await s.peek('saveGlossaryToGitHub')([['고양이사료', 'อาหารแมว']]).catch((e) => e);
  assert.match(s.peek('githubErrorMessage')(e2), /쓰기 권한이 없습니다/);
  assert.equal(ro.files['glossary.txt'], GL);
});

test('토큰 확인(checkGitHubToken)은 GitHub 사용자 이름을 돌려준다', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL } });
  const s = withGitHub(gh);
  assert.equal(await s.peek('checkGitHubToken')('ghp_test'), 'tester');
});

test('저장하는 사이에 끝난 용어집 새로 받기가 방금 저장한 단어를 덮어쓰지 않는다', async () => {
  // 쇼핑몰 페이지를 열자마자 저장한 경우: 페이지가 시작한 새로 받기(토큰 없는 GET)가 저장 전 판을 들고 늦게 끝난다.
  const gh = fakeGitHub({ files: { 'glossary.txt': GL } });
  const slowRefresh = (url, o) => {
    const r = gh.http(url, o);
    const reading = (o.method || 'GET') === 'GET' && !(o.headers || {}).Authorization && /glossary\.txt/.test(url);
    if (!reading) return r;
    const old = typeof r === 'string' ? r : r && r.text; // 지금(저장 전) 판을 들고
    return { status: 200, text: old, delay: 60 }; // 늦게 끝난다
  };
  const s = withGitHub(gh, { http: slowRefresh });
  const refreshing = s.peek('refreshGlossary')(); // 페이지가 시작한 새로 받기
  await s.peek('saveGlossaryToGitHub')([['고양이사료', 'อาหารแมว']]);
  await refreshing;
  assert.match(s.peek('glossaryStore').text, /고양이사료=อาหารแมว/, '새로 받기가 저장한 단어를 덮어씀');
  assert.match(s.store.remoteGlossary.text, /고양이사료=อาหารแมว/);
  const r = await s.peek('translateSearchKeyword')('고양이사료');
  assert.equal(r.thai, 'อาหารแมว');
});

test('다른 언어 용어집도: 저장하는 사이에 끝난 새로 받기가 방금 저장한 단어를 덮어쓰지 않는다', async () => {
  const gh = fakeGitHub({ files: { 'glossary.txt': GL, 'glossary-vi.txt': '안녕하세요=xin chào\n' } });
  const slowRaw = (url, o) => {
    if (url.startsWith('https://raw.githubusercontent.com/') && url.endsWith('/glossary-vi.txt')) {
      return { status: 200, text: gh.files['glossary-vi.txt'], delay: 60 }; // 저장 전 판을 들고 늦게
    }
    return gh.http(url, o);
  };
  const s = withGitHub(gh, { http: slowRaw });
  const loading = s.peek('loadLangGlossary')('glossary-vi.txt'); // 사본이 없어 새로 받는다
  await s.peek('saveGlossaryToGitHub')([['고마워요', 'cảm ơn']], 'glossary-vi.txt');
  await loading;
  assert.match(s.store['langGlossary:glossary-vi.txt'].text, /고마워요=cảm ơn/, '새로 받기가 저장한 단어를 덮어씀');
  const m = await s.peek('loadLangGlossary')('glossary-vi.txt');
  assert.equal(m.get('고마워요'), 'cảm ơn');
});
