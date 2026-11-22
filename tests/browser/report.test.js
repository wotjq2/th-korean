// 2단계: 문제 알리기 · 번역이 이상해요(1.35.8) — 진짜 크롬 + 확장. 쇼피에서 바꾼 검색어를 '한' 설정 창의 문제 알리기에서 골라
// [GitHub 에 올리기] → 그 글이 채워진 GitHub 새 글 화면이 열리는지(가짜 github.com 이 받은 title·body 로 본다), 드래그 번역 창의
// '번역이 이상해요', 확장 창(popup)의 문제 알리기. 진짜 GitHub 에는 아무것도 가지 않는다.
'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('./lib/session');
const { PAGES, ITEMS } = require('./lib/pages');
const { sleep } = require('./lib/chrome');

const GLOSSARY = ['무선이어폰=หูฟังไร้สาย', '이어폰=หูฟัง', '무선=ไร้สาย'].join('\n');
const T = { timeout: 60000 };
const ISSUE = '/wotjq2/th-korean/issues/new';

describe('문제 알리기 (진짜 크롬 + 확장)', () => {
  let S;
  let t;
  const issues = []; // 가짜 github.com 이 받은 새 글 화면 { path, title, body }
  const pages = {
    ...PAGES,
    'github.com': (u) => {
      issues.push({ path: u.pathname, title: u.searchParams.get('title'), body: u.searchParams.get('body') });
      return '<!doctype html><meta charset="utf-8"><title>New issue</title><p>fake github</p>';
    },
  };
  const val = (sel) => t.ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).value`);
  // 확장 창에서 쇼피 탭의 메뉴(몽키 메뉴 대신)를 고른다 — 확장 창의 메뉴 단추와 같은 길. 확장은 tabs 권한이 없어 탭 주소를
  // 모른다 — 탭마다 메뉴를 물어 그 이름이 있는 탭(번역 스크립트가 도는 쇼피 탭)에서 고른다.
  const runMenu = (name) =>
    S.popup.ev(`chrome.tabs.query({}).then(async (tabs) => {
      const seen = [];
      for (const tab of tabs) {
        const list = await chrome.tabs.sendMessage(tab.id, { t: 'gm-menu-list' }).catch(() => null);
        if (!list) continue;
        const c = list.find((x) => x.name === ${JSON.stringify(name)});
        if (!c) { seen.push(list.map((x) => x.name).join(' / ')); continue; }
        await chrome.tabs.sendMessage(tab.id, { t: 'gm-menu-run', id: c.id });
        return 'ok';
      }
      return 'no-menu: ' + seen.join(' | ');
    })`);
  const waitIssue = async (n) => {
    const end = Date.now() + 10000;
    while (issues.length < n && Date.now() < end) await sleep(200);
    assert.ok(issues.length >= n, 'GitHub 새 글 화면이 안 열림');
    return issues[n - 1];
  };

  before(async () => {
    S = await open({ pages, glossary: GLOSSARY });
    await S.setMyLang('ko');
    // 상품 글을 번역하지 않게(드래그 번역 시험에 태국어 글이 남아 있어야) + 지난 기록 하나
    await S.setStore({
      'gm:pageEngine': 'off',
      'gm:problemLog': [{ at: Date.now() - 60000, host: 'shopee.co.th', msg: '검색어 번역 실패: HTTP 429', n: 3 }],
    });
    t = await S.chrome.tab();
  });
  after(async () => {
    if (S) await S.close();
  });

  test('바꾼 검색어 → 설정 창 문제 알리기에서 골라 GitHub 에 올리기: 제목·본문이 채워지고 사이트는 이름만', T, async () => {
    await t.go('https://shopee.co.th/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await t.typeIn('input[name="keyword"]', '무선 이어폰');
    await t.enter();
    await t.until(`document.querySelector('input[name=keyword]').value === 'หูฟังไร้สาย'`, 10000, '검색어 바뀜');
    await t.enter();
    await t.until(`location.search.includes('keyword=')`, 10000, '검색 주소로');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "새 페이지 '한' 단추");
    // 페이지 자신의 오류는 기록하지 않는다(확장이 낸 것만)
    await t.ev(`setTimeout(() => { throw new Error('page-boom') }, 0), 1`);

    assert.equal(await runMenu('문제 알리기 · 번역이 이상해요'), 'ok');
    await t.until(`document.querySelector('#lzk-panel #lzk-report[open]')`, 10000, '문제 알리기 칸 펼침');
    const opts = await t.ev(`[...document.querySelectorAll('#lzk-rp-recent option')].map((o) => o.textContent)`);
    assert.ok(opts.includes('검색어: 무선 이어폰 → หูฟังไร้สาย'), `최근 번역 목록: ${JSON.stringify(opts)}`);
    await t.ev(`(() => { const s = document.getElementById('lzk-rp-recent'); s.value = '0'; s.dispatchEvent(new Event('change')); return 1; })()`);
    assert.equal(await val('#lzk-rp-src'), '무선 이어폰');
    assert.equal(await val('#lzk-rp-out'), 'หูฟังไร้สาย');
    await t.typeIn('#lzk-rp-want', '블루투스 이어폰도 나오면 좋겠어요');
    const body = await val('#lzk-rp-body');
    for (const want of ['- 어디서: 검색어', '- 원문: 무선 이어폰', '- 나온 번역: หูฟังไร้สาย (용어집', '- 바라는 뜻: 블루투스 이어폰도', '- 사이트: shopee.co.th', '검색어 번역 실패: HTTP 429 (×3)']) {
      assert.ok(body.includes(want), `보낼 글에 '${want}'\n${body}`);
    }
    assert.ok(!/keyword|search\?/.test(body), '주소 뒤쪽(검색어)은 넣지 않음');

    await t.ev(`document.getElementById('lzk-rp-send').scrollIntoView({ block: 'center' }), 1`);
    await t.click('#lzk-rp-send');
    const got = await waitIssue(1);
    assert.equal(got.path, ISSUE);
    assert.equal(got.title, '[번역] 무선 이어폰 → หูฟังไร้สาย');
    assert.equal(got.body, body, 'GitHub 화면에 들어간 본문 = 보여 준 글');
    assert.match(await t.ev(`document.getElementById('lzk-rp-note').textContent`), /Create/);

    await sleep(1300); // 문제 기록은 1초에 한 번 저장
    const log = (await S.getStore('gm:problemLog')) || [];
    assert.ok(!log.some((e) => /page-boom/.test(e.msg)), '페이지 오류가 기록됨');
    const recent = (await S.getStore('gm:recentTr')) || [];
    assert.ok(recent.some((e) => e.kind === '검색어' && e.src === '무선 이어폰' && e.host === 'shopee.co.th'));
  });

  test("드래그 번역 창의 '번역이 이상해요' → 문제 알리기에 원문·번역이 채워진다", T, async () => {
    // 앞 시험에서 연 GitHub 탭이 앞에 있으면 이 탭으로 보낸 마우스 누름이 먹지 않는다
    await S.chrome.send('Page.bringToFront', {}, t.s);
    await t.go('https://shopee.co.th/');
    await t.until(`document.querySelectorAll('#app li').length === 4`, 10000, '상품 글');
    await t.ev(`(() => { const li = document.querySelector('#app li'); const r = document.createRange(); r.selectNodeContents(li);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return 1; })()`);
    await t.until(`document.getElementById('lzk-seltip')`, 10000, "'한국어로' 단추");
    await t.click('#lzk-seltip');
    await t.until(`document.querySelector('#lzk-selpop .lzk-bad')`, 10000, '드래그 번역 창');
    const ko = await t.ev(`document.querySelector('#lzk-selpop .lzk-ko').textContent`);
    await t.click('#lzk-selpop .lzk-bad');
    await t.until(`document.querySelector('#lzk-panel #lzk-report[open]')`, 10000, '문제 알리기 칸 펼침');
    assert.equal(await val('#lzk-rp-src'), ITEMS['shopee.co.th'][0]);
    assert.equal(await val('#lzk-rp-out'), ko);
    assert.match(await val('#lzk-rp-body'), /- 어디서: 드래그 번역/);
    assert.equal(await t.ev(`document.activeElement && document.activeElement.id`), 'lzk-rp-want', '바라는 뜻 칸에 바로 쓰게');
  });

  test('확장 창(popup)의 문제 알리기: 판·도우미·기록이 든 글 → GitHub 새 글 화면, 키는 없음', T, async () => {
    await S.setStore({ 'gm:githubToken': 'ghp_SECRET_TOKEN' });
    await S.popup.reload();
    await S.popup.until(`/번역 도우미: (?!확인 중)/.test(document.getElementById('rbody').value)`, 10000, '도우미 줄');
    await S.popup.ev(`(() => { const w = document.getElementById('rwhat'); w.value = '번역 도우미가 안 켜져요'; w.dispatchEvent(new Event('input')); return 1; })()`);
    const body = await S.popup.ev(`document.getElementById('rbody').value`);
    const ver = await S.popup.ev(`chrome.runtime.getManifest().version`);
    for (const want of ['번역 도우미가 안 켜져요', `- 통합 번역 ${ver}`, '- 내 언어: ko', '검색어 번역 실패: HTTP 429']) {
      assert.ok(body.includes(want), `확장 창 글에 '${want}'\n${body}`);
    }
    // 시험 확장은 도우미와 이어지지 않는다: 도우미가 없는 PC 는 'not found', 깔린 PC 는 'forbidden'(이 확장 id 를 안 받음)
    assert.match(body, /- 번역 도우미: (이 PC 에 없음|연결 실패: .*forbidden)/);
    assert.ok(!body.includes('SECRET'));
    const n = issues.length;
    await S.popup.ev(`document.getElementById('rsend').click(), 1`);
    const got = await waitIssue(n + 1);
    assert.equal(got.path, ISSUE);
    assert.equal(got.title, '[문제] 번역 도우미가 안 켜져요');
    assert.equal(got.body, body);
  });

  test('내 언어가 영어면(1.35.9): 보낼 글을 영어로 읽어 볼 수 있고, 보내는 글은 한국어 그대로', T, async () => {
    await S.setMyLang('en');
    await S.chrome.send('Page.bringToFront', {}, t.s);
    await t.go('https://shopee.co.th/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'EN' 단추");
    assert.equal(await runMenu('문제 알리기 · 번역이 이상해요').catch((e) => String(e)), 'ok');
    await t.until(`document.querySelector('#lzk-report[open]')`, 10000, '문제 알리기 칸');
    assert.equal(await t.ev(`document.getElementById('lzk-rp-body').hidden`), true, '한국어 칸은 숨김');
    // 읽기 칸의 한국어가 영어(가짜 번역 '[en]…')로 바뀐다
    await t.until(`(() => { const v = document.getElementById('lzk-rp-view'); return v && !v.hidden && v.textContent.length > 50 && !/[가-힣]/.test(v.textContent); })()`, 15000, '읽기 칸이 내 언어로');
    assert.match(await val('#lzk-rp-body'), /### 무슨 일인가요\?/, '보내는 글은 한국어(개발자가 읽는다)');
    await t.ev(`document.getElementById('lzk-rp-raw').scrollIntoView({ block: 'center' }), 1`);
    await t.click('#lzk-rp-raw');
    assert.equal(await t.ev(`document.getElementById('lzk-rp-body').hidden`), false, "'그대로 보기·고치기' 로 원래 칸");
    // 확장 창도
    await S.popup.reload();
    await S.popup.until(`(() => { const v = document.getElementById('rview'); return v && !v.hidden && v.textContent.length > 50 && !/[가-힣]/.test(v.textContent); })()`, 15000, '확장 창 읽기 칸이 내 언어로');
    assert.equal(await S.popup.ev(`document.getElementById('rbody').hidden`), true);
    assert.match(await S.popup.ev(`document.getElementById('rbody').value`), /### 환경/);
    await S.setMyLang('ko');
  });

  test('확장 오류 없음', async () => {
    const errs = t.errors().filter((e) => !/page-boom/.test(e));
    assert.deepEqual(errs, []);
  });
});
