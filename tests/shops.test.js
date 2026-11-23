// 쇼피·라자다 나라별(1.34.0): 주소를 보고 그 나라 말로 검색한다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, same } = require("./lib/load");

const market = (host, key, config) => load({ host, config }).peek('shopMarket')(key);

test('쇼피: 나라 주소마다 그 나라 말', () => {
  const want = {
    'shopee.co.th': 'th', 'shopee.vn': 'vi', 'shopee.co.id': 'id', 'shopee.tw': 'zh-TW', 'shopee.com.br': 'pt',
    'shopee.com.mx': 'es', 'shopee.sg': 'en', 'shopee.com.my': 'en', 'shopee.ph': 'en',
  };
  for (const [host, lang] of Object.entries(want)) same(market(host, 'shopee'), { host, lang }, host);
});

test('라자다: www. 가 붙어도 그 나라', () => {
  same(market('www.lazada.co.th', 'lazada'), { host: 'lazada.co.th', lang: 'th' });
  same(market('www.lazada.vn', 'lazada'), { host: 'lazada.vn', lang: 'vi' });
  same(market('www.lazada.co.id', 'lazada'), { host: 'lazada.co.id', lang: 'id' });
});

test('쇼핑몰이 아닌 주소·비슷한 가짜 주소는 null', () => {
  assert.equal(market('www.example.com', 'shopee'), null);
  assert.equal(market('notshopee.vn', 'shopee'), null);
  assert.equal(market('shopee.vn.evil.com', 'shopee'), null);
});

test('다른 나라 쇼피는 검색 주소·이름이 그 나라로', () => {
  const site = load({ host: 'shopee.vn' }).peek('SITES').shopee;
  assert.equal(site.lang, 'vi');
  assert.equal(site.searchUrl('áo khoác'), 'https://shopee.vn/search?keyword=' + encodeURIComponent('áo khoác'));
  assert.match(site.label, /베트남/);
});

test('태국 쇼피는 예전 그대로(태국어)', () => {
  const site = load({ host: 'shopee.co.th' }).peek('SITES').shopee;
  assert.equal(site.lang, 'th');
  assert.equal(site.host, 'shopee.co.th');
});

test('config 의 markets 로 새 나라를 더할 수 있다', () => {
  const cfg = { shops: { shopee: { markets: { 'shopee.pl': 'pl' } } } };
  same(market('shopee.pl', 'shopee', cfg), { host: 'shopee.pl', lang: 'pl' });
});

// 1.36.3: 다른 나라 쇼핑몰 검색어는 언어별 용어집의 '직접 고른 말' 칸만 — 위쪽 사전 칸(국어사전·위키낱말사전 첫 뜻)은 쇼핑과 안 맞는
// 일이 많아(간식 → 'thức ăn giữa buổi' 정오의 음식, 2026-11-23 잰 것) 구글로. 입력칸·메신저(대화)는 예전처럼 사전 칸도 쓴다.
test('다른 나라 쇼핑 검색어: 사전 칸 낱말은 구글로, 직접 고른 말은 용어집으로 — 대화 입력칸은 예전 그대로', async () => {
  const vi = [
    '# --- 한국어기초사전 ---',
    '간식=thức ăn giữa buổi',
    '# === 한국어기초사전 끝 — 아래는 직접 고른 말 ===',
    '# --- 대화 4: 쇼핑·흥정 ---',
    '깎아 주세요=Bớt giá cho tôi nhé',
  ].join('\n');
  const s = load({ host: 'shopee.vn', glossaryFiles: { 'glossary-vi.txt': vi } });
  const shop = s.peek('translateShopQuery');
  const a = await shop('간식');
  assert.equal(a.thai, '간식?API', `사전 칸 값을 씀: ${a.thai}`);
  const b = await shop('깎아 주세요');
  assert.equal(b.thai, 'Bớt giá cho tôi nhé');
  assert.equal(b.via, '용어집');
  // 대화(입력칸 막대·메신저)는 사전 칸도 — 예전 그대로
  const lang = s.peek('TYPE_LANGS').find((l) => l.id === 'vi');
  const c = await s.peek('koreanToLang')('간식', lang);
  assert.equal(c.thai, 'thức ăn giữa buổi');
});
