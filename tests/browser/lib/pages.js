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

// 쇼핑몰도 외국어도 아닌 보통 한국어 페이지(뉴스) — 확장이 큰 용어집을 읽을 까닭이 없다.
const koNews = () => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>뉴스</title></head>
<body style="font-family:sans-serif;margin:24px"><h1>오늘의 소식</h1>
${Array.from({ length: 50 }, (_, i) => `<p>${i}. 오늘 서울 날씨는 맑고 기온은 영상 12도까지 오르겠습니다.</p>`).join('\n')}
<input id="q" placeholder="검색"></body></html>`;

// 페이스북 메신저 흉내(www.messenger.com/t/<방>) — 스크립트가 찾는 꼴만: 대화 영역 [role=main] 안의 [role=log],
// 말풍선 [data-message-id] div[dir=auto](상대 = 왼쪽, 나 = 오른쪽), 입력칸 contenteditable [role=textbox](Lexical 처럼 붙여 넣기로
// 글을 받고 Enter 로 보낸다 — 보낸 말은 오른쪽 말풍선이 된다), 이름표에 'enter' 가 든 보내기 단추.
const messenger = () => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Messenger</title>
<style>body{font-family:sans-serif;margin:0} [role=log]{width:640px;padding:12px} [data-message-id]{margin:6px 0;overflow:hidden}
[data-message-id].me>div{float:right;background:#0084ff;color:#fff} [data-message-id]>div{display:inline-block;max-width:60%;padding:6px 10px;border-radius:14px;background:#eee}
[role=textbox]{width:600px;min-height:24px;border:1px solid #ccc;margin:12px;padding:6px}</style></head>
<body><div role="main"><h2>Nguyen Van A</h2>
<div role="log" id="log">
<div data-message-id="m1"><div dir="auto">Hôm nay bạn có rảnh không?</div></div>
<div data-message-id="m2" class="me"><div dir="auto">Ok</div></div>
<div data-message-id="m3"><div dir="auto">Mình muốn đi ăn phở với bạn.</div></div>
</div>
<div contenteditable="true" role="textbox" id="ed" aria-label="Nguyen Van A 님에게 메시지 보내기"></div>
<div role="button" aria-label="Press enter to send" id="send">보내기</div>
</div>
<script>
let n = 10;
const ed = document.getElementById('ed');
ed.addEventListener('paste', (e) => { e.preventDefault(); ed.textContent = e.clipboardData.getData('text/plain'); });
const send = () => {
  const t = ed.innerText.trim(); if (!t) return;
  const m = document.createElement('div'); m.dataset.messageId = 'm' + (++n); m.className = 'me';
  const d = document.createElement('div'); d.dir = 'auto'; d.textContent = t; m.appendChild(d);
  document.getElementById('log').appendChild(m); ed.textContent = ''; window.__sent = (window.__sent || []).concat(t);
};
ed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
document.getElementById('send').addEventListener('click', send);
</script></body></html>`;

// 쇼핑몰이 아닌 보통 태국어 사이트 — 입력칸에 쓴 한국어를 태국어로(언어 막대·genericInit)
const thaiSite = () => `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ข่าว</title></head>
<body style="font-family:sans-serif;margin:24px"><h1>ข่าววันนี้</h1>
${Array.from({ length: 8 }, (_, i) => `<p>${i}. วันนี้อากาศดีมาก ผู้คนออกไปเที่ยวกันเยอะ</p>`).join('\n')}
<form action="/search"><input id="q" name="q" type="search" style="width:360px;font-size:16px"></form></body></html>`;

const PAGES = {
  'www.messenger.com': messenger,
  'thai.example.com': thaiSite,
  'news.example.com': koNews,
  'shopee.co.th': shopee('shopee.co.th'),
  'shopee.vn': shopee('shopee.vn'),
  'shopee.sg': shopee('shopee.sg'),
  'www.lazada.vn': lazadaVn,
};

module.exports = { PAGES, ITEMS, PRICE };
