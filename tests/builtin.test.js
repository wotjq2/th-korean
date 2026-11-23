// 4번(1.35.4): 구글이 막히거나 인터넷이 안 되면 크롬 내장 번역기(Translator API)로 — 이 PC 안에서 번역.
// 가짜 구글(opt.mt) + 가짜 내장 번역기(opt.translator). 진짜 크롬과 같게, 켜지 않은 쌍은 누름 중에만 만들 수 있다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./lib/load');

const googleHits = (s) => s.requests.filter((u) => u.includes('translate.googleapis.com'));
const free = (s) => s.peek('freeRaw');

test('구글이 되면 내장 번역기는 쓰지 않는다', async () => {
  const s = load({ translator: { 'ko>th': 'available' } });
  assert.equal(await free(s)('고양이 사료', 'ko', 'th'), '고양이 사료?API');
  assert.deepEqual(s.builtinCalls, []);
});

test('구글이 둘 다 막히면(429) 내장 번역기로 옮기고, 그렇게 했다고 알린다', async () => {
  const s = load({ mt: 'blocked', translator: { 'ko>th': 'available' } });
  assert.equal(await free(s)('고양이 사료', 'ko', 'th'), '내장(ko>th):고양이 사료');
  assert.ok(googleHits(s).length >= 1, '구글을 먼저 써 보지 않음');
  assert.ok(s.toasts.some((t) => /내장 번역기로 옮기고/.test(t)), `안내 없음: ${s.toasts.join(' | ')}`);
});

test('인터넷이 안 될 때도 내장 번역기로(이 PC 안에서)', async () => {
  const s = load({ mt: 'offline', translator: { 'th>ko': 'available' } });
  assert.equal(await free(s)('ส่งฟรี', 'th', 'ko'), '내장(th>ko):ส่งฟรี');
});

test('이 사이트에서 아직 안 켠 쌍: 누름이 없으면 기다렸다가 안내를 누르면 켠다', async () => {
  const s = load({ mt: 'blocked', translator: { 'th>ko': 'downloadable' } });
  await assert.rejects(free(s)('ส่งฟรี', 'th', 'ko'), (e) => e.rateLimited === true);
  s.peek('noteRateLimit')();
  assert.ok(s.toasts.some((t) => /여기를 누르면 크롬 내장 번역기로/.test(t)), `누를 안내 없음: ${s.toasts.join(' | ')}`);
  const el = s.attached.get('lzk-toast');
  assert.equal(typeof el.onclick, 'function', '안내를 누를 수 없음');
  s.userActivation.isActive = true; // 사용자가 안내를 눌렀다
  el.onclick();
  await new Promise((r) => setTimeout(r, 20));
  s.userActivation.isActive = false;
  assert.ok(s.toasts.some((t) => /켰습니다/.test(t)), `켰다는 안내 없음: ${s.toasts.join(' | ')}`);
  assert.equal(await free(s)('ส่งฟรี', 'th', 'ko'), '내장(th>ko):ส่งฟรี'); // 그다음부터는 누름 없이
});

test('Enter·누름 중이면 바로 켜서 옮긴다(검색칸)', async () => {
  const s = load({ mt: 'blocked', activation: true, translator: { 'ko>vi': 'downloadable' } });
  assert.equal(await free(s)('무선 이어폰', 'ko', 'vi'), '내장(ko>vi):무선 이어폰');
});

test('내장 번역기에 없는 언어(크메르어)는 구글이 풀릴 때까지 — 그 까닭을 알린다', async () => {
  const s = load({ mt: 'blocked', translator: { 'ko>th': 'available' } });
  await assert.rejects(free(s)('안녕하세요', 'ko', 'km'), (e) => e.rateLimited === true);
  s.peek('noteRateLimit')();
  const last = s.toasts[s.toasts.length - 1];
  assert.match(last, /크롬 내장 번역기에 없는 언어/);
  assert.doesNotMatch(last, /Groq/);
});

test('원문 언어를 모르면(auto) 글자로 알아본다 — 태국어·일본어', async () => {
  const s = load({ mt: 'blocked', translator: { 'th>ko': 'available', 'ja>ko': 'available' } });
  assert.equal(await free(s)('สวัสดี', 'auto', 'ko'), '내장(th>ko):สวัสดี');
  assert.equal(await free(s)('こんにちは', 'auto', 'ko'), '내장(ja>ko):こんにちは');
});

test('여러 줄(페이지 글): 구글이 막히면 줄마다 내장 번역기로', async () => {
  const s = load({ mt: 'blocked', translator: { 'vi>ko': 'available' } });
  const out = await s.peek('freeTranslateMany')(['Miễn phí vận chuyển', 'Bán chạy'], 'vi', 'ko');
  assert.deepEqual([...out], ['내장(vi>ko):Miễn phí vận chuyển', '내장(vi>ko):Bán chạy']);
});

test('config.json translate.order 에 builtin 을 앞에 두면 구글보다 먼저(심사 없이 바꾸기)', async () => {
  const s = load({ config: { translate: { order: ['builtin', 'dict', 'gtx'] } }, translator: { 'ko>th': 'available' } });
  assert.equal(await free(s)('고양이 사료', 'ko', 'th'), '내장(ko>th):고양이 사료');
  assert.deepEqual(googleHits(s), []);
});

test('몽키·번역 도우미(Translator 없음): 구글이 막히면 예전처럼 RateLimited', async () => {
  const s = load({ mt: 'blocked' });
  await assert.rejects(free(s)('고양이 사료', 'ko', 'th'), (e) => e.rateLimited === true);
});

test('안내 글: 언어 이름이 코드(ko)가 아니라 이름으로, 검색 안내 출처는 내장 번역기', async () => {
  const s = load({ mt: 'blocked', translator: { 'th>ko': 'downloadable' } });
  await assert.rejects(free(s)('ส่งฟรี', 'th', 'ko'));
  s.peek('noteRateLimit')();
  assert.match(s.toasts[s.toasts.length - 1], /태국어 → 한국어/);
  const s2 = load({ host: 'www.lazada.co.th', mt: 'blocked', translator: { 'ko>th': 'available' } });
  const r = await s2.peek('translateSearchKeyword')('고양이 사료');
  assert.equal(r.via, '크롬 내장 번역기');
});

// 1.36.1: 확장은 페이지를 열자마자 저절로 모델을 받기 시작해, 그 사이 검색하면 '받는 중 n%' 가 검색 안내(Enter 확인)를 가렸다
// (2026-11-23 GitHub Actions 2단계). 받는 정도 안내는 다른 안내를 덮지 않고, 저끼리는 이어서 바꾼다.
test('받는 정도 안내는 떠 있는 다른 안내(검색 안내 등)를 덮지 않는다', async () => {
  const s = load({ mt: 'blocked', activation: true, progress: [0, 0.5], translator: { 'ko>th': 'downloadable' } });
  s.peek('toast')('"고양이 사료" → "อาหารแมว"\n확인 후 Enter를 다시 누르세요.', 6000);
  assert.equal(await free(s)('고양이 사료', 'ko', 'th'), '내장(ko>th):고양이 사료');
  assert.ok(!s.toasts.some((t) => /받는 중/.test(t)), `검색 안내를 덮음: ${s.toasts.join(' | ')}`);
});

test('떠 있는 안내가 없거나 받는 정도 안내면 이어서 보인다(0% → 50%)', async () => {
  const s = load({ mt: 'blocked', activation: true, progress: [0, 0.5], translator: { 'th>ko': 'downloadable' } });
  assert.equal(await free(s)('ส่งฟรี', 'th', 'ko'), '내장(th>ko):ส่งฟรี');
  const dl = s.toasts.filter((t) => /받는 중/.test(t));
  assert.equal(dl.length, 2, s.toasts.join(' | '));
  assert.match(dl[0], /태국어 → 한국어\) 0%/);
  assert.match(dl[1], /50%/);
});

// 1.36.1: 크롬은 새 언어 모델을 깔 때 번역 서비스를 다시 띄워, 그 전에 만든 번역기가 'Other generic failures occurred.' 로 고장 난다
// (2026-11-23 크롬 157 — 화면 번역에서 5개 언어를 받은 뒤 일본어·베트남어 자막이 계속 실패). 고장 난 번역기는 버리고 다음에 새로 만든다.
test('고장 난 번역기(크롬이 번역 서비스를 다시 띄움)는 버리고 다음에 새로 만든다', async () => {
  const s = load({ mt: 'blocked', translator: { 'th>ko': 'available' } });
  assert.equal(await free(s)('ส่งฟรี', 'th', 'ko'), '내장(th>ko):ส่งฟรี');
  s.breakTranslators();
  await assert.rejects(free(s)('ขายดี', 'th', 'ko')); // 이번 줄은 놓친다(확장은 background 가 그 자리에서 다시 만든다)
  assert.equal(await free(s)('ขายดี', 'th', 'ko'), '내장(th>ko):ขายดี');
  assert.deepEqual(s.builtinCreates, ['th>ko', 'th>ko']);
});

// 1.36.3: 구글이 막히고 내장 번역기도 못 옮기면 그 까닭을 안내에(메신저 보내기·검색어·LINE). 예전에는 늘 '무료 번역 API가
// 요청을 일시적으로 거절했습니다' — 영어로 샌 답을 막은 것인데도(2026-11-23 메신저 한→베 '내일 만나요').
test('내장 번역기도 못 옮긴 까닭을 실패 안내에: 영어로 샘·없는 언어·모델 못 받음', async () => {
  const s = load({ mt: 'blocked', translator: { 'ko>vi': 'available' }, translateError: { 'ko>vi': 'english' } });
  await assert.rejects(free(s)('내일 만나요', 'ko', 'vi'), (e) => e.rateLimited === true && /베트남어가 아니라 영어로 나와 쓰지 않았습니다/.test(e.message));
  const s2 = load({ mt: 'blocked', translator: { 'ko>th': 'available' } });
  await assert.rejects(free(s2)('안녕하세요', 'ko', 'km'), (e) => e.rateLimited === true && /크롬 내장 번역기에는 .+가 없습니다/.test(e.message));
  const s3 = load({ mt: 'blocked', translator: { 'ko>th': 'downloadable' }, activation: true, createError: { 'ko>th': '크롬 내장 번역기 언어 모델을 받지 못합니다(인터넷 연결 확인)' } });
  await assert.rejects(free(s3)('안녕하세요', 'ko', 'th'), (e) => /언어 모델을 받지 못했습니다/.test(e.message));
  // 까닭을 모르면 예전 글 그대로
  const s4 = load({ mt: 'blocked' });
  await assert.rejects(free(s4)('안녕하세요', 'ko', 'th'), (e) => /무료 번역 API가 요청을 일시적으로 거절했습니다/.test(e.message));
});
