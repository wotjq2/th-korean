// 웹스토어 그림(스크린샷 1280×800, 작은 홍보 타일 440×280, 큰 홍보 타일 1400×560)을 한국어·영어로 만든다.
// HTML 을 크롬으로 그려 찍는다(아랍어·힌디어·태국어 글자도 바르게). 실제 화면 사진은 shots 폴더에서 가져온다:
//   <shots>/ko-input.png, en-input.png   — 구글 일본판 검색칸에 내 언어로 쓰고 Enter(1280×800)
//   <shots>/ko-popup.png, en-popup.png   — 확장 창 윗부분(380 폭, 2배)
//   store/screenshots/1-라자다-한국어검색.png, 2-유튜브-한국어자막.png — 한국어판에만(사용자 크롬에서 찍은 실제 화면)
// 돌리기: node extension/make-store-images.js <shots 폴더>  → extension/store/images/{ko,en}/
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { launch, sleep } = require('../tests/browser/lib/chrome.js');

const SHOTS = path.resolve(process.argv[2] || '');
const STORE = path.join(__dirname, 'store');
const OUT = path.join(STORE, 'images');
const url = (f) => pathToFileURL(f).href;
const ICON = url(path.join(STORE, 'icon512.png'));

const T = {
  ko: {
    name: '멀티 번역기',
    tag: '외국어 쇼핑·대화·영상을 내 언어로 · 30개 언어',
    font: "'Malgun Gothic', 'Segoe UI', sans-serif",
    input: ['어느 사이트에서든 내 언어로 쓰고 Enter', "그 페이지의 언어로 바꿔 줍니다(30개 언어) · 오른쪽 아래 '번역' 단추로 언어를 고를 수도 있어요"],
    popup: {
      h: "31개 언어 중<br>'내 언어'를 고르세요",
      li: ['처음 설치하면 크롬 언어로 시작합니다', '쇼핑몰·메신저·영상 자막이 그 언어로', '확장 창과 설정 창도 그 언어로 바뀝니다', '내 언어로 쓴 말은 30개 언어로'],
    },
    feat: {
      h: '쇼핑·대화·영상의 외국어를 내 언어로',
      cards: [
        ['쇼핑몰', '라자다 6개국 · 쇼피 11개국', '내 언어로 검색하면 그 나라 말로 찾고, 상품 이름과 사진 속 글자를 내 언어로 보여 줍니다.'],
        ['페이스북 메신저', '30개 언어 모두', '받은 외국어 메시지 아래에 내 언어 뜻을, 내가 쓴 말은 상대 언어로 바꿔 보냅니다.'],
        ['영상 자막', '유튜브 · 쇼츠 · 틱톡', '외국어 영상에 내 언어 자막을 띄웁니다. 자막이 없으면 화면 글자나 크롬 실시간 자막으로.'],
        ['번역 도우미 (윈도우, 선택)', 'LINE PC · 아무 프로그램', 'LINE 대화를 번역하고, Ctrl+Alt+K 로 아무 프로그램 창의 글을 그 자리에서 내 언어로 덮어 줍니다.'],
      ],
      foot: '구글 번역이 막혀도 크롬 내장 번역기로 이어서 · 개발자 서버 없음, 개인정보를 모으지 않습니다',
    },
    lazada: ['외국 쇼핑몰도 내 언어로', '상품 이름·메뉴를 내 언어로, 검색어는 그 나라 말로 바꿔 찾습니다'],
    youtube: ['외국어 영상에 내 언어 자막', '유튜브·쇼츠·틱톡 — 말하는 순간에 맞춰 보여 줍니다'],
    chips: [['สวัสดีครับ', '안녕하세요'], ['How much is it?', '얼마예요?'], ['ありがとう', '고마워요']],
  },
  en: {
    name: 'Multi Translator',
    tag: 'Foreign shops, chats and videos in your language · 30 languages',
    font: "'Segoe UI', 'Malgun Gothic', sans-serif",
    input: ['Type in your language on any site', "Press Enter — it becomes the page's language (30 languages), or pick one with the Translate button"],
    popup: {
      h: 'Choose your language<br>— 31 languages',
      li: ['Starts in your Chrome language', 'Shops, Messenger and video subtitles in it', 'The extension itself switches to it too', 'What you write goes out in 30 languages'],
    },
    feat: {
      h: 'Shopping, chats and videos in your language',
      cards: [
        ['Shopping sites', 'Lazada 6 · Shopee 11 countries', 'Search in your language and find in theirs; product names and text in photos shown in yours.'],
        ['Facebook Messenger', 'All 30 languages', "The meaning of each foreign message in your language; your replies sent in your partner's language."],
        ['Video subtitles', 'YouTube · Shorts · TikTok', 'Subtitles in your language on foreign videos — or from burned-in text and Chrome Live Caption.'],
        ['Translation Helper (Windows, optional)', 'LINE PC · any program', 'Translates LINE chats, and Ctrl+Alt+K covers any program window with your language in place.'],
      ],
      foot: "Falls back to Chrome's built-in translator when Google is blocked · No developer server, no data collection",
    },
    chips: [['สวัสดีครับ', 'Hello'], ['얼마예요?', 'How much is it?'], ['ありがとう', 'Thank you']],
  },
};
const LANGS_LINE = '한국어 · English · 日本語 · 中文 · ไทย · Tiếng Việt · Bahasa Indonesia · Español · Português · Français · Deutsch · Русский · Türkçe · العربية · हिन्दी · বাংলা · தமிழ் …';

const css = (t, w, h) => `
* { box-sizing: border-box; }
html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
body { font-family: ${t.font}; word-break: keep-all; color: #fff; background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); position: relative; }
.brand { position: absolute; right: 40px; top: 32px; display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 20px; opacity: .95; }
.brand img { width: 36px; height: 36px; filter: drop-shadow(0 3px 8px rgba(0,0,0,.3)); }
.logo { filter: drop-shadow(0 14px 30px rgba(0,0,0,.38)); }
h1 { margin: 0; font-size: 38px; line-height: 1.2; font-weight: 800; letter-spacing: -0.5px; }
.sub { margin-top: 10px; font-size: 21px; opacity: .9; }
.shot { position: absolute; border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.35); overflow: hidden; background: #fff; }
.shot img { display: block; width: 100%; height: 100%; }
`;
const brand = (t) => `<div class="brand"><img src="${ICON}">${t.name}</div>`;

// 실제 화면 한 장 + 제목
const shotPage = (t, [h, sub], img) => `<style>${css(t, 1280, 800)}</style>${brand(t)}
<div style="position:absolute;left:64px;top:40px;right:300px"><h1>${h}</h1><div class="sub">${sub}</div></div>
<div class="shot" style="left:140px;top:175px;width:1000px;height:625px;border-bottom-left-radius:0;border-bottom-right-radius:0"><img src="${url(img)}"></div>`;

const popupPage = (t, img) => `<style>${css(t, 1280, 800)}
ul { margin: 34px 0 0; padding: 0; list-style: none; }
li { font-size: 23px; margin: 0 0 18px; padding-left: 34px; position: relative; line-height: 1.35; }
li::before { content: ''; position: absolute; left: 4px; top: 11px; width: 12px; height: 12px; border-radius: 50%; background: #fbbf24; }
.langs { margin-top: 26px; font-size: 17px; line-height: 1.7; opacity: .85; }
</style>${brand(t)}
<div style="position:absolute;left:64px;top:110px;width:560px"><h1 style="font-size:46px">${t.popup.h}</h1>
<ul>${t.popup.li.map((x) => `<li>${x}</li>`).join('')}</ul><div class="langs">${LANGS_LINE}</div></div>
<div class="shot" style="right:110px;top:110px;width:420px;background:#1f1f22"><img src="${url(img)}" style="height:auto"></div>`;

const featPage = (t) => `<style>${css(t, 1280, 800)}
.grid { position: absolute; left: 64px; right: 64px; top: 150px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.card { background: #fff; color: #1f2937; border-radius: 18px; padding: 26px 28px; min-height: 230px; box-shadow: 0 12px 30px rgba(0,0,0,.25); position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 8px; }
.card:nth-child(1)::before { background: #2563eb; } .card:nth-child(2)::before { background: #e11d48; }
.card:nth-child(3)::before { background: #059669; } .card:nth-child(4)::before { background: #d97706; }
.card h2 { margin: 0; font-size: 27px; } .card .tag { margin-top: 6px; color: #2563eb; font-weight: 700; font-size: 17px; }
.card p { margin: 14px 0 0; font-size: 19px; line-height: 1.5; color: #374151; }
.foot { position: absolute; left: 64px; right: 64px; bottom: 34px; font-size: 18px; opacity: .9; }
</style>${brand(t)}
<div style="position:absolute;left:64px;top:52px;right:300px"><h1>${t.feat.h}</h1></div>
<div class="grid">${t.feat.cards.map(([a, b, c]) => `<div class="card"><h2>${a}</h2><div class="tag">${b}</div><p>${c}</p></div>`).join('')}</div>
<div class="foot">${t.feat.foot}</div>`;

const chipCss = `
.chip { display: flex; align-items: center; gap: 14px; background: #fff; color: #1f2937; border-radius: 999px; padding: 12px 24px; font-size: 24px; font-weight: 600; box-shadow: 0 8px 22px rgba(0,0,0,.25); white-space: nowrap; }
.chip .from { color: #6b7280; font-weight: 500; } .chip .arrow { color: #2563eb; font-weight: 800; }`;
const chip = ([a, b]) => `<div class="chip"><span class="from">${a}</span><span class="arrow">→</span><span>${b}</span></div>`;

const smallTile = (t) => `<style>${css(t, 440, 280)}</style>
<img class="logo" src="${ICON}" style="position:absolute;left:28px;top:66px;width:128px;height:128px">
<div style="position:absolute;left:178px;top:70px;right:20px"><div style="font-size:${t.name.length > 10 ? 30 : 38}px;font-weight:800;line-height:1.15">${t.name}</div>
<div style="margin-top:12px;font-size:16px;line-height:1.4;opacity:.92">${t.tag}</div></div>`;

const marquee = (t) => `<style>${css(t, 1400, 560)}${chipCss}</style>
<img class="logo" src="${ICON}" style="position:absolute;left:90px;top:150px;width:260px;height:260px">
<div style="position:absolute;left:400px;top:170px;width:520px"><div style="font-size:64px;font-weight:800;line-height:1.1">${t.name}</div>
<div style="margin-top:18px;font-size:25px;line-height:1.4;opacity:.92">${t.tag}</div></div>
<div style="position:absolute;right:70px;top:150px;display:flex;flex-direction:column;gap:22px;align-items:flex-end">${t.chips.map(chip).join('')}</div>`;

(async () => {
  for (const f of ['ko-input.png', 'en-input.png', 'ko-popup.png', 'en-popup.png']) if (!fs.existsSync(path.join(SHOTS, f))) throw new Error(`실제 화면 사진이 없음: ${path.join(SHOTS, f)}`);
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'storeimg-'));
  const c = await launch({ profile: path.join(tmp, 'profile'), hostRules: 'MAP * ~NOTFOUND', lang: 'ko' });
  try {
    const tab = await c.tab();
    const draw = async (html, w, h, out) => {
      const file = path.join(tmp, 'page.html');
      fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">${html}`);
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, tab.s);
      await tab.go(url(file));
      await tab.until('document.fonts.ready.then(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))', 10000, '그림 읽힘');
      await sleep(300);
      const { data } = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }, tab.s);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(data, 'base64'));
      console.log('만듦', path.relative(STORE, out));
    };
    for (const L of ['ko', 'en']) {
      const t = T[L];
      const dir = path.join(OUT, L);
      fs.rmSync(dir, { recursive: true, force: true });
      let n = 0;
      const name = (s) => path.join(dir, `${++n}-${s}.png`);
      if (L === 'ko') {
        await draw(shotPage(t, t.lazada, path.join(STORE, 'screenshots', '1-라자다-한국어검색.png')), 1280, 800, name('쇼핑몰'));
        await draw(shotPage(t, t.youtube, path.join(STORE, 'screenshots', '2-유튜브-한국어자막.png')), 1280, 800, name('영상자막'));
      }
      await draw(shotPage(t, t.input, path.join(SHOTS, `${L}-input.png`)), 1280, 800, name(L === 'ko' ? '입력칸' : 'input'));
      await draw(popupPage(t, path.join(SHOTS, `${L}-popup.png`)), 1280, 800, name(L === 'ko' ? '내언어' : 'my-language'));
      await draw(featPage(t), 1280, 800, name(L === 'ko' ? '기능' : 'features'));
      await draw(smallTile(t), 440, 280, path.join(dir, L === 'ko' ? '작은타일-440x280.png' : 'small-tile-440x280.png'));
      await draw(marquee(t), 1400, 560, path.join(dir, L === 'ko' ? '큰타일-1400x560.png' : 'marquee-1400x560.png'));
    }
  } finally {
    await c.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
