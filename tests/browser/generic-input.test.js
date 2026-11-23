// 보통 사이트 입력칸: 번역을 기다리는 사이에 사이트가 입력칸을 새 칸으로 바꿔 끼워도(위키백과 Vue 검색칸) 화면의 칸에
// 바꾼 말이 들어간다. 2026-11-23 일본어 위키백과에서 안내에는 일본어가 보였는데 칸은 한국어 그대로였다 — 떨어져 나간 옛 칸에만 썼다.
'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('./lib/session');
const { PAGES } = require('./lib/pages');

const T = { timeout: 60000 };

describe('보통 사이트 입력칸', () => {
  let S;
  let t;
  before(async () => {
    S = await open({ pages: PAGES, glossary: '' });
    await S.setMyLang('ko');
    t = await S.chrome.tab();
  });
  after(async () => S && S.close());

  test('번역을 기다리는 사이에 칸이 바뀌어도 화면의 칸에 태국어', T, async () => {
    S.fake.opts.mtDelay = 1200; // 칸은 0.3초 뒤에 바뀐다 — 번역 답은 그 뒤에
    try {
      await t.go('https://swap.example.com/');
      await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
      await t.typeIn('#q', '파란 우산 세 개');
      await t.enter();
      const v = await t.until(`(() => { const i = document.querySelector('input[name=q]'); return window.__swapped && i.className === 'swapped' && i.value.includes('[th]') && i.value; })()`, 15000, '바뀐 칸에 태국어');
      // '세 개' 는 용어집 짜맞추기로 '3 ชิ้น', 나머지는 (늦게 오는) 구글 답
      assert.match(v, /\[th\]/);
      assert.doesNotMatch(v, /[가-힣]/);
      // 다시 Enter 하면 그대로 사이트 검색(바꾼 말은 내 언어가 아니다)
      assert.equal(await t.ev(`document.activeElement === document.querySelector('input[name=q]')`), true, '새 칸에 포커스');
    } finally {
      S.fake.opts.mtDelay = 0;
    }
  });

  test('확장 오류 없음', async () => {
    assert.deepEqual(t.errors(), []);
  });
});
