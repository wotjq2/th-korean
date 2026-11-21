// 가짜 쇼핑몰 페이지 — 진짜 쇼피·라자다의 검색칸 꼴(선택자)만 흉내 낸다. 상품 글은 0.5초 뒤에 그려진다(SPA 처럼).
'use strict';

const ITEMS = {
  'shopee.co.th': ['หูฟังบลูทูธไร้สาย กันน้ำ', 'ส่งฟรีทั่วประเทศ', 'เคสโทรศัพท์ กันกระแทก', 'ขายดี'],
  'shopee.vn': ['Tai nghe bluetooth không dây chống nước', 'Miễn phí vận chuyển', 'Ốp lưng điện thoại chống sốc', 'Bán chạy'],
  'shopee.sg': ['Wireless Bluetooth Earphones Waterproof', 'Free Shipping', 'Phone Case Shockproof', 'Best Seller'],
};
const PRICE = { 'shopee.co.th': '฿199', 'shopee.vn': '₫150.000', 'shopee.sg': 'S$12.90' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const shopee = (host) => () => `<!doctype html><html><head><meta charset="utf-8"><title>Shopee</title></head>
<body style="font-family:sans-serif;margin:24px">
<form role="search" action="/search" class="shopee-searchbar"><div class="shopee-searchbar__main"><div class="shopee-searchbar-input">
<input type="search" name="keyword" class="shopee-searchbar-input__input" role="combobox" placeholder="site-placeholder" style="width:360px;font-size:16px"></div></div>
<button type="button" class="shopee-searchbar__search-button">search</button></form>
<div id="app"></div><p id="price">${esc(PRICE[host])}</p>
<script>setTimeout(() => { document.getElementById('app').innerHTML = '<ul>' + ${JSON.stringify(ITEMS[host])}.map((t) => '<li>' + t + '</li>').join('') + '</ul>'; }, 500);</script>
</body></html>`;

const lazadaVn = () => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Lazada</title></head>
<body style="font-family:sans-serif;margin:24px">
<form action="/catalog/"><input id="q" type="search" name="q" style="width:360px;font-size:16px"></form>
<p id="rec">Sản phẩm đề xuất cho bạn</p></body></html>`;

const PAGES = {
  'shopee.co.th': shopee('shopee.co.th'),
  'shopee.vn': shopee('shopee.vn'),
  'shopee.sg': shopee('shopee.sg'),
  'www.lazada.vn': lazadaVn,
};

module.exports = { PAGES, ITEMS, PRICE };
