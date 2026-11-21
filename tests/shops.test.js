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
