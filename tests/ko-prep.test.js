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

test('config.json: 초성체·요즘 말·귀여운 말끝 (2026-11-26, 구글 en·vi·ja 에 넣어 보고 고름)', () => {
  const p = load({ config: require('../config.json') }).peek('koPrep');
  assert.equal(p('ㄱㅊ 나 혼자 갈게'), '괜찮아 나 혼자 갈게'); // 구글: 'ㄱㅊ I'll go alone'
  assert.equal(p('아 킹받네'), '아 짜증 나네'); // 'Ah, you get king.'
  assert.equal(p('나 지금 개킹받았어'), '나 지금 정말 짜증 났어'); // 'I'm fucked now'
  assert.equal(p('오늘 칼퇴했어'), '오늘 정시 퇴근했어'); // 'I quit my job today'
  assert.equal(p('생파 언제야'), '생일 파티 언제야'); // 'fresh green onions'
  assert.equal(p('나 그거 시러'), '나 그거 싫어'); // 'I'm going to buy that'
  assert.equal(p('마자 마자'), '맞아 맞아'); // 'As soon as soon'
  assert.equal(p('나 읽씹당했어'), '걔가 내 메시지 읽고 답장을 안 했어'); // 'I was read and fucked'
  assert.equal(p('왜 읽씹해'), '왜 읽고 답장 안 해');
  assert.equal(p('담주에 보자'), '다음 주에 보자');
  assert.equal(p('솔까말 별로야'), '솔직히 말해서 별로야');
  assert.equal(p('이거 좀 느끼하다'), '이거 좀 기름지다'); // 'I feel a bit like this'
  assert.equal(p('걔 정들었어요'), '걔 많이 친해지고 정이 들었어요'); // 'He made love'
  assert.equal(p('배가 출출해'), '배가 조금 고파');
  assert.equal(p('오랫만이야'), '오랜만이야');
  assert.equal(p('애정 들었어'), '애정 들었어'); // 낱말 속 '정' 은 그대로
  // 관용구: 구글이 글자 그대로 옮겼다
  assert.equal(p('나 입이 짧아'), '나 편식이 심해'); // 'I have a short mouth'
  assert.equal(p('콩깍지가 씌었어'), '사랑에 빠져서 단점이 안 보여'); // 'I got a bean pod'
  assert.equal(p('김칫국부터 마시지 마'), '너무 앞서가지 마'); // 'Don't drink kimchi soup'
  assert.equal(p('조심히 들어가세요'), '집에 조심히 가세요'); // 'Go in carefully'
  assert.equal(p('걔 이제 철 들었어'), '걔 이제 어른스러워졌어'); // 일본어 '鉄を聞いた'
  for (const s of ['철도 들었어', '눈이 높게 쌓였어', '그냥 그래서 그랬어']) assert.equal(p(s), s, s);
  assert.equal(p('어제 바람맞았어'), '어제 약속했는데 상대가 안 나왔어'); // 'I got caught in the wind'
  assert.equal(p('간 떨어질 뻔했어'), '너무 놀라서 심장이 멎을 뻔했어'); // 'I almost lost my liver'
  assert.equal(p('발등에 불 떨어졌어'), '급한 일이 생겼어'); // 'My feet are on fire'
  assert.equal(p('누워서 떡 먹기지'), '아주 쉬운 일이지'); // 'Lie down and eat rice cake'
  for (const s of ['손이 많이 가는 일', '간이 커서 병원 갔어']) assert.equal(p(s), s, s); // 글자 그대로·꾸미는 꼴은 그대로
  // 한국식 영어·연애 속어
  assert.equal(p('이거 서비스예요'), '이거 무료로 드리는 거예요'); // 'This is a service'
  assert.equal(p('나 모쏠이야'), '나 연애 한 번도 안 해 본 사람이야'); // 'I'm Mosol'
  assert.equal(p('걔 엄친아네'), '걔 완벽한 사람이네'); // 'You're a tough kid'
  assert.equal(p('오늘 텐션 높다'), '오늘 기분이 들떠 있다'); // 'Tension is high today'
  assert.equal(p('콜!'), '좋아!');
  for (const s of ['좋은 서비스예요', '서비스로 연결해 드릴게요', '헬스 트레이너', '알바트로스', '오바마 대통령', '콜 택시 불러', 'ASAP']) assert.equal(p(s), s, s);
  // 다른 말은 그대로
  for (const s of ['머리를 조아리다', '담주머니', '오지랖이 넓어', '불고기 먹자', '시러베아들', '조아라 씨', 'ㄷㄷ 무섭다']) {
    assert.equal(p(s), s === 'ㄷㄷ 무섭다' ? '덜덜 무섭다' : s, s);
  }
});

test('config.json koPrep 은 뒤에 붙고, 틀린 정규식·모르는 자리는 버린다', () => {
  const p = load({ config: { koPrep: [['ㅂㄹ', ' 별로 ', 'jamo'], ['(', 'x'], ['겁나', '정말'], ['a', 'b', 'nowhere']] } }).peek('koPrep');
  assert.equal(p('ㅂㄹ 맛없어'), '별로 맛없어');
  assert.equal(p('겁나 좋아'), '정말 좋아');
  assert.equal(p('ㄱㄱ'), '가자'); // 기본 표도 그대로
});
