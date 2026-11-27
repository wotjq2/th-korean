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
  // 생활 말 — 방콕(집에만 있기)은 동사 꼴만, 도시 방콕은 그대로
  assert.equal(p('주말엔 방콕할래'), '주말엔 집에만 있을래'); // 'I want to go to Bangkok this weekend'
  assert.equal(p('주말에 방콕했어'), '주말에 집에만 있었어');
  assert.equal(p('해장하러 가자'), '숙취 해소하러 가자'); // 'Let's go hang out'
  assert.equal(p('지름신이 왔어'), '사고 싶은 마음을 못 참겠어'); // 'A fool has come'
  assert.equal(p('오후 반차야'), '오후 반나절 휴가야'); // 'It's half afternoon'
  for (const s of ['다음 주에 방콕 가', '방콕 가자', '방콕에서 만나', '방콕 중이야', '해장국 먹자', '짤렸어']) assert.equal(p(s), s, s);
  // 식당·택시 — 바꾼 말의 받침이 달라지면 조사도 맞춘다
  assert.equal(p('곱빼기로 주세요'), '양을 두 배로 주세요'); // 'Please give me a smaller number', 태국어 '전화번호 주세요'
  assert.equal(p('잔돈은 됐어요'), '잔돈은 가지세요'); // 'I have some change'
  assert.equal(p('콘센트 어디 있어요'), '전기 콘센트 어디 있어요'); // 태국어·베트남어 '출구'
  assert.equal(p('비번이 뭐야'), '비밀번호가 뭐야');
  assert.equal(p('기사님 여기서 세워 주세요'), '운전기사님 여기서 세워 주세요'); // 일본어 '記事'
  for (const s of ['택배 기사님이 왔어', '수리기사님', '전기 콘센트']) assert.equal(p(s), s, s);
  // 건강·태국 생활 — '~는 체했어'(척했어)는 그대로
  assert.equal(p('나 더위 먹었어'), '나 더위 때문에 몸이 안 좋아'); // 'I ate the heat'
  assert.equal(p('점심 먹고 체했어'), '점심 먹고 소화가 안 돼');
  assert.equal(p('몸살 났어'), '온몸이 쑤시고 아파'); // 일본어 '虐殺された'
  assert.equal(p('세븐 가서 물 사 와'), '세븐일레븐 가서 물 사 와'); // 'Seven go and buy water'
  assert.equal(p('다음 달에 비자런 가'), '다음 달에 비자 연장하러 국경에 다녀와');
  for (const s of ['모르는 체했어', '아픈 체했어요', '세븐틴 좋아해', '세븐업']) assert.equal(p(s), s, s);
  // 메신저 연락 말 — '있다가'·'잘 들어갔어' 는 메시지 맨 앞일 때만
  assert.equal(p('잘 들어갔어?'), '집에 잘 도착했어?'); // 'Did you get in okay?'
  assert.equal(p('다 와 가'), '거의 다 왔어'); // 'Everyone come and go'
  assert.equal(p('있다가 전화할게'), '이따가 전화할게');
  assert.equal(p('톡해'), '메시지 보내'); // 'Talk'
  assert.equal(p('문자 씹었지'), '문자 일부러 무시했지'); // 'I chewed the text message'
  for (const s of ['집에 잘 들어갔어요?', '공이 잘 들어갔어', '집에 있다가 나갔어', '토크해', '껌 씹었어']) assert.equal(p(s), s, s);
  // 가족 호칭·직장·학교·돈
  assert.equal(p('사장님 여기 계산이요'), '사장님 여기 결제할게요'); // 'Boss, here is the calculation'
  assert.equal(p('도련님 오셨어요'), '남편의 남동생이 오셨어요'); // 'Master, you have come'
  assert.equal(p('엠티 가'), '대학교 단체 여행 가'); // 'Empty Street'
  assert.equal(p('대학 동기야'), '대학교 같은 학년 친구야'); // 일본어 '動機'
  assert.equal(p('한 장만 빌려줘'), '만 원만 빌려줘'); // 'lend me one copy'
  for (const s of ['계산서 주세요', '친정 엄마가 오셨어', '전역 후에', '사진 한 장만 보내줘']) assert.equal(p(s), s, s);
  // 요즘 속어 2
  assert.equal(p('어쩔티비'), '어쩌라고'); // 'What TV'
  assert.equal(p('사바사야'), '사람마다 달라'); // 'Sabasaya'
  assert.equal(p('쌉가능'), '완전 가능'); // 'Cheap possible'
  assert.equal(p('오히려 좋아'), '오히려 더 좋아'); // 'rather good'
  assert.equal(p('찐친이야'), '진짜 친한 친구야'); // 'It's Jinchin.'
  for (const s of ['각도가 이상해', '썰매 타자', '댕댕 울린다', '현타임']) assert.equal(p(s), s, s);
  // 쇼핑·게임·외모 — 글자 그대로 뜻(채소 당근, 연장 공구, 쌍수 들고)은 그대로
  assert.equal(p('당근에 올렸어'), '중고 거래 앱에 올렸어'); // 'I put it on carrots'
  assert.equal(p('공구 같이 할래'), '공동 구매 같이 할래'); // 'work with tools'
  assert.equal(p('쌍수 했어'), '쌍꺼풀 수술 했어'); // 'I double-wielded'
  assert.equal(p('개이득'), '완전 이득'); // 'dog gain'
  for (const s of ['당근 사 왔어', '당근 케이크', '공구 상자', '쌍수 들고 환영', '멍이 들었어']) assert.equal(p(s), s, s);
  // 말머리·감탄 — 칭찬하는 '미쳤다' 만, 욕은 그대로
  assert.equal(p('몰겠다'), '모르겠다'); // 'I will drive'
  assert.equal(p('아 참 그거 샀어?'), '아 그런데 그거 샀어?'); // 'did you really buy that?'
  assert.equal(p('이 집 맛 미쳤어'), '이 집 맛 정말 대단해'); // 태국어 'บ้า'(미쳤다, 나쁜 뜻)
  for (const s of ['내가 차 몰겠다', '참 좋다', '너 미쳤어?', '걔 미쳤어']) assert.equal(p(s), s, s);
  // 속담·느낌 말
  assert.equal(p('꿩 먹고 알 먹고'), '일석이조'); // 'Eat pheasant and eat eggs'
  assert.equal(p('그건 하늘의 별 따기야'), '그건 정말 어려운 일이야'); // 'picking stars in the sky'
  assert.equal(p('빛 좋은 개살구네'), '겉만 좋고 실속이 없네'); // 일본어 '光の良い犬肉'
  assert.equal(p('코끝이 찡해'), '감동해서 눈물이 날 것 같아'); // 'The tip of my nose stings'
  assert.equal(p('짠하게 건배'), '짠하게 건배');
  // 사자성어·몸 관용구 3
  assert.equal(p('자업자득이지'), '자기가 한 일의 결과야'); // 'It's a blessing to be self-employed'
  assert.equal(p('유유상종이네'), '비슷한 사람끼리 모이네'); // 'It's a species of oil.'
  assert.equal(p('적반하장도 유분수지'), '잘못한 사람이 오히려 화를 내네'); // 'It's a red flag.'
  assert.equal(p('그 애가 눈에 밟혀'), '그 애가 자꾸 생각나고 걱정돼'); // 'That kid caught my eye'
  assert.equal(p('고진감래야'), '고생 끝에 좋은 날이 와'); // 'Gojingamraeya'
  assert.equal(p('일취월장했네'), '실력이 정말 빨리 늘었네'); // 'I bought a day and a month.'
  assert.equal(p('전화위복이 됐어'), '나쁜 일이 오히려 좋은 일이 됐어'); // 'The phone call was a blessing in disguise.'
  // 연애·직장·돈 속어
  assert.equal(p('나 어제 차였어'), '나 어제 이별 통보를 받았어'); // 일본어 '車でした'
  assert.equal(p('걔 어장관리 하는 거야'), '걔 여러 사람한테 여지만 주고 사귀지는 않는 거야'); // 'He's managing the fishery.'
  assert.equal(p('월급 루팡이네'), '일은 안 하고 월급만 받는 사람이네'); // 'Salary is Lupine'
  for (const s of ['공에 차였어', '기차였어', '자동차였어']) assert.equal(p(s), s, s);
  // 한국 음식 — 뜻이 틀리던 것만(순대 = 베트남어 '아이스크림'·태국어 '선데이')
  assert.equal(p('순대 먹을래'), '순대(돼지 창자에 당면을 넣은 한국 음식) 먹을래');
  assert.equal(p('쌈 싸 먹자'), '상추에 고기를 싸서 먹자'); // 태국어 'ห่อหมก'(다른 요리)
  for (const s of ['순댓국 먹자', '아빠랑 붕어빵이네']) assert.equal(p(s), s, s);
  // 명절·경조사
  assert.equal(p('설날에 차례 지내'), '설날에 조상께 제사 지내'); // 'Celebrate Lunar New Year', 일본어 '順番に'
  assert.equal(p('다음 주에 상견례야'), '다음 주에 결혼 전에 두 집안 부모님이 처음 만나는 자리야'); // 'I have a meeting next week.'
  assert.equal(p('백일 기념이야'), '사귄 지 100일 기념이야'); // 'the 100th anniversary'
  for (const s of ['네 차례야', '아기 백일 기념 사진']) assert.equal(p(s), s, s);
  // 집·학교 — '재수 없어'(운)·야자수·집안 족보·'학식이 풍부해' 는 그대로
  assert.equal(p('오늘 야자 있어'), '오늘 밤에 학교에서 하는 자율 학습 있어'); // 'I have palm trees today'
  assert.equal(p('족보 구했어'), '작년 시험 문제 구했어'); // 'I got the genealogy'
  assert.equal(p('재수해'), '대학 입시를 한 번 더 준비해'); // 'Flood again'
  assert.equal(p('학식 먹자'), '학교 식당 밥 먹자'); // 'Let's eat knowledge'
  for (const s of ['재수 없어', '야자수 아래', '우리 집안 족보', '학식이 풍부해']) assert.equal(p(s), s, s);
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
