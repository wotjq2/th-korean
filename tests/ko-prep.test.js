// 한국어 다듬기(1.35.5, 5번) — 구글·크롬 내장 번역기에 넘기기 직전에 초성체·줄임말·맞춤법 실수·큰 숫자를 표준 한국어로.
// 2026-11-22: 'ㄱㄱ 지금 출발' → 영어 'ㄱㄱ Leave now', 'ㅇㅋ 알겠어' → 일본어 'ㅇ', '낼' 이 일본어에서 빠짐 — 다듬으면 바르게.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./lib/load');

const prep = load().peek('koPrep');
const sent = (s) => s.requests.filter((u) => u.includes('translate.googleapis.com')).map((u) => [...u.matchAll(/[?&]q=([^&]*)/g)].map((m) => decodeURIComponent(m[1])).join(' | '));

test('초성체·웃음·울음', () => {
  assert.equal(prep('ㄱㄱ 지금 출발'), '가자 지금 출발');
  assert.equal(prep('ㅇㅋ 알겠어'), '오케이 알겠어');
  assert.equal(prep('ㅋㅋㅋ 넘 웃겨'), '하하 너무 웃겨');
  assert.equal(prep('웃겨ㅋㅋ'), '웃겨 하하'); // 글자에 붙여 써도
  assert.equal(prep('넘 이쁘다 ㅠㅠ'), '너무 예쁘다 😢');
  assert.equal(prep('ㄳ'), '고마워');
});

test('줄임말·맞춤법 실수·큰 숫자', () => {
  assert.equal(prep('낼 몇시에 만나?'), '내일 몇시에 만나?');
  assert.equal(prep('내일 할께요'), '내일 할게요');
  assert.equal(prep('먹을께'), '먹을게');
  assert.equal(prep('드릴께요'), '드릴게요');
  assert.equal(prep('됬어'), '됐어');
  assert.equal(prep('배송 언제 되요?'), '배송 언제 돼요?');
  assert.equal(prep('가격이 2억 5천이에요'), '가격이 250,000,000이에요');
  assert.equal(prep('3만5천원짜리 샀어'), '35,000원짜리 샀어');
});

test('낱말 안의 같은 글자는 건드리지 않는다', () => {
  for (const s of ['넘어지다', '이게 넘버원', '산을 넘었어', '헤어 젤', '첨부파일 보냈어', '선생님께 드려요', '줄 서서 기다려', '안녕하세요', '엉덩이', '머리', '셤니']) {
    assert.equal(prep(s), s, s);
  }
});

test('한글이 없으면 그대로, 줄 수도 그대로(여러 줄을 이어 보낸 뒤 줄로 나눈다)', () => {
  assert.equal(prep('hello world'), 'hello world');
  assert.equal(prep('สวัสดี'), 'สวัสดี');
  const multi = '첫 줄\nㄱㄱ\n셋째 줄 ㅋㅋ';
  assert.equal(prep(multi).split('\n').length, 3);
  assert.equal(prep(multi), '첫 줄\n가자\n셋째 줄 하하');
});

test('구글에 넘기는 글만 다듬는다 — 한국어에서 옮길 때', async () => {
  const s = load();
  await s.peek('freeRaw')('ㄱㄱ 지금 출발', 'ko', 'en');
  await s.peek('freeAltMany')(['낼 봐', 'ㅇㅋ'], 'ko', 'vi');
  assert.deepEqual(sent(s), ['가자 지금 출발', '내일 봐 | 오케이']);
  // 다른 말에서 한국어로 옮길 때(원문이 외국어)는 그대로
  const s2 = load();
  await s2.peek('freeRaw')('넘 good', 'en', 'ko');
  assert.deepEqual(sent(s2), ['넘 good']);
});

test('크롬 내장 번역기에도 다듬어 넘긴다', async () => {
  const s = load({ mt: 'blocked', translator: { 'ko>th': 'available' } });
  await s.peek('freeRaw')('ㄱㄱ 지금 출발', 'ko', 'th');
  assert.deepEqual(s.builtinCalls, ['ko>th|가자 지금 출발']);
});

test('용어집 찾기에는 쓰지 않는다(용어집 키는 사용자가 친 그대로)', async () => {
  const s = load({ host: 'www.lazada.co.th', glossary: 'ㅋㅋ=555\n넘버원=อันดับหนึ่ง\n' });
  const r = await s.peek('translateSearchKeyword')('ㅋㅋ');
  assert.equal(r.thai, '555');
  assert.deepEqual(sent(s), []);
});

test('config.json koPrep 은 뒤에 붙고, 틀린 정규식·모르는 자리는 버린다', () => {
  const p = load({ config: { koPrep: [['ㅂㄹ', ' 별로 ', 'jamo'], ['(', 'x'], ['겁나', '정말'], ['a', 'b', 'nowhere']] } }).peek('koPrep');
  assert.equal(p('ㅂㄹ 맛없어'), '별로 맛없어');
  assert.equal(p('겁나 좋아'), '정말 좋아');
  assert.equal(p('ㄱㄱ'), '가자'); // 기본 표도 그대로
});
