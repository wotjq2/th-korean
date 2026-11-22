// 2단계: 번역 캐시(1.35.9) — 진짜 크롬 + 확장. 2026-11-22 실측한 두 문제가 다시 생기지 않는지:
//  (1) 두 탭이 함께 번역하면 한쪽 탭의 새 번역이 사라졌다(탭마다 통째로 저장, 나중에 저장한 쪽이 이김)
//  (2) 저장할 때마다 캐시 전체(7,000개면 0.5 MB)가 storage.onChanged 로 열린 모든 탭에 갔다
// 그리고 옛 storage 의 gm:tmCache 를 background 의 IndexedDB 로 옮기고 지우는지, 다시 열면 캐시로 바로 보이는지.
'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('./lib/session');
const { PAGES, ITEMS } = require('./lib/pages');
const { sleep } = require('./lib/chrome');

const T = { timeout: 90000 };
const translated = (t) =>
  t.until(`document.querySelectorAll('#app li').length === 4 && [...document.querySelectorAll('#app li')].every((e) => /[가-힣]/.test(e.innerText))`, 15000, '상품 글 한국어');

describe('번역 캐시 (진짜 크롬 + 확장)', () => {
  let S;
  let idle;
  const OLD = {};
  for (let i = 0; i < 7000; i++) OLD[`ko|สินค้าตัวอย่างหมายเลข ${i} คุณภาพดีราคาถูก`] = `견본 상품 ${i}번 좋은 품질 싼 가격`;
  const shared = () => S.popup.ev(`chrome.runtime.sendMessage({ t: 'tm-load' })`);

  before(async () => {
    S = await open({ pages: PAGES, glossary: '무선이어폰=หูฟังไร้สาย' });
    await S.setMyLang('ko');
    // 예전 판을 쓰던 사람처럼: storage 에 큰 캐시 + 옛 캐시 비우기는 이미 지남
    await S.setStore({ 'gm:tmCache': OLD, 'gm:pageCachePurged1288': true, 'gm:searchCachePurged191': true });
    idle = await S.chrome.tab();
    await idle.go('https://news.example.com/');
    await idle.until(`document.readyState === 'complete'`, 10000);
    await sleep(1000);
    // 아무것도 안 하는 탭이 받는 storage 바뀜 알림을 센다
    await idle.evIso(`window.__chg = []; chrome.storage.onChanged.addListener((c) => { for (const k in c) window.__chg.push([k, JSON.stringify(c[k].newValue === undefined ? null : c[k].newValue).length]); }); 1`);
  });
  after(async () => {
    if (S) await S.close();
  });

  test('두 탭이 함께 번역해도 두 탭의 새 번역이 모두 남고, 옛 캐시는 옮겨진다', T, async () => {
    const a = await S.chrome.tab();
    const b = await S.chrome.tab();
    await Promise.all([a.go('https://shopee.co.th/'), b.go('https://shopee.vn/')]);
    await Promise.all([translated(a), translated(b)]);
    await sleep(4000); // 탭의 저장 주기(2.5초) + background 모으기(0.5초)
    const c = await shared();
    const keys = Object.keys(c || {});
    const th = ITEMS['shopee.co.th'].filter((t) => keys.some((k) => k.endsWith('|' + t)));
    const vi = ITEMS['shopee.vn'].filter((t) => keys.some((k) => k.endsWith('|' + t)));
    assert.equal(th.length, 4, `태국 탭 번역이 캐시에 ${th.length}/4`);
    assert.equal(vi.length, 4, `베트남 탭 번역이 캐시에 ${vi.length}/4`);
    assert.equal(keys.filter((k) => k.includes('ตัวอย่าง')).length, 7000, '옛 캐시 7,000개를 옮김');
    assert.equal(await S.getStore('gm:tmCache'), undefined, 'storage 의 옛 캐시는 지움');
  });

  test('아무것도 안 하는 탭에 큰 캐시가 가지 않는다(옮기며 지운 알림 한 번뿐)', T, async () => {
    const chg = await idle.evIso(`window.__chg`);
    const big = chg.filter(([, n]) => n > 20000);
    assert.deepEqual(big, [], `큰 바뀜 알림: ${JSON.stringify(big)}`);
  });

  test('다시 열면 캐시로 바로 보인다(구글에 다시 묻지 않음)', T, async () => {
    const t = await S.chrome.tab();
    const before = S.fake.mt.length;
    await t.go('https://shopee.co.th/');
    await translated(t);
    const asked = S.fake.mt.slice(before).filter((m) => ITEMS['shopee.co.th'].includes(m.q));
    assert.deepEqual(asked, [], '캐시에 있는 상품 글을 다시 물음');
  });
});
