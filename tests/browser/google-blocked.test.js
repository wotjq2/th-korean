// 2단계(4번, 1.35.4): 구글이 두 주소 다 막혔을 때(429) — 크롬 내장 번역기(흉내: lib/fake-translator.js)로 이어 가는지.
// 진짜 크롬과 같게, 이 사이트에서 안 켠 쌍은 누름이 있어야 켜진다(안내 누르기 · 검색칸 Enter).
'use strict';
const path = require('path');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('./lib/session');
const { PAGES, ITEMS } = require('./lib/pages');
const { sleep } = require('./lib/chrome');

const GLOSSARY = ['무선이어폰=หูฟังไร้สาย', '이어폰=หูฟัง', '무선=ไร้สาย'].join('\n');
const T = { timeout: 60000 };

describe('구글이 막혔을 때 (진짜 크롬 + 확장 + 내장 번역기 흉내)', () => {
  let S;
  let t;
  const toast = () => t.ev(`((document.getElementById('lzk-toast') || {}).textContent || '').replace(/\\s+/g, ' ')`);
  const allItemsStartWith = (p) => `[...document.querySelectorAll('#app li')].length === 4 && [...document.querySelectorAll('#app li')].every((e) => e.innerText.startsWith(${JSON.stringify(p)}))`;

  before(async () => {
    S = await open({ pages: PAGES, glossary: GLOSSARY, prelude: path.join(__dirname, 'lib/fake-translator.js') });
    S.fake.opts.blockMt = true;
    await S.setMyLang('ko');
    t = await S.chrome.tab();
  });
  after(async () => {
    if (S) await S.close();
  });

  test('태국 쇼피: 막힘 안내를 누르면 크롬 내장 번역기로 상품 글을 옮긴다', T, async () => {
    await t.go('https://shopee.co.th/');
    await t.until(`/여기를 누르면 크롬 내장 번역기로/.test((document.getElementById('lzk-toast') || {}).textContent || '')`, 15000, '누를 안내');
    assert.deepEqual(await t.ev(`[...document.querySelectorAll('#app li')].map((e) => e.innerText)`), ITEMS['shopee.co.th'], '누르기 전인데 바뀜');
    assert.doesNotMatch(await toast(), /Groq/);
    await t.click('#lzk-toast'); // 진짜 누름 — 크롬의 '사용자 동작'
    await t.until(allItemsStartWith('내장:'), 15000, '상품 글이 내장 번역기로');
    assert.ok(S.fake.mt.length > 0, '구글을 먼저 써 보지 않음');
  });

  test('태국 쇼피 검색: 용어집 말은 그대로, 없는 말은 Enter(누름)로 내장 번역기를 켜서 옮긴다', T, async () => {
    await t.go('https://shopee.co.th/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await t.typeIn('input[name="keyword"]', '무선 이어폰');
    await t.enter();
    await t.until(`document.querySelector('input[name=keyword]').value === 'หูฟังไร้สาย'`, 10000, '용어집 말');
    await t.typeIn('input[name="keyword"]', '고양이 사료');
    await t.enter();
    const v = await t.until(`(() => { const v = document.querySelector('input[name=keyword]').value; return v !== '고양이 사료' && v; })()`, 15000, '없는 말이 바뀌기');
    assert.equal(v, '[BI-th]k3 k2');
  });

  test('베트남 쇼피 검색: 막혀도 조용히 실패하지 않고 내장 번역기로 바꾼다', T, async () => {
    await t.go('https://shopee.vn/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await t.typeIn('input[name="keyword"]', '무선 이어폰');
    await t.enter();
    const v = await t.until(`(() => { const v = document.querySelector('input[name=keyword]').value; return v !== '무선 이어폰' && v; })()`, 15000, '검색어가 바뀌기');
    assert.equal(v, '[BI-vi]k2 k3');
    assert.match(await toast(), /Enter/);
  });

  test('확장 오류 0건', T, async () => {
    await sleep(300);
    assert.deepEqual(t.errors(), []);
  });
});
