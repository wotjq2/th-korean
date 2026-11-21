// AI 번역(Groq·NVIDIA, 사용자가 자기 키를 넣은 때만) — 7번. 진짜 키 대신 가짜 AI 서버.
// aiChat: POST {base}/chat/completions, Bearer 키, 모델. 검색어(용어집 낱말은 못 박기)·페이지 글(JSON 묶음). 실패하면 무료 번역으로.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./lib/load');

const GL = '가방=กระเป๋า\n무선이어폰=หูฟังไร้สาย\n';

// 가짜 AI: reply(body) → 내용 글. status 를 주면 그 상태로 실패.
function fakeAI({ reply, status }) {
  return (url, o) => {
    if (!/\/chat\/completions$/.test(url)) return undefined;
    if (status) return { status, text: '{"error":{"message":"invalid api key"}}' };
    const body = JSON.parse(o.data);
    return JSON.stringify({ choices: [{ message: { content: reply(body) } }] });
  };
}
const aiCalls = (s) => s.calls.filter((c) => /\/chat\/completions$/.test(c.url));

// searchEngineMigrated190: 실제 설치본은 처음 페이지에서 한 번 옮기기(1.9.0, AI→무료)가 끝나 있다 — 그 뒤에 고른 AI 는 그대로다.
function aiShop(store, http) {
  return load({ host: 'www.lazada.co.th', glossary: GL, http, store: { searchEngineMigrated190: true, searchEngine: 'ai', aiProvider: 'groq', groqKey: 'gsk_test', ...store } });
}

test('설정 옮기기(1.9.0)는 처음 한 번만 AI 를 무료로 바꾸고, 그 뒤에 고른 AI 는 그대로 둔다', () => {
  const first = load({ store: { searchEngine: 'ai' } });
  assert.equal(first.peek('cfg').searchEngine, 'free');
  assert.equal(first.store.searchEngineMigrated190, true);
  const later = load({ store: { searchEngine: 'ai', searchEngineMigrated190: true } });
  assert.equal(later.peek('cfg').searchEngine, 'ai');
});

test('검색어: AI(Groq)에 키·모델·지시문을 보내고, 따옴표를 떼어 쓴다', async () => {
  const s = aiShop({}, fakeAI({ reply: () => '"อาหารแมว"' }));
  const r = await s.peek('translateSearchKeyword')('고양이 사료');
  assert.deepEqual([r.thai, r.via], ['อาหารแมว', 'Groq']);
  const [c] = aiCalls(s);
  assert.equal(c.method, 'POST');
  assert.equal(c.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(c.headers.Authorization, 'Bearer gsk_test');
  const body = JSON.parse(c.data);
  assert.equal(body.model, 'llama-3.3-70b-versatile');
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[1].content, '고양이 사료');
  assert.match(body.messages[0].content, /태국어/);
});

test('검색어: 용어집에 있는 낱말은 AI 에게도 그 태국어로 못 박는다', async () => {
  const s = aiShop({}, fakeAI({ reply: () => 'กระเป๋าแมว' }));
  await s.peek('translateSearchKeyword')('고양이 가방');
  const body = JSON.parse(aiCalls(s)[0].data);
  assert.match(body.messages[0].content, /반드시 이 태국어로 옮기세요: 가방=กระเป๋า/);
});

test('검색어: 용어집에 통째로 있는 말은 AI 에 묻지 않는다', async () => {
  const s = aiShop({}, fakeAI({ reply: () => 'X' }));
  const r = await s.peek('translateSearchKeyword')('무선이어폰');
  assert.equal(r.thai, 'หูฟังไร้สาย');
  assert.deepEqual(aiCalls(s), []);
});

test('AI 가 실패하면(키 틀림 401) 무료 번역으로 이어 간다', async () => {
  const s = aiShop({}, fakeAI({ status: 401 }));
  const r = await s.peek('translateSearchKeyword')('고양이 사료');
  assert.equal(r.via, '무료 API');
  assert.equal(aiCalls(s).length, 1);
});

test('키가 없으면 AI 를 고른 설정이어도 AI 에 묻지 않는다', async () => {
  const s = aiShop({ groqKey: '' }, fakeAI({ reply: () => 'X' }));
  const r = await s.peek('translateSearchKeyword')('고양이 사료');
  assert.equal(r.via, '무료 API');
  assert.deepEqual(aiCalls(s), []);
});

test('NVIDIA 를 고르면 NVIDIA 주소·키·모델로', async () => {
  const s = aiShop({ aiProvider: 'nvidia', nvidiaKey: 'nvapi-test' }, fakeAI({ reply: () => 'อาหารแมว' }));
  const r = await s.peek('translateSearchKeyword')('고양이 사료');
  assert.equal(r.via, 'NVIDIA NIM');
  const [c] = aiCalls(s);
  assert.equal(c.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(c.headers.Authorization, 'Bearer nvapi-test');
  assert.equal(JSON.parse(c.data).model, 'nvidia/nemotron-3.5-lightning-30b-a3b');
});

test('페이지 글: JSON 묶음으로 보내고 같은 차례로 받는다(json 모드)', async () => {
  const s = aiShop({ pageEngine: 'ai' }, fakeAI({ reply: (b) => JSON.stringify({ out: JSON.parse(b.messages[1].content).in.map((t) => `한:${t}`) }) }));
  const out = await s.peek('translateToKorean')(['ส่งฟรี', 'ขายดี']);
  assert.deepEqual([...out], ['한:ส่งฟรี', '한:ขายดี']);
  assert.deepEqual(JSON.parse(aiCalls(s)[0].data).response_format, { type: 'json_object' });
});

test('페이지 글: AI 답의 줄 수가 틀리면 무료 번역으로', async () => {
  const s = aiShop({ pageEngine: 'ai' }, fakeAI({ reply: () => JSON.stringify({ out: ['하나뿐'] }) }));
  const out = await s.peek('translateToKorean')(['ส่งฟรี', 'ขายดี']);
  assert.ok([...out].every((t) => t && !t.includes('하나뿐')), JSON.stringify(out));
});
