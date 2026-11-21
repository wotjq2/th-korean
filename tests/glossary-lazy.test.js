// 용어집 사본을 탭마다 미리 읽지 않기(1.35.3, 3번) — 그래도 용어집은 계속 새로 받아 써야 한다(사용자: 언어 단어집은
// 계속 추가해서 업데이트되어야 한다). 확장처럼 GM_lazyGet 이 있는 판(lazy)과 몽키처럼 없는 판을 둘 다 본다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./lib/load');

const OLD = '무선이어폰=หูฟังไร้สาย\n'; // 예전에 받아 둔 사본
const NEW = '무선이어폰=หูฟังไร้สาย\n블루투스이어폰=หูฟังบลูทูธ\n'; // GitHub 의 지금 용어집(새 단어가 늘었다)
const HOUR = 60 * 60 * 1000;
const glossaryHits = (s) => s.requests.filter((u) => /th-korean-glossary.*glossary\.txt/.test(u));

function lazyShop(stored) {
  return load({
    host: 'www.lazada.co.th',
    lazy: true,
    glossary: NEW,
    store: stored ? { remoteGlossary: stored } : {},
  });
}

test('미리 안 읽기: 쇼핑몰이 아닌 페이지는 용어집을 읽지 않는다', () => {
  const s = load({ host: 'news.example.com', lazy: true, glossary: NEW, store: { remoteGlossary: { text: OLD, at: Date.now(), ver: 'test' } } });
  assert.equal(s.peek('glossaryStore'), null);
  assert.equal(s.lazyReads.includes('remoteGlossary'), false);
});

test('미리 안 읽기: 쓸 때 읽는다 — 새것이면 GitHub 에 다시 묻지 않는다', async () => {
  const s = lazyShop({ text: OLD, at: Date.now(), ver: 'test' });
  const r = await s.peek('translateSearchKeyword')('무선이어폰');
  assert.equal(r.thai, 'หูฟังไร้สาย');
  assert.ok(s.lazyReads.includes('remoteGlossary'));
  assert.deepEqual(glossaryHits(s), []);
});

test('업데이트: 사본이 오래됐으면(10분 넘음) GitHub 에서 새로 받아 새 단어를 쓴다', async () => {
  const s = lazyShop({ text: OLD, at: Date.now() - 2 * HOUR, ver: 'test' });
  const r = await s.peek('translateSearchKeyword')('블루투스이어폰');
  assert.equal(r.thai, 'หูฟังบลูทูธ');
  assert.ok(glossaryHits(s).length >= 1, 'GitHub 에 안 물음');
  assert.match(s.store.remoteGlossary.text, /블루투스이어폰/, '새 용어집이 저장되지 않음');
});

test('업데이트: 스크립트 판이 바뀌었으면 사본이 새것이어도 새로 받는다', async () => {
  const s = lazyShop({ text: OLD, at: Date.now(), ver: '0.0.1' });
  const r = await s.peek('translateSearchKeyword')('블루투스이어폰');
  assert.equal(r.thai, 'หูฟังบลูทูธ');
  assert.equal(s.store.remoteGlossary.ver, 'test');
});

test('업데이트: 처음 설치(사본 없음)면 받아서 쓴다', async () => {
  const s = lazyShop(null);
  const r = await s.peek('translateSearchKeyword')('블루투스이어폰');
  assert.equal(r.thai, 'หูฟังบลูทูธ');
});

test('언어별 용어집: 1시간 안이면 사본, 넘으면 GitHub 에서 새로 받는다', async () => {
  const file = 'glossary-vi.txt';
  const langHits = (s) => s.requests.filter((u) => u.includes(file));
  const fresh = load({ lazy: true, glossary: '안녕하세요=xin chào mới\n', store: { [`langGlossary:${file}`]: { text: '안녕하세요=xin chào\n', at: Date.now() } } });
  const m1 = await fresh.peek('loadLangGlossary')(file);
  assert.equal(m1.get('안녕하세요'), 'xin chào');
  assert.deepEqual(langHits(fresh), []);
  const stale = load({ lazy: true, glossary: '안녕하세요=xin chào mới\n', store: { [`langGlossary:${file}`]: { text: '안녕하세요=xin chào\n', at: Date.now() - 2 * HOUR } } });
  const m2 = await stale.peek('loadLangGlossary')(file);
  assert.equal(m2.get('안녕하세요'), 'xin chào mới');
  assert.equal(langHits(stale).length, 1);
  assert.match(stale.store[`langGlossary:${file}`].text, /mới/);
});

test('몽키·번역 도우미(GM_lazyGet 없음): 예전처럼 바로 읽는다', () => {
  const s = load({ host: 'news.example.com', glossary: NEW, store: { remoteGlossary: { text: OLD, at: Date.now(), ver: 'test' } } });
  assert.equal(s.peek('glossaryStore').text, OLD);
});
