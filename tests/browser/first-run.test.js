// 2단계(1.36.4): 처음 설치할 때 '내 언어' 를 크롬 언어로 — 예전에는 늘 한국어로 시작해 다른 나라 사람이 깔면 외국어 페이지를
// 한국어로 바꿔 보여 줬다. 크롬 화면 언어를 바꿔(--lang) 새 프로필에 확장을 넣고, 저장된 '내 언어' 와 확장 창 글을 본다.
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('./lib/session');
const { PAGES } = require('./lib/pages');
const { sleep } = require('./lib/chrome');

const T = { timeout: 60000 };
// [크롬 언어, 고를 '내 언어', 크롬이 보여 줄 확장 이름(extension/locales.json → _locales)]
const CASES = [
  ['es', 'es', 'Multitraductor'],
  ['en-US', 'en', 'Multi Translator'],
  ['zh-TW', 'zh-TW', '多語翻譯'],
  ['ko', 'ko', '멀티 번역기'],
];

describe("처음 설치 때 '내 언어' (크롬 언어별)", () => {
  for (const [chromeLang, want, name] of CASES) {
    test(`크롬 ${chromeLang} → 내 언어 ${want}`, T, async () => {
      const S = await open({ pages: PAGES, glossary: '', lang: chromeLang });
      try {
        let got;
        for (let i = 0; i < 30 && !got; i++) {
          got = await S.getStore('gm:myLang');
          if (!got) await sleep(200);
        }
        assert.equal(got, want);
        // 확장 이름·설명도 크롬 언어로(웹스토어 목록·확장 관리 화면에 보이는 글)
        const man = await S.popup.ev('(() => { const m = chrome.runtime.getManifest(); return [m.name, m.description, m.action.default_title]; })()');
        assert.equal(man[0], name);
        assert.equal(man[2], name);
        assert.ok(man[1] && !man[1].startsWith('__MSG_'), man[1]);
        // 확장 창 제목도 같은 이름(1.36.5 — 구글로 옮기지 않고 _locales 의 글 그대로)
        await S.popup.reload();
        await S.popup.until(`document.querySelector('header h1').textContent === ${JSON.stringify(name)} && document.title === ${JSON.stringify(name)}`, 15000, '확장 창 제목');
        if (want !== 'ko') {
          // 확장 창도 그 언어로(한국어 조각을 옮겨 보인다) — 도우미 칸 제목 줄
          await S.popup.reload();
          const txt = await S.popup.until(`(() => { const t = document.querySelector('#helper .hrow span').textContent; return /[가-힣]/.test(t) ? '' : t; })()`, 15000, '확장 창이 한국어 그대로');
          assert.ok(txt.length > 0);
        }
      } finally {
        await S.close();
      }
    });
  }
});
