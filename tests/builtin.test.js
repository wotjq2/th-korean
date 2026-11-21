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
