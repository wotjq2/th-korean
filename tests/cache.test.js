// 번역 캐시(1.35.9) — 크롬 확장에서는 background 가 하나만 갖고(IndexedDB) 탭은 받아 쓰고 새 번역만 보낸다(gm.js GM_tmLoad·
// GM_tmAdd). 예전처럼 탭마다 통째로 저장하면 두 탭이 함께 번역할 때 한쪽 새 번역이 사라지고, 저장마다 0.5 MB 가 모든 탭에
// 갔다(2026-11-22 실측). 몽키·번역 도우미(GM_tmLoad 없음)는 예전처럼 GM_setValue('tmCache').
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, same } = require('./lib/load');

const GL = '가방=กระเป๋า\n';
const flush = () => new Promise((r) => setTimeout(r, 0));

test('확장: 처음 쓸 때 공유 캐시를 받고, 받은 뒤에는 찾아 쓴다', async () => {
  const s = load({ host: 'news.example.com', glossary: GL, sharedCache: { 'ko|สวัสดี': '안녕하세요' } });
  const get = s.peek('cacheGet');
  assert.equal(get('สวัสดี', 'ko'), undefined, '받기 전에는 없다(구글에 묻는다)');
  await s.peek('cacheWarm')();
  assert.equal(get('สวัสดี', 'ko'), '안녕하세요');
  assert.equal(s.store.tmCache, undefined, '확장에서는 storage 에 캐시를 쓰지 않는다');
});

test('확장: 받는 사이 이 탭이 넣은 번역은 남고, 저장 때는 새 번역만 보낸다', async () => {
  const s = load({ host: 'news.example.com', glossary: GL, sharedCache: { 'ko|a': '가', 'ko|b': '나' } });
  const set = s.peek('cacheSet');
  set('c', 'ko', '다'); // 받기 시작 — 아직 안 왔다
  await flush();
  await s.peek('cacheWarm')();
  const get = s.peek('cacheGet');
  assert.equal(get('a', 'ko'), '가');
  assert.equal(get('c', 'ko'), '다', '받은 것이 이 탭의 새 번역을 덮지 않는다');
  s.tick();
  same(s.tmCalls, [['add', { 'ko|c': '다' }]], '새로 넣은 것만');
  s.tick();
  assert.equal(s.tmCalls.length, 1, '바뀐 것이 없으면 보내지 않는다');
  set('d', 'th', 'ง');
  s.tick();
  same(s.tmCalls[1], ['add', { 'th|d': 'ง' }]);
  assert.equal(s.store.tmCache, undefined);
});

test("확장: '캐시 비우기' 는 공유 캐시를 통째로 비운다", async () => {
  const s = load({ host: 'news.example.com', glossary: GL, sharedCache: { 'ko|a': '가' } });
  await s.peek('cacheWarm')();
  s.peek('cacheClear')();
  same(s.tmCalls, [['replace', {}]]);
  assert.equal(s.peek('cacheGet')('a', 'ko'), undefined);
});

test('몽키·도우미: 예전처럼 tmCache 를 통째로 저장한다', async () => {
  // 옛 캐시 한 번 비우기(1.9.1·1.28.8)를 이미 지난 사용자처럼
  const s = load({ host: 'news.example.com', glossary: GL, store: { tmCache: { 'ko|a': '가' }, searchCachePurged191: true, pageCachePurged1288: true } });
  assert.equal(s.peek('cacheGet')('a', 'ko'), '가', '열 때 바로 있다');
  s.peek('cacheSet')('b', 'ko', '나');
  s.tick();
  same(s.store.tmCache, { 'ko|a': '가', 'ko|b': '나' });
  assert.equal(s.tmCalls.length, 0);
});
