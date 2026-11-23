// 2단계: 진짜 크롬 + 지금 만든 확장 + 가짜 쇼핑몰. 번역·용어집·설정은 이 PC 의 가짜 서버가 답한다(진짜 인터넷 안 씀).
//   node --test "tests/browser/*.test.js"
'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('./lib/session');
const { PAGES, ITEMS, PRICE } = require('./lib/pages');
const { sleep } = require('./lib/chrome');
const { MT_TABLE } = require('./lib/fake-net');

MT_TABLE['vi|wireless earphones'] = 'tai nghe không dây';

// GitHub 의 '지금' 용어집. 블루투스이어폰은 예전 사본에는 없던 새 단어(업데이트 시험).
const GLOSSARY = ['무선이어폰=หูฟังไร้สาย', '이어폰=หูฟัง', '무선=ไร้สาย', '블루투스=บลูทูธ', '스피커=ลำโพง', '블루투스이어폰=หูฟังบลูทูธ'].join('\n');
const OLD_GLOSSARY = ['무선이어폰=หูฟังไร้สาย', '이어폰=หูฟัง', '무선=ไร้สาย'].join('\n');
const HANGUL = /[가-힣]/;
const T = { timeout: 60000 };

describe('쇼핑몰 (진짜 크롬 + 확장)', () => {
  let S;
  let t; // 시험 탭
  const items = () => t.ev(`[...document.querySelectorAll('#app li')].map((e) => e.innerText)`);
  const value = (sel) => t.ev(`document.querySelector(${JSON.stringify(sel)}).value`);
  const toast = () => t.ev(`((document.getElementById('lzk-toast') || {}).textContent || '').replace(/\\s+/g, ' ')`);
  const here = async () => decodeURIComponent(await t.ev('location.host + location.pathname + location.search'));
  // 한국어 Enter → 그 나라 말로 바뀌고(확인 기다림) → Enter → 그 말로 검색
  async function search(sel, text, want) {
    await t.typeIn(sel, text);
    await t.enter();
    const v = await t.until(`(() => { const v = document.querySelector(${JSON.stringify(sel)}).value; return v !== ${JSON.stringify(text)} && v; })()`, 10000, `${text} 가 바뀌기`);
    assert.equal(v, want, `'${text}' → '${v}' (안내: ${await toast()})`);
    assert.match(await toast(), /Enter/, '확인 안내가 안 뜸');
    await t.enter();
    await t.until(`location.search.length > 1`, 10000, '검색 주소로 넘어가기');
    return v;
  }

  before(async () => {
    S = await open({ pages: PAGES, glossary: GLOSSARY });
    t = await S.chrome.tab();
  });
  after(async () => {
    if (S) await S.close();
  });

  test('태국 쇼피(한국어 사용자): 상품 글은 한국어, 검색어는 용어집으로 태국어', T, async () => {
    await S.setMyLang('ko');
    await t.go('https://shopee.co.th/');
    await t.until(`document.documentElement.lang === 'th'`, 10000, '문서 언어 th');
    await t.until(`[...document.querySelectorAll('#app li')].length === 4 && [...document.querySelectorAll('#app li')].every((e) => /[가-힣]/.test(e.innerText))`, 10000, '상품 글 한국어');
    assert.match(await t.ev(`document.querySelector('input[name=keyword]').placeholder`), /한국어/);
    const mtBefore = S.fake.mt.length;
    await search('input[name="keyword"]', '무선 이어폰', 'หูฟังไร้สาย');
    assert.equal(await here(), 'shopee.co.th/search?keyword=หูฟังไร้สาย');
    const askedThai = S.fake.mt.slice(mtBefore).filter((m) => m.tl === 'th');
    assert.deepEqual(askedThai, [], '용어집에 있는 말을 구글에 물음');
  });

  test('베트남 쇼피(한국어 사용자): 베트남어 글 → 한국어, 검색어 → 베트남어, 가격 그대로', T, async () => {
    await t.go('https://shopee.vn/');
    await t.until(`document.documentElement.lang === 'vi'`, 10000, '문서 언어 vi (th 아님)');
    await t.until(`[...document.querySelectorAll('#app li')].length === 4 && [...document.querySelectorAll('#app li')].every((e) => /[가-힣]/.test(e.innerText))`, 10000, '상품 글 한국어');
    assert.equal(await t.ev(`document.getElementById('price').innerText`), PRICE['shopee.vn']);
    assert.match(await t.ev(`(document.getElementById('lzk-fab') || {}).title || ''`), /베트남/);
    await search('input[name="keyword"]', '무선 이어폰', 'tai nghe không dây');
    assert.equal(await here(), 'shopee.vn/search?keyword=tai nghe không dây');
  });

  test('라자다 베트남(한국어 사용자): 글 → 한국어, 검색어 → 베트남어', T, async () => {
    await t.go('https://www.lazada.vn/');
    await t.until(`/[가-힣]/.test(document.getElementById('rec').innerText)`, 10000, '글 한국어');
    await search('#q', '블루투스 스피커', 'loa bluetooth');
    assert.equal(await here(), 'www.lazada.vn/catalog/?q=loa bluetooth');
  });

  test('한국어 다듬기(1.35.5): 줄임말로 친 검색어도 표준 한국어로 다듬어 구글에 넘긴다', T, async () => {
    await t.go('https://shopee.vn/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    const before = S.fake.mt.length;
    await search('input[name="keyword"]', '넘 이쁜 원피스', '[vi]k2 k2 k3');
    assert.ok(S.fake.mt.slice(before).some((m) => m.q === '너무 예쁜 원피스'), `구글에 간 말: ${S.fake.mt.slice(before).map((m) => m.q).join(' | ')}`);
  });

  test('싱가포르 쇼피(영어 사용자): 영어 글·영어 검색어는 그대로', T, async () => {
    await S.setMyLang('en');
    await t.go('https://shopee.sg/');
    await t.until(`document.querySelectorAll('#app li').length === 4`, 10000, '상품 글');
    await sleep(2500); // 바꾸려 했다면 이만큼이면 바뀐다
    assert.deepEqual(await items(), ITEMS['shopee.sg']);
    assert.equal(await t.ev(`document.querySelector('input[name=keyword]').placeholder`), 'site-placeholder');
    await t.typeIn('input[name="keyword"]', 'wireless earphones');
    await t.enter();
    await t.until(`location.pathname === '/search'`, 10000, '사이트가 그대로 검색');
    assert.match(await here(), /^shopee\.sg\/search\?keyword=wireless[+ ]earphones$/);
  });

  test('베트남 쇼피(영어 사용자): 베트남어 글 → 영어, 영어 검색어 → 베트남어', T, async () => {
    await t.go('https://shopee.vn/');
    await t.until(`[...document.querySelectorAll('#app li')].length === 4 && [...document.querySelectorAll('#app li')].every((e) => e.innerText.startsWith('[en]'))`, 10000, '상품 글 영어');
    await search('input[name="keyword"]', 'wireless earphones', 'tai nghe không dây');
    assert.equal(await here(), 'shopee.vn/search?keyword=tai nghe không dây');
    await S.setMyLang('ko');
  });

  test("'한' 단추 끌기(1.34.2): 놓은 자리를 새로 고침 뒤에도 기억", T, async () => {
    await S.setMyLang('ko');
    await t.go('https://shopee.vn/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    const rect = () => t.ev(`(() => { const r = document.getElementById('lzk-fab').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })()`);
    const [x0, y0] = await rect();
    await t.drag('#lzk-fab', 140, 160);
    await sleep(500);
    const [x1, y1] = await rect();
    assert.ok(Math.abs(x1 - x0) > 100 || Math.abs(y1 - y0) > 100, `단추가 안 움직임: ${x0},${y0} → ${x1},${y1}`);
    assert.ok(await S.getStore('gm:fabPos'), 'gm:fabPos 에 자리가 저장되지 않음');
    await t.reload();
    await t.until(`document.getElementById('lzk-fab')`, 10000, "새로 고침 뒤 '한' 단추");
    await sleep(800);
    const [x2, y2] = await rect();
    assert.ok(Math.abs(x2 - x1) <= 4 && Math.abs(y2 - y1) <= 4, `자리를 잊음: 놓은 곳 ${x1},${y1} / 새로 고침 뒤 ${x2},${y2}`);
  });

  test('용어집: 보통 한국어 페이지는 큰 용어집을 탭에 읽지 않고, 쇼핑몰은 쓸 때 읽는다(1.35.3)', T, async () => {
    await S.setMyLang('ko');
    await t.go('https://news.example.com/');
    await t.until(`document.getElementById('lzk-fab') || document.readyState === 'complete'`, 10000, '페이지');
    await sleep(1500);
    assert.equal(await t.evIso(`gmStore.has('remoteGlossary')`), false, '뉴스 탭이 태국어 용어집을 들고 있음');
    assert.equal(await t.evIso(`[...gmStore.keys()].some((k) => k.startsWith('langGlossary:'))`), false, '뉴스 탭이 언어별 용어집을 들고 있음');
    await t.go('https://shopee.co.th/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await search('input[name="keyword"]', '무선 이어폰', 'หูฟังไร้สาย');
    await sleep(300);
    assert.equal(await t.evIso(`gmStore.has('remoteGlossary')`), true, '쇼핑몰에서 용어집을 안 읽음');
  });

  test('사진 글자 읽기 엔진(tesseract.min.js)은 쇼핑몰에만 — 뉴스 페이지에는 안 넣는다(1.36.3)', T, async () => {
    // 예전에는 모든 페이지에 넣어 한국어 뉴스 한 장에도 7.6 ms 를 썼다(확장이 쓰는 시간의 30%)
    await t.go('https://news.example.com/');
    await t.until(`document.readyState === 'complete'`, 10000, '페이지');
    await sleep(500);
    assert.equal(await t.evIso(`typeof Tesseract`), 'undefined', '뉴스 페이지에 사진 읽기 엔진이 들어감');
    for (const u of ['https://shopee.co.th/', 'https://shopee.vn/', 'https://www.lazada.vn/']) {
      await t.go(u);
      await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
      assert.equal(await t.evIso(`typeof Tesseract.createWorker`), 'function', `${u} 에 사진 읽기 엔진이 없음`);
    }
  });

  test('용어집 업데이트: 탭에 미리 안 읽어도, 사본이 오래됐으면 GitHub 에서 새로 받아 새 단어를 쓴다', T, async () => {
    const ver = await S.popup.ev('chrome.runtime.getManifest().version');
    await S.setStore({ 'gm:remoteGlossary': { text: OLD_GLOSSARY, at: Date.now() - 2 * 60 * 60 * 1000, ver, etag: null } });
    await t.go('https://shopee.co.th/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await search('input[name="keyword"]', '블루투스 이어폰', 'หูฟังบลูทูธ');
    const saved = await S.getStore('gm:remoteGlossary');
    assert.match(saved.text, /블루투스이어폰/, '새로 받은 용어집이 저장되지 않음');
    assert.ok(Date.now() - saved.at < 60000, '받은 때가 새로 적히지 않음');
  });

  test('영어 사용자: 번역 답에 원래 한국어가 섞여 와도 페이지가 멈추지 않는다', T, async () => {
    // 2026-11-21 찾은 멈춤: 단추 안내(title)를 옮긴 글에 한국어가 남으면 끝없이 다시 옮겼다.
    S.fake.opts.keepHangul = true;
    try {
      await S.setStore({ 'gm:uiTr:en': {} }); // 전에 옮겨 둔 화면 글을 지우고 새로 묻게
      await S.setMyLang('en');
      await t.go('https://shopee.vn/');
      await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
      await t.until(`/\\(en\\)/.test(document.getElementById('lzk-fab').title)`, 10000, '단추 안내가 옮겨짐');
      for (let i = 0; i < 6; i++) {
        await sleep(500);
        const title = await t.ev(`document.getElementById('lzk-fab').title`, 5000); // 멈췄으면 여기서 '멈춤'
        assert.ok(title.length < 300, `단추 안내가 계속 길어짐: ${title.slice(0, 120)}…`);
      }
    } finally {
      S.fake.opts.keepHangul = false;
      await S.setMyLang('ko');
    }
  });

  test('전체: 확장 오류 0건, 한국어로 검색된 적 없음, 모르는 주소 요청 없음, 진짜 인터넷은 막힘', T, async () => {
    assert.deepEqual(t.errors(), []);
    assert.deepEqual(S.fake.hits.filter((h) => /search|catalog/.test(h) && HANGUL.test(h)), []);
    assert.deepEqual(S.fake.other, []);
    const r = await S.chrome.send('Page.navigate', { url: 'https://example.com/' }, t.s);
    assert.ok(r.errorText, '진짜 인터넷(example.com)이 열림 — 시험 크롬이 바깥으로 나간다');
  });
});
