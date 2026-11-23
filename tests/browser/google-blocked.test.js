// 2단계(4번, 1.35.4 → 1.36.0): 구글이 두 주소 다 막혔을 때(429) — 크롬 내장 번역기(흉내: lib/fake-translator-sw.js, 확장
// service worker 안)로 이어 가는지. 1.36.0 부터 탭의 번역기는 background 에 맡겨(gm.js) 사이트마다 누를 필요가 없다 — 진짜 크롬처럼
// service worker 는 누름 없이 만들고, 처음 쓰는 쌍은 모델을 받는 정도를 알린다('받는 중' 안내).
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
    S = await open({ pages: PAGES, glossary: GLOSSARY, bgPrelude: path.join(__dirname, 'lib/fake-translator-sw.js') });
    S.fake.opts.blockMt = true;
    await S.setMyLang('ko');
    t = await S.chrome.tab();
  });
  after(async () => {
    if (S) await S.close();
  });

  test('태국 쇼피: 아무것도 누르지 않아도 크롬 내장 번역기로 상품 글을 옮긴다(처음 받는 정도도 보인다)', T, async () => {
    assert.ok(ITEMS['shopee.co.th'].every((x) => !x.startsWith('내장:')));
    await t.go('https://shopee.co.th/');
    const seen = new Set();
    const end = Date.now() + 15000;
    let done = false;
    while (!done && Date.now() < end) {
      seen.add(await toast());
      done = await t.ev(allItemsStartWith('내장:'));
      if (!done) await sleep(150);
    }
    const toasts = [...seen].filter(Boolean);
    assert.ok(done, `상품 글이 내장 번역기로 안 바뀜 — 안내: ${toasts.join(' | ')}`);
    assert.ok(toasts.some((x) => /크롬 내장 번역기를 받는 중 \(.+ → .+\) \d+%/.test(x)), `받는 정도 안내 없음: ${toasts.join(' | ')}`);
    assert.ok(!toasts.some((x) => /여기를 누르면/.test(x)), `누르라는 안내가 남음: ${toasts.join(' | ')}`);
    assert.ok(S.fake.mt.length > 0, '구글을 먼저 써 보지 않음');
  });

  test('태국 쇼피 검색: 용어집 말은 그대로, 없는 말은 내장 번역기로 옮긴다', T, async () => {
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

  test('인터넷이 끊겨 모델을 못 받으면(크롬은 끝없이 기다린다) 잠깐 뒤 실패로 알린다 — 말없이 멈추지 않는다', T, async () => {
    await t.go('https://shopee.sg/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await t.typeIn('input[name="keyword"]', '고양이 사료');
    const t0 = Date.now();
    await t.enter();
    const failed = async (from) => {
      const seen = new Set();
      while (Date.now() - from < 15000) {
        const m = await toast();
        seen.add(m);
        if (/검색어 번역 실패/.test(m)) return Date.now() - from;
        await sleep(100);
      }
      assert.fail(`'검색어 번역 실패' 안내가 안 뜸(멈춤?): ${[...seen].filter(Boolean).join(' | ')}`);
    };
    const ms = await failed(t0);
    // 멈춤 시계(시험 1.5초)만큼은 기다렸다 — 다른 까닭의 실패가 아니다
    assert.ok(ms >= 1300 && ms < 8000, `실패까지 ${ms} ms`);
    assert.equal(await t.ev(`document.querySelector('input[name=keyword]').value`), '고양이 사료');
    // 곧바로 다시 해도 또 기다리지 않는다(멈춘 쌍은 잠시 바로 실패)
    await t.ev(`(document.getElementById('lzk-toast') || { remove() {} }).remove(), 1`);
    const t1 = Date.now();
    await t.typeIn('input[name="keyword"]', '고양이 사료');
    await t.enter();
    const ms2 = await failed(t1);
    assert.ok(ms2 < 1300, `두 번째도 기다림 ${ms2} ms`);
  });

  test('확장 오류 0건', T, async () => {
    await sleep(300);
    assert.deepEqual(t.errors(), []);
  });
});
