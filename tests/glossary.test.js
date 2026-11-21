// 용어집 읽기와 쇼핑몰 검색어 번역(용어집 → 조합 → 못 덮은 조각만 구글).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, same } = require("./lib/load");

const GLOSSARY = [
  '# 시험용 작은 용어집',
  '무선이어폰=หูฟังไร้สาย',
  '이어폰=หูฟัง',
  '가방=กระเป๋า',
  '무선=ไร้สาย',
  '# --- @꾸밈말 ---',
  '빨간=สีแดง',
  '여성용=ผู้หญิง',
  '# --- 끝 ---',
  '운동화=รองเท้าผ้าใบ',
].join('\n');

test('용어집 읽기: 주석은 건너뛰고, 아래 칸이 위 칸을 이긴다', () => {
  const parse = load().peek('parseGlossary');
  const g = parse('# 주석\n가방=กระเป๋า\n잘못된 줄\n=값만\n가방=กระเป๋าใหม่\n');
  assert.equal(g.map['가방'], 'กระเป๋าใหม่');
  assert.equal(Object.keys(g.map).length, 1);
});

test('용어집 읽기: @꾸밈말 칸의 말만 꾸밈말', () => {
  const g = load().peek('parseGlossary')(GLOSSARY);
  const squash = load().peek('squash');
  assert.ok(g.mods.has(squash('빨간')));
  assert.ok(g.mods.has(squash('여성용')));
  assert.ok(!g.mods.has(squash('가방')));
  assert.ok(!g.mods.has(squash('운동화')));
});

async function search(q, opt = {}) {
  const s = load({ host: 'www.lazada.co.th', glossary: GLOSSARY, ...opt });
  const r = await s.peek('translateSearchKeyword')(q);
  return { ...r, requests: s.requests };
}

test('검색어: 용어집에 통째로 있으면 그 값(구글에 안 묻는다)', async () => {
  const r = await search('무선이어폰');
  same([r.thai, r.via], ['หูฟังไร้สาย', '용어집']);
  assert.ok(!r.requests.some((u) => u.includes('translate.googleapis.com')));
});

test('검색어: 용어집 조합 — 꾸밈말은 상품 이름 뒤로(태국어 순서)', async () => {
  same(Object.values(await search('빨간 가방')).slice(0, 2), ['กระเป๋า สีแดง', '용어집 조합']);
  assert.equal((await search('여성용 운동화')).thai, 'รองเท้าผ้าใบ ผู้หญิง');
});

test('검색어: 용어집이 못 덮은 말만 구글로', async () => {
  const r = await search('고양이 사료');
  assert.equal(r.via, '무료 API');
  assert.equal(r.thai, '고양이 사료?API');
});

test('검색어: 내 언어가 한국어가 아니면 한국어 용어집을 안 쓴다', async () => {
  const r = await search('wireless earphone', { myLang: 'en' });
  assert.notEqual(r.via, '용어집');
  assert.ok(r.requests.some((u) => /translate\.googleapis\.com.*tl=th/.test(u)));
});
