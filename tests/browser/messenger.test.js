// 2단계: 페이스북 메신저(가짜 www.messenger.com) + 보통 외국어 사이트 입력칸 — 진짜 크롬 + 확장.
// 받은 말풍선(어느 언어든) → 내 언어 줄, 그 줄의 '이상해요' → 문제 알리기, 한국어로 쓰고 Enter → 상대 언어로 바꿔 보내기,
// 메신저 선택자를 원격 설정(config.json messenger)으로 바꾸기·틀린 선택자는 버리기(1.35.9), 태국어 사이트 입력칸 바꾸기.
'use strict';
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { open } = require('./lib/session');
const { PAGES } = require('./lib/pages');
const { ROOT } = require('../lib/load');

const T = { timeout: 60000 };
const ROOM = 'https://www.messenger.com/t/1234567890';
// 받은 두 말풍선(m1·m3)에 한국어 줄(내 말풍선도 외국어면 옮긴다 — 보낸 말 확인용)
const RECV = `['m1', 'm3'].every((id) => { const b = document.querySelector('[data-message-id="' + id + '"] .lzk-msgko'); return b && /[가-힣]/.test(b.firstChild && b.firstChild.nodeValue); })`;

describe('메신저·외국어 사이트 입력칸 (진짜 크롬 + 확장)', () => {
  let S;
  let t;
  const kos = () => t.ev(`[...document.querySelectorAll('.lzk-msgko')].map((b) => b.firstChild && b.firstChild.nodeValue)`);

  before(async () => {
    S = await open({ pages: PAGES, glossary: '안녕하세요=สวัสดีครับ\n오늘=วันนี้' });
    await S.setMyLang('ko');
    t = await S.chrome.tab();
  });
  after(async () => {
    if (S) await S.close();
  });

  test('받은 베트남어 말풍선 아래에 한국어', T, async () => {
    await t.go(ROOM);
    await t.until(RECV, 15000, '받은 말풍선 둘에 한국어');
  });

  test("말풍선 번역의 '이상해요' → 문제 알리기에 원문·번역이 채워진다", T, async () => {
    const [x, y] = await t.center('[data-message-id="m1"] .lzk-msgko');
    await S.chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }, t.s);
    await t.until(`getComputedStyle(document.querySelector('[data-message-id="m1"] .lzk-msgbad')).display !== 'none'`, 5000, '마우스를 올리면 보임');
    await t.click('[data-message-id="m1"] .lzk-msgbad');
    await t.until(`document.querySelector('#lzk-report[open]')`, 10000, '문제 알리기 칸');
    assert.equal(await t.ev(`document.getElementById('lzk-rp-src').value`), 'Hôm nay bạn có rảnh không?');
    assert.match(await t.ev(`document.getElementById('lzk-rp-out').value`), /[가-힣]/);
    assert.match(await t.ev(`document.getElementById('lzk-rp-body').value`), /- 어디서: 메신저 받은 말/);
    assert.equal(await t.ev(`window.__sent || null`), null, '누른 것이 메시지를 보내지 않음');
    await t.ev(`document.getElementById('lzk-fab').click(), 1`); // 설정 창 닫기
  });

  test('한국어로 쓰고 Enter → 상대 언어(베트남어)로 바꿔 보낸다', T, async () => {
    await t.typeIn('#ed', '내일 만나요');
    await t.enter();
    await t.until(`(window.__sent || []).length === 1`, 15000, '보냄');
    const sent = await t.ev(`window.__sent[0]`);
    assert.ok(!/[가-힣]/.test(sent) && /^\[vi\]/.test(sent), `베트남어로 바꿔 보냄: ${sent}`);
    const recent = (await S.getStore('gm:recentTr')) || [];
    assert.ok(recent.some((e) => e.kind === '메신저 보내기' && e.src === '내일 만나요'), '최근 번역에 남음');
  });

  test('메신저 선택자를 원격 설정으로 바꾸고, 문법이 틀린 선택자는 버린다(1.35.9)', T, async () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    // 말풍선 선택자를 틀리게(div[[[) — 버리고 기본값으로 돌아가 그대로 옮겨야 한다.
    cfg.messenger = { ...cfg.messenger, bubble: 'div[[[' };
    await S.setStore({ 'gm:remoteConfig': { text: JSON.stringify(cfg), at: Date.now() } });
    await t.go(ROOM);
    await t.until(RECV, 15000, '틀린 선택자는 버리고 기본값으로');
    // 말풍선 선택자를 m3 만 가리키게 — 설정을 정말 따르면 m3 에만 한국어가 붙는다
    cfg.messenger = { ...cfg.messenger, bubble: '[data-message-id="m3"] div[dir="auto"]' };
    await S.setStore({ 'gm:remoteConfig': { text: JSON.stringify(cfg), at: Date.now() } });
    await t.go(ROOM);
    await t.until(`!!document.querySelector('[data-message-id="m3"] .lzk-msgko')`, 15000, 'm3 에 한국어');
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await t.ev(`!!document.querySelector('[data-message-id="m1"] .lzk-msgko')`), false, '설정 밖의 말풍선(m1)은 옮기지 않음');
    await S.setStore({ 'gm:remoteConfig': { text: fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'), at: Date.now() } });
  });

  test('보통 태국어 사이트: 입력칸에 쓴 한국어를 태국어로(용어집), 한국어 뉴스는 그대로', T, async () => {
    await t.go('https://thai.example.com/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await t.typeIn('#q', '안녕하세요');
    await t.enter();
    await t.until(`document.getElementById('q').value === 'สวัสดีครับ'`, 10000, '태국어로');
    const recent = (await S.getStore('gm:recentTr')) || [];
    assert.ok(recent.some((e) => e.kind === '입력칸' && e.out === 'สวัสดีครับ' && e.host === 'thai.example.com'));
    await t.go('https://news.example.com/');
    await t.until(`document.getElementById('lzk-fab')`, 10000, "'한' 단추");
    await t.typeIn('#q', '오늘 날씨');
    await t.enter();
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await t.ev(`document.getElementById('q').value`), '오늘 날씨', '한국어 페이지에서는 바꾸지 않음');
  });

  test('확장 오류 없음', async () => {
    assert.deepEqual(t.errors(), []);
  });
});
