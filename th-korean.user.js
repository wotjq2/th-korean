// ==UserScript==
// @name         태국 사이트 한국어
// @namespace    https://github.com/local/th-korean
// @version      1.35.6
// @description  외국어 사이트·메신저·영상을 내 언어(기본 한국어)로 읽고, 내 언어로 쓴 말을 30개 언어로 바꿉니다. 지원: 라자다·쇼피 여러 나라(그 나라 말로 검색, 상품 이름·사진 글자), 아무 사이트 입력칸(외국어 페이지는 그 페이지 언어로), 페이스북 메신저(어느 언어든 ↔ 내 언어), 유튜브·웹 영상 자막(외국어 영상은 자동) + 목소리 더빙(선택)
// @author       local
// @match        https://www.lazada.co.th/*
// @match        https://lazada.co.th/*
// @match        https://shopee.co.th/*
// @match        https://*.shopee.co.th/*
// 다른 태국 사이트: 대기만 하다가 태국어가 보이면 입력칸 한국어→태국어만 켠다(genericInit)
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/wotjq2/th-korean/main/th-korean.user.js
// @downloadURL  https://raw.githubusercontent.com/wotjq2/th-korean/main/th-korean.user.js
// @connect      api.groq.com
// @connect      integrate.api.nvidia.com
// @connect      translate.googleapis.com
// @connect      api.github.com
// @connect      127.0.0.1
// @connect      raw.githubusercontent.com
// @connect      lazcdn.com
// @connect      slatic.net
// @connect      susercontent.com
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js#sha256=a8e29918d098b2b06e1012bdaeffb4aec0445c5d5654709023e0bd1f442a80e8
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @run-at       document-start
// @noframes
// ==/UserScript==

// ★ @name 과 @namespace 는 절대 바꾸지 말 것 ★
// Tampermonkey 는 이 둘로 같은 스크립트인지 판단한다. 하나라도 바꾸면 업데이트가 아니라
// "새 스크립트"가 되어, 기존 설치본과 별개로 깔리고 API 키·용어집이 딸려 오지 않는다.
// (실제로 이름을 '라자다 …' → '태국 쇼핑 …' 으로 고쳤다가 업데이트 고리가 끊긴 적 있다.)
// 사이트를 추가할 때 손대는 곳은 @match, @description, 그리고 아래 SITES 뿐이다.

/* global GM_xmlhttpRequest, GM_setValue, GM_getValue, GM_addStyle, GM_registerMenuCommand, Tesseract */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 상수
  // ---------------------------------------------------------------------------

  // 보이는 이름. 2026-11-21 사용자: 이제 태국어 중심이 아니라 30개 언어 모두가 기준 — 확장 이름(통합 번역)과 같게.
  // 몽키의 @name 은 업데이트 고리라 그대로 둔다(위 ★).
  const APP_NAME = '통합 번역';

  const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
  const THAI = /[฀-๿]/;
  const LATIN_WORD = /[A-Za-z]{2,}/;

  // ---- 내 언어 (2026-11-05, 1.29.0) ----
  // '통합 번역' 창(도구 막대)에서 고른 기준 언어. 'ko' 면 지금까지와 똑같다(한국어 용어집·말투 다듬기·한글 알아보기).
  // 다른 언어면: 외국어 페이지·메신저·영상·사진 글을 그 언어로 보여 주고, 입력칸에 그 언어로 쓴 말을 고른 외국어로
  // 바꾸며(구글 번역 — 용어집은 한국어 것뿐이라 쓰지 않는다), '한' 창 같은 화면 글도 그 언어로 옮겨 보인다(uiLocalize).
  // 값은 구글 번역 언어 코드(zh-CN 처럼). 열려 있는 페이지도 1초 안에 따라 바뀐다(watchMyLang → applyMyLang) —
  // 사용자(2026-11-05): 언어를 바꾸면 새로 고침을 해야 적용됐다.
  const readMyLang = () => {
    try {
      const v = String(GM_getValue('myLang', 'ko') || 'ko');
      return /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(v) ? v : 'ko';
    } catch {
      return 'ko';
    }
  };
  let MY = readMyLang();
  let MY_KO = MY === 'ko';
  let MY2 = MY.split('-')[0].toLowerCase(); // 영상 자막 언어처럼 두 글자로 견줄 때(zh-CN → zh)
  // 글자로 언어를 알아보는 곳(입력칸에 '내 말'을 썼나, 이미 내 말인가). 로마자 언어끼리는 글자로 못 가른다 → null.
  const SCRIPT_OF = {
    ko: HANGUL, th: THAI, ja: /[぀-ヿ一-鿿]/, zh: /[一-鿿]/, yue: /[一-鿿]/,
    ar: /[؀-ۿ]/, ur: /[؀-ۿ]/, fa: /[؀-ۿ]/, he: /[֐-׿]/, hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, ne: /[ऀ-ॿ]/,
    bn: /[ঀ-৿]/, te: /[ఀ-౿]/, ta: /[஀-௿]/, ru: /[Ѐ-ӿ]/, uk: /[Ѐ-ӿ]/, mn: /[Ѐ-ӿ]/, km: /[ក-៿]/, lo: /[຀-໿]/,
    my: /[က-႟]/, ka: /[Ⴀ-ჿ]/, el: /[Ͱ-Ͽ]/,
  };
  let MY_SCRIPT = SCRIPT_OF[MY2] || null;
  const LETTER = /\p{L}/u;
  // 입력칸 글이 '내 말' 인가 — 바꿔 보낼지 정한다. 한국어면 예전처럼 한글이 있으면. 다른 언어면 그 언어 글자가 있으면,
  // 로마자 언어(영어·스페인어 …)면 글자가 있고 바꿀 언어의 글자(태국어 등)가 아니면.
  function isMine(v, target) {
    if (!v) return false;
    if (MY_KO) return HANGUL.test(v);
    const tg = String(target || '').split('-')[0];
    if (tg === MY2) return false; // 내 말로 바꿀 일은 없다(태국 사람이 태국 쇼핑몰)
    if (MY_SCRIPT) return MY_SCRIPT.test(v);
    const t = SCRIPT_OF[tg];
    return LETTER.test(v) && !(t && t.test(v));
  }
  // 이미 내 말이라 옮길 필요 없는 글(페이지 글·드래그한 글). 로마자 언어는 글자로 모르니 구글에 맡긴다(같으면 그대로 온다).
  function isMyText(v) {
    return MY_KO ? HANGUL.test(v) : !!(MY_SCRIPT && MY_SCRIPT.test(v));
  }
  // 번역이 안 된 결과인가(바꿔 보낼 말). 한국어면 결과에 한글이 남았는지, 다른 언어면 원문 그대로 왔는지.
  function untranslated(out, src) {
    return MY_KO ? HANGUL.test(out) : String(out).trim() === String(src).trim();
  }
  // 언어 이름을 내 언어로(Intl). 한국어면 config.json 의 한국어 이름을 그대로.
  function langName(lang) {
    if (MY_KO) return lang.name;
    try {
      return new Intl.DisplayNames([MY], { type: 'language' }).of(lang.mt || lang.id) || lang.name;
    } catch {
      return lang.id;
    }
  }
  // 언어 단추 글자. 한국어면 '태·미·중', 다른 언어면 'TH·EN·ZH'(한국어 줄임말은 다른 나라 사람이 못 읽는다).
  // 한국어가 아니면 언어 코드. 지역이 붙은 코드는 3글자로(zh-TW → ZHT) — 'ZH-TW' 는 30px 동그라미에서 두 줄로 갈렸다.
  function langLabel(lang) {
    if (MY_KO) return lang.label;
    const [a, b] = String(lang.id).split('-');
    return (b ? a + b[0] : a).toUpperCase();
  }

  // ---- 화면 글 옮기기 (내 언어가 한국어가 아닐 때만) ----
  // 단추·설정 창·안내(lzk- 로 시작하는 우리 요소)의 한국어 조각만 골라 구글로 옮기고 저장해 둔다(uiTr:<언어>).
  // 따옴표·화살표·줄바꿈에서 끊어 사용자가 쓴 말·번역 결과("무선 이어폰" → "หูฟัง…")는 건드리지 않는다.
  // 처음 보는 조각은 잠깐 한국어로 보였다가 바뀌고, 다음부터는 바로 바뀐다.
  const UI_RUN = /[ㄱ-ㆎ가-힣](?:[^\n"“”'‘’「」→←<>{}[\]|]*[ㄱ-ㆎ가-힣.…!?])?/g;
  const UI_ATTRS = ['title', 'placeholder', 'aria-label'];
  let uiTr = null;
  const uiQueue = new Set();
  const uiWaiting = new Set(); // 옮김을 기다리는 노드(글 노드 또는 속성을 가진 요소)
  const uiWrote = new WeakMap(); // 노드 → 우리가 써 넣은 글(같은 글이면 다시 보지 않는다)
  let uiTimer = 0;
  let uiSaveTimer = 0;

  function uiLoad() {
    if (uiTr) return uiTr;
    try {
      uiTr = GM_getValue('uiTr:' + MY, null) || {};
    } catch {
      uiTr = {};
    }
    return uiTr;
  }
  // 조각을 옮긴 글로. 모르는 조각은 줄에 세우고 null.
  function uiReplace(text) {
    const tr = uiLoad();
    let missing = false;
    const out = text.replace(UI_RUN, (run) => {
      const v = tr[run];
      if (v != null) return v;
      uiQueue.add(run);
      missing = true;
      return run;
    });
    return missing ? null : out;
  }
  function uiFixText(node) {
    const v = node.nodeValue;
    if (!v || !HANGUL.test(v) || uiWrote.get(node) === v) return;
    const out = uiReplace(v);
    if (out == null) {
      uiWaiting.add(node);
      uiSchedule();
    } else if (out !== v) {
      uiWrote.set(node, out);
      node.nodeValue = out;
    } else uiWrote.set(node, v);
  }
  // 속성도 우리가 써 넣은 글은 다시 옮기지 않는다(글 노드의 uiWrote 와 같은 막이). 옮긴 글에 원래 한국어가 남으면
  // ('번역' → '번역 Translate') 고치기 → MutationObserver → 또 고치기가 끝없이 돌아 페이지가 멈췄다(2026-11-21 시험).
  const uiWroteAttr = new WeakMap(); // 요소 → { 속성: 우리가 써 넣은 글 }
  function uiFixAttrs(el) {
    let wait = false;
    for (const a of UI_ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v || !HANGUL.test(v)) continue;
      const wrote = uiWroteAttr.get(el);
      if (wrote && wrote[a] === v) continue;
      const out = uiReplace(v);
      if (out == null) wait = true;
      else if (out !== v) {
        if (wrote) wrote[a] = out;
        else uiWroteAttr.set(el, { [a]: out });
        el.setAttribute(a, out);
      }
    }
    if (wait) {
      uiWaiting.add(el);
      uiSchedule();
    }
  }
  function uiFixTree(root) {
    if (!root || root.nodeType !== 1 || root.closest('[data-lzk-noi18n]')) return;
    uiFixAttrs(root);
    for (const el of root.querySelectorAll('[title],[placeholder],[aria-label]')) uiFixAttrs(el);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if (p && !/^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName) && !p.closest('[data-lzk-noi18n]')) uiFixText(n);
    }
  }
  function uiSchedule() {
    if (!uiTimer) uiTimer = setTimeout(uiFlush, 120);
  }
  async function uiFlush() {
    uiTimer = 0;
    const runs = [...uiQueue].slice(0, 80);
    runs.forEach((r) => uiQueue.delete(r));
    if (runs.length) {
      let got = [];
      try {
        got = await freeTranslateMany(runs, 'ko', MY);
      } catch (e) {
        console.warn(`[${APP_NAME}] 화면 글 옮기기 실패:`, e.message);
      }
      const tr = uiLoad();
      runs.forEach((r, i) => (tr[r] = got[i] && String(got[i]).trim() ? String(got[i]).trim() : r));
      if (Object.keys(tr).length > 4000) uiTr = {};
      clearTimeout(uiSaveTimer);
      uiSaveTimer = setTimeout(() => GM_setValue('uiTr:' + MY, uiTr), 1500);
    }
    const nodes = [...uiWaiting];
    uiWaiting.clear();
    for (const n of nodes) {
      if (!n.isConnected) continue;
      if (n.nodeType === 3) uiFixText(n);
      else uiFixAttrs(n);
    }
    if (uiQueue.size) uiSchedule();
  }
  // 우리 요소인가(lzk- 로 시작하는 id·class 안).
  function uiOurs(el) {
    return !!(el && el.closest && el.closest('[id^="lzk-"],[class*="lzk-"]'));
  }
  function uiStart() {
    const ob = new MutationObserver((list) => {
      if (MY_KO) return; // 한국어로 되돌렸다
      for (const m of list) {
        if (m.type === 'attributes') {
          if (uiOurs(m.target)) uiFixAttrs(m.target);
          continue;
        }
        if (m.type === 'characterData') {
          if (HANGUL.test(m.target.nodeValue || '') && uiOurs(m.target.parentElement)) uiFixText(m.target);
          continue;
        }
        for (const n of m.addedNodes) {
          if (n.nodeType === 3) {
            if (HANGUL.test(n.nodeValue || '') && uiOurs(n.parentElement)) uiFixText(n);
          } else if (n.nodeType === 1) {
            // form.id 는 name="id" 인 입력칸을 돌려주기도 한다(쇼피에서 startsWith 오류) — 글자인지 먼저 본다.
            const own = (typeof n.id === 'string' && n.id.startsWith('lzk-')) || (typeof n.className === 'string' && n.className.includes('lzk-'));
            if (own || (HANGUL.test(n.textContent || '') && uiOurs(n))) uiFixTree(n);
          }
        }
      }
    });
    ob.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: UI_ATTRS,
    });
  }
  let uiStarted = false;
  function uiEnsure() {
    if (uiStarted || MY_KO || typeof document === 'undefined' || !document.documentElement || typeof document.createTreeWalker !== 'function') return;
    uiStarted = true;
    try {
      uiStart();
    } catch (e) {
      console.warn(`[${APP_NAME}] 화면 글 옮기기를 켜지 못했습니다:`, e.message);
    }
  }
  uiEnsure();

  // 다른 탭·통합 번역 창에서 내 언어를 바꾸면 이 페이지도 따른다(1초마다·창으로 돌아올 때 본다 — 저장소 값 읽기라 가볍다).
  function watchMyLang() {
    const check = () => {
      const v = readMyLang();
      if (v !== MY) applyMyLang(v);
    };
    setInterval(check, 1000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
  }
  function applyMyLang(v) {
    MY = v;
    MY_KO = v === 'ko';
    MY2 = v.split('-')[0].toLowerCase();
    MY_SCRIPT = SCRIPT_OF[MY2] || null;
    uiTr = null;
    uiQueue.clear();
    uiWaiting.clear();
    try {
      ytMyRecalc();
      ytSpoken.clear();
    } catch {
      /* 아직 영상 부분이 안 읽혔다 */
    }
    uiEnsure();
    // 우리 화면을 새로 그린다 — 이미 옮겨 둔 글은 옛 언어라서(한국어 원문에서 다시 옮긴다).
    document.getElementById('lzk-panel')?.remove();
    const fab = document.getElementById('lzk-fab');
    if (fab) {
      fab.textContent = MY_KO ? '한' : MY2.toUpperCase();
      fab.title = `${APP_NAME} 설정 (${SITE.label}) — 끌어서 옮길 수 있습니다`;
    }
    if (document.getElementById('lzk-langbar')) {
      document.getElementById('lzk-langbar').remove();
      if (typeLang && !myTypeLangs().some((l) => l.id === typeLang)) {
        typeLang = ''; // 고른 언어가 이제 내 언어라 목록에서 빠졌다
        GM_setValue(TYPE_LANG_KEY, '');
      }
      mountLangBar();
      updateGenericChip();
    }
    // 이미 옮겨 둔 페이지 글·메신저 말풍선·영상 자막도 새 언어로.
    if (!GENERIC && originalText.size) {
      restoreOriginal();
      seen = new WeakSet();
      if (cfg.autoTranslatePage && cfg.pageEngine !== 'off') translatePage();
    }
    if (MESSENGER) {
      for (const b of document.querySelectorAll('.lzk-msgko')) b.remove();
      chatSame = new WeakMap(); // '이미 내 말' 이 언어와 함께 바뀐다
      chatLangMemo = null;
      scheduleChatScan();
    }
    if (dub) {
      for (const s of dub.sentences) {
        s.ko = null;
        s.tried = false;
      }
      dubTranslate(dub);
    }
  }

  const FREE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
  // gtx 가 막혔을 때 쓰는 같은 서버의 크롬 사전 확장용 주소(freeRaw).
  const FREE_ALT_ENDPOINT = 'https://translate.googleapis.com/translate_a/t';

  // ---------------------------------------------------------------------------
  // 원격 설정(config.json) — 코드를 고치지 않고(크롬 웹스토어에 다시 올리지 않고) 바꾸는 값들
  //
  // 사용자(2026-11-02): 웹스토어에 올린 뒤로는 언어를 더하거나 고칠 때 소스를 만지지 않게. 웹스토어는 확장이 밖에서
  // 받은 코드를 돌리지 못하게 하므로 바꿀 수 있는 것은 '값' 뿐이다. 이 저장소(wotjq2/th-korean)의 config.json 을 받아
  // 이 브라우저에 사본으로 두고(RC_STORE), 페이지를 열 때 그 사본을 읽는다. 사본이 RC_TTL 보다 오래되면 뒤에서 새로
  // 받아 다음 페이지부터 쓴다. 받은 값은 글자·숫자·목록으로만 쓰고(실행하지 않는다) 칸마다 꼴과 범위를 맞춰 본다 —
  // 틀린 칸은 버리고 아래 RC_DEFAULT 를 쓴다(쉼표 하나 틀려도 다른 칸·기능은 그대로). 칸 설명과 예: config.json.
  // 코드 저장소에 두는 까닭: 용어집 저장소는 브라우저마다 쓰기 토큰이 있어, 새어 나가도 번역 주소·선택자는 못 바꾸게.
  // ---------------------------------------------------------------------------
  // API 먼저 — raw 주소는 CDN 이 몇 분 늦게 줘서(2026-11-02 아랍어·힌디어를 더한 직후 raw 는 아직 옛 목록), 그때
  // 받은 브라우저는 옛 사본을 1시간 더 썼다. API 는 IP 당 시간 60회라 1시간에 한 번은 넉넉하다(용어집과 같은 차례).
  const RC_SOURCES = [
    {
      url: 'https://api.github.com/repos/wotjq2/th-korean/contents/config.json?ref=main',
      headers: { Accept: 'application/vnd.github.raw' },
    },
    { url: 'https://raw.githubusercontent.com/wotjq2/th-korean/main/config.json' },
  ];
  const RC_STORE = 'remoteConfig'; // { text, at }
  const RC_TTL = 60 * 60 * 1000;
  const RC_DEFAULT = {
    // 입력칸의 한국어를 바꿀 언어('번역' 단추를 누르면 펼쳐지는 줄). id·mt = 구글 번역 언어 코드(mt 가 다르면 mt 로
    // 번역), label = 단추 글자 하나, glossary = th-korean-glossary 저장소의 '한국어=그 언어' 파일(있으면 먼저 본다).
    // config.json 과 같은 목록 — 처음 깐 브라우저의 첫 페이지와 처음 깐 번역 도우미는 원격 설정을 받기 전에 이 값을 쓴다
    // (2026-11-04 예전 7개 그대로라 첫 화면에 언어 7개, 언어별 용어집 없음).
    languages: [
      { id: 'th', label: '태', name: '태국어', mt: 'th', chip: '→ ไทย', glossary: 'glossary-th-krdict.txt', reverse: 'reverse-th.txt', reverseKo: 'reverse-th-ko.txt' },
      { id: 'en', label: '미', name: '영어', mt: 'en', chip: '→ EN', glossary: 'glossary-en.txt', reverse: 'reverse-en.txt', toKo: false },
      { id: 'zh', label: '중', name: '중국어', mt: 'zh-CN', chip: '→ 中文', glossary: 'glossary-zh.txt', reverse: 'reverse-zh.txt', reverseKo: 'reverse-zh-ko.txt' },
      { id: 'hi', label: '힌', name: '힌디어', mt: 'hi', chip: '→ हिन्दी', glossary: 'glossary-hi.txt' },
      { id: 'es', label: '스', name: '스페인어', mt: 'es', chip: '→ ES', glossary: 'glossary-es.txt', reverse: 'reverse-es.txt', reverseKo: 'reverse-es-ko.txt' },
      { id: 'ar', label: '아', name: '아랍어', mt: 'ar', chip: '→ العربية', glossary: 'glossary-ar.txt', reverse: 'reverse-ar.txt', reverseKo: 'reverse-ar-ko.txt' },
      { id: 'fr', label: '프', name: '프랑스어', mt: 'fr', chip: '→ FR', glossary: 'glossary-fr.txt', reverse: 'reverse-fr.txt', reverseKo: 'reverse-fr-ko.txt' },
      { id: 'bn', label: '벵', name: '벵골어', mt: 'bn', chip: '→ বাংলা', glossary: 'glossary-bn.txt' },
      { id: 'pt', label: '포', name: '포르투갈어', mt: 'pt', chip: '→ PT', glossary: 'glossary-pt.txt' },
      { id: 'ru', label: '러', name: '러시아어', mt: 'ru', chip: '→ RU', glossary: 'glossary-ru.txt', reverse: 'reverse-ru.txt', reverseKo: 'reverse-ru-ko.txt' },
      { id: 'ur', label: '우', name: '우르두어', mt: 'ur', chip: '→ اردو', glossary: 'glossary-ur.txt' },
      { id: 'id', label: '인', name: '인도네시아어', mt: 'id', chip: '→ ID', glossary: 'glossary-id.txt', reverse: 'reverse-id.txt', reverseKo: 'reverse-id-ko.txt' },
      { id: 'de', label: '독', name: '독일어', mt: 'de', chip: '→ DE', glossary: 'glossary-de.txt' },
      { id: 'ja', label: '일', name: '일본어', mt: 'ja', chip: '→ 日本語', glossary: 'glossary-ja.txt', reverse: 'reverse-ja.txt', reverseKo: 'reverse-ja-ko.txt' },
      { id: 'mr', label: '마', name: '마라티어', mt: 'mr', chip: '→ मराठी', glossary: 'glossary-mr.txt' },
      { id: 'te', label: '텔', name: '텔루구어', mt: 'te', chip: '→ తెలుగు', glossary: 'glossary-te.txt' },
      { id: 'tr', label: '터', name: '튀르키예어', mt: 'tr', chip: '→ TR', glossary: 'glossary-tr.txt' },
      { id: 'ta', label: '타', name: '타밀어', mt: 'ta', chip: '→ தமிழ்', glossary: 'glossary-ta.txt' },
      { id: 'yue', label: '광', name: '광둥어', mt: 'yue', chip: '→ 粵語', glossary: 'glossary-yue.txt' },
      { id: 'vi', label: '베', name: '베트남어', mt: 'vi', chip: '→ VI', glossary: 'glossary-vi.txt', reverse: 'reverse-vi.txt', reverseKo: 'reverse-vi-ko.txt' },
      { id: 'he', label: '이', name: '히브리어', mt: 'he', chip: '→ עברית', glossary: 'glossary-he.txt' },
      { id: 'pl', label: '폴', name: '폴란드어', mt: 'pl', chip: '→ PL', glossary: 'glossary-pl.txt' },
      { id: 'mn', label: '몽', name: '몽골어', mt: 'mn', chip: '→ МОН', glossary: 'glossary-mn.txt', reverse: 'reverse-mn.txt', reverseKo: 'reverse-mn-ko.txt' },
    ],
    // 무료 번역 주소를 써 보는 차례: gtx(translate_a/single), dict(translate_a/t)
    translate: { order: ['gtx', 'dict'] },
    video: {
      liveMaxChars: 60, // 실시간 자막을 영상 위에 보일 때 끝에서 이만큼(글자)
      liveMaxAgeMs: 6000, // 이만큼 새 말이 없으면 실시간 자막을 내린다
      subFontTall: 26, // 세로 영상(쇼츠·릴스) 자막 글자 = 영상 폭 / 이 값
      subFontWide: 19, // 가로 영상 자막 글자 = 영상 높이 / 이 값
      subBottomTall: 0.22, // 세로 영상 자막을 영상 아래에서 띄우는 높이(영상 높이에 대한 비율)
      subBottomWide: 0.12,
      // 화면에 박힌 자막(중국 드라마 등) 읽기 — 1 켜기, 0 끄기. 영상 아래쪽(hsTop ~ 끝)을 hsEveryMs 마다 보고,
      // 획 토막이 hsMinPeak 줄 넘게 몰린 가운데 줄을 자막으로 본다.
      hsOn: 1,
      hsEveryMs: 250,
      hsTop: 0.55,
      hsMinPeak: 8,
      // 옮긴 말은 띄운 뒤 적어도 hsShowMs + 글자 수 × hsShowCharMs(hsShowMaxMs 까지) 둔다 — 자막 줄이 먼저 사라져도.
      // 새 줄의 번역이 오면 바로 바뀐다. 0 이면 줄이 사라질 때 같이 내린다(1.34.0 까지).
      hsShowMs: 1200,
      hsShowCharMs: 60,
      hsShowMaxMs: 3000,
    },
    // 화면 자막 언어를 영상(제목·자동 자막)으로 못 가늠할 때 읽어 볼 언어(구글 코드, 4개까지).
    hardsub: { fallback: ['zh-CN', 'en'] },
    // 영상 위 '한국어 자막' 단추 자리: auto(영상 왼쪽 밖에 자리가 있으면 거기, 없으면 안쪽 왼쪽 위에서 조금 아래),
    // outside-left, top-left, top-right, bottom-left. hosts 로 사이트마다 따로.
    chip: { place: 'auto', hosts: {} },
    youtube: {
      shortsPlayer: 'ytd-reel-video-renderer[is-active] #shorts-player',
      shortsPlayerAny: '#shorts-player',
      player: '#movie_player',
      ccButton: '.ytp-subtitles-button',
      rightControls: '.ytp-right-controls',
      adShowing: 'ad-showing',
      // 말 언어를 가늠할 때 빼는 자동 자막의 variant(자막 주소의 variant=) — 유튜브가 진짜 자동 자막 말고 하나 더 붙이는
      // 것으로, 언어가 말과 상관없다(한국어 쇼츠에 en, 태국어 영상에 en-US — 2026-11-18).
      extraAsr: ['timing-optimized'],
    },
    ocr: { lang: 'tha' }, // 사진 글자 읽기 언어(Tesseract, 'tha+eng' 처럼 여럿)
    shops: {}, // 검색 가로채기 사이트(라자다·쇼피 칸 고치기, 새 쇼핑몰 더하기) — SITES 참고
  };

  // 자막(영상 자막 파일·화면에 박힌 자막)을 구글에 넘기기 전에 바꿔 둘 말 — 언어(구글 코드 앞부분)마다 [찾을 말(정규식), 바꿀 말].
  // 사용자(2026-11-21, 대만 틱톡 @kobebelabronnron/7699146548193627413 '번역이 매우 이상해'): 대만말 욕·속어를 구글이 글자
  // 그대로 옮겼다(比我懶覺還小欸 → '내가 게을러지면 그 사람은 나보다 어려' — 懶覺 은 대만말로 남자 성기, 표준어 老二 로 바꾸면
  // '내 거시기보다 작네'), 맥도날드 麥香魚(필레오피시)는 '물고기'(麥香魚堡 → '피시버거'), 화면 글자 인식은 麥 을 膺 으로 읽었다.
  // 바꿀 말은 모두 구글에 넣어 보고 고른 것. config.json 의 subPrep 으로 더할 수 있다(스토어 심사 없이) — 이 표 뒤에 붙는다.
  const SUB_PREP_DEFAULT = {
    zh: [
      // 글자 인식 실수(번체 모델): 麥 → 膺
      ['膺(?=香魚|香雞|香鱼|香鸡|當勞|当劳|克)', '麥'],
      // 상표·메뉴
      // 麥香魚 홀로는 '물고기', 麥香魚堡 홀로는 '물고기 요새' — 漢堡 를 붙이면 '맥피시 버거'
      ['麥香魚(?:堡|漢堡)?', '麥香魚漢堡'], ['麦香鱼(?:堡|汉堡)?', '麦香鱼汉堡'], ['麥香雞(?:堡|漢堡)?', '麥香雞漢堡'], ['麦香鸡(?:堡|汉堡)?', '麦香鸡汉堡'],
      ['大麥克', '巨無霸'], ['麥當當', '麥當勞'], ['麦当当', '麦当劳'],
      // 대만말(민남어) 욕·속어
      // 睡懶覺(늦잠)은 그대로 — 懶覺 앞에 睡 가 있으면 늦잠이다.
      ['(?<!睡)(?:懶|卵|懒)(?:覺|叫|鳥|觉|鸟)', '老二'], ['(?:懶|卵|懒)(?:趴|葩|脬)', '睪丸'],
      ['(?:幹|姦|擊|干)你(?:娘|老師|老木|老母)的?', '他媽的'], ['看你娘的?', '他媽的'], ['幹(?=[，,!！？? ]|$)', '他媽的'],
      // 홑 '你娘'(욕) — 뒤에 這·啦 같은 말이나 문장 끝이 올 때만(你娘在家嗎 '너희 엄마 집에 계셔?' 는 그대로)
      ['(?<![他她我妳的])你娘(?=[這这啦咧嘞喔哦，,！!？? ]|$)', '他媽的'],
      ['(?:靠|哭)(?:北|杯|夭|么|腰|邀)', '靠'], ['三小', '什麼鬼'], ['北七|北爛|北七仔', '白痴'],
      ['(很|超|有夠|真)(?:機掰|雞掰|機歪|機八)', '$1討厭'], ['機掰|雞掰|機歪|機八', '王八蛋'],
      ['母湯', '不行'], ['歹勢', '不好意思'], ['(?:甲|呷|吃)賽', '吃屎'], ['哩賀|哩厚', '你好'], ['醬子', '這樣子'],
      // 중국 인터넷 속어
      ['草泥馬|草泥马|操你媽|操你妈|艹你妈', '他妈的'], ['(?:yyds|YYDS)', '最棒的'], ['绝绝子|絕絕子', '太绝了'],
      ['(?<![0-9])666+(?![0-9])', '太厉害了'], ['老六', '阴险的家伙'], ['芭比[Qq]了', '完蛋了'], ['栓[Qq]', '谢谢你，无语了'],
    ],
  };

  // ---- 한국어 다듬기 — 30개 언어 공통(1.35.5, 5번) ----
  // 구글·크롬 내장 번역기에 한국어를 넘기기 직전에 초성체·줄임말·흔한 맞춤법 실수·큰 숫자를 표준 한국어로 바꾼다.
  // 2026-11-22 구글에 넣어 본 것: 'ㄱㄱ 지금 출발' → 영어 'ㄱㄱ Leave now', 'ㅇㅋ 알겠어' → 일본어 'ㅇ'(뜻이 사라짐),
  // '낼 몇시에 만나?' → 일본어에서 '내일' 이 빠짐. 다듬어 넘기니 모두 바르게 나왔다 — 한 번 고치면 모든 언어가 함께 좋아진다.
  // 용어집 찾기에는 쓰지 않는다(용어집 키는 사용자가 친 그대로 — 'ㅋㅋ' 같은 대화 라운드 키가 그대로 걸린다).
  // 칸: [찾을 말(정규식), 바꿀 말, 자리]. 자리: word = 낱말 하나 전체(앞뒤가 글자·숫자가 아님, 기본 — '넘어지다'·'넘버원' 은 그대로),
  // start = 낱말 첫머리('이쁘다' 의 이쁘), jamo = 낱자 묶음(앞뒤가 다른 낱자만 아니면 — '웃겨ㅋㅋ' 처럼 붙여 써도), any = 정규식 그대로.
  // config.json 의 koPrep 칸이 뒤에 붙는다 — 대화 라운드마다 심사 없이 늘린다. 뜻은 대화 라운드 r01(초성체)을 따랐다.
  // 받침이 ㄹ 인 글자 모두(할·줄·을·릴·낼…) — 아래 '께' 규칙에 쓴다.
  const KO_RIEUL = Array.from({ length: 399 }, (_, i) => String.fromCharCode(0xac00 + i * 28 + 8)).join('');
  const KO_PREP_DEFAULT = [
    // 웃음·울음(뜻을 담은 그림 글자는 어느 언어로도 그대로 간다)
    ['ㅋ{2,}', ' 하하 ', 'jamo'], ['ㅎ{2,}', ' 하하 ', 'jamo'], ['[ㅠㅜ]+', ' 😢 ', 'jamo'],
    // 초성체
    ['ㅇㅇ', ' 응 ', 'jamo'], ['ㅇㅋ(?:ㅇㅋ)*', ' 오케이 ', 'jamo'], ['(?:ㄱㅅ)+|ㄳ', ' 고마워 ', 'jamo'], ['(?:ㅈㅅ)+', ' 죄송해요 ', 'jamo'],
    ['ㄴㄴ', ' 아니 ', 'jamo'], ['ㄱㄱ', ' 가자 ', 'jamo'], ['ㅂㅂ|ㅂㅇ|ㅃㅇ|ㅃㅃ|ㅎㅇ', ' 안녕 ', 'jamo'], ['(?:ㅊㅋ)+', ' 축하해 ', 'jamo'],
    ['ㅇㅈ', ' 인정 ', 'jamo'], ['ㄹㅇ', ' 진짜 ', 'jamo'], ['ㅅㄱ', ' 수고해 ', 'jamo'], ['ㅁㄹ', ' 몰라 ', 'jamo'], ['ㄷㄷ', ' 덜덜 ', 'jamo'],
    ['ㄱㄷ', ' 기다려 ', 'jamo'], ['ㅈㅂ', ' 제발 ', 'jamo'], ['ㅇㄷ', ' 어디 ', 'jamo'], ['ㅈㄴ', ' 정말 ', 'jamo'],
    // 줄임말(낱말 하나 전체일 때만)
    ['넘', '너무'], ['넘넘', '너무너무'], ['넘나', '너무나'], ['낼', '내일'], ['담에', '다음에'], ['글구|그리구', '그리고'],
    ['왜케', '왜 이렇게'], ['첨', '처음'], ['첨에', '처음에'], ['첨엔', '처음엔'], ['첨부터', '처음부터'], ['쌤', '선생님'],
    ['쫌', '좀'], ['마니', '많이'], ['머해|모해', '뭐 해'], ['머', '뭐'], ['머야|모야', '뭐야'], ['오키|오키오키', '오케이'],
    ['넵|넹|넴', '네'], ['웅|엉', '응'], ['짱', '최고'], ['존맛|존맛탱|JMT|jmt', '정말 맛있어'], ['노잼', '재미없어'],
    ['꿀잼|개꿀잼', '정말 재미있어'], ['졸귀|존귀', '정말 귀여워'], ['존나|졸라', '정말'], ['갠적으로', '개인적으로'],
    ['셤', '시험'], ['겜', '게임'],
    // 낱말 첫머리
    ['어케', '어떻게', 'start'], ['이쁘', '예쁘', 'start'], ['이뻐', '예뻐', 'start'], ['이쁜', '예쁜', 'start'], ['이쁨', '예쁨', 'start'],
    // 몇일 → 며칠 은 넣지 않는다: 바르게 고치면 구글이 일본어로 '数日'(며칠 동안)로 옮겼다 — 틀린 철자 '몇일' 을 더 잘 알아듣는다(2026-11-22).
    // 흔한 맞춤법 실수. 받침 ㄹ 뒤의 '께'(할께·줄께·먹을께·드릴께·보낼께) — 구글이 '께' 를 높임 조사로 읽는다.
    [`(?<=[${KO_RIEUL}])께(?=요|[\\s.,!?~]|$)`, '게', 'any'], ['됬', '됐', 'any'], ['되요(?=[\\s.,!?~]|$)', '돼요', 'any'],
    ['되서(?![가-힣])', '돼서', 'any'],
  ];
  const KO_LETTER = '가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9';
  function koPrepRule(src, to, mode) {
    const left = `(?<![${KO_LETTER}])`;
    const right = `(?![${KO_LETTER}])`;
    const re =
      mode === 'any' ? src
        : mode === 'jamo' ? `(?<![ㄱ-ㅎㅏ-ㅣ])(?:${src})(?![ㄱ-ㅎㅏ-ㅣ])`
          : mode === 'start' ? `${left}(?:${src})`
            : `${left}(?:${src})${right}`;
    return [new RegExp(re, 'gu'), to];
  }

  const rcNum = (v, d, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : d);
  const rcStr = (v, d, re) => (typeof v === 'string' && v.length <= 300 && (!re || re.test(v)) ? v : d);
  // 선택자는 문법이 맞는지만 본다(페이지 쪽 엔진에는 document 가 없다 — 그때는 글자만 본다).
  function rcSel(v, d) {
    if (typeof v !== 'string' || !v.trim() || v.length > 300) return d;
    try {
      if (typeof document !== 'undefined' && document.createDocumentFragment) document.createDocumentFragment().querySelector(v);
      return v;
    } catch {
      return d;
    }
  }
  const RC_LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

  function rcLanguages(list) {
    const out = [];
    for (const l of Array.isArray(list) ? list : []) {
      if (!l || typeof l !== 'object') continue;
      const id = rcStr(l.id, '', RC_LANG);
      const label = rcStr(l.label, '', /^.{1,3}$/u);
      const name = rcStr(l.name, '', /^.{1,20}$/u);
      if (!id || !label || !name || out.some((x) => x.id === id)) continue;
      out.push({
        id,
        label,
        name,
        mt: rcStr(l.mt, id, RC_LANG),
        chip: rcStr(l.chip, `→ ${id.toUpperCase()}`, /^.{1,20}$/u),
        glossary: rcStr(l.glossary, '', /^[\w.-]{1,60}\.txt$/),
        reverse: rcStr(l.reverse, '', /^[\w.-]{1,60}\.txt$/), // 그 언어 → 한국어 거꾸로 표(언어 교차). 지우면 심사 없이 꺼진다
        reverseKo: rcStr(l.reverseKo, '', /^[\w.-]{1,60}\.txt$/), // 한국어 쪽 뜻이 여럿인 낱말 — 한국어로 옮길 때만
        toKo: l.toKo !== false, // false 면 그 언어 → 한국어는 구글로. 영어는 구글이 더 나았다(2026-11-09 사전 4 : 구글 9)
      });
    }
    if (!out.length) return RC_DEFAULT.languages;
    // 태국어는 쇼핑몰·메신저·태국어 페이지가 기대어 있어 늘 둔다.
    if (!out.some((l) => l.id === 'th')) out.unshift(RC_DEFAULT.languages[0]);
    return out;
  }

  // 쇼핑몰 칸: 이미 있는 사이트(lazada·shopee)는 적은 칸만 바꾸고, 새 키는 label·host·searchUrl·inputSelectors 가
  // 다 있어야 더한다. searchUrl 은 https 이고 {q} 자리에 검색어가 들어가며, 그 사이트 주소여야 한다.
  function rcShops(o) {
    const out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    for (const [key, s] of Object.entries(o)) {
      if (!/^[a-z0-9_]{2,20}$/.test(key) || !s || typeof s !== 'object') continue;
      const host = rcStr(s.host, '', /^[a-z0-9.-]+\.[a-z]{2,}$/);
      const shop = {};
      if (s.label != null) shop.label = rcStr(s.label, undefined, /^.{1,30}$/u);
      if (host) shop.host = host;
      if (Array.isArray(s.inputSelectors)) shop.inputSelectors = s.inputSelectors.map((x) => rcSel(x, '')).filter(Boolean);
      for (const k of ['widgetSelector', 'buttonSelector']) if (s[k] != null) shop[k] = rcSel(s[k], undefined);
      if (s.queryParam != null) shop.queryParam = rcStr(s.queryParam, undefined, /^[\w-]{1,30}$/);
      for (const k of ['spa', 'broadInputFallback']) if (typeof s[k] === 'boolean') shop[k] = s[k];
      if (s.langHint != null) shop.langHint = rcStr(s.langHint, undefined, RC_LANG);
      // 그 쇼핑몰의 말(검색어를 이 말로 바꾸고 페이지 글을 이 말에서 옮긴다). 새 쇼핑몰만 — 쇼피·라자다는 markets 로 나라마다.
      if (s.lang != null) shop.lang = rcStr(s.lang, undefined, RC_LANG);
      // 쇼피·라자다 나라 더하기/말 바꾸기: { "shopee.pl": "pl" } — 주소 → 그 나라 쇼핑몰 말.
      if (s.markets && typeof s.markets === 'object' && !Array.isArray(s.markets)) {
        const m = {};
        for (const [h, l] of Object.entries(s.markets)) {
          if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(h) && typeof l === 'string' && RC_LANG.test(l)) m[h] = l;
        }
        if (Object.keys(m).length) shop.markets = m;
      }
      if (typeof s.searchUrl === 'string' && s.searchUrl.includes('{q}')) {
        try {
          const u = new URL(s.searchUrl.replace('{q}', 'q'));
          const h = host || (SITES_BUILTIN_HOSTS[key] || '');
          if (u.protocol === 'https:' && h && (u.hostname === h || u.hostname.endsWith(`.${h}`))) shop.searchUrl = s.searchUrl;
        } catch {
          /* 틀린 주소 — 버린다 */
        }
      }
      for (const k of Object.keys(shop)) if (shop[k] === undefined) delete shop[k];
      out[key] = shop;
    }
    return out;
  }
  const SITES_BUILTIN_HOSTS = { lazada: 'lazada.co.th', shopee: 'shopee.co.th' };
  const RC_VIDEO_RANGE = {
    liveMaxChars: [10, 400],
    liveMaxAgeMs: [1000, 60000],
    subFontTall: [5, 100],
    subFontWide: [5, 100],
    subBottomTall: [0, 0.9],
    subBottomWide: [0, 0.9],
    hsOn: [0, 1],
    hsEveryMs: [100, 3000],
    hsTop: [0.2, 0.9],
    hsMinPeak: [3, 60],
    hsShowMs: [0, 5000],
    hsShowCharMs: [0, 300],
    hsShowMaxMs: [0, 8000],
  };

  function rcBuild(text) {
    let j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch {
      j = null;
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) j = {};
    const D = RC_DEFAULT;
    const v = j.video || {};
    const yt = j.youtube || {};
    const chip = j.chip || {};
    const places = ['auto', 'outside-left', 'top-left', 'top-right', 'bottom-left'];
    const hosts = {};
    if (chip.hosts && typeof chip.hosts === 'object') {
      for (const [h, p] of Object.entries(chip.hosts)) if (/^[a-z0-9.-]+$/.test(h) && places.includes(p)) hosts[h] = p;
    }
    const order = Array.isArray(j.translate && j.translate.order)
      ? [...new Set(j.translate.order.filter((x) => x === 'gtx' || x === 'dict' || x === 'builtin'))]
      : [];
    return {
      languages: rcLanguages(j.languages),
      translate: { order: order.length ? order : D.translate.order },
      video: Object.fromEntries(Object.entries(D.video).map(([k, d]) => [k, rcNum(v[k], d, ...RC_VIDEO_RANGE[k])])),
      hardsub: {
        fallback: Array.isArray(j.hardsub && j.hardsub.fallback)
          ? j.hardsub.fallback.filter((c) => typeof c === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(c)).slice(0, 4)
          : D.hardsub.fallback,
      },
      chip: { place: places.includes(chip.place) ? chip.place : D.chip.place, hosts },
      youtube: {
        ...Object.fromEntries(
          Object.entries(D.youtube)
            .filter(([k]) => k !== 'extraAsr')
            .map(([k, d]) => [k, k === 'adShowing' ? rcStr(yt[k], d, /^[\w-]{1,40}$/) : rcSel(yt[k], d)])
        ),
        extraAsr: Array.isArray(yt.extraAsr)
          ? yt.extraAsr.filter((s) => typeof s === 'string' && /^[\w-]{1,40}$/.test(s)).slice(0, 10)
          : D.youtube.extraAsr,
      },
      ocr: { lang: rcStr(j.ocr && j.ocr.lang, D.ocr.lang, /^[a-z_]{3,10}(\+[a-z_]{3,10}){0,3}$/) },
      shops: rcShops(j.shops),
      subPrep: rcSubPrep(j.subPrep),
      koPrep: rcKoPrep(j.koPrep),
    };
  }

  // 자막 바꿀 말: 기본 표 + config.json subPrep { 'zh': [['찾을 말', '바꿀 말'], …] }(뒤에 붙는다). 틀린 정규식·너무 긴 것은 버린다.
  function rcSubPrep(extra) {
    const out = {};
    const add = (lang, list) => {
      if (!/^[a-z]{2,3}$/.test(lang) || !Array.isArray(list)) return;
      for (const e of list.slice(0, 300)) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string' || !e[0] || e[0].length > 120 || e[1].length > 120) continue;
        try {
          (out[lang] = out[lang] || []).push([new RegExp(e[0], 'gu'), e[1]]);
        } catch {
          /* 이 브라우저가 모르는 정규식 — 버린다 */
        }
      }
    };
    for (const [lang, list] of Object.entries(SUB_PREP_DEFAULT)) add(lang, list);
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) for (const [lang, list] of Object.entries(extra)) add(lang, list);
    return out;
  }

  // 한국어 다듬기 표: 기본 표 + config.json koPrep [['찾을 말', '바꿀 말', 자리?], …](뒤에 붙는다). 틀린 정규식·너무 긴 것·모르는 자리는 버린다.
  function rcKoPrep(extra) {
    const out = [];
    // 길이 제한은 config.json 에서 온 칸에만(기본 표의 '께' 규칙은 받침 ㄹ 글자 399개를 품어 길다).
    const add = (list, max) => {
      if (!Array.isArray(list)) return;
      for (const e of list.slice(0, 500)) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string' || !e[0] || e[0].length > max || e[1].length > 120) continue;
        const mode = e[2] === undefined ? 'word' : e[2];
        if (!['word', 'start', 'jamo', 'any'].includes(mode)) continue;
        try {
          out.push(koPrepRule(e[0], e[1], mode));
        } catch {
          /* 이 브라우저가 모르는 정규식 — 버린다 */
        }
      }
    };
    add(KO_PREP_DEFAULT, 1000);
    add(extra, 120);
    return out;
  }

  // 번역에 넘길 한국어를 다듬는다(구글·내장 번역기 직전에만 — freeGtx·freeAlt·freeAltMany·builtinTranslate). 줄 수는 그대로 둔다
  // (여러 줄을 이어 보낸 뒤 줄로 다시 나눈다). 한글이 없으면 그대로.
  function koPrep(text) {
    const s0 = String(text == null ? '' : text);
    if (!/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(s0)) return s0;
    let s = koBigNumbers(s0);
    for (const [re, to] of RC.koPrep) s = s.replace(re, to);
    if (s === s0) return s0;
    return s.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '');
  }
  const koSource = (from, text) => from === 'ko' || (from === 'auto' && HANGUL.test(String(text || '')));

  // 자막 한 줄을 그 언어의 표로 바꾼다. 광둥어(yue)·번체(zh-TW)도 중국어(zh) 표를 쓴다.
  function subPrep(text, lang) {
    const base = String(lang || '').split('-')[0].toLowerCase();
    const rules = RC.subPrep[base === 'yue' ? 'zh' : base];
    if (!rules || !text) return text;
    let t = String(text);
    for (const [re, to] of rules) t = t.replace(re, to);
    return t;
  }

  let rcStore = GM_getValue(RC_STORE, null);
  const RC = rcBuild(rcStore && rcStore.text);

  // 사본이 오래됐으면 뒤에서 새로 받는다(이 페이지는 이미 읽은 값으로 돈다). 받기에 실패하면 10분 뒤 다시.
  function rcRefresh() {
    if (rcStore && Date.now() - rcStore.at < RC_TTL) return;
    const old = rcStore && rcStore.text;
    const tryAt = (i) => {
      if (i >= RC_SOURCES.length) {
        rcStore = { text: old || '', at: Date.now() - RC_TTL + 10 * 60 * 1000 };
        GM_setValue(RC_STORE, rcStore);
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url: RC_SOURCES[i].url,
        headers: RC_SOURCES[i].headers || {},
        timeout: 10000,
        onload: (r) => {
          let ok = false;
          try {
            const j = JSON.parse(r.responseText);
            ok = r.status === 200 && j && typeof j === 'object' && !Array.isArray(j);
          } catch {
            ok = false;
          }
          if (!ok) return tryAt(i + 1);
          rcStore = { text: r.responseText, at: Date.now() };
          GM_setValue(RC_STORE, rcStore);
        },
        onerror: () => tryAt(i + 1),
        ontimeout: () => tryAt(i + 1),
      });
    };
    tryAt(0);
  }
  setTimeout(rcRefresh, 3000);

  // ---------------------------------------------------------------------------
  // 사이트별 설정
  //
  // 사이트를 추가하려면 여기에 항목 하나를 더하고 위에 @match 를 적으면 된다.
  // 용어집·API 키·설정은 스크립트 하나에 붙어 있으므로 사이트를 늘려도 그대로 공유된다.
  // 나머지 코드는 이 표만 보고 움직이니 아래를 고칠 일은 없다.
  //
  //   label           사용자에게 보여 줄 이름, AI 프롬프트에도 들어간다
  //   host            대표 도메인 (프롬프트용)
  //   match           location.hostname 판정
  //   inputSelectors  검색창. 앞에서부터 찾고 먼저 맞는 것을 쓴다.
  //                   클래스명은 빌드마다 바뀌므로 name/type/id 기반을 앞에 둔다.
  //   widgetSelector  검색 위젯 범위. 자동완성 목록 등 검색창 밖에서 오는 Enter 를 잡는다.
  //   buttonSelector  검색 버튼. type="button" 인 곳이 많아 클릭을 직접 가로챈다.
  //   queryParam      주소의 검색어 파라미터. 안전망이 이 값을 읽는다.
  //   searchUrl       검색 주소. 폼 제출에 맡기지 않고 직접 만들어 이동한다.
  //                   사이트가 검색어를 자기 JS 상태로 들고 있어도(라자다가 그랬다)
  //                   한국어가 되살아나지 않고, DOM 구조를 몰라도 동작한다.
  //   spa             주소만 바뀌는 사이트면 true. 라우팅마다 훅을 다시 건다.
  //   broadInputFallback  DOM 을 확인 못 한 사이트용 임시 보완. 확인했으면 끈다.
  // ---------------------------------------------------------------------------

  const SITES = {
    lazada: {
      label: '라자다',
      host: 'lazada.co.th',
      match: /(^|\.)lazada\.co\.th$/,
      // 해시가 붙은 클래스명은 빌드마다 바뀌므로 안정적인 선택자만 쓴다.
      inputSelectors: ['#q', 'input[name="q"]'],
      widgetSelector: '[class*="search-box"], form[action*="catalog"]',
      buttonSelector: '[class*="search-box__button"]',
      queryParam: 'q',
      searchUrl: (q) => `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(q)}`,
      spa: false,
    },
    shopee: {
      label: '쇼피',
      host: 'shopee.co.th',
      match: /(^|\.)shopee\.co\.th$/,
      // 실제 DOM 확인(2026-09-20, shopee.co.th 첫 화면):
      //   <form role="search" action="/search" class="shopee-searchbar">
      //     <div class="shopee-searchbar__main"><div class="shopee-searchbar-input">
      //       <input type="search" name="keyword" class="shopee-searchbar-input__input"
      //              role="combobox" aria-controls="shopee-searchbar-listbox">
      //     <button type="button" class="... shopee-searchbar__search-button">
      // name/type 은 클래스명보다 오래 가므로 먼저 본다.
      inputSelectors: [
        'form.shopee-searchbar input[name="keyword"]',
        'input[name="keyword"]',
        'input.shopee-searchbar-input__input',
        'form[role="search"] input[type="search"]',
        'input[type="search"]',
      ],
      // 자동완성 목록(#shopee-searchbar-listbox)은 폼 안에 그려지지만,
      // 팝오버가 바깥으로 빠지는 판이 있어 id 도 함께 적어 둔다.
      widgetSelector:
        'form.shopee-searchbar, form[role="search"], [class*="searchbar"], #shopee-searchbar-listbox',
      // 검색 버튼은 type="button" 이라 클릭해도 submit 이 나지 않는다. 클릭을 직접 잡아야 한다.
      buttonSelector:
        '.shopee-searchbar__search-button, [class*="searchbar"] button, button[class*="search"]',
      queryParam: 'keyword',
      // 버튼을 눌러 보니 쇼피도 이 주소로 통째 이동한다(SPA 전환이 아님).
      searchUrl: (q) => `https://shopee.co.th/search?keyword=${encodeURIComponent(q)}`,
      spa: true,
      // 선택자를 실제로 확인했으므로 끈다. 켜 두면 주소·리뷰 같은 다른 입력칸에서
      // 한국어를 치고 Enter 만 눌러도 검색으로 튄다.
      broadInputFallback: false,
      // 크롬 자동번역이 쇼피에서만 안 뜨는 이유. 쇼피가 내려주는 첫 HTML 은 껍데기고
      // (태그를 걷어내면 본문 0자, 라자다는 8000자) <html> 에 lang 도 없다. 크롬은
      // 로드 시점에 언어를 정하는데 볼 글자가 없으니 '감지된 언어'로 남고, 그러면
      // 번역 아이콘도 '항상 번역' 규칙도 만들어지지 않는다. 쇼피도 나중에 lang="th" 를
      // 붙이지만 이미 늦다. document-start 인 우리가 먼저 선언해 준다.
      langHint: 'th',
    },
  };

  // 쇼피·라자다는 나라마다 주소와 파는 말이 다르다(2026-11-19 사용자: 전세계 쇼피몰에서도). 주소 → 그 나라 쇼핑몰 말.
  // 검색어는 이 말로 바꾸고(태국만 태국어 용어집·AI, 다른 나라는 입력칸과 같은 길 — 그 언어 용어집 → 구글), 페이지 글은
  // 이 말에서 내 언어로 옮긴다. 싱가포르·말레이시아·필리핀은 화면과 상품명이 거의 영어라 영어로 찾는다. 검색창 모양은 나라가
  // 달라도 같다(같은 회사 같은 화면). 나라를 더하거나 말을 바꾸려면 config.json shops.shopee.markets 처럼 — 코드는 그대로.
  const SHOP_MARKETS = {
    shopee: {
      'shopee.co.th': 'th', 'shopee.sg': 'en', 'shopee.com.my': 'en', 'shopee.co.id': 'id', 'shopee.vn': 'vi',
      'shopee.ph': 'en', 'shopee.tw': 'zh-TW', 'shopee.com.br': 'pt', 'shopee.com.mx': 'es', 'shopee.com.co': 'es',
      'shopee.cl': 'es',
    },
    lazada: {
      'lazada.co.th': 'th', 'lazada.sg': 'en', 'lazada.com.my': 'en', 'lazada.co.id': 'id', 'lazada.vn': 'vi',
      'lazada.com.ph': 'en',
    },
  };
  const SHOP_COUNTRY = {
    th: '태국', sg: '싱가포르', my: '말레이시아', id: '인도네시아', vn: '베트남', ph: '필리핀', tw: '대만',
    br: '브라질', mx: '멕시코', co: '콜롬비아', cl: '칠레',
  };
  function shopMarket(key) {
    const h = location.hostname;
    const all = { ...SHOP_MARKETS[key], ...((RC.shops[key] && RC.shops[key].markets) || {}) };
    // 긴 주소 먼저(shopee.com.my 가 my 로 끝나는 다른 주소보다 앞서게)
    for (const host of Object.keys(all).sort((a, b) => b.length - a.length)) {
      if (h === host || h.endsWith(`.${host}`)) return { host, lang: all[host] };
    }
    return null;
  }
  for (const key of Object.keys(SHOP_MARKETS)) {
    const m = shopMarket(key);
    const s = SITES[key];
    s.lang = 'th';
    if (!m) continue;
    s.lang = m.lang;
    if (s.langHint) s.langHint = m.lang;
    if (m.host === s.host) continue; // 태국 — 예전 그대로
    const cc = m.host.split('.').pop();
    s.label = `${s.label} ${SHOP_COUNTRY[cc] || cc.toUpperCase()}`;
    s.host = m.host;
    s.match = new RegExp(`(^|\\.)${m.host.replace(/\./g, '\\.')}$`);
    const base = key === 'lazada' ? `https://www.${m.host}/catalog/?q=` : `https://${m.host}/search?keyword=`;
    s.searchUrl = (q) => base + encodeURIComponent(q);
  }

  // 원격 설정(config.json 의 shops)으로 칸을 바꾸거나 새 쇼핑몰을 더한다 — 선택자가 바뀐 쇼핑몰을 웹스토어 심사 없이
  // 고치려고(rcShops 가 꼴을 맞춰 봤다). 새 쇼핑몰은 label·host·searchUrl·inputSelectors 가 다 있어야 한다.
  for (const [key, cfgShop] of Object.entries(RC.shops)) {
    const base = SITES[key];
    const { markets, ...s } = cfgShop; // markets 는 위 shopMarket 이 썼다
    if (base && SHOP_MARKETS[key]) delete s.lang; // 쇼피·라자다의 말은 나라마다(markets)
    if (!base && !(s.label && s.host && s.searchUrl && s.inputSelectors && s.inputSelectors.length)) continue;
    const site = { spa: true, broadInputFallback: false, widgetSelector: '', buttonSelector: '', queryParam: 'q', ...base, ...s };
    if (s.host) site.match = new RegExp(`(^|\\.)${s.host.replace(/\./g, '\\.')}$`);
    // 쇼피·라자다의 검색 주소 고치기는 그 주소의 나라에만(태국 주소를 적었으면 베트남 쇼피는 베트남 주소 그대로).
    if (s.searchUrl) {
      let h = '';
      try {
        h = new URL(s.searchUrl.replace('{q}', 'q')).hostname;
      } catch {
        h = '';
      }
      if (h === site.host || h.endsWith(`.${site.host}`)) site.searchUrl = (q) => s.searchUrl.replace('{q}', encodeURIComponent(q));
    }
    SITES[key] = site;
  }

  // @match 는 추가했는데 위 표에 항목을 빠뜨린 경우. 예전에는 라자다 설정으로 떨어져서
  // 검색이 엉뚱하게 lazada.co.th 로 날아갔다. 그보다는 검색 기능만 끄고 알리는 편이 낫다.
  // (표시 번역과 선택 번역은 사이트 설정이 필요 없으므로 그대로 동작한다.)
  const UNKNOWN_SITE = {
    label: location.hostname,
    host: location.hostname,
    inputSelectors: [],
    widgetSelector: '',
    buttonSelector: '',
    queryParam: 'q',
    searchUrl: null, // null 이면 검색 가로채기를 하지 않는다
    spa: true,
    broadInputFallback: false,
  };

  const SITE =
    Object.values(SITES).find((s) => s.match.test(location.hostname)) || UNKNOWN_SITE;

  // 표에 없는 사이트(스크립트는 모든 사이트에서 뜬다). 대기만 하다가 태국어가 보이면
  // 입력칸의 한국어를 태국어로 바꾸는 기능만 켠다(genericInit). 페이지 번역은 크롬에 맡긴다.
  const GENERIC = SITE === UNKNOWN_SITE;
  // 이 쇼핑몰의 말(검색어를 바꿀 말, 페이지 글의 말). 표에 없는 사이트는 예전처럼 태국어(태국어 페이지에서만 켜진다).
  const SITE_LANG = SITE.lang || 'th';
  const SITE_LANG2 = SITE_LANG.split('-')[0].toLowerCase();
  const SITE_SCRIPT = SCRIPT_OF[SITE_LANG2] || null; // 로마자 언어(영어·베트남어 …)면 null

  // AI 공급자. 둘 다 OpenAI 호환이라 같은 코드로 호출한다.
  const PROVIDERS = {
    groq: {
      label: 'Groq',
      base: 'https://api.groq.com/openai/v1',
      keyField: 'groqKey',
      modelField: 'groqModel',
      signup: 'console.groq.com',
    },
    nvidia: {
      label: 'NVIDIA NIM',
      base: 'https://integrate.api.nvidia.com/v1',
      keyField: 'nvidiaKey',
      modelField: 'nvidiaModel',
      signup: 'build.nvidia.com',
    },
  };

  // 번역에서 제외할 태그. 가격/통화 기호는 별도 텍스트 노드라 필터에서 걸러진다.
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
    'CODE', 'PRE', 'IFRAME', 'CANVAS', 'SVG', 'MATH', 'TITLE',
  ]);

  const DEFAULTS = {
    aiProvider: 'nvidia',    // 'groq' | 'nvidia'
    groqKey: '',
    groqModel: 'llama-3.3-70b-versatile',
    nvidiaKey: '',
    nvidiaModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    pageEngine: 'free',      // 'free' | 'ai' | 'off'
    // 용어집에 없는 검색어 조각을 무엇으로 채우나. 용어집은 어느 쪽이든 먼저 본다.
    searchEngine: 'free',    // 'free' | 'ai'
    autoTranslatePage: true,
    confirmSearch: true,
    // 외국어 페이지(30개 언어)에서 입력칸에 쓴 내 말을 그 페이지 언어로 바꾼다. 1.34.2 까지는 태국어 페이지만 그랬다
    // (2026-11-21 사용자: 태국어에만 되던 것을 모든 언어에). 번역 단추에서 고른 언어가 있으면 그쪽이 먼저.
    pageLangAuto: true,
    // 메신저에서 한국어 존댓말(~요·~니다)을 태국어로 보낼 때 끝에 붙이는 말 = 내 성별. '' 이면 안 붙인다.
    chatParticle: 'ครับ',
    // 메신저의 외국어 말풍선 밑에 한국어(내 언어). 페이지 번역(pageEngine)을 꺼 두고 크롬 번역을 써도
    // 메신저는 따로 켠다 — 크롬 번역은 화면이 한국어인 메신저에선 잘 안 뜬다.
    chatTranslate: true,
    selectionTranslate: true,  // 드래그한 글자만 골라 번역
    imageTranslate: true,      // 사진에 마우스를 올리면 '사진 번역' 버튼
    // 마우스를 올려 두기만 해도 번역. 꺼 두면 버튼을 눌러야 읽는다(훑어보기만 해도 Vision 건수가
    // 쌓이지 않게). 꺼져 있어도 전에 번역한 사진은 저장된 결과로 바로 보인다(다시 읽지 않는다).
    imageAuto: false,
    visionKey: '',             // Google Cloud Vision API 키(선택, 이 PC에만). 있으면 사진 글자를 Vision 으로 읽는다
    visionMonthlyCap: 900,     // 이 PC에서 한 달에 Vision 을 부를 최대 횟수(무료는 계정 전체 월 1,000건)
    glossary: {},      // 예전 방식의 '내 용어집'(이 PC에만). 이제는 GitHub glossary.txt 를 쓴다
    githubToken: '',   // 용어집 저장용. th-korean-glossary 쓰기 권한만 있는 토큰 (이 PC에만)
    githubUser: '',    // 토큰 확인 때 받은 GitHub 아이디 (표시용)
    pageGlossary: {},  // 표시: 원문 -> 한국어 (브랜드명 보존 등)
  };

  // 무료 엔진은 브랜드명을 일반 단어로 번역해 버린다(Quiescent -> "정지").
  // 자주 보이는 것들만 미리 고정해 둔다.
  const SEED_PAGE_GLOSSARY = {
    'LazMall': 'LazMall', 'Lazada': 'Lazada', 'LazLive': 'LazLive',
    'Flash Sale': '플래시 세일', 'Free Shipping': '무료배송',
    'Voucher': '바우처', 'Vouchers': '바우처',
    // 라자다 상품 설명의 펼치기/접기 버튼. 구글은 'ย่อรายละเอียด' 를 '세부 정보를 요약합니다' 로 옮겼다.
    'ดูเพิ่ม': '더 보기', 'ดูเพิ่มเติม': '더 보기', 'ย่อรายละเอียด': '접기',
  };

  // ---------------------------------------------------------------------------
  // 검색 용어집 — GitHub 의 glossary.txt 한 곳에만 둔다
  //
  // 예전에는 스크립트 안(기본)과 PC 브라우저(내 용어집) 두 곳에 나뉘어, 한 PC에서 넣은
  // 단어가 다른 PC에는 없었다. 이제 모든 PC가 같은 파일을 받아 쓴다. 단어를 고칠 때는
  // 그 파일만 고치면 되고 스크립트는 다시 올릴 필요가 없다. 편집은 GitHub 웹 편집기에서
  // 한다 — 크롬에 GitHub 로그인이 돼 있으면 그대로 저장된다.
  // 받은 내용은 이 브라우저에 사본으로 두어(GLOSSARY_STORE) 페이지마다 다시 받지 않고,
  // 사본이 GLOSSARY_TTL 보다 오래되면 뒤에서 조용히 새로 받는다.
  // ---------------------------------------------------------------------------

  // 용어집은 스크립트(wotjq2/th-korean)와 다른 저장소에 둔다. 브라우저에 두는 저장용 토큰이
  // 이 저장소에만 쓸 수 있으면, 토큰이 새어 나가도 바뀌는 것은 단어뿐이고 모든 PC가 자동
  // 업데이트로 받는 스크립트 코드는 건드릴 수 없다. 용어집은 글자로만 쓰이므로(검색어·토스트
  // 모두 textContent / encodeURIComponent) 이상한 값이 들어와도 코드로 실행되지 않는다.
  const GLOSSARY_REPO = 'wotjq2/th-korean-glossary';
  const GLOSSARY_FILE = 'glossary.txt';
  // API 는 고친 내용을 1분 안에 준다. raw 주소는 CDN 캐시로 몇 분 늦을 수 있어 예비로만 쓴다.
  // API 는 로그인 없이 IP 당 시간 60회까지라, 10분에 한 번 받는 정도는 넉넉하다.
  const GLOSSARY_SOURCES = [
    {
      url: `https://api.github.com/repos/${GLOSSARY_REPO}/contents/${GLOSSARY_FILE}?ref=main`,
      headers: { Accept: 'application/vnd.github.raw' },
    },
    { url: `https://raw.githubusercontent.com/${GLOSSARY_REPO}/main/${GLOSSARY_FILE}` },
  ];
  const GLOSSARY_EDIT_URL = `https://github.com/${GLOSSARY_REPO}/edit/main/${GLOSSARY_FILE}`;
  const GLOSSARY_STORE = 'remoteGlossary'; // { text, at }
  const GLOSSARY_TTL = 10 * 60 * 1000;

  // glossary.txt 형식: 한 줄에 '한국어=태국어', '#' 로 시작하는 줄은 설명.
  // 칸 제목('# --- … ---')에 MOD_TAG 가 붙은 칸의 말은 꾸밈말(색·소재·성별·냉동…)로 따로
  // 모아 둔다. 조합할 때 상품 이름 뒤로 보내는 데 쓴다(assembleThai).
  const MOD_TAG = '@꾸밈말';

  function parseGlossary(text) {
    const map = {};
    const mods = new Set(); // squash 한 한국어
    let inMod = false;
    for (const line of String(text || '').split('\n')) {
      const t = line.trim();
      if (t.startsWith('#')) {
        if (/^#\s*---/.test(t)) inMod = t.includes(MOD_TAG);
        continue;
      }
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = normKey(t.slice(0, i));
      const v = t.slice(i + 1).trim();
      if (!k || !v) continue;
      map[k] = v;
      if (inMod) mods.add(squash(k));
      else mods.delete(squash(k)); // 같은 말이 아래에 또 있으면 아래 칸을 따른다
    }
    return { map, mods };
  }

  // 확장(통합 번역)에서는 용어집 사본(몇 MB)을 탭마다 미리 읽지 않고 처음 쓸 때 읽는다(GM_lazyGet — extension/src/gm.js).
  // 2026-11-21 잰 것: 저장값 전체를 탭마다 읽어 한국어 뉴스 같은 탭 하나도 15~25MB 를 더 썼다. 몽키·번역 도우미에는
  // GM_lazyGet 이 없어서 예전처럼 바로 읽는다. 용어집을 쓰기 전에는 glossaryStoreLoad() 를 기다린다(ensureGlossary 가 한다).
  const gmLazyGet = (k, d) => (typeof GM_lazyGet === 'function' ? GM_lazyGet(k, d) : Promise.resolve(GM_getValue(k, d)));
  let glossaryStoreReady = typeof GM_lazyGet !== 'function';
  let glossaryStore = glossaryStoreReady ? GM_getValue(GLOSSARY_STORE, null) : null;
  let glossaryStoreRead = null;
  function glossaryStoreLoad() {
    if (glossaryStoreReady) return Promise.resolve();
    if (!glossaryStoreRead) {
      glossaryStoreRead = gmLazyGet(GLOSSARY_STORE, null)
        .then((v) => {
          if (!glossaryStore && v) {
            glossaryStore = v; // 읽는 사이에 새로 받았으면(refreshGlossary) 그쪽이 새것이다
            glossaryParsed = null;
          }
        })
        .catch(() => {})
        .finally(() => {
          glossaryStoreReady = true;
        });
    }
    return glossaryStoreRead;
  }
  let glossaryParsed = null; // 처음 쓸 때 해석한다 (normKey 가 쓰는 상수가 아직 정의 전이라)
  let glossaryLoading = null;
  // 받기에 실패하면 1분은 오래된 사본으로 그냥 쓴다. 쇼츠를 넘길 때마다·번역 묶음마다 다시 받으려 해서 실패가
  // 수십 줄 쌓였다(2026-11-01). 사본이 아예 없을 때(처음 설치)와 설정 창의 '새로 받기' 는 그대로 받는다.
  let glossaryFailedAt = 0;
  const GLOSSARY_RETRY_MS = 60 * 1000;

  function parsedGlossary() {
    if (!glossaryParsed) glossaryParsed = parseGlossary(glossaryStore && glossaryStore.text);
    return glossaryParsed;
  }
  function remoteGlossary() {
    return parsedGlossary().map;
  }
  function glossaryMods() {
    return parsedGlossary().mods;
  }

  // GitHub 에서 받아 사본을 갈아 끼운다. 실패하면 있던 사본을 그대로 쓴다.
  // 용어집은 몇 MB 까지 커질 수 있다(수만 개). 10분마다 통째로 받지 않도록 GitHub API 에
  // '가진 판(ETag)과 같으면 내용 없이 304' 를 요청한다. 304 는 API 사용 한도에도 안 센다.
  function refreshGlossary() {
    if (glossaryLoading) return glossaryLoading;
    glossaryLoading = (async () => {
      await glossaryStoreLoad(); // 가진 판(ETag)을 알아야 304 로 받는다
      for (const src of GLOSSARY_SOURCES) {
        try {
          const headers = { ...(src.headers || {}) };
          const conditional = src === GLOSSARY_SOURCES[0] && glossaryStore && glossaryStore.etag;
          if (conditional) headers['If-None-Match'] = glossaryStore.etag;
          const res = await requestFull({ method: 'GET', url: src.url, headers, timeout: 8000 });
          if (res.status === 304 && conditional) {
            glossaryStore = { ...glossaryStore, at: Date.now(), ver: SCRIPT_VERSION }; // 그대로다
            GM_setValue(GLOSSARY_STORE, glossaryStore);
            return true;
          }
          if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
          const parsed = parseGlossary(res.text);
          if (!Object.keys(parsed.map).length) throw new Error('내용이 비어 있습니다');
          const etag = src === GLOSSARY_SOURCES[0] ? res.etag : null;
          glossaryStore = { text: res.text, at: Date.now(), ver: SCRIPT_VERSION, etag };
          GM_setValue(GLOSSARY_STORE, glossaryStore);
          glossaryParsed = parsed;
          return true;
        } catch (e) {
          console.warn(`[${APP_NAME}] 용어집 받기 실패 (${src.url}):`, e.message);
        }
      }
      glossaryFailedAt = Date.now();
      return false;
    })().finally(() => {
      glossaryLoading = null;
    });
    return glossaryLoading;
  }

  // 검색 직전에 부른다. 사본이 없으면(처음 설치) 받을 때까지 기다리고,
  // 오래됐으면 지금 사본으로 바로 답하면서 뒤에서 새로 받는다.
  async function ensureGlossary() {
    await glossaryStoreLoad();
    if (!glossaryStore) {
      await refreshGlossary();
      return;
    }
    // 사본이 오래됐으면 새로 받는 것을 잠깐(1.5초까지) 기다린다. 뒤에서만 받게 두면
    // 다른 PC에서 고친 단어가 이번 검색에는 안 들어가고 한 번 더 틀린 채로 나간다.
    // 스크립트가 업데이트됐으면 사본이 몇 분 전 것이어도 새로 받는다. 새 스크립트가 용어집의
    // 새 표시(예: @꾸밈말)에 기대는데 옛 사본을 쓰면 업데이트가 안 된 것처럼 보인다
    // (1.12.0 에서 실제로 그랬다: 돼지막창 냉동 → แช่แข็ง ไส้ใหญ่หมู 가 그대로).
    const stale = Date.now() - glossaryStore.at > GLOSSARY_TTL || glossaryStore.ver !== SCRIPT_VERSION;
    if (stale && Date.now() - glossaryFailedAt > GLOSSARY_RETRY_MS) {
      await Promise.race([refreshGlossary(), new Promise((r) => setTimeout(r, 1500))]);
    }
  }

  function glossaryStatus() {
    if (!glossaryStore) return 'GitHub에서 아직 받지 못함';
    const n = Object.keys(remoteGlossary()).length;
    const at = new Date(glossaryStore.at).toLocaleString();
    const legacy = Object.keys(cfg.glossary || {}).length;
    return `${n}개 (GitHub, ${at} 받음)` + (legacy ? ` + 이 PC에만 있는 예전 단어 ${legacy}개` : '');
  }

  // ---------------------------------------------------------------------------
  // 용어집 저장 — 설정 패널 칸에 적은 단어를 GitHub glossary.txt 에 바로 커밋한다
  //
  // 저장에는 GitHub 토큰이 필요하다. 크롬의 GitHub 로그인은 github.com 웹페이지에서만
  // 통하고 스크립트가 빌려 쓸 수 없어서다. 토큰은 th-korean-glossary 저장소 하나, 내용 쓰기
  // 권한만 주도록 안내한다. 스크립트 저장소나, 이 계정에서 배포 파일을 올리는 다른 공개
  // 저장소까지 쓸 수 있는 토큰을 브라우저에 두면 새어 나갔을 때 피해가 거기까지 번진다.
  // 토큰은 이 PC 의 Tampermonkey 저장소에만 있고 api.github.com 에만 보낸다.
  // ---------------------------------------------------------------------------

  // 새 토큰 화면. 이름·대상·권한을 미리 채워 달라고 주소에 적는다(GitHub 가 모르는 값은 무시한다).
  const GITHUB_TOKEN_URL =
    'https://github.com/settings/personal-access-tokens/new' +
    `?name=${encodeURIComponent('th-korean 용어집')}` +
    `&description=${encodeURIComponent('통합 번역 - 설정 패널에서 용어집 저장')}` +
    `&target_name=${GLOSSARY_REPO.split('/')[0]}&contents=write`;

  // 번역 도우미(line-helper/, 윈도우 프로그램 — LINE PC·아무 창 Ctrl+Alt+K 화면 번역). 크롬은 PC 에 프로그램을
  // 깔거나 켤 수 없어서, 설치는 명령 한 줄을 복사해 주고(윈도우 키+R → Ctrl+V → Enter), 켜기는 도우미가 설치될 때
  // 이어 둔 th-korean-helper:// 주소를 연다(처음 한 번 크롬이 '열까요?' 를 묻는다).
  const HELPER_LINK = 'th-korean-helper://start';
  const HELPER_INSTALL =
    'powershell -NoExit -c "irm https://raw.githubusercontent.com/wotjq2/th-korean/main/line-helper/install.ps1 | iex"';
  // 번역 도우미 엔진(node)도 이 스크립트를 불러 쓴다 — node 18·20 에는 navigator 가 없다.
  const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent || '');

  // 클립보드에 글 넣기. 권한이 막힌 페이지면 옛 방식(execCommand)으로 한 번 더 해 본다.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 아래 옛 방식 */
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
  // 패널에서 추가한 새 단어가 모이는 칸. 파일 맨 끝에 한 번 만들고 그 뒤로 이어 붙인다.
  const ADDED_SECTION = '# --- 설정 패널에서 추가한 단어 ---';

  function githubHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  // GitHub 파일 내용은 base64 다. 한글·태국어가 깨지지 않게 UTF-8 바이트로 오간다.
  function b64ToUtf8(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  function utf8ToB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  // 패널 칸에 적은 글을 [한국어, 태국어] 목록으로. 형식이 틀린 줄은 따로 돌려준다.
  function parseEntries(text) {
    const map = new Map();
    const bad = [];
    for (const line of String(text || '').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const i = t.indexOf('=');
      const k = i > 0 ? normKey(t.slice(0, i)) : '';
      const v = i > 0 ? t.slice(i + 1).trim() : '';
      if (!k || !v) bad.push(t);
      else map.set(k, v); // 같은 말을 두 번 적으면 아래 것
    }
    return { entries: [...map], bad };
  }

  // glossary.txt 에 단어를 넣는다. 이미 있는 말은 그 줄의 뜻만 고치고(자리 유지),
  // 새 말은 맨 끝 '설정 패널에서 추가한 단어' 칸에 붙인다.
  function mergeIntoGlossary(text, entries) {
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const at = new Map(); // 같은 말이 두 번 있으면 실제로 쓰이는 아래 줄
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const eq = t.indexOf('=');
      if (eq > 0) at.set(normKey(t.slice(0, eq)), i);
    });
    const added = [];
    const changed = [];
    for (const [k, v] of entries) {
      const i = at.get(k);
      if (i === undefined) {
        added.push([k, v]);
      } else if (lines[i].slice(lines[i].indexOf('=') + 1).trim() !== v) {
        lines[i] = `${k}=${v}`;
        changed.push(k);
      }
    }
    if (added.length) {
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (!lines.some((l) => l.trim() === ADDED_SECTION)) lines.push('', ADDED_SECTION);
      for (const [k, v] of added) lines.push(`${k}=${v}`);
    }
    return {
      text: lines.join('\n').replace(/\n*$/, '\n'),
      added: added.map(([k]) => k),
      changed,
    };
  }

  // 언어마다 용어집 파일 하나. 태국어는 사람이 고른 glossary.txt(config 의 glossary-th-krdict.txt 는 사전이라 거기엔
  // 넣지 않는다), 다른 언어는 config.json 의 glossary-xx.txt. 설정 창 '용어집' 이 고른 언어의 파일에 저장한다.
  function glossaryFileOf(lang) {
    return !lang || lang.id === 'th' ? GLOSSARY_FILE : lang.glossary;
  }
  const GLOSSARY_EXAMPLE = {
    th: 'สำนักงาน', en: 'office', zh: '办公室', 'zh-TW': '辦公室', yue: '辦公室', ja: '事務所', vi: 'văn phòng', id: 'kantor',
    ms: 'pejabat', tl: 'opisina', es: 'oficina', pt: 'escritório', fr: 'bureau', de: 'Büro', it: 'ufficio', pl: 'biuro',
    tr: 'ofis', ru: 'офис', mn: 'оффис', ar: 'مكتب', he: 'משרד', hi: 'कार्यालय', km: 'ការិយាល័យ', lo: 'ຫ້ອງການ', my: 'ရုံး',
  };
  // 설정 창을 열 때 고를 언어: 메신저면 이 대화방 상대 언어, 쇼핑몰이면 그 나라 말, 외국어 페이지면 그 페이지 언어,
  // 아니면 번역 단추에서 고른 언어 → 지난번에 고른 언어 → 태국어.
  function glossaryDefaultLang(list) {
    const want = [];
    if (MESSENGER) want.push(chatTarget()?.id);
    want.push(GENERIC ? genericPageLang : SITE_LANG, typeLang, GM_getValue('glLang', ''), 'th');
    for (const w of want) {
      if (!w) continue;
      const hit = list.find((l) => l.id === w || l.mt === w) || list.find((l) => l.id === String(w).split('-')[0].toLowerCase());
      if (hit) return hit.id;
    }
    return list[0] ? list[0].id : 'th';
  }

  // GitHub 에서 지금 파일을 받아 합친 뒤 커밋한다. 이 PC 에는 바로 반영된다.
  async function saveGlossaryToGitHub(entries, file = GLOSSARY_FILE) {
    const token = (cfg.githubToken || '').trim();
    if (!token) throw new Error('GitHub 연결이 필요합니다');
    const headers = githubHeaders(token);
    const apiFile = `https://api.github.com/repos/${GLOSSARY_REPO}/contents/${file}`;
    for (let attempt = 0; ; attempt++) {
      const cur = JSON.parse(await request({ method: 'GET', url: `${apiFile}?ref=main`, headers }));
      // 1MB 가 넘는 파일은 JSON 에 내용이 빠지고 sha 만 온다. 그때는 원문을 따로 받는다.
      const text =
        cur.encoding === 'base64' && cur.content
          ? b64ToUtf8(cur.content)
          : await request({
              method: 'GET',
              url: `${apiFile}?ref=main`,
              headers: { ...headers, Accept: 'application/vnd.github.raw' },
            });
      const merged = mergeIntoGlossary(text, entries);
      if (merged.added.length || merged.changed.length) {
        const names = [...merged.added, ...merged.changed];
        const message =
          `용어집${file === GLOSSARY_FILE ? '' : ` (${file})`}: ${names.slice(0, 5).join(', ')}` + (names.length > 5 ? ` 외 ${names.length - 5}개` : '');
        try {
          await request({
            method: 'PUT',
            url: apiFile,
            headers: { ...headers, 'Content-Type': 'application/json' },
            data: JSON.stringify({ message, content: utf8ToB64(merged.text), sha: cur.sha, branch: 'main' }),
          });
        } catch (e) {
          // 다른 PC가 그 사이에 먼저 저장했다(파일 버전이 바뀜). 새로 받아 한 번 더 합친다.
          if (attempt === 0 && /HTTP 409/.test(e.message)) continue;
          throw e;
        }
      }
      if (file !== GLOSSARY_FILE) {
        // 다른 언어 용어집 — 이 PC 의 받아 둔 사본을 바로 바꾼다(다음 입력·메시지부터 쓴다).
        GM_setValue(`langGlossary:${file}`, { text: merged.text, at: Date.now() });
        langGlossaryMaps.delete(file);
        return merged;
      }
      glossaryStore = { text: merged.text, at: Date.now(), ver: SCRIPT_VERSION, etag: null };
      GM_setValue(GLOSSARY_STORE, glossaryStore);
      glossaryParsed = parseGlossary(merged.text);
      return merged;
    }
  }

  async function checkGitHubToken(token) {
    const me = JSON.parse(
      await request({ method: 'GET', url: 'https://api.github.com/user', headers: githubHeaders(token) })
    );
    return me.login;
  }

  function githubErrorMessage(e) {
    const m = String((e && e.message) || e);
    if (/HTTP 401/.test(m)) return '토큰이 맞지 않거나 기간이 끝났습니다. GitHub 연결에서 새 토큰을 넣으세요.';
    if (/HTTP 40[34]/.test(m)) {
      return '이 토큰에는 용어집 저장소 쓰기 권한이 없습니다. 토큰을 만들 때 저장소 th-korean-glossary, Contents: Read and write 를 고르세요.';
    }
    if (/HTTP 409/.test(m)) return '다른 PC에서 방금 용어집을 고쳤습니다. 저장을 한 번 더 눌러 주세요.';
    return m;
  }

  // ---------------------------------------------------------------------------
  // 설정 저장소
  // ---------------------------------------------------------------------------

  const cfg = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    cfg[k] = GM_getValue(k, v);
  }
  function saveCfg(key) {
    GM_setValue(key, cfg[key]);
  }

  function provider() {
    return PROVIDERS[cfg.aiProvider] || PROVIDERS.groq;
  }
  function aiKey() {
    return (cfg[provider().keyField] || '').trim();
  }
  function aiModel() {
    return cfg[provider().modelField] || '';
  }
  // 1.0.5 이전에는 엔진 값이 'groq' 였다. 'ai' 와 같은 뜻으로 받아준다.
  function usesAI(engineValue) {
    return engineValue === 'ai' || engineValue === 'groq';
  }

  // 1.9.0 부터 검색어 기본 경로는 '용어집 조합 → 빈 곳만 무료 API' 다. AI 는 검색마다
  // 몇 초씩 걸려 쓰기 답답했다. 예전 기본값(AI)으로 저장된 설치본도 한 번만 옮겨 준다.
  // 그 뒤에 설정에서 AI 를 다시 고르면 그대로 둔다.
  if (!GM_getValue('searchEngineMigrated190', false)) {
    if (usesAI(cfg.searchEngine)) {
      cfg.searchEngine = 'free';
      saveCfg('searchEngine');
    }
    GM_setValue('searchEngineMigrated190', true);
  }

  // ---------------------------------------------------------------------------
  // 번역 캐시 (같은 문구를 두 번 번역하지 않는다)
  // ---------------------------------------------------------------------------

  const CACHE_KEY = 'tmCache';
  const CACHE_MAX = 8000;
  let cache = GM_getValue(CACHE_KEY, {});
  let cacheDirty = false;

  // 1.9.1: 검색어 캐시('th|…')를 한 번 비운다. 용어집이 작던 시절 AI 가 낸 오역
  // (빗자루 → ด้ามไม้กวาด, 도시락 → อาหารกลางวัน)이 여기 남아 계속 되살아났다.
  // 페이지 표시 캐시('ko|…')는 그대로 둔다.
  if (!GM_getValue('searchCachePurged191', false)) {
    for (const k of Object.keys(cache)) if (k.startsWith('th|')) delete cache[k];
    GM_setValue(CACHE_KEY, cache);
    GM_setValue('searchCachePurged191', true);
  }
  // 1.28.8: 페이지 표시 캐시('ko|…')를 한 번 비운다. 줄바꿈으로 이어 보낸 묶음 번역의 짝이 밀려 엉뚱한 번역
  // (หูฟังไร้สาย(무선 이어폰) → '안녕하세요.')이 남아 라자다 검색 결과 제목에 계속 나왔다. 이제 묶음은 줄마다 따로 보낸다.
  if (!GM_getValue('pageCachePurged1288', false)) {
    for (const k of Object.keys(cache)) if (k.startsWith('ko|')) delete cache[k];
    GM_setValue(CACHE_KEY, cache);
    GM_setValue('pageCachePurged1288', true);
  }

  function cacheGet(text, to) {
    return cache[to + '|' + text];
  }
  function cacheSet(text, to, value) {
    cache[to + '|' + text] = value;
    cacheDirty = true;
  }
  setInterval(() => {
    if (!cacheDirty) return;
    cacheDirty = false;
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      // 오래된 절반을 버린다 (삽입 순서 기준).
      const trimmed = {};
      for (const k of keys.slice(keys.length - Math.floor(CACHE_MAX / 2))) trimmed[k] = cache[k];
      cache = trimmed;
    }
    GM_setValue(CACHE_KEY, cache);
  }, 2500);

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  function request(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        timeout: 20000,
        ...opts,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) resolve(r.responseText);
          else reject(new Error(`HTTP ${r.status}: ${String(r.responseText).slice(0, 200)}`));
        },
        onerror: () => reject(new Error('네트워크 오류')),
        ontimeout: () => reject(new Error('시간 초과')),
      });
    });
  }

  // 상태 코드와 ETag 까지 돌려준다. 304 처럼 2xx 가 아닌 답도 오류로 치지 않는다.
  function requestFull(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        timeout: 20000,
        ...opts,
        onload: (r) => {
          const m = /^etag:\s*(.+)$/im.exec(r.responseHeaders || '');
          resolve({ status: r.status, text: r.responseText, etag: m ? m[1].trim() : null });
        },
        onerror: () => reject(new Error('네트워크 오류')),
        ontimeout: () => reject(new Error('시간 초과')),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 무료 엔진 (키 불필요).
  // gtx 주소(translate_a/single)는 q 를 여러 개 줘도 첫 번째만 번역한다. 그래서 여러 줄은 dict-chrome-ex
  // 주소(translate_a/t)에 줄마다 q 를 하나씩 넣어 같은 차례의 배열로 받는다(freeAltMany). 줄바꿈으로 이어 보내는
  // 예전 방식은 줄 수가 맞아도 짝이 밀릴 수 있어(2026-11-04) 그 주소가 막혔을 때만 쓴다.
  // ---------------------------------------------------------------------------

  const FREE_CHUNK_ITEMS = 40;
  const FREE_CHUNK_CHARS = 700; // 태국어는 URL 인코딩 시 글자당 9바이트라 넉넉히 잡는다.

  // 무료 API가 요청을 거절하면 JSON 대신 HTML 안내 페이지를 돌려준다.
  // 짧은 시간에 수백 건을 보내면 실제로 발생하며, 보통 잠시 뒤 풀린다.
  class RateLimited extends Error {
    constructor() {
      super('무료 번역 API가 요청을 일시적으로 거절했습니다');
      this.rateLimited = true;
    }
  }
  let rateLimitNotified = 0;
  let rateLimitUntil = 0;        // 이 시각까지는 페이지 번역을 쉬게 한다
  const RATE_LIMIT_COOLDOWN = 45000;

  // 구글이 막혔을 때의 안내. 크롬 내장 번역기를 누름 한 번으로 켤 수 있으면 그 단추가 된다(builtinEnable).
  // 예전 안내('설정에서 엔진을 Groq으로')는 키가 없는 대부분의 사용자에게 할 수 있는 일이 아니었다(2026-11-21).
  function noteRateLimit() {
    rateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN;
    const now = Date.now();
    if (now - rateLimitNotified < 30000) return;
    rateLimitNotified = now;
    if (builtinWant) {
      const { from, to } = builtinWant;
      toastAction(
        '구글 번역이 잠시 막혔습니다.\n' +
          `▶ 여기를 누르면 크롬 내장 번역기로 계속 옮깁니다 (${builtinName(from)} → ${builtinName(to)}, 이 PC 안에서 번역).`,
        15000,
        builtinEnable
      );
      return;
    }
    toast(
      '구글 번역이 잠시 막혔습니다.\n' +
        `${RATE_LIMIT_COOLDOWN / 1000}초 뒤 다시 해 봅니다. 용어집에 있는 말은 그대로 됩니다.` +
        (builtinMissing ? `\n(${builtinName(builtinMissing)}: 크롬 내장 번역기에 없는 언어라 구글이 풀릴 때까지 기다립니다 — 보통 몇 분~몇 시간)` : ''),
      7000
    );
  }

  // 구글이 gtx 를 막으면(429 "Sorry…" 페이지, 2026-10-27 이 PC — 화면 번역이 한 줄도 못 덮고 페이지 번역도 멈췄다)
  // 같은 서버의 dict-chrome-ex 주소는 그대로 됐다. 줄바꿈으로 이은 글도 줄 순서대로 돌려준다.
  // 막힌 걸 한 번 보면 10분 동안은 gtx 를 건너뛰고 바로 이쪽으로 묻는다.
  let gtxBlockedUntil = 0;
  const isBlocked = (e) => e.rateLimited || /^HTTP 429/.test(e.message);

  // 두 주소를 원격 설정(config.json 의 translate.order)의 차례로 써 본다. 구글이 한쪽을 막으면(2026-10-27 gtx 429)
  // 설정만 바꿔 다른 쪽을 먼저 쓰게 한다 — 스크립트·확장을 다시 올리지 않는다.
  // 구글이 둘 다 막혔거나 인터넷이 안 되면 끝으로 크롬 내장 번역기(builtin)를 쓴다. order 에 'builtin' 을 적으면 그 차례에
  // (예: 구글이 오래 막히면 config.json 에서 ['builtin', 'dict', 'gtx'] — 심사 없이). opt.builtin === false 면 구글만.
  async function freeRaw(text, from, to, timeout, opt = {}) {
    const order = RC.translate.order.includes('builtin') ? RC.translate.order : [...RC.translate.order, 'builtin'];
    let fail = null; // 구글이 막혔으면 RateLimited, 다른 까닭(인터넷 끊김·시간 초과)이면 그 오류
    for (let i = 0; i < order.length; i++) {
      if (order[i] === 'builtin') {
        if (opt.builtin === false) continue;
        const out = await builtinTranslate(text, from, to);
        if (out != null) {
          if (fail) noteBuiltinUsed();
          freeLastWay = 'builtin';
          return out;
        }
        continue;
      }
      if (fail && !fail.rateLimited) continue; // 인터넷이 안 되면 다른 구글 주소도 안 된다 — 내장 번역기만 본다
      const gtx = order[i] === 'gtx';
      if (gtx && Date.now() < gtxBlockedUntil && i < order.length - 1) continue;
      try {
        const out = await (gtx ? freeGtx : freeAlt)(text, from, to, timeout);
        freeLastWay = 'google';
        return out;
      } catch (e) {
        if (isBlocked(e)) {
          if (gtx) gtxBlockedUntil = Date.now() + 10 * 60 * 1000;
          fail = new RateLimited();
        } else fail = e;
      }
    }
    throw fail || new RateLimited();
  }

  // ---------------------------------------------------------------------------
  // 크롬 내장 번역기(Translator API, 크롬 138+) — 구글이 막히거나 인터넷이 안 될 때의 예비 길(1.35.4, 4번).
  // 이 PC 안에서 옮긴다(글이 밖으로 나가지 않는다). 2026-11-21 크롬 157 에서 잰 것: 한국어와 태·영·중(간체·번체)·일·베·
  // 인니·힌디·스페인·아랍·프랑스·벵골·포르투갈·러시아·독일·마라티·텔루구·터키·타밀·히브리·폴란드·이탈리아어는 되고, 우르두·
  // 광둥·몽골·말레이·필리핀·크메르·라오·미얀마어는 없다. 한 줄 1~36 ms. 언어 모델은 처음 한 번 받는다(한→태 약 17초).
  // 크롬은 사이트마다 '누름' 한 번이 있어야 그 언어 쌍을 켜 준다(사용자 언어 목록 밖 — 개인정보 보호). 한 번 켜면 그 사이트에서는
  // 새로 고쳐도 누름 없이 된다. 그래서 Enter·누름 중이면 바로 켜고, 아니면 막힘 안내를 누를 때 켠다(builtinEnable).
  // 몽키·번역 도우미에는 Translator 가 없어 이 길은 쉰다.
  // ---------------------------------------------------------------------------
  const BUILTIN_OK = typeof Translator !== 'undefined';
  const builtinTr = new Map(); // '쌍' → 약속(번역기 또는 null)
  const builtinNone = new Set(); // 내장 번역기에 없는 쌍
  let builtinWant = null; // 누르면 켤 쌍 { from, to }
  let builtinMissing = ''; // 내장 번역기에 없는 언어(안내용)
  let builtinUsedNotified = 0;
  let builtinDetector = null;
  const builtinCode = (c) => {
    c = String(c || '');
    return c === 'yue' ? 'zh-TW' : c === 'iw' ? 'he' : c === 'fil' ? 'tl' : c;
  };
  function builtinName(c) {
    const l = RC.languages.find((x) => x.mt === c || x.id === c);
    if (l) return langName(l);
    try {
      return new Intl.DisplayNames([MY], { type: 'language' }).of(c) || c; // 내 언어(한국어 등)는 목록에 없다
    } catch {
      return c;
    }
  }
  // 마지막 무료 번역이 어느 길이었나 — 검색 안내 '(…)' 에 그대로 보인다(내장 번역기였으면 그렇다고).
  let freeLastWay = '';
  const freeLabel = (google = '무료 API') => (freeLastWay === 'builtin' ? '크롬 내장 번역기' : google);
  // 원문 언어. 'auto' 면 글자로(태·일·한·중·히브리·크메르…), 로마자면 크롬 언어 알아보기(받아 둔 때만), 그래도 모르면 페이지 언어.
  async function builtinSource(text, from, usePageLang = true) {
    if (from && from !== 'auto') return from;
    const s = chatScriptLang(text);
    if (s) return s;
    if (/[Ѐ-ӿ]/.test(text)) return 'ru';
    if (/[؀-ۿ]/.test(text)) return 'ar';
    if (/[ऀ-ॿ]/.test(text)) return 'hi';
    if (typeof LanguageDetector !== 'undefined') {
      try {
        if (!builtinDetector && (await LanguageDetector.availability()) === 'available') builtinDetector = LanguageDetector.create();
        if (builtinDetector) {
          const [top] = await (await builtinDetector).detect(text);
          if (top && top.confidence >= 0.5 && top.detectedLanguage !== 'und') return top.detectedLanguage;
        }
      } catch {
        builtinDetector = null;
      }
    }
    if (!usePageLang) return '';
    const pl = String(document.documentElement.lang || '').split('-')[0].toLowerCase();
    return /^[a-z]{2}$/.test(pl) ? pl : '';
  }
  function builtinGet(from, to) {
    const key = `${from}>${to}`;
    if (builtinNone.has(key)) return Promise.resolve(null);
    if (builtinTr.has(key)) return builtinTr.get(key);
    const job = (async () => {
      let a = 'unavailable';
      try {
        a = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
      } catch {
        /* 크롬이 모르는 언어 코드 */
      }
      if (a === 'unavailable') {
        builtinNone.add(key);
        builtinMissing = [from, to].find((c) => c.split('-')[0] !== MY2) || to;
        return null;
      }
      // 아직 이 사이트에서 안 켠 쌍은 누름(Enter·누름) 중에만 켤 수 있다.
      if (a !== 'available' && !(navigator.userActivation && navigator.userActivation.isActive)) {
        builtinWant = { from, to };
        return null;
      }
      return Translator.create({
        sourceLanguage: from,
        targetLanguage: to,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            if (e.loaded < 1) toast(`크롬 내장 번역기를 받는 중 (${builtinName(from)} → ${builtinName(to)}) ${Math.round(e.loaded * 100)}%\n처음 한 번만 받습니다.`, 4000);
          });
        },
      });
    })()
      .catch(() => null)
      .then((t) => {
        if (!t) builtinTr.delete(key);
        else if (builtinWant && builtinWant.from === from && builtinWant.to === to) builtinWant = null;
        return t;
      });
    builtinTr.set(key, job);
    return job;
  }
  async function builtinTranslate(text, from, to) {
    if (!BUILTIN_OK || !text || !String(text).trim()) return null;
    const src = builtinCode(await builtinSource(text, from));
    const dst = builtinCode(to);
    if (!src || !dst) return null;
    if (src === dst) return text;
    const t = await builtinGet(src, dst);
    if (!t) return null;
    try {
      return await t.translate(src === 'ko' ? koPrep(text) : text);
    } catch {
      return null;
    }
  }
  // 여러 줄. 첫 줄부터 안 되면(켜지 않은 쌍·없는 언어) null — 그때는 막힘 안내로 간다.
  async function builtinMany(lines, from, to) {
    if (!BUILTIN_OK) return null;
    const out = [];
    for (const l of lines) {
      const r = await builtinTranslate(l, from, to);
      if (r == null && !out.length) return null;
      out.push(r);
    }
    return out;
  }
  function noteBuiltinUsed() {
    const now = Date.now();
    if (now - builtinUsedNotified < 60000) return;
    builtinUsedNotified = now;
    toast('구글 번역이 잠시 막혀 크롬 내장 번역기로 옮기고 있습니다(이 PC 안에서 번역).\n구글이 풀리면 저절로 돌아갑니다.', 5000);
  }
  // 막힘 안내를 눌렀을 때(그 누름으로 크롬이 쌍을 켜 준다).
  function builtinEnable() {
    const w = builtinWant;
    if (!w) return;
    toast(`크롬 내장 번역기를 켜는 중… (${builtinName(w.from)} → ${builtinName(w.to)})`, 20000);
    builtinGet(w.from, w.to).then((t) => {
      if (!t) {
        toast('크롬 내장 번역기를 켜지 못했습니다. 크롬을 최신으로 올린 뒤 다시 해 보세요.', 6000);
        return;
      }
      rateLimitUntil = 0;
      rateLimitNotified = 0;
      toast('크롬 내장 번역기를 켰습니다. 이 사이트에서는 구글이 막혀도 이것으로 옮깁니다.', 5000);
      if (!GENERIC) translatePage();
    });
  }

  async function freeGtx(text, from, to, timeout) {
    if (koSource(from, text)) text = koPrep(text); // 한국어 다듬기(30개 언어 공통)
    const url = `${FREE_ENDPOINT}?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const body = await request({ method: 'GET', url, ...(timeout ? { timeout } : {}) });
    if (!body.trimStart().startsWith('[')) throw new RateLimited();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new RateLimited();
    }
    if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('응답 형식 오류');
    return data[0].map((seg) => (seg && seg[0]) || '').join('');
  }

  // 답: sl=auto 면 [["번역", "en"]], 언어를 정해 주면 ["번역"].
  async function freeAlt(text, from, to, timeout) {
    if (koSource(from, text)) text = koPrep(text);
    const url = `${FREE_ALT_ENDPOINT}?client=dict-chrome-ex&sl=${from}&tl=${to}&q=${encodeURIComponent(text)}`;
    const body = await request({ method: 'GET', url, ...(timeout ? { timeout } : {}) });
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new RateLimited();
    }
    const first = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : null;
    if (typeof first !== 'string') throw new Error('응답 형식 오류');
    return first;
  }

  async function freeTranslateOne(text, from, to) {
    return freeRaw(text, from, to);
  }

  // 여러 줄을 한 번에 — dict-chrome-ex 는 q 를 여러 개 받아 같은 차례의 배열로 돌려준다(sl=auto 면 [["번역", "th"], …]).
  // 줄바꿈으로 이어 보내면 구글이 줄을 합치고 나눠, 줄 수는 맞는데 짝이 밀린 채 캐시에 남았다(2026-11-04
  // 라자다 검색 결과 제목 หูฟังไร้สาย(무선 이어폰) → 앞줄 인사말의 '안녕하세요.').
  let dictBlockedUntil = 0;
  async function freeAltMany(lines, from, to, timeout) {
    lines = lines.map((l) => (koSource(from, l) ? koPrep(l) : l));
    const url = `${FREE_ALT_ENDPOINT}?client=dict-chrome-ex&sl=${from}&tl=${to}&` + lines.map((l) => `q=${encodeURIComponent(l)}`).join('&');
    const body = await request({ method: 'GET', url, ...(timeout ? { timeout } : {}) });
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new RateLimited();
    }
    if (!Array.isArray(data) || data.length !== lines.length) throw new Error('응답 형식 오류');
    return data.map((d) => (Array.isArray(d) ? d[0] : d)).map((s) => (typeof s === 'string' ? s : ''));
  }

  function chunkForFree(texts) {
    const chunks = [];
    let current = [];
    let size = 0;
    texts.forEach((t, i) => {
      if (current.length >= FREE_CHUNK_ITEMS || (size + t.length > FREE_CHUNK_CHARS && current.length)) {
        chunks.push(current);
        current = [];
        size = 0;
      }
      current.push(i);
      size += t.length + 1;
    });
    if (current.length) chunks.push(current);
    return chunks;
  }

  async function freeTranslateMany(texts, from, to) {
    const out = new Array(texts.length).fill(null);
    // 줄 단위로 묶기 때문에 원문 안의 줄바꿈은 공백으로 눕힌다.
    const flat = texts.map((t) => t.replace(/\s*\n+\s*/g, ' '));
    const chunks = chunkForFree(flat);

    await runPool(chunks, 4, async (idxs) => {
      const lines = idxs.map((i) => flat[i]);
      if (Date.now() >= dictBlockedUntil) {
        try {
          const parts = await freeAltMany(lines, from, to);
          idxs.forEach((orig, k) => {
            out[orig] = parts[k].trim();
          });
          return;
        } catch (e) {
          // 막혔으면 10분 동안은 이 주소를 건너뛰고 아래(이어 보내기 → 줄 수가 어긋나면 하나씩)로 간다.
          if (isBlocked(e)) dictBlockedUntil = Date.now() + 10 * 60 * 1000;
        }
      }
      try {
        // 이어 보내기는 구글만 — 내장 번역기는 줄마다 옮긴다(아래).
        const joined = await freeRaw(lines.join('\n'), from, to, undefined, { builtin: false });
        const parts = joined.split('\n');
        if (parts.length === lines.length) {
          idxs.forEach((orig, k) => {
            out[orig] = parts[k].trim();
          });
          return;
        }
        // 줄 수가 어긋났다 — 이 묶음만 하나씩 처리한다.
      } catch (e) {
        if (e.rateLimited) {
          // 구글이 막혔다 — 크롬 내장 번역기로 줄마다. 그것도 안 되면(켜지 않은 쌍·없는 언어) 이 묶음은 포기한다.
          // 거절당한 상태에서 구글에 하나씩 다시 물으면 상황만 나빠진다.
          const viaBuiltin = await builtinMany(lines, from, to);
          if (viaBuiltin) {
            noteBuiltinUsed();
            freeLastWay = 'builtin';
            idxs.forEach((orig, k) => {
              out[orig] = viaBuiltin[k] ? viaBuiltin[k].trim() : null;
            });
            return;
          }
          noteRateLimit();
          return;
        }
      }
      const singles = await runPool(lines, 4, async (line) => {
        try {
          return await freeRaw(line, from, to);
        } catch (err) {
          if (err.rateLimited) noteRateLimit();   // runPool 이 오류를 삼키므로 여기서 알린다
          throw err;
        }
      });
      idxs.forEach((orig, k) => {
        out[orig] = singles[k] ? singles[k].trim() : null;
      });
    });

    return out;
  }

  async function runPool(items, limit, worker) {
    const out = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try {
          out[i] = await worker(items[i], i);
        } catch {
          out[i] = null;
        }
      }
    });
    await Promise.all(runners);
    return out;
  }

  // ---------------------------------------------------------------------------
  // AI 엔진 (정확도용). Groq 과 NVIDIA NIM 모두 OpenAI 호환이라 같은 코드로 부른다.
  // ---------------------------------------------------------------------------

  async function aiChat(messages, { json = false, temperature = 0.2 } = {}) {
    const p = provider();
    const key = aiKey();
    if (!key) throw new Error(`${p.label} API 키가 설정되지 않았습니다`);
    const payload = {
      model: aiModel(),
      messages,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    };
    const body = await request({
      method: 'POST',
      url: `${p.base}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      data: JSON.stringify(payload),
    });
    const data = JSON.parse(body);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error(`${p.label} 응답이 비어 있습니다`);
    return content;
  }

  async function aiListModels() {
    const p = provider();
    const body = await request({
      method: 'GET',
      url: `${p.base}/models`,
      headers: { Authorization: `Bearer ${aiKey()}` },
    });
    return (JSON.parse(body).data || []).map((m) => m.id).sort();
  }

  // 프롬프트는 사이트 이름을 SITE 에서 받아 쓴다. 사이트를 추가해도 문구를 고칠 일이 없다.
  const SEARCH_SYSTEM = [
    `당신은 ${SITE.label} 태국(${SITE.host}) 검색창에 넣을 쇼핑 검색어를 한국어에서 태국어로 옮깁니다.`,
    '규칙:',
    '- 태국어 검색어만 출력합니다. 설명, 따옴표, 로마자 표기를 붙이지 마세요.',
    '- 태국 온라인 쇼핑객이 실제로 입력하는 표현을 쓰세요. 문어체나 사전식 직역은 피합니다.',
    '- 브랜드명, 모델명, 숫자, 규격, 단위는 원문 그대로 둡니다 (예: iPhone 15 Pro, USB-C, XL, 500ml).',
    '- 태국 쇼핑객이 영어로 검색하는 제품군은 영어를 그대로 둡니다.',
    '- 드문 동의어 대신 검색 결과가 많이 나오는 일반적인 카테고리 단어를 고르세요.',
    // 실제로 겪은 오역 두 가지. 원인이 같아 규칙으로 못 박아 둔다.
    '- 검색하는 사람은 물건을 사려는 것입니다. 한국어가 음식·행위·상태도 뜻할 수 있으면 파는 물건 쪽으로 옮기세요. 예: 도시락 → กล่องข้าว(통)이지 อาหารกลางวัน(점심 끼니)이 아닙니다.',
    '- 합성어를 글자 단위로 쪼개지 마세요. 물건 전체를 가리키는 말을 쓰세요. 예: 빗자루 → ไม้กวาด 이지 ด้ามไม้กวาด(빗자루의 자루=손잡이)가 아닙니다.',
    '- 그 말만으로 상품이 특정되지 않는 너무 넓은 단어는 피하세요. 예: 거치대 → ที่วางโทรศัพท์ 이지 ที่วาง("놓는 자리")가 아닙니다.',
  ].join('\n');

  const PAGE_SYSTEM = [
    SITE_LANG2 === 'th'
      ? `당신은 ${SITE.label} 태국 쇼핑몰의 태국어/영어 텍스트를 한국어로 옮깁니다.`
      : `당신은 ${SITE.label} 쇼핑몰(${SITE.host})의 외국어 텍스트를 한국어로 옮깁니다.`,
    '입력은 {"in": ["...", "..."]} 형태의 JSON입니다.',
    '출력은 {"out": ["...", "..."]} 형태의 JSON이며, 길이와 순서가 입력과 같아야 합니다.',
    '규칙:',
    '- 상품명, 카테고리명, 버튼 문구입니다. 한국 쇼핑몰에서 쓰는 말투로 짧게 옮기세요.',
    '- 브랜드명, 모델명, 숫자, 단위, 규격은 그대로 둡니다.',
    '- 설명이나 주석을 덧붙이지 마세요.',
    '- 이미 한국어이거나 숫자/기호뿐인 문자열은 그대로 돌려주세요.',
  ].join('\n');

  const ONE_SYSTEM = [
    SITE_LANG2 === 'th'
      ? `당신은 ${SITE.label} 태국 쇼핑몰의 태국어/영어 문구를 한국어로 옮깁니다.`
      : `당신은 ${SITE.label} 쇼핑몰(${SITE.host})의 외국어 문구를 한국어로 옮깁니다.`,
    '규칙:',
    '- 번역문만 출력합니다. 설명, 따옴표, 원문 재출력 금지.',
    '- 상품명입니다. 한국 쇼핑몰에서 쓰는 말투로 자연스럽게 옮기세요.',
    '- 브랜드명, 모델명, 숫자, 단위, 규격은 그대로 둡니다.',
    '- 판매자가 끼워 넣은 과장 문구나 키워드 나열도 뜻이 통하게 정리해 주세요.',
  ].join('\n');

  // 선택 번역용. 페이지 전체는 크롬에 맡기고 헷갈리는 문구만 정확히 본다.
  async function translateSelection(text) {
    if (!MY_KO) return { ko: await freeTranslateOne(text, 'auto', MY), via: '무료 API' };
    if (aiKey()) {
      try {
        const out = await aiChat(
          [
            { role: 'system', content: ONE_SYSTEM },
            { role: 'user', content: text },
          ],
          { temperature: 0.2 }
        );
        if (out && out.trim()) return { ko: out.trim(), via: provider().label };
      } catch (e) {
        console.warn(`[${APP_NAME}] ${provider().label} 선택 번역 실패, 무료 엔진으로 대체:`, e.message);
      }
    }
    const out = await freeTranslateOne(text, 'auto', 'ko');
    return { ko: out, via: '무료 API' };
  }

  async function aiTranslateBatch(texts) {
    const content = await aiChat(
      [
        { role: 'system', content: PAGE_SYSTEM },
        { role: 'user', content: JSON.stringify({ in: texts }) },
      ],
      { json: true }
    );
    const parsed = JSON.parse(content);
    const out = parsed.out || parsed.result || parsed.translations;
    if (!Array.isArray(out) || out.length !== texts.length) {
      throw new Error('AI 배치 길이가 맞지 않습니다');
    }
    return out.map((s) => (typeof s === 'string' ? s : ''));
  }

  // ---------------------------------------------------------------------------
  // 통합 번역 (캐시 → 엔진 → 폴백)
  // ---------------------------------------------------------------------------

  // 이름은 예전 그대로지만 '내 언어'(MY)로 옮긴다. 한국어가 아니면 고정 용어(태국어→한국어)·AI(한국어 지시문)는 건너뛴다.
  // from: 원문 언어를 알면(화면 자막의 로마자 언어 등) — 기본은 구글이 알아본다.
  async function translateToKorean(texts, from = 'auto') {
    const result = new Array(texts.length);
    const pending = [];
    const pinned = MY_KO ? { ...SEED_PAGE_GLOSSARY, ...cfg.pageGlossary } : {};

    texts.forEach((t, i) => {
      if (pinned[t] !== undefined) {         // 고정 용어가 최우선 (브랜드명 등)
        result[i] = pinned[t];
        return;
      }
      const hit = cacheGet(t, MY);
      if (hit !== undefined) result[i] = hit;
      else pending.push(i);
    });
    if (!pending.length) return result;

    const pendingTexts = pending.map((i) => texts[i]);
    let translated = null;

    if (MY_KO && usesAI(cfg.pageEngine) && aiKey()) {
      try {
        translated = [];
        for (let i = 0; i < pendingTexts.length; i += 20) {
          const chunk = pendingTexts.slice(i, i + 20);
          translated.push(...(await aiTranslateBatch(chunk)));
        }
      } catch (e) {
        console.warn(`[${APP_NAME}] ${provider().label} 페이지 번역 실패, 무료 엔진으로 대체:`, e.message);
        translated = null;
      }
    }

    if (!translated) {
      translated = await freeTranslateMany(pendingTexts, from, MY);
    }

    pending.forEach((originalIndex, k) => {
      const value = translated[k];
      if (value && value !== texts[originalIndex]) {
        cacheSet(texts[originalIndex], MY, value);
        result[originalIndex] = value;
      } else {
        result[originalIndex] = value || null;
      }
    });
    return result;
  }

  const SEARCH_FREE_TIMEOUT = 6000; // 검색은 사람이 기다리는 중이라 페이지 번역보다 짧게 끊는다

  // 검색어 번역. 빠른 것부터 본다.
  //   1) 용어집 — 통째로 있거나, 용어집 단어로 다 쪼개지면 여기서 끝난다(API 없음)
  //   2) 캐시 — 전에 번역한 검색어
  //   3) 용어집에 없는 말 — 기본은 그 조각만 무료 API 로 채운다. 'AI' 를 고르면 통째로 AI.
  // 무료 API(구글 번역)는 빠르지만 영어를 거쳐 다른 뜻으로 옮기는 일이 잦다(가방 → ถุง).
  // 그래서 용어집을 먼저 보고, 무료 API 에는 용어집이 못 덮은 조각만 맡긴다.
  async function translateSearchKeyword(korean) {
    const trimmed = normKey(korean);
    // 내 언어가 한국어가 아니면 용어집(한국어=태국어)은 맞지 않는다 — 구글로 내 말 → 태국어.
    if (!MY_KO) {
      const crossed = await crossLookup(trimmed, MY2, 'th');
      if (crossed) return { thai: crossed, via: '사전' };
      const hit = cacheGet(MY + '>' + trimmed, 'th');
      if (hit) return { thai: hit, via: '저장' };
      const th = (await freeRaw(trimmed, 'auto', 'th', SEARCH_FREE_TIMEOUT)).trim();
      if (th && th !== trimmed) cacheSet(MY + '>' + trimmed, 'th', th);
      return { thai: th, via: '번역' };
    }

    await ensureGlossary();
    const glossary = buildGlossary();
    if (glossary[trimmed]) return { thai: glossary[trimmed], via: '용어집' };

    const { pieces, unknown } = composeFromGlossary(trimmed);
    if (!unknown.length) {
      const thai = assembleThai(pieces);
      const used = pieces.filter((p) => p.kind === 'glossary' || p.kind === 'literal').length;
      if (thai) return { thai, via: used > 1 ? '용어집 조합' : '용어집' };
    }

    // glossary.txt 로 다 못 옮긴 말이 통째로 한국어기초사전에 있으면 그 값. 조각만 구글에 묻는 것보다 낫다.
    const dict = await thaiDictLookup(trimmed);
    if (dict) return { thai: dict, via: '사전' };

    const known = pieces.filter((p) => p.kind === 'glossary');

    // AI — 쇼핑 검색어 맥락을 아는 번역. 느리므로 사용자가 고른 경우에만.
    if (usesAI(cfg.searchEngine) && aiKey()) {
      const cached = cacheGet(trimmed, 'th');
      if (cached) return { thai: cached, via: '캐시' };
      // 용어집에 걸린 말은 AI 에게도 못 박아 둔다. 안 그러면 '실내 빗자루' 를 통째로 받은
      // AI 가 빗자루를 또 ด้ามไม้กวาด(자루=손잡이)로 옮긴다.
      const pinned = known.length
        ? '\n- 다음 말은 반드시 이 태국어로 옮기세요: ' + known.map((p) => `${p.ko}=${p.th}`).join(', ')
        : '';
      try {
        const out = (await aiChat(
          [
            { role: 'system', content: SEARCH_SYSTEM + pinned },
            { role: 'user', content: trimmed },
          ],
          { temperature: 0 }
        )).trim().replace(/^["'`]+|["'`]+$/g, '');
        if (out) {
          cacheSet(trimmed, 'th', out);
          return { thai: out, via: provider().label };
        }
      } catch (e) {
        console.warn(`[${APP_NAME}] ${provider().label} 검색어 번역 실패, 무료 엔진으로 대체:`, e.message);
      }
    }

    // 용어집에 걸린 말이 있으면 모르는 조각만 옮겨 끼운다. 조각이 짧아 요청 한 번이면 된다.
    // 검색어 통째 캐시는 보지 않는다. 캐시에는 용어집을 고치기 전 AI 가 낸 답(빗자루 →
    // ด้ามไม้กวาด 같은)이 남아 있을 수 있는데, 그걸 꺼내면 용어집을 고쳐도 소용이 없다.
    if (known.length) {
      await fillUnknown(unknown);
      const thai = assembleThai(pieces);
      if (thai) {
        const filled = unknown.filter((p) => p.th);
        const dropped = unknown.filter((p) => !p.th);
        const notes = [];
        if (filled.length) {
          notes.push(
            '용어집에 없던 말: ' + filled.map((p) => `${p.ko} → ${p.th}`).join(', ') +
              '\n(자주 쓰면 한 버튼 → 검색 용어집 칸에 적고 저장하세요)'
          );
        }
        if (dropped.length) notes.push('번역하지 못해 뺀 말: ' + dropped.map((p) => p.ko).join(', '));
        return {
          thai,
          via: filled.length ? `용어집 + ${freeLabel()}` : '용어집',
          note: notes.join('\n'),
        };
      }
    }

    // 용어집에 걸리는 말이 하나도 없다 — 캐시, 없으면 통째로 무료 API.
    const cached = cacheGet(trimmed, 'th');
    if (cached) return { thai: cached, via: '캐시' };
    const out = await freeRaw(trimmed, 'ko', 'th', SEARCH_FREE_TIMEOUT);
    if (out) cacheSet(trimmed, 'th', out);
    return { thai: out, via: freeLabel() };
  }

  // 이 쇼핑몰 말(SITE_LANG)의 언어 항목 — 언어 목록(config.json languages)에 없는 말이면 구글 코드만으로.
  function siteLangObj() {
    return (
      TYPE_LANGS.find((l) => l.id === SITE_LANG) ||
      TYPE_LANGS.find((l) => l.mt === SITE_LANG) || { id: SITE_LANG, mt: SITE_LANG, name: SITE_LANG, label: SITE_LANG2, glossary: '' }
    );
  }

  // 쇼핑몰 검색어 → 그 쇼핑몰의 말. 태국은 예전 그대로(용어집 조합·사전·AI). 다른 나라 쇼피·라자다는 입력칸 막대와 같은 길 —
  // 그 언어 용어집(한국어=그 언어, 통째로 맞을 때) → 구글. 결과 칸 이름(thai)은 예전 그대로 둔다.
  async function translateShopQuery(value) {
    if (SITE_LANG2 === 'th') return translateSearchKeyword(value);
    return koreanToLang(normKey(value), siteLangObj());
  }

  // 용어집에 없는 조각만 무료 API 로 옮긴다. 여러 조각은 조각마다 따로 넣어 한 번에 보내고 같은 차례로 받는다
  // (freeAltMany — 줄바꿈으로 이어 보내면 짝이 밀린 채 캐시에 남을 수 있다). 그 주소가 막혔으면 하나씩 묻는다.
  // 실패한 조각은 비워 둔다 — 그러면 검색은 용어집에 걸린 말만으로 나간다.
  async function fillUnknown(unknown) {
    const need = [];
    for (const p of unknown) {
      const hit = cacheGet(p.ko, 'th');
      if (hit) p.th = hit;
      else need.push(p);
    }
    if (!need.length) return;
    let lines = null;
    if (Date.now() >= dictBlockedUntil) {
      try {
        lines = await freeAltMany(need.map((p) => p.ko), 'ko', 'th', SEARCH_FREE_TIMEOUT);
      } catch (e) {
        if (isBlocked(e)) dictBlockedUntil = Date.now() + 10 * 60 * 1000;
        console.warn(`[${APP_NAME}] 검색어 조각을 한 번에 옮기지 못해 하나씩 묻습니다:`, e.message);
      }
    }
    if (!lines) {
      lines = await Promise.all(
        need.map((p) => freeRaw(p.ko, 'ko', 'th', SEARCH_FREE_TIMEOUT).catch(() => ''))
      );
    }
    need.forEach((p, k) => {
      const th = (lines[k] || '').trim();
      if (th && !HANGUL.test(th)) {
        p.th = th;
        cacheSet(p.ko, 'th', th);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 페이지 표시 번역
  // ---------------------------------------------------------------------------

  const originalText = new Map(); // Node -> 원문
  let seen = new WeakSet(); // 내 언어를 바꾸면 새로 만든다(다시 옮기게 — applyMyLang)
  let showingOriginal = false;

  function isTranslatable(node) {
    if (seen.has(node)) return false;
    const raw = node.nodeValue;
    if (!raw) return false;
    const t = raw.trim();
    if (t.length < 2 || t.length > 300) return false;
    // 이미 한국어(내 언어). 일본어 사용자에게 대만 쇼피의 한자뿐인 글은 내 말이 아니다(가나가 없다).
    if (isMyText(t) && !(MY2 === 'ja' && SITE_LANG2 === 'zh' && !/[぀-ヿ]/.test(t))) return false;
    // 쇼핑몰 말의 글자(태국어, 대만 쇼피의 한자). 표에 없는 사이트·태국 쇼핑몰은 예전처럼 태국어.
    const own = THAI.test(t) || !!(SITE_SCRIPT && SITE_SCRIPT.test(t));
    if (!own && !LATIN_WORD.test(t)) return false; // 숫자·기호·통화만
    // 내 언어가 로마자 언어일 때 로마자 글: 영어 사용자면 태국·대만 쇼핑몰의 영어 글은 그대로(예전 그대로), 쇼핑몰 말이 곧 내 말이면
    // (멕시코 쇼피의 스페인어 사용자, 싱가포르 쇼피의 영어 사용자) 옮길 것이 없다.
    if (!own && !MY_SCRIPT && ((MY2 === 'en' && SITE_SCRIPT) || SITE_LANG2 === MY2)) return false;
    if (/^[\d\s.,%\-+/฿$₫₱€£¥()[\]:]+$/.test(t)) return false;   // 가격·수치
    if (/^(?:Rp|RM|NT\$?|S\$|R\$|COP|CLP|MXN)\s?[\d\s.,\-~]+[kK]?$/.test(t)) return false; // 다른 나라 쇼핑몰 가격

    let el = node.parentElement;
    if (!el) return false;
    while (el && el !== document.body) {
      if (SKIP_TAGS.has(el.tagName)) return false;
      if (el.isContentEditable) return false;
      if (el.id && el.id.startsWith('lzk-')) return false;  // 우리 UI
      if (el.classList && el.classList.contains('lzk-skip')) return false;
      el = el.parentElement;
    }
    return true;
  }

  function collectNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (isTranslatable(n)) nodes.push(n);
    }
    return nodes;
  }

  let translating = false;
  const queue = new Set();

  async function flushQueue() {
    if (translating || showingOriginal || cfg.pageEngine === 'off') return;

    // 무료 API에 거절당한 직후라면 잠시 쉬었다가 다시 시도한다.
    // 곧바로 재요청하면 차단만 길어진다.
    const wait = rateLimitUntil - Date.now();
    if (wait > 0) {
      setBadge(`번역 대기 ${Math.ceil(wait / 1000)}초`);
      scheduleFlush(Math.min(wait + 200, 5000));
      return;
    }

    const nodes = [...queue].filter((n) => n.isConnected && isTranslatable(n));
    queue.clear();
    if (!nodes.length) {
      setBadge(null);
      return;
    }

    translating = true;
    setBadge(`번역 중… (${nodes.length})`);
    let failed = 0;
    try {
      const texts = nodes.map((n) => n.nodeValue.trim());
      const results = await translateToKorean(texts);
      nodes.forEach((node, i) => {
        const value = results[i];
        if (!value || !node.isConnected) {
          // 실패한 노드는 seen 에 넣지 않는다. 넣어버리면 일시적인 거절 한 번에
          // 그 문구가 영영 번역되지 않은 채로 남는다. 다음 차례에 다시 시도한다.
          if (node.isConnected) {
            queue.add(node);
            failed++;
          }
          return;
        }
        seen.add(node);
        const raw = node.nodeValue;
        originalText.set(node, raw);
        // replace()에 문자열을 넘기면 결과의 $& 같은 패턴이 치환 기호로 해석되므로
        // 앞뒤 공백만 떼어내고 직접 이어 붙인다.
        node.nodeValue = raw.match(/^\s*/)[0] + value + raw.match(/\s*$/)[0];
        // 원문은 부모의 title로 남겨 마우스를 올리면 확인할 수 있게 한다.
        const el = node.parentElement;
        if (el && !el.title) el.title = texts[i];
      });
    } catch (e) {
      console.warn(`[${APP_NAME}] 페이지 번역 오류`, e.message);
      for (const node of nodes) if (node.isConnected) queue.add(node);
      failed = nodes.length;
    } finally {
      translating = false;
      setBadge(null);
      // 실패분이 남았으면 시간을 두고 재시도한다.
      if (queue.size) scheduleFlush(failed ? 4000 : 400);
    }
  }

  let flushTimer = null;
  function scheduleFlush(delay = 400) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushQueue, delay);
  }

  function enqueue(root) {
    for (const n of collectNodes(root)) queue.add(n);
    if (queue.size) scheduleFlush();
  }

  function translatePage() {
    showingOriginal = false;
    enqueue(document.body);
  }

  function restoreOriginal() {
    showingOriginal = true;
    for (const [node, text] of originalText) {
      if (node.isConnected) node.nodeValue = text;
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (!cfg.autoTranslatePage || showingOriginal || cfg.pageEngine === 'off') return;
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType === Node.ELEMENT_NODE) enqueue(added);
        else if (added.nodeType === Node.TEXT_NODE && isTranslatable(added)) queue.add(added);
      }
      if (m.type === 'characterData' && isTranslatable(m.target)) queue.add(m.target);
    }
    if (queue.size) scheduleFlush(600);
  });

  // ---------------------------------------------------------------------------
  // 한국어 검색
  // ---------------------------------------------------------------------------

  // 한글은 완성형(NFC)과 조합형(NFD) 두 가지로 저장될 수 있다. '도시락'과 '도시락'이
  // 화면에는 똑같이 보여도 문자열로는 다르다. 웹에서 복사해 붙인 글자가 NFD 로 들어오면
  // 용어집 조회가 영원히 빗나간다. 보이지 않는 폭 없는 공백도 같은 이유로 걷어낸다.
  const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

  function normKey(s) {
    return String(s == null ? '' : s)
      .replace(ZERO_WIDTH, '')
      .trim()
      .normalize('NFC');
  }

  // 조회용 용어집. GitHub 용어집이 기준이고, 예전에 이 PC에만 넣어 둔 단어는 GitHub 에
  // 없는 말일 때만 쓴다. 거꾸로 두면 GitHub 에서 고쳐도 이 PC에서만 옛 값이 남는다.
  // 용어집이 수만 개가 되면 검색마다 새로 만드는 비용이 커진다. 용어집(또는 예전 PC 단어)이
  // 바뀔 때만 다시 만들고, 그 사이에는 만든 것을 그대로 쓴다. 돌려준 객체는 고치지 말 것.
  let built = { parsed: null, legacy: null, glossary: null, index: null };

  function buildGlossary() {
    const parsed = parsedGlossary();
    const legacy = cfg.glossary;
    if (built.glossary && built.parsed === parsed && built.legacy === legacy) return built.glossary;
    const out = { ...parsed.map };
    for (const [k, v] of Object.entries(legacy || {})) {
      const key = normKey(k);
      if (key && v && !(key in out)) out[key] = v;
    }
    built = { parsed, legacy, glossary: out, index: null };
    return out;
  }

  // ---------------------------------------------------------------------------
  // 용어집 조합
  //
  // 사람이 치는 검색어는 대부분 용어집 단어의 조합이다(여성용 + 방수 + 운동화).
  // 통째로 용어집에 없어도 단어로 쪼개 이어 붙이면 API 없이 바로 끝난다.
  // 쪼개지지 않는 말만 무료 API(또는 AI)로 넘긴다.
  // ---------------------------------------------------------------------------

  // 검색어에서 빼는 말. 쇼핑몰 검색창에 넣어 봐야 상품 대신 잡음만 걸린다.
  const NOISE_WORDS = new Set([
    '추천', '인기', '순위', '후기', '리뷰', '가성비', '최저가', '로켓배송',
    '판매', '구매', '구입', '좋은', '괜찮은', '제일', '가장', '최고',
    // 포럼에 묻듯이 치는 말('혹시 방콕 한인마트 아시는 분')
    '혹시', '아시는', '아시는분', '알려주세요', '궁금해요', '궁금합니다', '부탁드립니다', '부탁해요',
    // 말하듯 묻는 끝말('서류 뭐 필요해요', '우기에 여행 괜찮나요', '어디가 좋아요')
    '뭐', '좋아요', '괜찮나요', '괜찮아요', '해요', '사야',
    '너무', '자꾸', '있어요', '있나요', '뭐가', '줘요',
    '거', '것', // '싼 거', '조용한 거'
    // 게시판 글 끝말('도움 부탁드려요', '급해요', '해보신 분 계신가요')
    '정말', '아주', '매우', '특히', // 힘주는 말
    '부탁드려요', '급해요', '제발', '계신가요', '계신분', '계세요', '있으신가요', '알려주실분',
  ]);
  // 띄어 친 한 단어일 때만 빼는 말. '인사 하는 법', '운동 하는 곳' 의 '하는' 은 앞 명사가 뜻을
  // 다 가진다. 합성어 안에서는 빼지 않는다 — '연장하는' 이 연장 + 하는 으로 덮여 버리면
  // 어미를 떼지 않아 '비자 연장 방법'(วิธีต่อวีซ่า) 통째 항목을 놓친다.
  // 한 단어로 띄어 쳤을 때만 쓰는 말. '아이' 를 용어집에 두면 '아이패치·아이크림' 이 아이(เด็ก)로
  // 쪼개지니, '아이 선물·코딩 학원 아이' 처럼 따로 쳤을 때만 아이(เด็ก)로 읽는다.
  // '바·클럽' 도 쇼핑의 풀업바·골프클럽과 겹쳐 용어집에 따로 두지 않고, '통로 바', '방콕 클럽' 처럼
  // 띄어 쳤을 때만 술집으로 읽는다. '손흥민 골' 의 '골' 도 골목·골반과 겹치지 않게 띄어 쳤을 때만 ประตู.
  // '첫 방문', '첫 출근' 의 첫 → ครั้งแรก.
  const WORD_ONLY = { 아이: 'เด็ก', 바: 'บาร์', 클럽: 'ผับ', 비: 'ฝน', 강: 'แม่น้ำ', 산: 'ภูเขา', 짐: 'สัมภาระ', 차이: 'ความแตกต่าง', 열: 'ไข้', 골: 'ประตู', 첫: 'ครั้งแรก', 후: 'ข้างหน้า', 하나: '1 อัน', 또: 'อีก', 완전: 'สุดๆ', 네: 'ใช่', 예: 'ใช่', 응: 'ใช่' };
  // 붙여 쓴 '5미리'(mm)와 달리 띄어 쓴 홑말 '미리' 는 '먼저' 라는 뜻 — 용어집의 mm 보다 세게 이긴다.
  const WORD_ONLY_STRONG = { 미리: 'ล่วงหน้า' };
  // 위와 같되 상품 이름처럼 맨 앞에 두는 말. '모스크 방문', '처가 방문' 의 '방문' 은 찾아가는 것(เยี่ยม)이고,
  // 용어집의 방문(ประตูห้อง)은 '방문손잡이·방문고리' 같은 쇼핑 합성어 쪽에 남긴다. '표 취소', '창가 자리' 의
  // 표·자리도 띄어 쳤을 때만 ตั๋ว·ที่นั่ง (합성어 안의 표·자리는 도표·일자리 같은 다른 말이다).
  const WORD_ONLY_HEAD = { 방문: 'เยี่ยม', 표: 'ตั๋ว', 자리: 'ที่นั่ง' };
  // '데이트 하기 좋은 곳', '주차 할 곳', '메이드 추천 부탁', '나눔 합니다'
  // '이 식당 맛있어요', '이거 얼마예요' 의 '이·그·저·이거' 는 가리키는 말이라 뺀다.
  // '주소 알려 주세요' 의 '알려' 도 뺀다(붙여 친 '알려주세요' 는 NOISE_WORDS) → ขอ ที่อยู่.
  // '식중독 같아요' 의 '같아요', '200바트에 해 주세요' 의 '해', '짐 좀 들어 주세요' 의 '좀' 도 뺀다.
  // '안·못 + ~요' 에서 용어집과 뜻이 다른 동사(가요=เพลงเกาหลี).
  const VERB_YO = { 가요: 'ไป', 와요: 'มา' };
  // 반말의 존댓말 꼴(매워 → 매워요, 얼마야 → 얼마예요) 중 용어집(또는 VERB_YO)에 있는 것.
  function banmalYo(text, idx) {
    const forms = [text + '요', ...(text.endsWith('야') ? [text.slice(0, -1) + '예요', text.slice(0, -1) + '이에요'] : [])];
    return forms.find((k) => VERB_YO[k] || idx.has(squash(k))) || '';
  }
  const VERB_YO_AFTER = { 가요: 'ไป', 타요: 'นั่ง' };
  const WORD_NOISE = new Set(['하는', '하기', '할', '부탁', '합니다', '해주세요', '해줘요', '이', '그', '저', '이거', '그거', '저거', '이것', '그것', '저것', '이건', '알려', '같아요', '해', '좀', '줘', '해도', '잘']);

  // 혼자 쓰일 때와 다른 말과 붙을 때 뜻이 갈리는 말.
  //   before  뒤에 다른 말이 올 때. '차' 는 혼자면 마시는 차(ชา)지만 '차 방향제',
  //           '차 충전기' 처럼 앞에 붙으면 자동차다. 띄어 쓴 '차' 에만 쓴다. '우엉차 500g'
  //           처럼 합성어 끝에서 떼어 낸 '차' 는 마시는 차다(ในรถ โกโบ 가 되던 사고).
  //   after   앞에 다른 말이 올 때. '거치대' 는 혼자면 휴대폰 거치대로 좁혀 두었는데,
  //           '모니터 거치대' 에 그대로 쓰면 모니터용 휴대폰 받침이 된다. 무엇을 거는지는
  //           앞말이 말해 주므로 받침대(ขาตั้ง)만 남긴다.
  // 이 규칙과 다르게 옮기고 싶은 검색어는 용어집에 통째로 넣는다. 통째가 조합보다 먼저다.
  //   suffix  같은 단어 안에서 다른 말 뒤에 붙을 때. '국가별·시대별' 의 '별' 은 별(ดาว)이 아니라
  //           '~에 따라' 다. 띄어 쓴 '밤하늘 별' 은 그대로 ดาว.
  //   prefix  같은 단어 안에서 맨 앞에 오고 뒤에 다른 말이 붙을 때.
  // '기타가전·기타건강식품' 처럼 붙여 쓴 쇼핑 분류의 '기타' 는 악기가 아니라 '그 밖의'(อื่นๆ)다. 악기 쪽
  // 말(기타줄·기타앰프·기타가격)은 용어집에 통째로 있어 먼저 이긴다. 띄어 쓴 '기타 가격' 은 사람들이
  // 악기를 찾는 경우가 많아 그대로 กีต้าร์.
  const CONTEXT_FORMS = {
    '차': { before: 'ในรถ' },
    '거치대': { after: 'ขาตั้ง' },
    '별': { suffix: 'แยกตาม' },
    '기타': { prefix: 'อื่นๆ' },
    // '보험금·적립금·계약금' 의 '금' 은 금(ทอง)이 아니라 돈. '18K금' 처럼 숫자·영문 뒤는 그대로 금.
    '금': { suffix: 'เงิน' },
    // '일주일간·한달간' 의 '간' 은 간(ตับ)이 아니라 '동안' 이라 뺀다. 돼지간·닭간은 통째 항목이 이긴다.
    '간': { suffix: '' },
    // '긴장감·만족감·승차감' 의 '감' 은 감(ลูกพลับ)이 아니라 느낌이라 뺀다(앞말이 뜻을 다 가진다). 곶감·단감은 통째 항목.
    '감': { suffix: '' },
    // '복학생·수습생·하숙생' 의 '생' 은 날것(สด)이 아니라 학생. 생연어·생크림처럼 앞에 붙는 '생' 은 그대로 สด.
    '생': { suffix: 'นักเรียน' },
  };

  // 공백을 빼고 소문자로. '무선이어폰' 과 '무선 이어폰', 'c타입' 과 'C타입' 을 같게 본다.
  function squash(s) {
    return s.replace(/\s+/g, '').toLowerCase();
  }

  function buildIndex() {
    const glossary = buildGlossary();
    if (built.index) return built.index;
    const idx = new Map();
    for (const [k, v] of Object.entries(glossary)) idx.set(squash(k), v);
    built.index = idx;
    return idx;
  }

  // 띄어 쓰지 않은 합성어를 용어집 단어로 나눈다. '여성운동화' → 여성 + 운동화.
  // 끝까지 다 덮이지 않으면 쪼개지 않는다(null). 반만 맞춘 조각은 오역의 씨앗이다.
  // 한 글자 단어(차·옷·컵)는 맨 끝에서만 쓴다. 앞에서도 쓰게 하면 '차량' 이
  // 차(ชา) + 량 으로 쪼개지는 사고가 난다. 끝의 '용' 은 떼어 낸다(강아지용 → 강아지).
  function segmentWord(s, idx, endings = true) {
    const n = s.length;
    const cost = new Array(n + 1).fill(Infinity);
    const back = new Array(n + 1).fill(null);
    cost[0] = 0;
    for (let i = 0; i < n; i++) {
      if (cost[i] === Infinity) continue;
      for (let j = i + 1; j <= n; j++) {
        const w = s.slice(i, j);
        if (w.length === 1 && !(j === n && i > 0)) continue;
        // 합성어 끝의 '은' 은 은(เงิน)이 아니라 조사다('사람들은', '태국은'). 여기서 덮어 버리면
        // 조사를 떼지 않는다. 띄어 쓴 '은 반지' 의 '은' 은 단어째로 찾으니 그대로 เงิน.
        if (j === n && i > 0 && w === '은') continue;
        let piece = null;
        let c = 1;
        if (NOISE_WORDS.has(w) || w === '용') piece = { ko: w, th: '', kind: 'noise' };
        else if (idx.has(squash(w))) piece = { ko: w, th: idx.get(squash(w)), kind: 'glossary' };
        else if (endings && i > 0 && w.length >= 2 && ENDINGS.includes(w)) {
          // 붙여 친 문장 가운데의 조사·어미('수완나품공항에서시내가는법', '계좌개설하는방법').
          // 두 글자 이상만, 맨 앞은 안 된다. 조금 비싸게 매겨 조사 없이 쪼개지는 쪽을 먼저 고른다.
          piece = { ko: w, th: '', kind: 'noise' };
          c = 1.5;
        }
        if (piece && cost[i] + c < cost[j]) {
          cost[j] = cost[i] + c;
          back[j] = { i, piece };
        }
      }
    }
    if (cost[n] === Infinity) return null;
    const out = [];
    for (let k = n; k > 0; k = back[k].i) out.unshift(back[k].piece);
    return out;
  }

  // 뉴스·정부·포럼 검색은 문장처럼 친다('방콕에서 비자 연장하는 방법'). 용어집에는 조사·어미가
  // 없는 말만 있으니, 단어째로도 쪼개서도 용어집에 없는 단어는 끝의 조사·어미를 떼어 본다.
  // 떼고 남은 말이 용어집으로 다 덮일 때만 뗀다 — 모르는 말은 그대로 무료 API 가 문맥째 옮긴다.
  // 긴 것부터 본다('에서' 를 '서' 보다 먼저).
  // 묻는 말투('추천해주세요', '필요한가요', '얼마인가요', '되나요'). 이 끝말은 단어가 쪼개지더라도
  // 먼저 뗀다 — '안전한가요' 가 안전한 + 가요(เพลงเกาหลี, 한국 가요)로 쪼개지던 사고.
  const ASK_ENDINGS = ['해주세요', '해줘요', '해줘', '한가요', '인가요', '하나요', '할까요', '되나요', '될까요', '해요', '가요'];
  // '가요' 는 '더운가요·좋은가요' 처럼 앞말이 ㄴ 받침(꾸미는 꼴)일 때만 묻는 끝말로 본다.
  // '한국가요' 의 가요는 노래(เพลงเกาหลี)다.
  const askStemOk = (stem, e) => e !== '가요' || (stem.charCodeAt(stem.length - 1) - 0xac00) % 28 === 4;
  const ENDINGS = [
    ...ASK_ENDINGS,
    '인데', '인지', '이에요', '예요', '입니다',
    '했어요', '할게요', '할래요', '했는데', '하세요', // '연락할게요·샤워했어요·서명하세요' → 연락·샤워·서명
    '하려면', '하는데', '하기', '하는', '하면', '하고', '해서', '했다', '합니다', '할때', '한', '할',
    '되는', '되면', '됐다', '된', '받는', '받기', '받으려면',
    '에서는', '으로는', '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다', '이랑',
    '에는', '에도', '와', '과', '이', '가', '을', '를', '에', '의', '로', '도', '만', '랑', '은',
  ];
  // 몸·집안의 흔한 한 글자 말만(차가 막혀요의 차=ชา, 병이 났어요의 병=ขวด 같은 쇼핑 뜻은 뺀다).
  // 받침이 있으면 이·을, 없으면 가·를 — 받침 없는 말 뒤의 '이' 는 조사가 아니다(차이·오이·나이).
  const ONE_CHAR_NOUNS = '귀눈코목팔발손입턱혀뼈뇌폐털땀멍물불돈방집밥술약옷문꿈땅빚섬역숲꽃쌀빵떡꿀맛색향앱폰';
  const oneCharParticleOk = (stem, e) => {
    if (!ONE_CHAR_NOUNS.includes(stem)) return false;
    const jong = (stem.charCodeAt(0) - 0xac00) % 28;
    return e === '에' || ((e === '이' || e === '을') && jong > 0) || ((e === '가' || e === '를') && jong === 0);
  };
  // '는' 은 넣지 않았다. '자라는'(→ ZARA)처럼 동사를 명사로 잘못 뗀다. '은' 은 한 글자 조사라
  // 떼고 남은 말이 용어집 단어 그대로일 때만 뗀다('사람들은' → 사람들, '태국은' → 태국).

  // 형용사 줄기를 꾸미는 꼴로. 조용하 → 조용한, 싸 → 싼, 가볍 → 가벼운, 작 → 작은.
  // 한 글자로 끝나는 꾸미는 꼴은 형용사만 — '가고 있어요' 의 가고 → 간(ตับ) 같은 동사는 뺀다.
  const ONE_CHAR_ADJ = '긴큰싼짠흰먼';
  function toAttributive(stem) {
    const a = attributiveOf(stem);
    return a.length === 1 && !ONE_CHAR_ADJ.includes(a) ? '' : a;
  }
  function attributiveOf(stem) {
    if (!stem) return '';
    const last = stem.charCodeAt(stem.length - 1) - 0xac00;
    if (last < 0 || last > 11171) return '';
    const jong = last % 28;
    const head = stem.slice(0, -1);
    if (stem.endsWith('하')) return head + '한';
    if (jong === 0) return head + String.fromCharCode(0xac00 + last + 4);
    if (jong === 17) return head + String.fromCharCode(0xac00 + last - 17) + '운';
    return stem + '은';
  }

  function stripEndings(words, idx) {
    const known = (s) => idx.has(squash(s)) || !!segmentWord(s, idx, false); // 조사 없이 덮이는지 본다
    // 여러 단어가 통째로 용어집에 있으면('짱구는 못말려') 그 단어들은 건드리지 않는다.
    const keep = new Set();
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length && j < i + 7; j++) {
        if (idx.has(squash(words.slice(i, j + 1).join('')))) for (let k = i; k <= j; k++) keep.add(k);
      }
    }
    const out = [];
    let prevVerb = false;
    words.forEach((w, wi) => {
      let word = w;
      // '하는 법' 의 '법' 은 법률이 아니라 방법이다. '아시는 분' 의 '분' 은 사람이라 뺀다.
      // 통째 항목에 든 단어('살 빼는 법' → 살빼는법)는 그대로 둔다.
      if (prevVerb && !keep.has(wi) && w === '법') word = '방법';
      // '사는 게 좋아요' 의 '게' 는 '것이' 다(먹는 게 = ปู 가 아니다).
      if (prevVerb && !keep.has(wi) && (w === '분' || w === '게')) {
        prevVerb = false;
        return;
      }
      prevVerb = false;
      const m = word.match(/^(.*?)([가-힣]+)$/);
      const ask =
        m &&
        !keep.has(wi) &&
        !idx.has(squash(m[2])) &&
        ASK_ENDINGS.find(
          (e) =>
            m[2].length - e.length >= 2 &&
            m[2].endsWith(e) &&
            askStemOk(m[2].slice(0, -e.length), e) &&
            // '친절한가요' 는 '친절' 이 없어도 '친절한'(บริการดี)이 있으면 뗀다. 안 떼면 '가요'(เพลงเกาหลี)가 붙는다.
            (known(m[2].slice(0, -e.length)) || (e[0] === '한' && idx.has(squash(m[2].slice(0, -e.length) + '한'))))
        );
      if (ask) {
        // '안전한가요' → '안전한'(ปลอดภัย)이 용어집에 있으면 그쪽. '안전'(นิรภัย)은 안전벨트의 안전이다.
        const stem = m[2].slice(0, -ask.length);
        word = m[1] + (ask[0] === '한' && idx.has(squash(stem + '한')) ? stem + '한' : stem);
      } else if (m && !keep.has(wi) && !known(m[2])) {
        for (const e of ENDINGS) {
          const tail = m[2];
          if (tail.length <= e.length || !tail.endsWith(e)) {
            // 'BTS에서' 처럼 영문 뒤에 조사만 붙은 경우. 숫자 뒤는 단위다('90도').
            if (/[A-Za-z]$/.test(m[1]) && tail === e) {
              word = m[1];
              break;
            }
            continue;
          }
          const stem = tail.slice(0, -e.length);
          // 한 글자 말은 '귀가 아파요', '발에 물집' 처럼 주어·자리 조사가 붙고 그 한 글자가
          // 용어집에 있을 때만(귀=หู, 발=เท้า).
          if (stem.length < 2 && !(m[1] === '' && oneCharParticleOk(stem, e) && idx.has(squash(stem)))) continue;
          // 한 글자 조사는 떼고 남은 말이 용어집 단어 그대로일 때만. '교통편의' 를
          // 교통편 + 의 로 보고 다시 교통 + 편 으로 쪼개면 뜻이 사라진다.
          if (e.length === 1 ? !idx.has(squash(stem)) : !known(stem)) continue;
          word = m[1] + stem;
          break;
        }
        // '가볍고 튼튼한', '싸게 사는 법', '작고 조용한' 의 '~고·~게' 는 꾸미는 꼴(가벼운·싼·작은)로
        // 바꿔 용어집에 있으면 그 말로 읽는다.
        if (word === w && /[고게]$/.test(m[2])) {
          const attr = toAttributive(m[2].slice(0, -1));
          if (attr && idx.has(squash(attr))) word = m[1] + attr;
        }
      }
      prevVerb = /는$/.test(w);
      out.push(word);
    });
    return out;
  }

  // '3번 버스'(สาย 3)·'505호'(ห้อง 505)처럼 태국어에서 단위가 숫자 앞에 오는 것은 넣지 않는다.
  const NUM_UNITS = {
    시간: 'ชั่วโมง', 분: 'นาที', 주: 'สัปดาห์', 초: 'วินาที',
    명: 'คน', 층: 'ชั้น', 박: 'คืน', 회: 'ครั้ง', 장: 'แผ่น', 도: 'องศา',
    // 시각('3시에 만나요'). 용어집의 '오후2시'(บ่าย 2 โมง) 같은 통째 항목이 먼저다.
    시: 'โมง', 시에: 'โมง', 시쯤: 'โมงกว่าๆ',
    // '5분만 기다려' 의 분만(용어집 คลอด 출산)은 '분' + '만'.
    분만: 'นาที',
  };

  // '두 시간'·'세 명'·'한 달' 처럼 한글 수 뒤에 단위가 오는 말. 분·초·회·박은 한자 수('이십 분')로 세니
  // 넣지 않는다('두 분' 은 두 사람이다). '한번' 은 '한번 가 보고 싶다' 의 부사라 1 ครั้ง 으로 두지 않는다.
  const NATIVE_NUMS = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
  const NATIVE_UNITS = {
    시간: 'ชั่วโมง', 명: 'คน', 사람: 'คน', 주: 'สัปดาห์', 달: 'เดือน', 층: 'ชั้น', 장: 'แผ่น',
    개: 'ชิ้น', 번: 'ครั้ง', 살: 'ขวบ', 잔: 'แก้ว', 병: 'ขวด', 그릇: 'ชาม', 곳: 'แห่ง',
    봉지: 'ถุง', 박스: 'กล่อง', 상자: 'กล่อง', 켤레: 'คู่', 마리: 'ตัว', 권: 'เล่ม', 캔: 'กระป๋อง', 배: 'เท่า',
  };
  function nativeCount(num, unit, idx) {
    const n = NATIVE_NUMS[num];
    if (!n || !NATIVE_UNITS[unit] || (n === 1 && unit === '번')) return '';
    return idx.get(squash(n + unit)) || `${n} ${NATIVE_UNITS[unit]}`;
  }

  // 숫자 뒤의 만·천·억을 숫자로('80만 바트' → '800,000 바트'). 태국 사이트는 금액을 숫자로 쓴다.
  // '1억2천만' 처럼 이어진 것도 합친다. 뒤에 한글이 바로 붙은 '만'(1개만 = '만' 조사)은 숫자 바로 뒤가
  // 아니라 건드리지 않는다.
  function koreanNumbers(s) {
    return s.replace(/(\d+(?:\.\d+)?(?:억|천만|백만|만|천))+/g, (m) => {
      let total = 0;
      let rest = 0;
      for (const [, n, u] of m.matchAll(/(\d+(?:\.\d+)?)(억|천만|백만|만|천)/g)) {
        const v = parseFloat(n) * { 억: 1e8, 천만: 1e7, 백만: 1e6, 만: 1e4, 천: 1e3 }[u];
        if (u === '억') total += v;
        else rest += v;
      }
      return Math.round(total + rest).toLocaleString('en-US');
    });
  }

  // 검색어를 용어집 단어로 쪼갠다. 조각은 한국어 순서 그대로 돌려준다.
  //   glossary  용어집에 있는 말
  //   literal   영문·숫자(iPhone, 15, 500ml). 그대로 쓴다
  //   noise     뺄 말(추천, 강아지'용', 기호)
  //   unknown   용어집에 없는 말. th 가 비어 있으니 호출부가 채운다
  // 더 공손한 부탁·물음은 용어집에 든 꼴로 바꾼다. '열어 주시겠어요' → '열어 주세요', '앉아도 될까요' → '앉아도 돼요'.
  const POLITE_FORMS = [
    [/주시겠어요|주실래요|주시면\s*안\s*될까요/g, '주세요'],
    [/될까요/g, '돼요'],
    [/말씀해/g, '말해'],
  ];
  const plainPolite = (s) => POLITE_FORMS.reduce((acc, [re, to]) => acc.replace(re, to), s);

  function composeFromGlossary(query) {
    const idx = buildIndex();
    const words = stripEndings(plainPolite(koreanNumbers(normKey(query))).split(/\s+/).filter(Boolean), idx);
    // 단어를 한글과 그 밖으로 가른다. 'USB충전기' → USB | 충전기, 'C타입' → C | 타입.
    const toks = [];
    words.forEach((w, wi) => {
      for (const text of w.match(/[가-힣]+|[^가-힣]+/g) || []) {
        toks.push({ text, word: wi, hangul: /[가-힣]/.test(text) });
      }
    });
    const n = toks.length;
    const firstOfWord = (i) => i === 0 || toks[i - 1].word !== toks[i].word;
    const lastOfWord = (i) => i === n - 1 || toks[i + 1].word !== toks[i].word;

    // 조각 수가 가장 적게 쪼갠다. 모르는 말은 비싸게 매겨 되도록 피한다.
    const cost = new Array(n + 1).fill(Infinity);
    const back = new Array(n + 1).fill(null);
    cost[0] = 0;
    const relax = (from, to, c, pieces) => {
      if (cost[from] + c < cost[to]) {
        cost[to] = cost[from] + c;
        back[to] = { from, pieces };
      }
    };
    for (let i = 0; i < n; i++) {
      if (cost[i] === Infinity) continue;
      // 여러 토큰에 걸친 용어집 단어. '무선 이어폰'(두 단어), 'C타입'(한 단어 안 두 토큰).
      // 단어를 넘어갈 때는 단어 경계에 딱 맞아야 한다('2인용 텐트' 의 '인용 텐트' 는 안 됨).
      let joined = '';
      let shown = '';
      for (let j = i; j < n && j < i + 6; j++) {
        joined += toks[j].text;
        shown += (j > i && toks[j].word !== toks[j - 1].word ? ' ' : '') + toks[j].text;
        if (toks[j].word !== toks[i].word && !(firstOfWord(i) && lastOfWord(j))) continue;
        const th = idx.get(squash(joined));
        if (th) relax(i, j + 1, 1, [{ ko: shown, th, kind: 'glossary', word: toks[i].word }]);
      }
      const t = toks[i];
      if (!t.hangul) {
        // 기호뿐인 토큰(/, +, ·)은 버리고, 글자나 숫자가 있으면 그대로 둔다.
        const keep = /[A-Za-z0-9฀-๿]/.test(t.text);
        relax(i, i + 1, keep ? 1 : 0, [
          { ko: t.text, th: keep ? t.text : '', kind: keep ? 'literal' : 'noise', word: t.word },
        ]);
        // 숫자·영문에 붙은 용어집 말 뒤로 다른 말이 이어 붙은 경우('90일신고온라인' → 90일신고 + 온라인).
        const next = toks[i + 1];
        if (keep && next && next.hangul && next.word === t.word) {
          for (let k = 1; k < next.text.length; k++) {
            const th = idx.get(squash(t.text + next.text.slice(0, k)));
            if (!th) continue;
            const rest = segmentWord(next.text.slice(k), idx);
            if (!rest) continue;
            relax(i, i + 2, 1 + rest.length, [
              { ko: t.text + next.text.slice(0, k), th, kind: 'glossary', word: t.word },
              ...rest.map((p) => ({ ...p, word: t.word })),
            ]);
          }
        }
        continue;
      }
      // 숫자 바로 뒤의 시간 단위. '시간' 은 혼자면 เวลา(때)지만 '2시간' 은 2 ชั่วโมง 이다.
      // '분·주·초' 는 한 글자라 용어집 조합에 안 걸려 여기서 잡는다.
      const prevTok = toks[i - 1];
      if (prevTok && prevTok.word === t.word && /^\d+$/.test(prevTok.text) && NUM_UNITS[t.text]) {
        relax(i, i + 1, 0.5, [{ ko: t.text, th: NUM_UNITS[t.text], kind: 'glossary', word: t.word }]);
      }
      // 숫자 뒤의 '번'(몇 번째). '3번 출구' → ทางออก 3, '8번 버스' → รถบัส 8. 태국어는 숫자를 뒤에 쓰니
      // '번' 은 빼고 숫자만 남긴다(숫자 덩어리는 꾸밈말이라 명사 뒤로 간다). 용어집의 '1번' 등이 먼저다.
      if (t.text === '번' && prevTok && prevTok.word === t.word && /^\d+$/.test(prevTok.text)) {
        relax(i, i + 1, 0.5, [{ ko: t.text, th: '', kind: 'noise', word: t.word }]);
      }
      // 숫자 뒤의 '원'(한국 돈). '5만원' 은 koreanNumbers 를 거쳐 '50,000원' 이 된다. 띄어 쓴 '5만 원' 도.
      // '원' 을 용어집에 따로 두면 '상담원·연구원' 이 상담 + 원(วอน)으로 쪼개지니 숫자 바로 뒤에서만 본다.
      if (
        (t.text === '원' || t.text === '원대') && prevTok && /^[\d,.]+$/.test(prevTok.text) &&
        (prevTok.word === t.word || (prevTok.word === t.word - 1 && firstOfWord(i) && lastOfWord(i)))
      ) {
        relax(i, i + 1, 0.5, [{ ko: t.text, th: 'วอน', kind: 'glossary', word: t.word }]);
      }
      // 한글 수 + 단위. 띄어 쓴 '두 시간' 과 붙여 쓴 '두시간' 둘 다. 비용을 1 로 두어 같은 비용이면
      // 먼저 들어간 용어집 항목('한달'·'세대')이 이긴다.
      const nx = toks[i + 1];
      if (firstOfWord(i) && lastOfWord(i) && nx && nx.hangul && nx.word === t.word + 1 && lastOfWord(i + 1)) {
        const th = nativeCount(t.text, nx.text, idx);
        if (th) relax(i, i + 2, 1, [{ ko: t.text + ' ' + nx.text, th, kind: 'glossary', word: t.word, mod: true }]);
      }
      // 안·못 뒤의 반말('안 매워·안 추워·못 가')은 존댓말 꼴('매워요·가요')로 읽는다. 아래 두 규칙이
      // '~요' 로만 풀이말을 알아봐서 반말은 '안' 을 못 읽고 부정이 빠졌다('기분이 안 좋아' → ดี).
      const nxPos = nx && nx.hangul && nx.word === t.word + 1 && lastOfWord(i + 1);
      const nxYo =
        nxPos && (t.text === '안' || t.text === '못') && firstOfWord(i) && lastOfWord(i)
          ? /요$/.test(nx.text)
            ? nx.text
            : banmalYo(nx.text, idx)
          : '';
      // 띄어 쓴 '안' + 꾸미는 말·풀이말('안 비싼', '안 무거운', '안 뜨거워요') → ไม่ + 그 말. 용어집의
      // 통째 항목('안새는' กันรั่ว, '안 매운' ไม่เผ็ด)이 비용 1 로 먼저 이긴다. 뒷말이 명사면('안 방') 안 한다.
      const adj = nxYo && nxYo !== nx.text ? nxYo : nx && nx.text;
      if (
        t.text === '안' && firstOfWord(i) && lastOfWord(i) && nxPos && glossaryMods().has(squash(adj)) &&
        (/(요|게|음|함)$/.test(adj) || (adj.charCodeAt(adj.length - 1) - 0xac00) % 28 === 4)
      ) {
        const th = idx.get(squash(adj));
        if (th && !/^(ไม่|กัน)/.test(th)) {
          relax(i, i + 2, 1.5, [{ ko: t.text + ' ' + nx.text, th: 'ไม่' + th, kind: 'glossary', word: t.word, mod: true }]);
        }
      }
      // 띄어 쓴 '안·못' + '~요' 풀이말(동사). '안 먹어요' → ไม่กิน, '못 와요' → มาไม่ได้.
      // 용어집의 못(ตะปู)은 '못 박기' 같은 쇼핑 말이라 뒤에 '~요' 가 올 때만 이렇게 읽는다.
      if (nxYo && !glossaryMods().has(squash(nxYo))) {
        const th = VERB_YO[nxYo] || idx.get(squash(nxYo));
        if (th && !/^(ไม่|กัน)/.test(th) && !/ไม่ได้$/.test(th)) {
          // 지난 일('먹었어요' → กินแล้ว)은 ไม่ได้ + 동사: '안 먹었어요' → ไม่ได้กิน.
          const past = th.endsWith('แล้ว') && th.length > 4 ? th.slice(0, -4) : '';
          // 이미 ได้ 로 시작하는 말('받았어요' ได้รับแล้ว)은 ไม่ 만 — ไม่ได้ได้รับ 이 되지 않게.
          const neg = past
            ? (past.startsWith('ได้') ? 'ไม่' : 'ไม่ได้') + past
            : t.text === '안' ? 'ไม่' + th : th + 'ไม่ได้';
          relax(i, i + 2, 1.5, [{ ko: t.text + ' ' + nx.text, th: neg, kind: 'glossary', word: t.word }]);
        }
      }
      // '비싸지 않은', '맵지 않은' → ไม่ + 꾸미는 꼴(비싼·매운). 용어집 통째 항목('맵지않게')이 먼저다.
      if (
        firstOfWord(i) && lastOfWord(i) && t.text.length >= 2 && t.text.endsWith('지') &&
        nx && nx.hangul && nx.word === t.word + 1 && lastOfWord(i + 1) && /^않(은|는|게|아요|음)$/.test(nx.text)
      ) {
        const attr = toAttributive(t.text.slice(0, -1));
        const th = attr && idx.get(squash(attr));
        if (th && !/^(ไม่|กัน)/.test(th)) {
          relax(i, i + 2, 1.5, [{ ko: t.text + ' ' + nx.text, th: 'ไม่' + th, kind: 'glossary', word: t.word, mod: true }]);
        }
      }
      // 붙여 쓴 것은 병·층·주를 받지 않는다('열병' 은 열 병이 아니라 병 이름, '한층' 은 부사).
      const nm = firstOfWord(i) && lastOfWord(i) && t.text.match(/^(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(.+)$/);
      if (nm && !/^(병|층|주)$/.test(nm[2])) {
        const th = nativeCount(nm[1], nm[2], idx);
        if (th) relax(i, i + 1, 1, [{ ko: t.text, th, kind: 'glossary', word: t.word, mod: true }]);
      }
      // 한 글자 뺄 말('뭐')은 segmentWord 가 한 글자를 안 받으니 여기서 뺀다.
      if (WORD_ONLY[t.text] && firstOfWord(i) && lastOfWord(i)) {
        relax(i, i + 1, 1, [{ ko: t.text, th: WORD_ONLY[t.text], kind: 'glossary', word: t.word, mod: true }]);
      }
      if (WORD_ONLY_STRONG[t.text] && firstOfWord(i) && lastOfWord(i)) {
        relax(i, i + 1, 0, [{ ko: t.text, th: WORD_ONLY_STRONG[t.text], kind: 'glossary', word: t.word, mod: true }]);
      }
      // 뒷말을 몰라도 띄어 쓴 '안·못' + '~요' 는 부정이다(못=ตะปู 로 읽지 않는다). 뒷말까지 아는 위 규칙이 먼저다.
      // '못' 은 뒤에 어떤 말이 와도 부정('오늘 못 갈 것 같아요') — 쇼핑의 못(ตะปู)은 '못 박기' 처럼 '박' 이 뒤따른다.
      if (
        (t.text === '안' || t.text === '못') && firstOfWord(i) && lastOfWord(i) && nx && nx.hangul &&
        nx.word === t.word + 1 && (/요$/.test(nx.text) || (t.text === '못' && !/^박/.test(nx.text)))
      ) {
        relax(i, i + 1, 0.9, [{ ko: t.text, th: t.text === '안' ? 'ไม่' : 'ไม่ได้', kind: 'glossary', word: t.word, mod: true }]);
      }
      // 반말('피곤해·배고파·멀어·얼마야')은 용어집의 존댓말 항목('피곤해요·얼마예요')이 있으면 그 뜻으로 읽는다.
      if (firstOfWord(i) && lastOfWord(i) && t.text.length >= 2 && !idx.has(squash(t.text))) {
        const yo = [
          t.text + '요',
          ...(t.text.endsWith('야') ? [t.text.slice(0, -1) + '예요', t.text.slice(0, -1) + '이에요'] : []),
          ...(t.text.endsWith('이야') ? [t.text.slice(0, -2) + '이에요'] : []), // 오랜만이야 → 오랜만이에요
        ]
          .find((k) => idx.has(squash(k)));
        if (yo) {
          relax(i, i + 1, 1, [{ ko: t.text, th: idx.get(squash(yo)), kind: 'glossary', word: t.word, mod: glossaryMods().has(squash(yo)) }]);
        }
      }
      // 띄어 쓴 '더'. 뒤에 말이 오면 견주는 말('더 큰 거' → ขนาดใหญ่ กว่านี้), 끝에 오면 하나 더('한 잔 더' → อีก 1 แก้ว).
      if (t.text === '더' && firstOfWord(i) && lastOfWord(i)) {
        relax(i, i + 1, 1, [{ ko: t.text, th: nx && nx.hangul ? 'กว่านี้' : 'อีก', kind: 'glossary', word: t.word, mod: true }]);
      }
      // 용어집에도 같은 키가 있으니 비용을 조금 낮춰 이긴다. '방문 손잡이' 통째 항목(1)은 그래도 먼저다.
      if (WORD_ONLY_HEAD[t.text] && firstOfWord(i) && lastOfWord(i)) {
        relax(i, i + 1, 0.9, [{ ko: t.text, th: WORD_ONLY_HEAD[t.text], kind: 'glossary', word: t.word }]);
      }
      // 다른 말 뒤에 띄어 쓴 '가요·타요' 는 동사(ไป·นั่ง) — '한국 가요', '오토바이 택시 타요'. 혼자 친 말과
      // 합성어 안의 것(가요CD·타요버스)은 용어집대로 노래(เพลงเกาหลี)·만화 Tayo.
      if (VERB_YO_AFTER[t.text] && t.word > 0 && firstOfWord(i) && lastOfWord(i)) {
        relax(i, i + 1, 0.9, [{ ko: t.text, th: VERB_YO_AFTER[t.text], kind: 'glossary', word: t.word }]);
      }
      // 수량 뒤의 '사면' 은 사다(ถ้าซื้อ) — '10개 사면 얼마', '두 개 사면'. 그 밖의 사면은 용어집대로(อภัยโทษ).
      if (t.text === '사면' && firstOfWord(i) && lastOfWord(i) && prevTok && /^(\d+|개|병|박스|세트|봉지|팩|켤레)$/.test(prevTok.text)) {
        relax(i, i + 1, 0.9, [{ ko: t.text, th: 'ถ้าซื้อ', kind: 'glossary', word: t.word }]);
      }
      // 뺄 말도 비용을 조금 매겨, 그 말까지 든 통째 항목('가성비 좋아요' → คุ้มค่า, '자리 있어요')이 이기게 한다.
      if (NOISE_WORDS.has(t.text) || (WORD_NOISE.has(t.text) && firstOfWord(i) && lastOfWord(i))) {
        relax(i, i + 1, 0.6, [{ ko: t.text, th: '', kind: 'noise', word: t.word }]);
      }
      const segs = segmentWord(t.text, idx);
      if (segs) relax(i, i + 1, segs.length, segs.map((p) => ({ ...p, word: t.word })));
      relax(i, i + 1, 100, [{ ko: t.text, th: '', kind: 'unknown', word: t.word }]);
    }

    const steps = [];
    for (let k = n; k > 0; k = back[k].from) steps.unshift({ from: back[k].from, pieces: back[k].pieces });

    // 숫자·영문이 붙은 단어(2인용, 3단)에서 한글 쪽을 모르면 단어째 넘긴다.
    // '인용' 만 떼어 옮기면 '인용하다'(อ้างอิง)가 된다.
    const unknownWords = new Set(
      steps.filter((s) => s.pieces[0].kind === 'unknown').map((s) => toks[s.from].word)
    );
    const pieces = [];
    const emitted = new Set();
    for (const s of steps) {
      const w = toks[s.from].word;
      if (unknownWords.has(w)) {
        if (!emitted.has(w)) {
          emitted.add(w);
          pieces.push({ ko: words[w], th: '', kind: 'unknown', word: w });
        }
        continue;
      }
      pieces.push(...s.pieces.map((p) => ({ ...p })));
    }

    // 모르는 말이 이어지면 한 덩어리로 보낸다. 앞뒤 문맥이 있어야 무료 API 도 덜 틀린다.
    const merged = [];
    for (const p of pieces) {
      const prev = merged[merged.length - 1];
      if (p.kind === 'unknown' && prev && prev.kind === 'unknown') prev.ko += ' ' + p.ko;
      else merged.push(p);
    }

    const content = merged.filter((p) => p.kind !== 'noise');
    content.forEach((p, i) => {
      const f = p.kind === 'glossary' && CONTEXT_FORMS[p.ko];
      if (!f) return;
      if (f.before && i < content.length - 1 && squash(words[p.word]) === squash(p.ko)) p.th = f.before;
      else if (f.after && i > 0) p.th = f.after;
      else if ('suffix' in f && i > 0 && content[i - 1].word === p.word && content[i - 1].kind === 'glossary') {
        p.th = f.suffix;
      }
      else if (
        f.prefix && i < content.length - 1 && content[i + 1].word === p.word &&
        (i === 0 || content[i - 1].word !== p.word)
      ) {
        p.th = f.prefix;
      }
    });

    return { pieces: merged, unknown: merged.filter((p) => p.kind === 'unknown') };
  }

  // 조각을 태국어 검색어로 잇는다. 태국 상품명은 상품 이름이 먼저, 꾸밈말이 뒤에 온다
  // (ไส้ใหญ่หมูแช่แข็ง, รองเท้าผ้าใบกันน้ำผู้หญิง). 한국어로는 꾸밈말을 앞에도 뒤에도 친다
  // ('냉동 돼지막창' / '돼지막창 냉동'). 처음에는 순서를 통째로 뒤집었는데, 그러면 뒤에 친
  // 꾸밈말이 앞으로 가 버렸다(돼지막창 냉동 → แช่แข็ง ไส้ใหญ่หมู). 그래서
  //   상품 이름(뒤집어서) → 상품 앞에 쳤던 꾸밈말(뒤집어서) → 상품 뒤에 쳤던 꾸밈말(그대로)
  // 로 잇는다. 상품 이름끼리 뒤집는 것은 '고양이 모래 → ทราย แมว' 때문이다.
  // 꾸밈말: 용어집의 @꾸밈말 칸, 영문·숫자 덩어리(iPhone 15 Pro, 27 นิ้ว, L), 용어집에 없던 말.
  // 영문·숫자가 이어진 부분은 한 덩어리로 묶어 제 순서를 지키고, 숫자에 바로 붙은 단위
  // (27인치 → 27 นิ้ว)도 그 덩어리에 넣는다.
  const CURRENCY_TH = new Set(['บาท', 'วอน', 'ดอลลาร์', 'เยน', 'หยวน']);

  function assembleThai(pieces) {
    const groups = [];
    let run = null;
    let prev = null;
    for (const p of pieces) {
      if (!p.th) continue;
      const latin = !THAI.test(p.th);
      // 띄어 쓴 통화도 숫자에 붙인다('3천 바트 이하' → 3,000 บาท ไม่เกิน). 통화만 — '아이폰 15 케이스'
      // 의 케이스까지 숫자에 붙으면 상품 이름이 뒤로 밀린다.
      const unit =
        run && prev && /^[\d.,]+$/.test(prev.th) &&
        (prev.word === p.word || (prev.word === p.word - 1 && CURRENCY_TH.has(p.th)));
      if (run && (latin || unit)) {
        run.push(p);
      } else if (latin) {
        groups.push((run = [p]));
      } else {
        run = null;
        groups.push([p]);
      }
      prev = p;
    }

    const mods = glossaryMods();
    const isHead = (g) =>
      g.length === 1 && g[0].kind === 'glossary' && !g[0].mod && THAI.test(g[0].th) && !mods.has(squash(g[0].ko));
    let last = -1;
    groups.forEach((g, i) => {
      if (isHead(g)) last = i;
    });
    // 용어집 꾸밈말만 있고 맨 끝이 '~요' 서술어면 주어 → 서술어 순서 그대로 둔다
    // ('잇몸이 부었어요' → เหงือก บวม, '택배가 안 와요' → พัสดุ ไม่มา).
    const keepOrder =
      groups.length > 1 &&
      groups.every((g) => g.length === 1 && g[0].kind === 'glossary' && THAI.test(g[0].th)) &&
      /요$/.test(groups[groups.length - 1][0].ko);
    const ordered =
      last < 0
        ? keepOrder
          ? groups.slice()
          : groups.slice().reverse() // 상품 이름을 모르면 예전처럼 뒤집는다
        : [
            ...groups.filter((g, i) => i <= last && isHead(g)).reverse(),
            ...groups.filter((g, i) => i < last && !isHead(g)).reverse(),
            ...groups.slice(last + 1),
          ];

    const out = [];
    for (const g of ordered) {
      const s = g.map((p) => p.th).join(' ');
      if (!out.includes(s)) out.push(s); // '유리컵' → แก้ว + แก้ว 같은 겹침
    }
    return out.join(' ');
  }

  let awaitingConfirm = false;
  let searchBusy = false;

  // 비밀번호·이메일·숫자 칸은 검색창일 리 없으니 제외한다.
  function isTypableText(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const t = (el.type || 'text').toLowerCase();
    return t === 'text' || t === 'search' || t === '';
  }

  // root 안에서 이 사이트의 검색창을 찾는다. 선택자는 사이트별로 다르다.
  function findInputIn(root) {
    for (const sel of SITE.inputSelectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch {
        /* 잘못된 선택자는 건너뛴다 */
      }
    }
    return null;
  }

  function getSearchInput() {
    const el = findInputIn(document);
    if (el) return el;
    // 선택자가 하나도 안 맞으면 지금 입력 중인 칸을 검색창으로 본다.
    return isTypableText(document.activeElement) ? document.activeElement : null;
  }

  async function handleKoreanSearch(input, submitFn) {
    const value = input.value.trim();
    if (!value || !isMine(value, SITE_LANG)) return false; // 한국어(내 말)가 아니면 그대로 통과

    searchBusy = true;
    setBadge('검색어 번역 중…');
    try {
      const { thai, via, note } = await translateShopQuery(value);
      if (!thai) throw new Error('번역 결과가 비어 있습니다');
      // 로마자 언어 사용자가 이미 그 쇼핑몰 말로 쓴 검색어(영어 사용자가 베트남 쇼피에서 베트남어로)는 구글이 그대로
      // 돌려준다 — 확인 Enter 없이 바로 찾는다.
      if (!MY_KO && thai.trim() === value) {
        submitFn();
        return true;
      }

      setInputValue(input, thai);

      const msg = `"${value}" → "${thai}"  (${via})` + (note ? `\n${note}` : '');
      // 통합 번역 아이콘 화면에서도 바꿀 수 있어서, 열려 있는 페이지도 바로 따르게 쓸 때마다 다시 읽는다.
      cfg.confirmSearch = GM_getValue('confirmSearch', cfg.confirmSearch);
      if (cfg.confirmSearch) {
        awaitingConfirm = true;
        toast(`${msg}\n확인 후 Enter를 다시 누르세요. 직접 수정해도 됩니다.`, note ? 9000 : 6000);
        input.focus();
        input.setSelectionRange(thai.length, thai.length);
      } else {
        toast(msg, 2500);
        // 곧바로 페이지가 넘어가 토스트가 사라진다. 용어집에 없던 말은 알려야 채워 넣을
        // 수 있으니, 결과 페이지에서 다시 띄운다.
        if (note) carryToast(msg, 8000);
        submitFn();
      }
      return true;
    } catch (e) {
      toast(`검색어 번역 실패: ${e.message}`, 4000);
      return false;
    } finally {
      searchBusy = false;
      setBadge(null);
    }
  }

  // 라자다의 검색창은 값을 자기 JS 상태로 따로 들고 있다. input.value 에 직접 써도
  // 그 상태는 그대로라서, 리렌더가 일어나면 입력창이 원래 한국어로 되돌아가고
  // 제출도 한국어로 나간다. 네이티브 setter 로 쓴 뒤 값 추적기를 무효화해야
  // 프레임워크가 변경을 인식한다.
  function setInputValue(input, value) {
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; // 구글 검색칸 = textarea
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, value);
    if (input._valueTracker) input._valueTracker.setValue('');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 폼 제출이나 검색 버튼에 맡기면 라자다가 자기 상태로 주소를 다시 만들어
  // 한국어가 되살아난다. 주소를 직접 만들어 이동하는 쪽이 확실하다.
  function submitSearch(input) {
    if (!SITE.searchUrl) return; // 표에 없는 사이트
    const q = (input.value || '').trim();
    if (!q) return;
    location.href = SITE.searchUrl(q);
  }

  function isSearchInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    for (const sel of SITE.inputSelectors) {
      try {
        if (el.matches(sel)) return true;
      } catch {
        /* 잘못된 선택자는 건너뛴다 */
      }
    }
    return false;
  }

  // 검색창 자체가 아니라 자동완성 드롭다운 같은 형제 요소가 키 이벤트를 받는 경우가 있다.
  // 검색 위젯 안에서 일어난 일이면 전부 검색 동작으로 본다.
  function inSearchWidget(el) {
    if (isSearchInput(el)) return true;
    if (el && el.closest && SITE.widgetSelector) {
      try {
        if (el.closest(SITE.widgetSelector)) return true;
      } catch {
        /* 무시 */
      }
    }
    // 구조를 확인하지 못한 사이트용 보완. 켜 두면 한국어가 든 텍스트 칸의 Enter 를
    // 전부 검색으로 본다. 두 사이트 다 선택자를 확인했으므로 지금은 꺼져 있다.
    return SITE.broadInputFallback ? isTypableText(el) : false;
  }

  // 리스너를 입력란·폼·버튼에 직접 붙이면 소용이 없다. 라자다가 자기 핸들러를
  // 먼저 등록해 두기 때문에 그쪽이 먼저 실행되고, 한국어가 그대로 검색으로 나간다.
  // window 캡처 단계는 하위 요소의 어떤 리스너보다 먼저 실행되므로 여기서 가로챈다.
  function installSearchInterceptors() {
    if (window.__lzkSearchHooked) return;
    window.__lzkSearchHooked = true;

    const intercept = (e, input) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (searchBusy) return;            // 번역이 진행 중이면 중복 실행하지 않는다
      handleKoreanSearch(input, () => submitSearch(input));
    };

    // 확인 차례(awaitingConfirm)는 검색칸이 아직 태국어일 때만이다. 그 사이 한국어로 다시 쳤으면 새로 바꾼다 —
    // 안 그러면 다시 친 한국어가 그대로 검색으로 나갔다(2026-11-04 전수검사).
    const confirming = (input) => {
      if (!awaitingConfirm) return false;
      awaitingConfirm = false;
      return !isMine(input.value, SITE_LANG);
    };

    window.addEventListener(
      'keydown',
      (e) => {
        // 한글 조합 중의 Enter(글자 확정)는 그냥 둔다 — 바로 뒤에 오는 Enter 를 잡는다(메신저·다른 사이트와 같게).
        // 조합 중 Enter 로 바꾸기를 시작하면 뒤따르는 Enter 가 확인 Enter 로 읽혀 확인 없이 검색됐다.
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        if (!inSearchWidget(e.target)) return;
        // 대상이 입력창이 아니면(자동완성 목록 등) 실제 검색창을 찾아 쓴다.
        const input = isSearchInput(e.target) ? e.target : getSearchInput();
        if (!input) return;
        if (confirming(input)) {
          // 확인 Enter. 라자다에 넘기면 자기 상태에 남은 한국어로 검색해 버리므로
          // 여기서도 막고 우리가 직접 태국어 주소로 이동한다.
          e.preventDefault();
          e.stopImmediatePropagation();
          submitSearch(input);
          return;
        }
        if (!isMine(input.value, SITE_LANG)) return;
        intercept(e, input);
      },
      true
    );

    window.addEventListener(
      'submit',
      (e) => {
        const form = e.target;
        if (!form || typeof form.querySelector !== 'function') return;
        // 사이트마다 검색창 이름이 다르다(라자다 q, 쇼피 keyword). 폼 안에서 찾는다.
        // 로그인·주소 같은 다른 폼까지 건드리지 않도록, 폼 밖으로는 나가지 않는다.
        const input = findInputIn(form);
        if (!input) return;
        if (confirming(input)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          submitSearch(input);
          return;
        }
        if (!isMine(input.value, SITE_LANG)) return;
        intercept(e, input);
      },
      true
    );

    // 검색 버튼은 <a href="/catalog/?q="> 형태라 클릭도 가로챈다.
    window.addEventListener(
      'click',
      (e) => {
        if (!e.target.closest || !SITE.buttonSelector) return;
        let btn = null;
        try {
          btn = e.target.closest(SITE.buttonSelector);
        } catch {
          /* 무시 */
        }
        if (!btn) return;
        const input = getSearchInput();
        if (!input) return;
        if (confirming(input)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          submitSearch(input);
          return;
        }
        if (!isMine(input.value, SITE_LANG)) return;
        intercept(e, input);
      },
      true
    );
  }

  function hookSearch() {
    installSearchInterceptors();
    const input = getSearchInput();
    if (!input || input.dataset.lzkHooked) return;
    input.dataset.lzkHooked = '1';
    // 다른 언어 사용자에게는 한국어 안내가 읽히지 않는다 — 쇼핑몰의 안내를 그대로 둔다.
    if (MY_KO) input.placeholder = '한국어로 검색하세요 (예: 무선 이어폰)';
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  // document-start 에서는 아직 head 가 없을 수 있어 init 에서 주입한다.
  const LZK_CSS = `
    #lzk-fab {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
      width: 46px; height: 46px; border-radius: 50%; border: none; cursor: pointer;
      background: #0f146e; color: #fff; font: 600 15px/1 system-ui, sans-serif;
      box-shadow: 0 4px 14px rgba(0,0,0,.28);
    }
    #lzk-fab:hover { background: #1a22a0; }
    #lzk-fab[data-high] { bottom: 96px; }
    /* 끌어서 옮기는 단추 — 끄는 동안 페이지 글이 같이 선택되지 않게 */
    #lzk-fab, #lzk-langbar .lzk-lang-toggle { user-select: none; -webkit-user-select: none; }
    #lzk-langbar {
      position: fixed; right: 72px; bottom: 26px; z-index: 2147483000; display: flex; gap: 4px; align-items: flex-end;
    }
    #lzk-langbar[data-solo] { right: 18px; }
    #lzk-langbar[data-high] { bottom: 104px; }
    /* 언어가 많으면(2026-11-03 사용자: 많이 쓰는 언어 20개 — 22개) 한 줄에 12개까지, 넘치면 위로 줄을 더한다. */
    #lzk-langbar .lzk-langs { display: none; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: min(404px, calc(100vw - 150px)); }
    #lzk-langbar[data-open] .lzk-langs { display: flex; }
    #lzk-langbar button {
      width: 30px; height: 30px; padding: 0; border-radius: 50%; cursor: pointer;
      border: 1px solid #0f146e; background: #fff; color: #0f146e; opacity: .85;
      font: 600 13px/1 system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.2);
    }
    #lzk-langbar button.lzk-lang-toggle { width: auto; padding: 0 11px; border-radius: 15px; }
    #lzk-langbar button:hover { opacity: 1; }
    #lzk-langbar button[data-on] { background: #0f146e; color: #fff; opacity: 1; }
    #lzk-badge {
      position: fixed; right: 74px; bottom: 26px; z-index: 2147483000;
      background: #0f146e; color: #fff; padding: 5px 10px; border-radius: 6px;
      font: 500 12px/1.4 system-ui, sans-serif; white-space: nowrap;
    }
    #lzk-langbar ~ #lzk-badge { bottom: 64px; }
    #lzk-toast {
      position: fixed; right: 18px; bottom: 76px; z-index: 2147483000; max-width: 340px;
      background: #111; color: #fff; padding: 11px 14px; border-radius: 8px;
      font: 500 13px/1.55 system-ui, sans-serif; white-space: pre-wrap;
      box-shadow: 0 6px 20px rgba(0,0,0,.35);
    }
    #lzk-panel {
      position: fixed; right: 18px; bottom: 76px; z-index: 2147483001; width: 340px;
      max-height: 76vh; overflow-y: auto; background: #fff; color: #111;
      border: 1px solid #d8d8e0; border-radius: 10px; padding: 16px;
      font: 400 13px/1.55 system-ui, sans-serif;
      box-shadow: 0 8px 28px rgba(0,0,0,.22);
    }
    #lzk-panel h3 { margin: 0 0 12px; font-size: 15px; }
    #lzk-panel label { display: block; margin: 12px 0 4px; font-weight: 600; font-size: 12px; }
    #lzk-panel input[type=text], #lzk-panel input[type=password], #lzk-panel input[type=number],
    #lzk-panel select, #lzk-panel textarea {
      width: 100%; box-sizing: border-box; padding: 7px 8px;
      border: 1px solid #ccc; border-radius: 5px; font: inherit; font-size: 12px;
    }
    #lzk-panel textarea { height: 96px; resize: vertical; font-family: ui-monospace, monospace; }
    #lzk-panel .lzk-row { display: flex; gap: 6px; align-items: center; }
    #lzk-panel .lzk-check { display: flex; align-items: center; gap: 7px; margin: 9px 0; font-weight: 500; }
    #lzk-panel .lzk-check input { margin: 0; }
    #lzk-panel button {
      padding: 7px 11px; border: 1px solid #0f146e; border-radius: 5px;
      background: #0f146e; color: #fff; cursor: pointer; font: 600 12px/1 system-ui, sans-serif;
    }
    #lzk-panel button.lzk-ghost { background: #fff; color: #0f146e; }
    #lzk-panel .lzk-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }
    #lzk-panel .lzk-hint { color: #666; font-size: 11px; margin-top: 4px; }
    #lzk-panel details {
      margin-top: 16px; border-top: 1px solid #e6e6ec; padding-top: 10px;
    }
    #lzk-panel details summary {
      cursor: pointer; font-weight: 600; font-size: 12px; color: #0f146e;
      list-style: revert;
    }
    #lzk-panel details[open] summary { margin-bottom: 4px; }
    #lzk-thchip {
      position: fixed; z-index: 2147483002; height: 24px; padding: 0 9px; border: none; border-radius: 12px;
      background: #0f146e; color: #fff; cursor: pointer; font: 600 12px/24px system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    #lzk-thchip:hover { background: #1a22a0; }
    #lzk-chatchip {
      position: fixed; z-index: 2147483002; height: 24px; padding: 0 10px; border: none; border-radius: 12px;
      background: #0f146e; color: #fff; cursor: pointer; font: 600 12px/24px system-ui, sans-serif;
      white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    #lzk-chatchip[data-off] { background: #6b6b76; }
    .lzk-msgko {
      margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(128,128,128,.35);
      font-size: .92em; opacity: .85; white-space: pre-wrap;
    }
    .lzk-msgsrc { margin-top: 2px; font-size: .8em; opacity: .6; white-space: pre-wrap; }
    .lzk-msgsrc:empty { display: none; }
    #lzk-seltip {
      position: absolute; z-index: 2147483002; border: none; border-radius: 6px;
      background: #0f146e; color: #fff; padding: 6px 10px; cursor: pointer;
      font: 600 12px/1 system-ui, sans-serif; box-shadow: 0 3px 10px rgba(0,0,0,.3);
    }
    #lzk-selpop {
      position: fixed; right: 18px; bottom: 76px; z-index: 2147483002; width: 340px;
      max-height: 60vh; overflow-y: auto; background: #fff; color: #111;
      border: 1px solid #d8d8e0; border-radius: 10px; padding: 14px;
      font: 400 13px/1.6 system-ui, sans-serif; box-shadow: 0 8px 28px rgba(0,0,0,.22);
    }
    #lzk-selpop .lzk-src { color: #666; font-size: 12px; margin-bottom: 9px; word-break: break-word; }
    #lzk-selpop .lzk-ko { font-size: 14px; font-weight: 600; word-break: break-word; }
    #lzk-selpop .lzk-via { color: #888; font-size: 11px; margin-top: 9px; }
    #lzk-selpop .lzk-close {
      float: right; border: none; background: none; cursor: pointer;
      font-size: 17px; color: #888; line-height: 1; padding: 0 0 0 8px;
    }
    #lzk-imgbtn, #lzk-imgall {
      position: fixed; z-index: 2147483002; border: none; border-radius: 6px;
      background: rgba(15, 20, 110, .92); color: #fff; padding: 7px 11px; cursor: pointer;
      font: 600 12px/1 system-ui, sans-serif; box-shadow: 0 3px 10px rgba(0,0,0,.3);
    }
    #lzk-imgbtn:hover, #lzk-imgall:hover { background: #1a22a0; }
    #lzk-imgall { background: rgba(0, 110, 90, .92); }
    #lzk-imgall:hover { background: #008a70; }
    #lzk-overlays { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483000; pointer-events: none; }
    .lzk-overlay {
      position: fixed; display: none; margin: 0; padding: 0; border: 0;
      max-width: none; max-height: none; pointer-events: none;
    }
    #lzk-imgbtn[data-busy], #lzk-imgall[data-busy] { cursor: progress; background: rgba(60, 60, 70, .9); }
    .lzk-dub-btn.ytp-button {
      width: auto !important; min-width: 36px; padding: 0 6px !important; vertical-align: top;
      color: #fff !important; font: 700 16px/1 system-ui, sans-serif !important; opacity: .92;
    }
    .lzk-dub-btn.ytp-button[data-on] { color: #ffd54a !important; }
    .lzk-dubsub {
      position: fixed; z-index: 2147483001; pointer-events: none; text-align: center;
      color: #fff; font-weight: 600; line-height: 1.4; white-space: pre-wrap; word-break: keep-all;
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
      text-shadow: 0 0 2px #000, 0 0 5px #000;
    }
    .lzk-dubsub span {
      background: rgba(0, 0, 0, .58); padding: .06em .4em; border-radius: 4px;
      -webkit-box-decoration-break: clone; box-decoration-break: clone;
    }
    .lzk-dubsub[hidden], #lzk-dubchip[hidden] { display: none !important; }
    html[data-lzk-dubsubs] ${RC.youtube.player} .ytp-caption-window-container,
    html[data-lzk-dubsubs] ${RC.youtube.shortsPlayerAny} .ytp-caption-window-container { display: none !important; }
    #lzk-dubchip {
      position: fixed; z-index: 2147483002; border: none; border-radius: 6px;
      background: rgba(15, 20, 110, .92); color: #fff; padding: 7px 11px; cursor: pointer;
      font: 600 12px/1 system-ui, sans-serif; box-shadow: 0 3px 10px rgba(0,0,0,.3);
    }
    #lzk-dubchip:hover { background: #1a22a0; }
    .lzk-dubpanel {
      position: fixed; z-index: 2147483003; width: 270px; box-sizing: border-box; padding: 12px 14px 14px;
      background: #fff; color: #111; border: 1px solid #d8d8e0; border-radius: 10px; text-align: left;
      font: 400 13px/1.5 system-ui, sans-serif; box-shadow: 0 8px 28px rgba(0,0,0,.3);
    }
    .lzk-dubpanel .lzk-dub-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
    .lzk-dubpanel .lzk-dub-x { border: none; background: none; color: #888; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px; }
    .lzk-dubpanel .lzk-dub-status { color: #555; font-size: 12px; margin: 4px 0 10px; min-height: 18px; }
    .lzk-dubpanel .lzk-dub-toggle {
      width: 100%; padding: 9px; border: none; border-radius: 6px; cursor: pointer;
      background: #0f146e; color: #fff; font: 600 13px/1 system-ui, sans-serif;
    }
    .lzk-dubpanel .lzk-dub-toggle[data-on] { background: #b42318; }
    .lzk-dubpanel .lzk-dub-cc {
      width: 100%; margin: -4px 0 10px; padding: 7px; border: 1px solid #0f146e; border-radius: 6px; cursor: pointer;
      background: #fff; color: #0f146e; font: 600 12px/1 system-ui, sans-serif;
    }
    .lzk-dubpanel .lzk-dub-cc[hidden] { display: none; }
    .lzk-dubpanel label { display: block; margin-top: 11px; color: #111; font-size: 12px; font-weight: 600; }
    .lzk-dubpanel input[type=range] { display: block; width: 100%; margin: 5px 0 0; }
    .lzk-dubpanel .lzk-dub-check { display: flex; gap: 6px; align-items: center; font-weight: 500; }
    .lzk-dubpanel .lzk-dub-voicebox { margin: 0 0 4px 22px; }
    .lzk-dubpanel .lzk-dub-voicebox[hidden] { display: none; }
    .lzk-dubpanel select {
      display: block; width: 100%; margin-top: 5px; padding: 5px; box-sizing: border-box;
      border: 1px solid #ccc; border-radius: 5px; background: #fff; color: #111; font: 400 12px/1.3 system-ui, sans-serif;
    }
  `;

  // 우리가 만든 UI 는 이미 한국어다. 크롬 자동번역이 이걸 태국어로 착각해
  // 한 번 더 번역하면 문장이 완전히 무너진다("설정" -> "아주 오래전 일이에요").
  // translate="no" 와 notranslate 클래스로 번역 대상에서 제외시킨다.
  // translate="no" 는 HTML 표준, notranslate 는 구글 번역, skiptranslate 는
  // 구글 번역 위젯이 쓰는 표시다. 어느 경로로 번역기가 붙어도 걸리도록 셋 다 단다.
  function markNoTranslate(el) {
    el.setAttribute('translate', 'no');
    el.classList.add('notranslate', 'skiptranslate', 'lzk-skip');
    el.lang = 'ko';
    return el;
  }

  // '한'·'번역' 단추 자리 (2026-11-21 사용자: 고정이라 불편 — 자유롭게 옮기게). 둘 중 하나를 끌면 둘이 같이 움직이고,
  // 놓은 자리를 이 사이트와 '기본'(아직 옮긴 적 없는 사이트가 따른다)으로 기억한다. 메신저는 오른쪽 아래에 보내기 단추가
  // 있어 기본을 따르지 않고 메신저에서 옮긴 자리만 쓴다. '한' 이 화면 왼쪽 절반이면 '번역' 은 그 오른쪽에, 위쪽 절반이면
  // 언어 줄·설정 창·알림이 아래로 펼쳐진다. 옮긴 적이 없으면 CSS 그대로(오른쪽 아래) — 예전 모습과 같다.
  // 자리 = { h: 'l'|'r', x: 그 쪽 가장자리에서 '한' 까지, v: 't'|'b', y: 위·아래 가장자리에서 } (px). 창 크기가 바뀌어도
  // 가까운 모서리에서의 거리를 지켜 화면 안에 남는다.
  const FAB_POS_KEY = 'fabPos';
  const FAB_SIZE = 46;
  let fabDragPos = null; // 끄는 중의 자리(놓을 때 저장)
  let fabLock = null; // '번역' 을 끄는 동안은 좌우·위아래를 바꾸지 않는다(단추가 손가락 밑에서 반대편으로 튀지 않게)
  let fabNoClick = 0; // 끌고 놓은 직후의 click 은 누른 것이 아니다
  let fabHooked = false;

  function fabSaved() {
    const all = GM_getValue(FAB_POS_KEY, null);
    if (!all || typeof all !== 'object') return null;
    const p = all[location.hostname] || (MESSENGER ? null : all['*']);
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  }

  function fabSave(p) {
    let all = GM_getValue(FAB_POS_KEY, null);
    if (!all || typeof all !== 'object') all = {};
    delete all[location.hostname]; // 맨 뒤로 — 오래 안 쓴 사이트부터 지운다
    all[location.hostname] = p;
    if (!MESSENGER) all['*'] = p;
    const hosts = Object.keys(all).filter((k) => k !== '*');
    for (const k of hosts.slice(0, Math.max(0, hosts.length - 300))) delete all[k];
    GM_setValue(FAB_POS_KEY, all);
  }

  function fabReset() {
    GM_setValue(FAB_POS_KEY, {});
    fabDragPos = null;
    fabLock = null;
    placeLzk();
  }

  function fabView() {
    const de = document.documentElement;
    return { w: Math.min(innerWidth, de.clientWidth || innerWidth), h: Math.min(innerHeight, de.clientHeight || innerHeight) };
  }

  // 저장한 자리 → 이 화면에서 '한' 의 왼쪽·위 (화면 밖으로 나가지 않게).
  function fabXY(p, vw, vh) {
    const S = FAB_SIZE;
    const m = 4;
    const l = p.h === 'l' ? p.x : vw - p.x - S;
    const t = p.v === 't' ? p.y : vh - p.y - S;
    return { l: Math.max(m, Math.min(vw - S - m, l)), t: Math.max(m, Math.min(vh - S - m, t)) };
  }

  function fabPosFrom(l, t, vw, vh) {
    const S = FAB_SIZE;
    const h = l + S / 2 < vw / 2 ? 'l' : 'r';
    const v = t + S / 2 < vh / 2 ? 't' : 'b';
    return { h, x: Math.round(h === 'l' ? l : vw - l - S), v, y: Math.round(v === 't' ? t : vh - t - S) };
  }

  // 지금 '한' 이 있는 자리(옮긴 적이 없으면 화면에서 잰다; '한' 이 없으면 '번역' 막대에서 거꾸로 셈한다).
  function fabNowXY(vw, vh) {
    const p = fabDragPos || fabSaved();
    if (p) return fabXY(p, vw, vh);
    const fab = document.getElementById('lzk-fab');
    if (fab) {
      const r = fab.getBoundingClientRect();
      return { l: r.left, t: r.top };
    }
    const bar = document.getElementById('lzk-langbar');
    const r = bar ? bar.getBoundingClientRect() : { right: vw - 18, bottom: vh - 26 };
    return { l: r.right - FAB_SIZE, t: r.bottom + 8 - FAB_SIZE };
  }

  // '한'·'번역' 막대·설정 창·알림·작은 상태 표시·선택 번역 창을 '한' 자리에 맞춰 둔다.
  function placeLzk() {
    const get = (id) => document.getElementById(id);
    const fab = get('lzk-fab');
    const bar = get('lzk-langbar');
    const langs = bar && bar.querySelector('.lzk-langs');
    // 옮긴 자리에서는 쓰지 않는 쪽을 auto 로 — CSS 의 right·bottom 이 남으면 막대·알림이 양쪽으로 늘어난다.
    // 처음 자리로 돌릴 때(none)는 모두 비워 CSS 그대로.
    const set = (el, o, none) => {
      if (!el) return;
      for (const k of ['left', 'right', 'top', 'bottom']) el.style[k] = o[k] || (none ? '' : 'auto');
      for (const k of ['maxHeight', 'flexDirection', 'alignItems']) el.style[k] = o[k] || '';
    };
    const p = fabDragPos || fabSaved();
    if (!p) {
      for (const id of ['lzk-fab', 'lzk-langbar', 'lzk-panel', 'lzk-toast', 'lzk-badge', 'lzk-selpop']) set(get(id), {}, true);
      if (langs) langs.style.justifyContent = langs.style.maxWidth = '';
      return;
    }
    const S = FAB_SIZE;
    const { w: vw, h: vh } = fabView();
    const { l, t } = fabXY(p, vw, vh);
    const side = fabLock || fabPosFrom(l, t, vw, vh);
    const L = side.h === 'l';
    const T = side.v === 't';
    const r = vw - l - S;
    const b = vh - t - S;
    const hx = (off) => (L ? { left: `${l + off}px` } : { right: `${r + off}px` });
    const vy = (off) => (T ? { top: `${t + off}px` } : { bottom: `${b + off}px` });
    set(fab, { ...hx(0), ...vy(0) });
    if (bar) {
      const off = fab ? S + 8 : 0;
      set(bar, { ...hx(off), ...vy(8), flexDirection: L ? 'row-reverse' : '', alignItems: T ? 'flex-start' : '' });
      if (langs) {
        const tg = bar.querySelector('.lzk-lang-toggle');
        const room = (L ? vw - l - off : l + S - off) - ((tg && tg.offsetWidth) || 80) - 12;
        langs.style.justifyContent = L ? 'flex-start' : '';
        langs.style.maxWidth = `${Math.max(120, Math.min(404, room))}px`;
      }
    }
    set(get('lzk-badge'), { ...hx(S + 10), ...vy(bar ? 46 : 8) });
    // 넓은 창(설정 340px 등)은 '한' 과 같은 쪽 가장자리에 맞추되 화면 밖으로 나가지 않게.
    for (const [id, frac] of [['lzk-panel', 0.76], ['lzk-toast', 0], ['lzk-selpop', 0.6]]) {
      const el = get(id);
      if (!el) continue;
      const room = vw - (el.offsetWidth || 340) - 8;
      const edge = Math.max(8, Math.min(L ? l : r, room));
      const gap = (T ? t : b) + S + 12;
      set(el, {
        ...(L ? { left: `${edge}px` } : { right: `${edge}px` }),
        ...(T ? { top: `${gap}px` } : { bottom: `${gap}px` }),
        // max-height 는 안쪽 높이 — 위아래 여백·테두리(약 34px)를 빼야 화면 끝에 닿지 않는다.
        maxHeight: frac ? `${Math.max(120, Math.min(vh * frac, vh - gap - 8 - 40))}px` : '',
      });
    }
  }

  // 누르고 5px 넘게 움직이면 끌기 — 놓으면 그 자리를 기억하고, 그 뒤의 click(설정 열기·언어 펼치기)은 삼킨다.
  function fabDraggable(el, lock) {
    if (!el || el.dataset.lzkDrag) return;
    el.dataset.lzkDrag = '1';
    el.style.touchAction = 'none'; // 손가락으로 끌 때 페이지가 대신 밀리지 않게
    if (!fabHooked) {
      fabHooked = true;
      window.addEventListener(
        'click',
        (e) => {
          if (Date.now() > fabNoClick) return;
          const t = e.target;
          if (!t || !t.closest || !t.closest('#lzk-fab, #lzk-langbar .lzk-lang-toggle')) return;
          fabNoClick = 0;
          e.preventDefault();
          e.stopImmediatePropagation();
        },
        true
      );
      // 창 크기가 바뀌거나, 다른 탭에서 옮기고 돌아오면 다시 맞춘다.
      window.addEventListener('resize', () => fabSaved() && placeLzk());
      window.addEventListener('focus', () => placeLzk());
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && placeLzk());
    }
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || fabDragPos) return;
      const v0 = fabView();
      const start = fabNowXY(v0.w, v0.h);
      const x0 = e.clientX;
      const y0 = e.clientY;
      let moving = false;
      const move = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (!moving) {
          if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
          moving = true;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* 이미 손을 뗐다 */
          }
          document.getElementById('lzk-langbar')?.removeAttribute('data-open');
          if (lock) fabLock = fabPosFrom(start.l, start.t, v0.w, v0.h);
        }
        ev.preventDefault();
        const v = fabView();
        fabDragPos = fabPosFrom(start.l + dx, start.t + dy, v.w, v.h);
        placeLzk();
      };
      const up = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        if (!moving) return;
        fabNoClick = Date.now() + 600;
        const p = fabDragPos;
        fabDragPos = null;
        fabLock = null;
        if (p) {
          const v = fabView();
          const { l, t } = fabXY(p, v.w, v.h); // 화면 안으로 당긴 자리를 저장한다
          fabSave(fabPosFrom(l, t, v.w, v.h));
        }
        placeLzk();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    });
  }

  let badgeEl = null;
  function setBadge(text) {
    if (!text) {
      badgeEl?.remove();
      badgeEl = null;
      return;
    }
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.id = 'lzk-badge';
      markNoTranslate(badgeEl);
      document.body.appendChild(badgeEl);
      placeLzk();
    }
    badgeEl.textContent = text;
  }

  let toastTimer = null;
  function toast(msg, ms = 3000) {
    let el = document.getElementById('lzk-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lzk-toast';
      markNoTranslate(el);
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.onclick = null; // 누를 수 있는 안내(toastAction)였다면 되돌린다
    el.style.cursor = '';
    placeLzk(); // 글 길이로 너비가 바뀐다 — 화면 안에 들게 다시 맞춘다
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), ms);
  }
  // 누르면 onClick 을 부르는 안내(그 누름이 크롬의 '사용자 동작' 이 된다 — 내장 번역기 켜기).
  function toastAction(msg, ms, onClick) {
    toast(msg, ms);
    const el = document.getElementById('lzk-toast');
    if (!el) return;
    el.style.cursor = 'pointer';
    el.onclick = () => {
      el.onclick = null;
      el.style.cursor = '';
      onClick();
    };
  }

  // 페이지를 넘어가도 보여 줄 토스트. 다음 페이지의 init 에서 꺼내 띄운다.
  const CARRY_KEY = 'lzk-carry-toast';
  function carryToast(msg, ms) {
    try {
      sessionStorage.setItem(CARRY_KEY, JSON.stringify({ msg, ms, at: Date.now() }));
    } catch {
      /* 저장소가 막혀 있으면 포기한다 */
    }
  }
  function showCarriedToast() {
    let v = null;
    try {
      v = JSON.parse(sessionStorage.getItem(CARRY_KEY) || 'null');
      sessionStorage.removeItem(CARRY_KEY);
    } catch {
      return;
    }
    if (v && Date.now() - v.at < 20000) toast(v.msg, v.ms);
  }

  // ---------------------------------------------------------------------------
  // 선택 번역 — 페이지 전체는 크롬 자동번역에 맡기고,
  // 뭉개져 보이는 상품명만 드래그해서 AI 로 제대로 본다.
  // ---------------------------------------------------------------------------

  let selTip = null;
  function removeSelTip() {
    if (selTip) {
      selTip.remove();
      selTip = null;
    }
  }

  function showSelPopup(src, ko, via) {
    const old = document.getElementById('lzk-selpop');
    if (old) old.remove();
    const pop = document.createElement('div');
    pop.id = 'lzk-selpop';
    markNoTranslate(pop);
    pop.innerHTML =
      '<button class="lzk-close" type="button" title="닫기">&times;</button>' +
      '<div class="lzk-src"></div><div class="lzk-ko"></div><div class="lzk-via"></div>';
    pop.querySelector('.lzk-src').textContent = src;
    pop.querySelector('.lzk-ko').textContent = ko;
    pop.querySelector('.lzk-via').textContent = `번역: ${via}`;
    pop.querySelector('.lzk-close').addEventListener('click', () => pop.remove());
    document.body.appendChild(pop);
    placeLzk();
  }

  async function runSelectionTranslate(src) {
    removeSelTip();
    setBadge('선택 번역 중…');
    try {
      const { ko, via } = await translateSelection(src);
      if (ko) showSelPopup(src, ko, via);
      else toast('번역 결과가 비어 있습니다.');
    } catch (e) {
      toast(`선택 번역 실패: ${e.message}`, 4000);
    } finally {
      setBadge(null);
    }
  }

  function handleSelection() {
    if (!cfg.selectionTranslate) return removeSelTip();
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text || text.length < 2 || text.length > 400) return removeSelTip();
    if (isMyText(text)) return removeSelTip();               // 이미 한국어(내 언어)
    if (!THAI.test(text) && !LATIN_WORD.test(text)) return removeSelTip();
    // 바트 기호 ฿ 는 태국어 영역(U+0E3F)이라 가격만 끌어도 태국어로 잡힌다.
    // 기호·숫자를 걷어내고도 글자가 남을 때만 버튼을 띄운다.
    if (!text.replace(/[฿\d\s.,%\-+/()[\]:|~฿]+/g, '')) return removeSelTip();

    let rect;
    try {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch {
      return removeSelTip();
    }
    if (!rect || (!rect.width && !rect.height)) return removeSelTip();

    removeSelTip();
    selTip = document.createElement('button');
    selTip.id = 'lzk-seltip';
    markNoTranslate(selTip);
    selTip.type = 'button';
    selTip.textContent = '한국어로';
    selTip.style.left = `${window.scrollX + rect.left}px`;
    selTip.style.top = `${window.scrollY + rect.bottom + 6}px`;
    selTip.addEventListener('mousedown', (e) => e.preventDefault()); // 선택이 풀리지 않게
    selTip.addEventListener('click', () => runSelectionTranslate(text));
    document.body.appendChild(selTip);
  }

  function installSelectionUI() {
    document.addEventListener('mouseup', () => setTimeout(handleSelection, 10));
    document.addEventListener('mousedown', (e) => {
      if (e.target && e.target.id !== 'lzk-seltip') removeSelTip();
    });
  }

  // ---------------------------------------------------------------------------
  // 사진 속 글자 번역 — 상품 사진의 태국어를 읽어(OCR) 그 자리에 한국어를 덮어 그린다.
  //
  // 사진에 마우스를 잠깐(0.5초) 올려 두면 그 사진만 읽어 바꾼다. 목록 페이지의 사진을 모두 읽거나
  // 스쳐 지나간 사진까지 읽으면 한 장에 몇 초라 브라우저가 무거워진다. 버튼으로 원래 사진을 볼 수 있다.
  // 글자 인식은 브라우저 안에서 Tesseract.js(무료, 태국어 지원)로 한다. 처음 한 번 인식 엔진과
  // 태국어 자료(합쳐 4MB 남짓)를 받고, 그 뒤로는 브라우저가 보관한다. 번역은 페이지 번역과 같은 길.
  // 확인한 것(2026-09-27): 라자다는 CSP 가 없어 워커를 띄울 수 있고, img.lazcdn.com 사진은 CORS 를
  // 열어 둬 픽셀을 읽을 수 있다. 흩어진 글자 모드(PSM 11)가 상품 사진의 라벨·표 글자를 자동 모드
  // (PSM 3)보다 훨씬 많이 찾았고, 무늬를 글자로 잘못 읽은 조각은 확신도가 낮아 걸러진다.
  // ---------------------------------------------------------------------------

  const OCR_LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist';
  const OCR_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
  const OCR_MIN_SIDE = 160;     // 이보다 작게 보이는 사진(아이콘·작은 썸네일)엔 버튼을 안 띄운다
  const OCR_MIN_CONF = 35;      // 이보다 확신이 낮은 조각에서 줄을 끊는다(무늬·물건을 글자로 읽은 것)
  const OCR_MIN_LINE_CONF = 72; // 줄 전체 확신도. 시험 사진에서 진짜 줄은 74 이상, 가짜 줄은 대개 43~70
  const OCR_TARGET_SIDE = 1000; // 번역을 그려 넣을 사진 크기. 작은 사진은 이만큼 키워야 한국어가 뭉개지지 않는다
  const OCR_MAX_SIDE = 2000;
  // 한 사진을 크기·색을 바꿔 여러 번 읽는다. 알맞은 글자 크기가 사진마다 달랐다(2026-09-27 시험):
  // 표처럼 글자가 촘촘한 사진은 긴 변 800px 에서 14줄을 읽고 1000px 이상에서는 0~1줄,
  // 큰 제목은 1300px 에서 더 잘 읽혔다. 색 바탕의 흰 글씨·빨간 제목은 색을 뒤집은 흑백본(inv)에서만
  // 읽혔다. 타일 바닥 사진 위의 흰 테두리 파란 기울임 글씨는 어떤 흑백본으로도 엉터리였는데, 색이 진할수록
  // 검게 만든 채도본(sat)에서는 모든 줄이 거의 정확히 읽혔다(광고 글씨는 대개 원색이고 배경은 무채색).
  const OCR_PASSES = [
    { side: 800, mode: 'rgb' },
    { side: 800, mode: 'sat' },
    { side: 800, mode: 'inv' },
    { side: 1300, mode: 'inv' },
  ];
  const OCR_IDLE_MS = 120000;   // 이만큼 안 쓰면 인식기를 내려 메모리를 돌려준다
  // 인식기 여러 개가 여러 번 읽기를 나눠 동시에 한다(하나가 차례로 하면 한 장에 3~4초).
  // 하나에 수십 MB 라 CPU 코어 수보다 적게, 읽기 횟수보다 많지 않게.
  const OCR_WORKERS = Math.max(1, Math.min(OCR_PASSES.length, (navigator.hardwareConcurrency || 2) - 1));
  const OCR_FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

  let ocrPoolP = null;
  let ocrIdleTimer = null;

  // 사진 글자의 언어 = 이 쇼핑몰(나라)의 말. 1.34.2 까지는 태국어 모델뿐이라 베트남·인도네시아·대만·브라질… 쇼피·라자다의
  // 상품 사진은 글자를 하나도 못 읽었다(태국어처럼 생긴 줄만 남겼다). 2026-11-21 사용자: 태국어에만 되던 것을 모든 언어에.
  // 구글 코드 → Tesseract 모델. 여기 없는 언어는 Vision 키가 있을 때만 읽는다.
  const OCR_TESS = {
    th: 'tha', en: 'eng', id: 'ind', vi: 'vie', ms: 'msa', tl: 'fil', 'zh-TW': 'chi_tra', yue: 'chi_tra', zh: 'chi_sim',
    'zh-CN': 'chi_sim', ja: 'jpn', ko: 'kor', pt: 'por', es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pl: 'pol', tr: 'tur',
    ru: 'rus', uk: 'ukr', mn: 'mon', ar: 'ara', ur: 'urd', he: 'heb', hi: 'hin', mr: 'mar', bn: 'ben', ta: 'tam', te: 'tel',
    km: 'khm', lo: 'lao', my: 'mya',
  };
  const ocrGoogle = () => (OCR_TESS[SITE_LANG] ? SITE_LANG : SITE_LANG2);
  const ocrModel = () => OCR_TESS[SITE_LANG] || OCR_TESS[SITE_LANG2] || '';
  const OCR_THAI = () => ocrModel() === 'tha';
  // 그 언어의 글자(줄을 남길지 볼 때). 로마자 언어는 로마자.
  const OCR_LATIN = /[A-Za-zÀ-ɏḀ-ỿ]/;
  const ocrScript = () => (OCR_THAI() ? THAI : SCRIPT_OF[SITE_LANG2] || OCR_LATIN);
  // 태국어 밖의 모델: 확장은 Tesseract 공식 모델(tessdata_fast, GitHub — 코드가 아닌 자료)을 받아 넘긴다(받은 것은 브라우저가
  // 보관한다). 몽키판은 CDN 기본 주소.
  const OCR_DATA_URL = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/';
  let ocrDataP = null;
  function ocrModelData(code) {
    if (!ocrDataP) {
      ocrDataP = new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `${OCR_DATA_URL}${code}.traineddata`,
          responseType: 'arraybuffer',
          timeout: 60000,
          onload: (r) => (r.status === 200 && r.response && r.response.byteLength > 100000 ? resolve(new Uint8Array(r.response)) : reject(new Error(`사진 글자 자료(${code})를 받지 못했습니다 (HTTP ${r.status})`))),
          onerror: () => reject(new Error(`사진 글자 자료(${code})를 받지 못했습니다`)),
          ontimeout: () => reject(new Error(`사진 글자 자료(${code}) 받기가 너무 오래 걸립니다`)),
        });
      }).catch((e) => {
        ocrDataP = null;
        throw e;
      });
    }
    return ocrDataP;
  }

  // 인식기는 모델을 먼저 자기 보관함(이 사이트의 IndexedDB 'keyval-store' › 'keyval', 이름 './<모델>.traineddata')에서
  // 찾는다. 모델 자료를 직접 넘기는 길(createWorker([{ code, data }]))은 tesseract.js 5.1.1 에서 고장이다(초기화에 이름 대신
  // 자료를 넘겨 'initialization failed' — 2026-11-21 시험). 그래서 받은 모델을 그 보관함에 먼저 넣어 두고 이름으로 부른다.
  // 한 번 넣으면 이 사이트에서는 다시 받지 않는다.
  let ocrPrimeP = null;
  function ocrIdb(mode, fn) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('keyval-store');
      req.onupgradeneeded = () => req.result.createObjectStore('keyval');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('keyval')) {
          db.close();
          return reject(new Error('사진 글자 보관함이 없습니다'));
        }
        const tx = db.transaction('keyval', mode);
        const out = fn(tx.objectStore('keyval'));
        tx.oncomplete = () => {
          db.close();
          resolve(out && 'result' in out ? out.result : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }
  function ocrPrime(code) {
    if (!ocrPrimeP) {
      const key = `./${code}.traineddata`;
      ocrPrimeP = (async () => {
        const have = await ocrIdb('readonly', (st) => st.count(key)).catch(() => 0);
        if (have) return;
        const data = await ocrModelData(code);
        await ocrIdb('readwrite', (st) => st.put(data, key));
      })().catch((e) => {
        ocrPrimeP = null;
        throw e;
      });
    }
    return ocrPrimeP;
  }

  async function makeOcrWorker() {
    // 확장(통합 번역)은 엔진과 태국어 자료를 확장 안에 넣었다 — 크롬 웹스토어는 밖에서 받은 코드를 못 돌리게 한다.
    // 그래서 확장은 넣어 둔 tha 를 읽고, 다른 언어는 모델 자료만 받아 넘긴다(config.json 의 ocr.lang 은 몽키판 태국어에만). 몽키판은 CDN.
    const local = typeof GM_extensionURL === 'function';
    const code = ocrModel();
    const lang = code === 'tha' && !local ? RC.ocr.lang : code;
    if (local && code !== 'tha') await ocrPrime(code);
    const w = await Tesseract.createWorker(lang, 1, local ? {
      workerPath: GM_extensionURL('tesseract/worker.min.js'),
      corePath: GM_extensionURL('tesseract'),
      langPath: GM_extensionURL('tesseract'),
    } : {
      workerPath: `${OCR_LIB}/worker.min.js`,
      corePath: OCR_CORE,
    });
    // 태국어 모델은 숫자·영어도 읽는다. 영어 자료(5MB)는 받지 않는다.
    await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
    return w;
  }

  function ocrPool() {
    clearTimeout(ocrIdleTimer);
    if (!ocrPoolP) {
      ocrPoolP = (async () => {
        // 첫 인식기가 태국어 자료를 받아 브라우저에 보관한 뒤에 나머지를 띄운다(여러 번 받지 않게).
        const first = await makeOcrWorker();
        const rest = await Promise.all(Array.from({ length: OCR_WORKERS - 1 }, makeOcrWorker));
        return [first, ...rest];
      })().catch((e) => {
        ocrPoolP = null;
        throw e;
      });
    }
    return ocrPoolP;
  }

  // 사진에 마우스가 닿으면 미리 띄운다. 머무는 0.5초 동안 준비가 끝난다.
  function warmOcr() {
    if (typeof Tesseract === 'undefined') return;
    ocrPool().then(releaseOcrLater, () => {});
    if (OCR_THAI()) loadThaiWords();
  }

  function releaseOcrLater() {
    clearTimeout(ocrIdleTimer);
    ocrIdleTimer = setTimeout(async () => {
      const p = ocrPoolP;
      ocrPoolP = null;
      try {
        for (const w of (await p) || []) await w.terminate();
      } catch {
        /* 이미 내려갔다 */
      }
    }, OCR_IDLE_MS);
  }

  // 화면의 사진은 축소판이다. 원본을 받아야 작은 글자까지 읽힌다.
  //   라자다: …/abc.jpg_720x720q80.jpg_.webp → …/abc.jpg
  //   쇼피:   …/file/th-11134207-…_tn        → …/file/th-11134207-…
  function ocrSourceUrl(img) {
    return (img.currentSrc || img.src)
      .replace(/(\.(?:jpe?g|png|webp))_\d+x\d+[^/?#]*$/i, '$1')
      .replace(/(\/file\/[^/?#]+)_tn$/, '$1');
  }

  async function fetchImageBlob(url) {
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (r.ok) return await r.blob();
    } catch {
      /* CORS 를 안 연 서버 — 아래에서 확장 권한으로 받는다 */
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: 20000,
        onload: (r) =>
          r.status >= 200 && r.status < 300 ? resolve(r.response) : reject(new Error(`사진 받기 실패 (HTTP ${r.status})`)),
        onerror: () => reject(new Error('사진을 받지 못했습니다')),
        ontimeout: () => reject(new Error('사진 받기 시간 초과')),
      });
    });
  }

  async function imageToCanvas(img) {
    const urls = [...new Set([ocrSourceUrl(img), img.currentSrc || img.src])];
    let bmp = null;
    let lastErr = null;
    for (const u of urls) {
      try {
        bmp = await createImageBitmap(await fetchImageBlob(u));
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!bmp) throw lastErr || new Error('사진을 읽지 못했습니다');
    const long = Math.max(bmp.width, bmp.height);
    const scale = Math.min(OCR_MAX_SIDE / long, Math.max(1, OCR_TARGET_SIDE / long));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; // 투명한 PNG 가 JPEG 로 나갈 때 검게 되지 않게
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return canvas;
  }

  // Tesseract 는 태국어를 글자마다 띄어 쓴 것처럼 돌려준다. 태국어는 원래 붙여 쓰므로 붙인다.
  // 자주 틀리는 것도 바로잡는다: 'ำ' 을 'ํ'+'า' 두 글자로 내거나 아예 'า' 로 읽는다
  // (น้ำกระด้าง 센물 → น้ากระด้าง, 번역이 "나는 가혹하다" 가 됐다). 상품 사진의 น้า 는 거의 น้ำ 다.
  function joinThai(s) {
    return s
      .replace(/\s+/g, ' ')
      .replace(/([฀-๿])\s+(?=[฀-๿])/g, '$1')
      .replace(/ํา/g, 'ำ')
      .replace(/น้า(?=[ก-ฮ]|$)/g, 'น้ำ')
      .trim();
  }

  // 태국어답게 생겼나. 태국어 모델은 한국어·영어 글자나 무늬도 억지로 태국어로 읽는데, 그러면
  // 맞춤법이 무너진 글자열이 나온다("ขฆญว ขอขมย"). 그런 줄을 덮어 그리면 사진만 망가지므로 버린다.
  // 상품 사진 스크린숏으로 맞춰 봤다: 진짜 태국어 40줄은 모두 남고, 가짜 34줄 중 30줄이 걸러졌다.
  function looksLikeThai(text) {
    const t = text.replace(/[^฀-๿]/g, '');
    if (t.length < 4) return false;
    if (/[๐-๙]/.test(t)) return false; // 상품 사진에 태국 숫자는 거의 안 쓴다
    const rare = (t.match(/[ฃฅฆฌญฎฏฐฑฒธฬฮ]/g) || []).length;
    if (rare / t.length > 0.12) return false;
    // 모음·성조가 너무 적으면 자음만 늘어놓은 가짜다. อ ว ย 도 모음 노릇을 자주 한다(ของ, กลัว, เลย).
    const vowels = (t.match(/[ะาำิีึืุูเแโใไั็ๅอวย่้๊๋์]/g) || []).length;
    if (vowels / t.length < 0.2) return false;
    if (/([ก-ฮ])\1\1/.test(t)) return false;
    if (/[กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมศษสหฬฮ]{5,}/.test(t)) return false;
    if (/(^|[^ก-ฮ])[ัิีึืุู็]/.test(t)) return false; // 윗·아랫 모음은 자음 뒤에만 온다
    if (/(^|[^ก-ฮัิีึืุู็])[่้๊๋์]/.test(t)) return false; // 성조는 자음이나 윗·아랫 모음 뒤에만 온다
    if (/[เแโใไ]($|[^ก-ฮ])/.test(t.replace(/เเ/g, 'แ'))) return false; // 앞 모음 뒤엔 자음이 온다
    if (/[ะาำ][ัิีึืุู]/.test(t) || /[ัิีึืุู]{2}/.test(t)) return false;
    if (/[^ก-ฮา]ะ/.test(t)) return false;
    const runs = text.split(/[^฀-๿]+/).filter(Boolean);
    return t.length / runs.length >= 3; // 기호 사이사이 한두 글자씩이면 가짜
  }

  // 한 줄을 태국어 토막으로 나눈다. Tesseract 의 태국어 '낱말'은 사실 글자 한두 개라, 확신 낮은
  // 글자를 하나씩 버리면 낱말이 부서진다(ส่ง 에서 ส 만 빠져 성조 부호가 홀로 남고, 줄 전체가 가짜로
  // 판정됐다). 그래서 줄 가운데서는 버리지 않고 끊는다: 태국 숫자(영어 로고 'DC-DC' 를 ๒๐-ว๐ 로
  // 읽은 것)나 아주 낮은 확신도의 조각에서 끊고, 토막 양 끝의 태국 글자 없는 조각과 맨 앞의
  // 홀로 남은 윗·아랫 모음·성조(앞 자음이 끊겨 나간 것)만 떼어 낸다. 끝의 모음·성조는 남긴다(สินค้า 의 ้า).
  function thaiRuns(words) {
    const runs = [];
    let cur = [];
    const flush = () => {
      while (cur.length && (!/[ก-๛]/.test(cur[0].text) || /^[ะ-ฺ็-๎]/.test(cur[0].text))) cur.shift();
      while (cur.length && !/[ก-๛]/.test(cur[cur.length - 1].text)) cur.pop();
      if (cur.length) runs.push(cur);
      cur = [];
    };
    for (const w of words) {
      if (!/\S/.test(w.text)) continue;
      if (w.confidence < OCR_MIN_CONF || /[๐-๙]/.test(w.text)) flush();
      else cur.push(w);
    }
    flush();
    return runs;
  }

  // mode: 'rgb' 그대로, 'inv' 밝기를 뒤집은 흑백, 'sat' 색이 진할수록 검은 흑백
  function scaledCopy(src, scale, mode) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * scale));
    c.height = Math.max(1, Math.round(src.height * scale));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    if (mode !== 'rgb') {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const p = img.data;
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i];
        const g = p[i + 1];
        const b = p[i + 2];
        p[i] = p[i + 1] = p[i + 2] =
          mode === 'sat' ? 255 - (Math.max(r, g, b) - Math.min(r, g, b)) : 255 - (0.299 * r + 0.587 * g + 0.114 * b);
      }
      ctx.putImageData(img, 0, 0);
    }
    return c;
  }

  // ---- 빠진 윗·아랫 모음·성조 되살리기 ----
  // 인식기는 'เหล็กกล่อง' 을 'เหลกกลอง'(강철 드럼) 처럼 모음·성조를 자주 빠뜨린다. 태국 쇼핑 검색 태그
  // 780만 개에서 센 낱말·낱말 묶음(2~3개) 빈도표로, 표시(모음·성조)만 더하면 되는 가장 그럴듯한 낱말들로
  // 줄을 다시 나눈다. 뼈대 글자는 바꾸지 않는다. 앞뒤 낱말 묶음까지 보므로 'กลอง(북)' 처럼 틀린 글자가
  // 우연히 낱말이어도 'เหล็กกล่อง' 으로 고쳐진다. 시험(2026-09-27): 멀쩡한 문구 100% 그대로, 일부러 뺀
  // 표시 90% 복구, 실제 사진 오독 21줄 중 17줄 정답('크롬바 렁 경' → '나이트 영양크림',
  // '고등학교 졸업/대학원생' → '핸들 / 빨판').
  // 빈도표(157,000개, 4.7MB)는 처음 쓸 때 한 번 받고 브라우저가 보관한다(태그를 고정한 주소라 바뀌지 않는다).
  const THAI_WORDS_URL = 'https://cdn.jsdelivr.net/gh/wotjq2/th-korean@thai-words-1/thai-words.tsv';
  const THAI_MARKS = /[ัิีึืุู็่้๊๋์ํ]/;
  const FIX_UNKNOWN = 5;  // 사전에 없는 글자 하나의 벌점(낱말 하나는 대개 2~4점)
  const FIX_ADDED = 1;    // 되살린 표시 하나의 벌점(원문 그대로를 조금 더 믿는다)
  // 표시를 되살리는 낱말은 뼈대 글자 4개 이상만. 짧으면 'สว่าว' 가 'สี(색)+ว่าว(연)' 처럼
  // 흔한 짧은 낱말 둘로 쪼개져 뜻이 엉뚱해졌다.
  const FIX_MIN_SKELETON = 4;
  let thaiWordsP = null;

  const thaiNorm = (s) => s.replace(/ำ/g, 'ํา'); // 'ำ' 는 'ํ'+'า'. 인식기가 'า' 만 읽는 일이 많다
  const thaiSkeleton = (s) => [...s].filter((c) => !THAI_MARKS.test(c)).join('');

  function loadThaiWords() {
    if (!thaiWordsP) {
      thaiWordsP = (async () => {
        const r = await fetch(THAI_WORDS_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const freq = new Map();
        let total = 0;
        for (const line of (await r.text()).split('\n')) {
          const tab = line.indexOf('\t');
          if (tab <= 0) continue;
          const n = +line.slice(tab + 1);
          freq.set(line.slice(0, tab), n);
          total += n;
        }
        const bySkel = new Map();
        let maxSkel = 0;
        for (const w of freq.keys()) {
          const k = thaiSkeleton(w);
          const list = bySkel.get(k);
          if (list) list.push(w);
          else bySkel.set(k, [w]);
          if (k.length > maxSkel) maxSkel = k.length;
        }
        return { freq, bySkel, maxSkel, logTotal: Math.log10(total) };
      })().catch((e) => {
        console.warn(`[${APP_NAME}] 태국어 낱말표를 받지 못해 철자 고치기를 건너뜁니다:`, e);
        return null; // 다음 페이지에서 다시 시도한다
      });
    }
    return thaiWordsP;
  }

  // word 가 span 에 표시만 더한 것이면 더한 개수, 아니면 -1
  function addedMarks(word, span) {
    let j = 0;
    let added = 0;
    for (const c of word) {
      if (j < span.length && c === span[j]) j++;
      else if (THAI_MARKS.test(c)) added++;
      else return -1;
    }
    return j === span.length ? added : -1;
  }

  // 태국어 덩어리 하나를 가장 그럴듯한 낱말들로 나눈다(낱말 점수 = log 빈도 비율 − 더한 표시 수).
  function restoreRun(run, dict) {
    const chars = [...run];
    const base = []; // [뼈대 글자, 시작, 끝(뒤따르는 표시 포함)]
    for (let i = 0; i < chars.length; i++) {
      if (THAI_MARKS.test(chars[i]) && base.length) base[base.length - 1][2] = i + 1;
      else base.push([chars[i], i, i + 1]);
    }
    const n = base.length;
    const best = new Array(n + 1).fill(null);
    best[0] = { score: 0, parts: [] };
    for (let i = 0; i < n; i++) {
      if (!best[i]) continue;
      const one = chars.slice(base[i][1], base[i][2]).join('');
      if (!best[i + 1] || best[i].score - FIX_UNKNOWN > best[i + 1].score) {
        best[i + 1] = { score: best[i].score - FIX_UNKNOWN, parts: [...best[i].parts, one] };
      }
      let k = '';
      for (let len = 1; len <= Math.min(dict.maxSkel, n - i); len++) {
        k += base[i + len - 1][0];
        const cands = dict.bySkel.get(k);
        if (!cands) continue;
        const span = chars.slice(base[i][1], base[i + len - 1][2]).join('');
        for (const w of cands) {
          const add = addedMarks(w, span);
          if (add < 0 || (add > 0 && len < FIX_MIN_SKELETON)) continue;
          const sc = best[i].score + Math.log10(dict.freq.get(w)) - dict.logTotal - add * FIX_ADDED;
          if (!best[i + len] || sc > best[i + len].score) best[i + len] = { score: sc, parts: [...best[i].parts, w] };
        }
      }
    }
    return best[n].parts.join('');
  }

  function restoreThaiMarks(text, dict) {
    if (!dict) return text;
    return thaiNorm(text)
      .replace(/[ก-๛]+/g, (run) => restoreRun(run, dict))
      .replace(/ํา/g, 'ำ');
  }

  // 태국어 밖의 언어: 확신 낮은 조각에서 줄을 끊고, 그 언어 글자가 충분하고 엉터리(같은 글자 넷, 모음 없는 로마자 …)가
  // 아닌 토막만 남긴다. 한자·가나는 붙여 쓰고, 다른 글자는 띄어 쓴다. 이미 내 언어인 줄은 그대로 둔다.
  const OCR_CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
  const OCR_VOWELS = /[aeiouyàáâãäåèéêëìíîïòóôõöùúûüýăắằẳẵặấầẩẫậếềểễệốồổỗộơớờởỡợưứừửữự]/gi;
  function ocrPlausible(text) {
    const script = ocrScript();
    const t = text.replace(/\s+/g, '');
    const mine = [...t].filter((c) => script.test(c)).length;
    if (mine < (OCR_CJK.test(t) ? 2 : 3) || mine / t.length < 0.5) return false;
    if (/(.)\1\1\1/u.test(t) || isMyText(text)) return false;
    if (script === OCR_LATIN) {
      const words = text.match(/[A-Za-zÀ-ɏḀ-ỿ]+/g) || [];
      if (!words.some((w) => w.length >= 3)) return false;
      const letters = words.join('');
      const vowels = (letters.match(OCR_VOWELS) || []).length / letters.length;
      if (vowels < 0.2 || vowels > 0.8) return false;
    }
    return true;
  }
  function ocrRuns(words) {
    const runs = [];
    let cur = [];
    const flush = () => {
      while (cur.length && !ocrScript().test(cur[0].text)) cur.shift();
      while (cur.length && !ocrScript().test(cur[cur.length - 1].text)) cur.pop();
      if (cur.length) runs.push(cur);
      cur = [];
    };
    for (const w of words) {
      if (!/\S/.test(w.text)) continue;
      if (w.confidence < OCR_MIN_CONF) flush();
      else cur.push(w);
    }
    flush();
    return runs;
  }
  function ocrJoin(words) {
    let out = '';
    for (const w of words) {
      const t = w.text.trim();
      if (!t) continue;
      out += out && !(OCR_CJK.test(out.slice(-1)) && OCR_CJK.test(t[0])) ? ` ${t}` : t;
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  function readLinesOther(data) {
    const segs = [];
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          if (line.confidence < OCR_MIN_LINE_CONF - 10) continue;
          for (const words of ocrRuns(line.words)) {
            const text = ocrJoin(words);
            if (!ocrPlausible(text)) continue;
            const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            for (const w of words) {
              box.x0 = Math.min(box.x0, w.bbox.x0);
              box.y0 = Math.min(box.y0, w.bbox.y0);
              box.x1 = Math.max(box.x1, w.bbox.x1);
              box.y1 = Math.max(box.y1, w.bbox.y1);
            }
            if (box.y1 - box.y0 < 6) continue;
            segs.push({ text, box, conf: line.confidence });
          }
        }
      }
    }
    return segs;
  }

  async function readLines(worker, canvas, dict) {
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    if (!OCR_THAI()) return readLinesOther(data);
    const segs = [];
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          if (line.confidence < OCR_MIN_LINE_CONF) continue;
          for (const words of thaiRuns(line.words)) {
            const raw = joinThai(words.map((w) => w.text).join(' ')).replace(/[เแโใไ]+$/, '');
            // 엉터리 줄 거르기는 고치기 전 글자로 한다(고치고 나면 엉터리도 태국어처럼 보인다).
            if (!looksLikeThai(raw)) continue;
            const text = restoreThaiMarks(raw, dict);
            const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            for (const w of words) {
              box.x0 = Math.min(box.x0, w.bbox.x0);
              box.y0 = Math.min(box.y0, w.bbox.y0);
              box.x1 = Math.max(box.x1, w.bbox.x1);
              box.y1 = Math.max(box.y1, w.bbox.y1);
            }
            if (box.y1 - box.y0 < 6) continue;
            segs.push({ text, box, conf: line.confidence });
          }
        }
      }
    }
    return segs;
  }

  function overlapRatio(a, b) {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (w <= 0 || h <= 0) return 0;
    const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
    return (w * h) / Math.min(area(a), area(b));
  }

  // 여러 번 읽은 결과에서 같은 자리의 줄은 하나만 남긴다: 확신도가 높고 글자가 온전한(긴) 쪽.
  // 한 번은 'ว 2 เมตร…' 로 앞이 잘리고 다른 번엔 'ความยาว 2 เมตร…' 로 온전히 읽히는 일이 흔하다.
  // 다만 숫자·기호 사이에 한두 글자짜리 태국어 조각이 흩어진 줄은 길어도 엉터리다
  // ('ความยาว 10cm' 을 'คอลมยาว 70 6 ทา 250 6 ทา' 로 읽은 것이 온전한 'ความยาว' 를 이겼다).
  function pickBestLines(found) {
    // 부스러기(한두 글자 토막) 벌점은 태국어만 — 다른 언어는 짧은 낱말(of·di·la)이 흔하다.
    const crumbs = (t) => (OCR_THAI() ? t.split(/[^ก-๛]+/).filter((r) => r && r.length <= 2).length : 0);
    const score = (s) => s.conf + Math.min(s.text.length, 40) * 0.3 - crumbs(s.text) * 5;
    const kept = [];
    for (const s of [...found].sort((a, b) => score(b) - score(a))) {
      if (!kept.some((k) => overlapRatio(k.box, s.box) > 0.5)) kept.push(s);
    }
    return kept;
  }

  // ---- Google Cloud Vision (선택) ----
  // 키가 있으면 사진 글자를 Vision 으로 읽는다. 기울임체·테두리 광고 글씨도 정확하고, 여러 줄 문장을
  // 문단으로 묶어 주어 번역이 자연스럽다. 무료는 계정 전체 월 1,000건이고 Google 은 Vision 에 '여기서
  // 멈춤' 장치를 두지 않는다(하루 할당량·지출 상한 모두 없음, 2026-09 확인). 그래서 이 PC 에서 이번 달
  // 부른 횟수를 요청 '보내기 전에' 세어, 한도(기본 900)에 닿으면 Vision 을 아예 부르지 않고 무료 인식으로
  // 돌아간다. 거절(결제 꺼짐·키 제한 등)되면 이 페이지에서는 다시 부르지 않는다.
  // 페이지에서 직접 부른다(키에 '웹사이트 제한' 을 걸면 라자다·쇼피 주소로 확인되게).
  const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
  const VISION_USAGE = 'visionUsage';
  const VISION_MAX_SIDE = 1600; // 올려 보낼 사진 크기. 이보다 크면 줄여 보낸다(요금은 크기와 무관)
  let visionBlocked = '';       // 거절 이유. 한 번 거절되면 이 페이지에서는 다시 부르지 않는다

  function visionMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function visionUsage() {
    const u = GM_getValue(VISION_USAGE, null);
    return u && u.month === visionMonth() ? u : { month: visionMonth(), count: 0 };
  }

  function visionUsable() {
    return !!cfg.visionKey && !visionBlocked && visionUsage().count < (Number(cfg.visionMonthlyCap) || 0);
  }

  // 보낼 JPEG(base64). 요청 한 개는 10MB 까지라 크면 화질·크기를 낮춘다.
  function canvasBase64(canvas, maxSide) {
    const long = Math.max(canvas.width, canvas.height);
    let src = long > maxSide ? scaledCopy(canvas, maxSide / long, 'rgb') : canvas;
    let data = src.toDataURL('image/jpeg', 0.88).split(',')[1];
    for (let i = 0; i < 3 && data.length > 7e6; i++) {
      src = scaledCopy(src, 0.8, 'rgb');
      data = src.toDataURL('image/jpeg', 0.8).split(',')[1];
    }
    return { data, scale: src.width / canvas.width };
  }

  // Vision 의 문단을 사진(part)별 { text, box, lines } 로. 문단 안 줄바꿈은 띄어 붙여 한 문장으로
  // 번역한다. 여러 사진을 이어 붙인 한 장이면 낱말마다 어느 사진 위에 있는지 보고 나눈다(Vision 이 옆
  // 사진의 같은 높이 글줄을 한 문단으로 묶어도 사진별로 갈린다). box 는 그 사진 canvas 좌표.
  // parts: [{ x, y, w, h, s }] — 붙인 한 장에서의 자리와 축소 비율. 사진 한 장이면 하나.
  function visionSegments(resp, scale, parts) {
    const out = parts.map(() => []);
    const page = resp.fullTextAnnotation?.pages?.[0];
    const partAt = (cx, cy) => parts.findIndex((p) => cx >= p.x && cx < p.x + p.w && cy >= p.y && cy < p.y + p.h);
    for (const block of page?.blocks || []) {
      for (const para of block.paragraphs || []) {
        const pieces = new Map(); // part 번호 → { text, lines, box }
        const words = para.words || [];
        words.forEach((word, i) => {
          const vs = (word.boundingBox?.vertices || []).map((v) => [(v.x || 0) / scale, (v.y || 0) / scale]);
          if (!vs.length) return;
          const cx = vs.reduce((a, v) => a + v[0], 0) / vs.length;
          const cy = vs.reduce((a, v) => a + v[1], 0) / vs.length;
          const pi = partAt(cx, cy);
          if (pi < 0) return;
          const p = parts[pi];
          let pc = pieces.get(pi);
          if (!pc) pieces.set(pi, (pc = { text: '', lines: 1, box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } }));
          const syms = word.symbols || [];
          pc.text += syms.map((s) => s.text).join('');
          const brk = syms[syms.length - 1]?.property?.detectedBreak?.type;
          if (brk === 'EOL_SURE_SPACE' || brk === 'LINE_BREAK' || brk === 'HYPHEN') {
            pc.text += ' ';
            const next = words[i + 1]?.boundingBox?.vertices;
            if (next && partAt(((next[0]?.x || 0) + (next[2]?.x || 0)) / 2 / scale, ((next[0]?.y || 0) + (next[2]?.y || 0)) / 2 / scale) === pi) pc.lines++;
          } else if (brk === 'SPACE' || brk === 'SURE_SPACE') pc.text += ' ';
          for (const [x, y] of vs) {
            const lx = (x - p.x) / p.s;
            const ly = (y - p.y) / p.s;
            pc.box.x0 = Math.min(pc.box.x0, lx);
            pc.box.y0 = Math.min(pc.box.y0, ly);
            pc.box.x1 = Math.max(pc.box.x1, lx);
            pc.box.y1 = Math.max(pc.box.y1, ly);
          }
        });
        for (const [pi, pc] of pieces) {
          const text = pc.text.replace(/\s+/g, ' ').trim();
          // 태국어가 없는 문단(숫자·영어)은 그대로 둔다.
          if (!ocrScript().test(text) || isMyText(text) || !(pc.box.x1 > pc.box.x0)) continue;
          out[pi].push({ text, box: pc.box, lines: pc.lines, conf: 99 });
        }
      }
    }
    return out;
  }

  // Vision 에 사진 한 장을 보낸다(= 1건). 보내기 전에 센다(실패한 요청도 센다).
  async function visionAnnotate(canvas, maxSide) {
    const u = visionUsage();
    u.count++;
    GM_setValue(VISION_USAGE, u);
    const { data, scale } = canvasBase64(canvas, maxSide);
    const r = await fetch(`${VISION_URL}?key=${encodeURIComponent(cfg.visionKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: data }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: [OCR_THAI() ? 'th' : SITE_LANG] } }],
      }),
    });
    const body = await r.json().catch(() => ({}));
    const resp = body.responses?.[0] || {};
    const err = body.error || resp.error;
    if (!r.ok || err) {
      visionBlocked = err?.message || `HTTP ${r.status}`;
      throw new Error(visionBlocked);
    }
    return { resp, scale };
  }

  async function visionReadText(canvas) {
    const { resp, scale } = await visionAnnotate(canvas, VISION_MAX_SIDE);
    return visionSegments(resp, scale, [{ x: 0, y: 0, w: canvas.width, h: canvas.height, s: 1 }])[0];
  }

  // ---- 페이지 사진을 한 장으로 이어 붙여 Vision 1건으로 ----
  // Vision 은 '사진 한 장 = 1건' 이라 한 요청에 여러 장을 담아도 장수만큼 센다. 대신 여러 사진을 큰
  // 한 장(콜라주)으로 이어 붙여 보내면 1건이다. 사진마다 폭 800px(상품 사진 글씨는 이 크기에서 충분히
  // 읽힌다)로 맞춰 기둥 3개에 쌓고, 사이를 흰 띠로 띄운다. 기둥이 너무 길어지면 다음 장으로 넘긴다.
  const COLLAGE_W = 800;
  const COLLAGE_COLS = 3;
  const COLLAGE_MAX_H = 4800;
  const COLLAGE_PART_MAX_H = 2400; // 아주 긴 설명 사진은 이 높이까지 줄여 넣는다
  const COLLAGE_GAP = 48;

  function packCollages(items) {
    const collages = [];
    let cur = null;
    const fresh = () => ({ cols: new Array(COLLAGE_COLS).fill(0), parts: [] });
    for (const it of items) {
      const s = Math.min(COLLAGE_W / it.canvas.width, COLLAGE_PART_MAX_H / it.canvas.height);
      const w = Math.round(it.canvas.width * s);
      const h = Math.round(it.canvas.height * s);
      if (!cur) cur = fresh();
      let c = cur.cols.indexOf(Math.min(...cur.cols));
      if (cur.cols[c] && cur.cols[c] + h > COLLAGE_MAX_H) {
        collages.push(cur);
        cur = fresh();
        c = 0;
      }
      cur.parts.push({ it, x: c * (COLLAGE_W + COLLAGE_GAP), y: cur.cols[c], w, h, s });
      cur.cols[c] += h + COLLAGE_GAP;
    }
    if (cur) collages.push(cur);
    return collages;
  }

  function drawCollage(col) {
    const c = document.createElement('canvas');
    c.width = Math.max(...col.parts.map((p) => p.x + p.w));
    c.height = Math.max(...col.parts.map((p) => p.y + p.h));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    for (const p of col.parts) ctx.drawImage(p.it.canvas, p.x, p.y, p.w, p.h);
    return c;
  }

  // 사진들을 붙인 장마다 Vision 1건으로 읽어 [{ img, canvas, segs }] 로 돌려준다.
  async function visionReadMany(items) {
    const done = [];
    for (const col of packCollages(items)) {
      if (!visionUsable()) break; // 한도에 닿으면 남은 사진은 무료 인식으로
      const { resp, scale } = await visionAnnotate(drawCollage(col), 5000);
      visionSegments(resp, scale, col.parts).forEach((segs, i) => done.push({ ...col.parts[i].it, segs }));
    }
    return done;
  }

  // 사진에서 태국어 줄을 찾아 { text, box } 로 돌려준다(box 는 canvas 좌표). 태국어가 없는
  // 줄(숫자·영어)은 그대로 둬도 읽히니 건드리지 않는다. Vision 을 쓸 수 있으면 Vision, 아니면 무료 인식.
  let visionCapNoticed = false;

  async function readImageText(canvas) {
    if (cfg.visionKey && !visionBlocked && !visionUsable() && !visionCapNoticed) {
      visionCapNoticed = true;
      toast(`이 PC의 이번 달 Google Vision 한도(${cfg.visionMonthlyCap}건)를 다 써서 무료 인식으로 읽습니다. 다음 달 1일에 다시 채워집니다.`, 6000);
    }
    if (visionUsable()) {
      try {
        return await visionReadText(canvas);
      } catch (e) {
        console.warn(`[${APP_NAME}] Google Vision 실패, 무료 인식으로 대신합니다:`, e);
        toast(`Google Vision 을 쓸 수 없어 무료 인식으로 읽습니다.\n(${e.message || e})`, 6000);
      }
    }
    return readImageTextLocal(canvas);
  }

  async function readImageTextLocal(canvas) {
    const [workers, dict] = await Promise.all([ocrPool(), OCR_THAI() ? loadThaiWords() : null]);
    try {
      const long = Math.max(canvas.width, canvas.height);
      const found = [];
      const queue = [...OCR_PASSES];
      // 인식기마다 남은 읽기를 하나씩 집어 간다.
      await Promise.all(
        workers.map(async (worker) => {
          for (let pass; (pass = queue.shift()); ) {
            const scale = pass.side / long;
            for (const seg of await readLines(worker, scaledCopy(canvas, scale, pass.mode), dict)) {
              const b = seg.box;
              found.push({ ...seg, box: { x0: b.x0 / scale, y0: b.y0 / scale, x1: b.x1 / scale, y1: b.y1 / scale } });
            }
          }
        })
      );
      return pickBestLines(found);
    } finally {
      releaseOcrLater();
    }
  }

  function medianColor(px) {
    const ch = (i) => px.map((p) => p[i]).sort((a, b) => a - b)[px.length >> 1];
    return [ch(0), ch(1), ch(2)];
  }
  function colorDist(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  }
  function luminance(c) {
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  }

  // 칸 안에서 가장 많은 색 = 바탕색(글자는 칸의 일부만 차지한다), 바탕과 많이 다른 색 = 글자색.
  // 둘레만 재면 라벨 가장자리에 걸친 칸이 라벨 밖 배경색을 집어 회색 띠가 생겼다.
  function boxColors(ctx, rect) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(W, Math.ceil(rect.x + rect.w));
    const y1 = Math.min(H, Math.ceil(rect.y + rect.h));
    if (x1 - x0 < 3 || y1 - y0 < 3) return { bg: [255, 255, 255], fg: [17, 17, 17] };
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const bins = new Map(); // 채널마다 16단계로 뭉뚱그린 색 → [개수, R합, G합, B합]
    for (let i = 0; i < d.length; i += 4) {
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const b = bins.get(key);
      if (b) {
        b[0]++;
        b[1] += d[i];
        b[2] += d[i + 1];
        b[3] += d[i + 2];
      } else bins.set(key, [1, d[i], d[i + 1], d[i + 2]]);
    }
    let top = null;
    for (const b of bins.values()) if (!top || b[0] > top[0]) top = b;
    const bg = [Math.round(top[1] / top[0]), Math.round(top[2] / top[0]), Math.round(top[3] / top[0])];
    const ink = [];
    for (let i = 0; i < d.length; i += 4) {
      const p = [d[i], d[i + 1], d[i + 2]];
      if (colorDist(p, bg) > 120) ink.push(p);
    }
    let fg = ink.length > (d.length / 4) * 0.02 ? medianColor(ink) : null;
    if (!fg || colorDist(fg, bg) < 150) fg = luminance(bg) > 140 ? [17, 17, 17] : [255, 255, 255];
    return { bg, fg };
  }

  // 위아래로 붙은 줄(라벨·표의 여러 줄)을 한 무리로 묶는다. 무리 안에서는 같은 크기 글씨로 쓴다.
  function groupLines(items) {
    const groups = [];
    for (const it of [...items].sort((a, b) => a.box.y0 - b.box.y0)) {
      const h = it.box.y1 - it.box.y0;
      const g = groups.find((gr) => {
        const last = gr.items[gr.items.length - 1].box;
        const gap = it.box.y0 - last.y1;
        const overlap = Math.min(it.box.x1, gr.box.x1) - Math.max(it.box.x0, gr.box.x0);
        const narrow = Math.min(it.box.x1 - it.box.x0, gr.box.x1 - gr.box.x0);
        return gap <= h * 0.9 && gap >= -h * 0.6 && overlap > narrow * 0.3;
      });
      if (g) {
        g.items.push(it);
        g.box = {
          x0: Math.min(g.box.x0, it.box.x0),
          y0: Math.min(g.box.y0, it.box.y0),
          x1: Math.max(g.box.x1, it.box.x1),
          y1: Math.max(g.box.y1, it.box.y1),
        };
      } else groups.push({ items: [it], box: { ...it.box } });
    }
    return groups;
  }

  // 줄마다 제 칸만 바탕색으로 지우고, 모든 칸을 지운 뒤에 글씨를 쓴다(칸이 겹쳐도 글씨는 안 덮인다).
  // 전에는 여러 줄을 큰 상자 하나로 덮어, 사진 위 글씨가 커다란 흰 판으로 바뀌어 보였다.
  function paintTranslations(canvas, segs, kos) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const items = segs
      .map((s, i) => {
        const h = s.box.y1 - s.box.y0;
        const lines = s.lines || 1;
        const pad = Math.max(2, Math.round((h / lines) * 0.12));
        const rect = { x: s.box.x0 - pad, y: s.box.y0 - pad, w: s.box.x1 - s.box.x0 + pad * 2, h: h + pad * 2 };
        return { box: s.box, ko: kos[i], rect, lines };
      })
      .filter((it) => it.ko);
    // 색은 칠하기 전에 모두 재 둔다(먼저 칠한 칸이 옆 칸의 색을 바꾸지 않게).
    for (const it of items) Object.assign(it, boxColors(ctx, it.rect));
    for (const it of items) {
      ctx.fillStyle = `rgb(${it.bg.join(',')})`;
      ctx.fillRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const outlined = (it, text, x, y, size, maxW) => {
      // 바탕색 테두리: 칸 둘레가 사진이라 바탕색이 고르지 않아도 글씨가 또렷하다.
      ctx.strokeStyle = `rgb(${it.bg.join(',')})`;
      ctx.lineWidth = Math.max(2, size * 0.18);
      ctx.strokeText(text, x, y, maxW);
      ctx.fillStyle = `rgb(${it.fg.join(',')})`;
      ctx.fillText(text, x, y, maxW);
    };
    // 여러 줄 문단(Vision): 번역문을 칸 폭에 맞춰 줄바꿈해 칸 높이 안에 채운다.
    for (const it of items.filter((x) => x.lines > 1)) {
      const maxW = it.rect.w - 4;
      let size = Math.max(9, Math.floor(((it.box.y1 - it.box.y0) / it.lines) * 0.8));
      const floor = Math.max(9, Math.floor(size * 0.5));
      let rows;
      for (;;) {
        ctx.font = `700 ${size}px ${OCR_FONT}`;
        rows = wrapText(ctx, it.ko, maxW);
        if (size <= floor || rows.length * size * 1.25 <= it.rect.h) break;
        size -= 1;
      }
      const x = it.rect.x + it.rect.w / 2;
      const top = it.rect.y + (it.rect.h - rows.length * size * 1.25) / 2 + size * 0.625;
      rows.forEach((row, k) => outlined(it, row, x, top + k * size * 1.25, size, maxW));
    }
    for (const g of groupLines(items.filter((x) => x.lines === 1))) {
      // 무리 안에서는 같은 글씨 크기. 보통 줄 높이의 85%에서 시작해 번역이 모두 제 칸에 들 때까지 줄인다.
      // 절반 아래로는 줄이지 않고, 그래도 넘치는 줄은 fillText 의 최대 폭으로 가로를 눌러 담는다.
      // (가장 작은 줄에 맞추면 잘못 읽은 작은 조각 하나 때문에 무리 전체 글씨가 깨알만 해졌다.)
      const hs = g.items.map((it) => it.box.y1 - it.box.y0).sort((a, b) => a - b);
      let size = Math.max(9, Math.floor(hs[hs.length >> 1] * 0.85));
      const floor = Math.max(9, Math.floor(size * 0.5));
      for (;;) {
        ctx.font = `700 ${size}px ${OCR_FONT}`;
        if (size <= floor || g.items.every((it) => ctx.measureText(it.ko).width <= it.rect.w - 2)) break;
        size -= 1;
      }
      for (const it of g.items) {
        const x = it.rect.x + it.rect.w / 2;
        const y = (it.box.y0 + it.box.y1) / 2;
        outlined(it, it.ko, x, y, size, Math.max(it.rect.w - 2, size * 2));
      }
    }
  }

  // 띄어쓰기 단위로 폭에 맞춰 나눈다. 한 낱말이 폭보다 길면 그 줄은 fillText 가 가로를 눌러 담는다.
  function wrapText(ctx, text, maxW) {
    const rows = [];
    let cur = '';
    for (const w of text.split(/\s+/)) {
      const t = cur ? `${cur} ${w}` : w;
      if (!cur || ctx.measureText(t).width <= maxW) cur = t;
      else {
        rows.push(cur);
        cur = w;
      }
    }
    if (cur) rows.push(cur);
    return rows;
  }

  // 읽은 결과(줄 위치 + 번역)를 사진 주소별로 보관한다. 다른 날 같은 상품을 다시 봐도 글자를 다시
  // 읽지 않고 사진만 받아 바로 그린다. 위치는 사진 크기에 대한 비율이라 크기가 달라도 맞는다.
  // 스크립트 버전이 바뀌면(읽는 방법이 나아졌을 수 있으니) 통째로 버린다.
  const OCR_CACHE = 'ocrCache';
  const OCR_CACHE_MAX = 400;
  let ocrCache = null;

  function ocrCacheStore() {
    if (!ocrCache) {
      const saved = GM_getValue(OCR_CACHE, null);
      ocrCache = saved && saved.ver === SCRIPT_VERSION ? saved : { ver: SCRIPT_VERSION, e: {} };
    }
    return ocrCache;
  }

  function ocrCacheGet(url) {
    return ocrCacheStore().e[url] || null;
  }

  function ocrCachePut(url, lines) {
    const store = ocrCacheStore();
    store.e[url] = { at: Date.now(), lines };
    const keys = Object.keys(store.e);
    if (keys.length > OCR_CACHE_MAX) {
      keys.sort((a, b) => store.e[a].at - store.e[b].at);
      for (const k of keys.slice(0, keys.length - OCR_CACHE_MAX)) delete store.e[k];
    }
    GM_setValue(OCR_CACHE, store);
  }

  // 번역해 그린 사진의 blob 주소. 찾을 태국어가 없으면 null.
  // pre: 페이지 전체 번역에서 미리 받아 읽어 둔 { canvas, segs }.
  async function renderTranslatedImage(img, pre) {
    const src = ocrSourceUrl(img);
    let cached = ocrCacheGet(src);
    if (cached && !cached.lines.length) return null; // 전에 봤는데 태국어가 없던 사진: 받지도 않는다
    const canvas = pre?.canvas || (await imageToCanvas(img));
    const W = canvas.width;
    const H = canvas.height;
    if (!cached) {
      const segs = pre?.segs || (await readImageText(canvas));
      const out = segs.length ? await translateToKorean(segs.map((s) => s.text), OCR_THAI() ? 'auto' : ocrGoogle()) : [];
      const lines = [];
      segs.forEach((s, i) => {
        const k = out[i];
        if (k && (MY_KO ? HANGUL.test(k) : true) && k !== s.text) lines.push([s.box.x0 / W, s.box.y0 / H, s.box.x1 / W, s.box.y1 / H, k.trim(), s.lines || 1]);
      });
      ocrCachePut(src, lines);
      cached = { lines };
    }
    if (!cached.lines.length) return null;
    const segs = cached.lines.map(([x0, y0, x1, y1, , n]) => ({ box: { x0: x0 * W, y0: y0 * H, x1: x1 * W, y1: y1 * H }, lines: n || 1 }));
    const kos = cached.lines.map((l) => l[4]);
    paintTranslations(canvas, segs, kos);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('번역한 사진을 만들지 못했습니다');
    return URL.createObjectURL(blob);
  }

  // 사진 위에 이만큼 머물면 번역을 시작한다. 마우스가 스쳐 지나간 사진까지 읽으면 무거워진다.
  const OCR_HOVER_MS = 500;
  // 원래 사진 주소 → 번역한 사진('' = 태국어가 없었음). 사진을 넘겼다 돌아와도 다시 읽지 않는다.
  const ocrDone = new Map();
  const ocrKeepOriginal = new Set(); // '원래 사진' 을 누른 사진. 다시 올려도 자동으로 바꾸지 않는다.
  const ocrFailed = new Set();       // 실패한 사진. 자동으로는 다시 시도하지 않는다(버튼으로는 된다).
  const ocrBusy = new WeakSet();
  let ocrRunning = 0;
  let imgBtn = null;
  let imgBtnTarget = null;
  let hoverImg = null;
  let hoverKey = null;
  let hoverTimer = null;

  // 번역본은 사이트의 사진(<img>)을 건드리지 않고 그 위에 덮어 보인다. 전에는 사진 주소를 바꿨는데,
  // 사이트가 '사진이 새로 로드됐다' 고 받아 일을 벌였다: 라자다 상품 설명은 펼친 '더 보기' 를 도로
  // 접었다(설명 칸에 height-limit 을 다시 붙임). 덮개는 누르기·확대경이 그대로 되도록 마우스를
  // 통과시키고, 화면마다 사진 자리를 따라간다. 사진이 다른 것으로 바뀌면(갤러리 넘기기) 숨었다가
  // 돌아오면 다시 보인다.
  const overlays = new Map(); // img → { key, el }
  let overlayLayer = null;
  let overlayRaf = 0;

  function imageSrcKey(img) {
    return img.currentSrc || img.src;
  }

  function isShowingTranslation(img) {
    const o = overlays.get(img);
    return !!o && o.key === imageSrcKey(img);
  }

  // 사진을 잘라 보이는 조상(가로로 넘기는 갤러리, 높이를 제한한 설명 칸). 덮개도 그만큼만 보인다.
  function clippingAncestors(img) {
    const list = [];
    for (let el = img.parentElement; el && el !== document.body; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') list.push(el);
    }
    return list;
  }

  // 사진이 그 자리에서 맨 위에 보이나(팝업·고정 메뉴에 가려지지 않았나). 사진 위의 투명한 층(확대경
  // 등)은 사진 가까운 조상 안에 있으니 봐준다.
  function imageOnTop(img, x, y) {
    const el = document.elementsFromPoint(x, y).find((e) => !e.closest('[id^="lzk-"]'));
    if (!el) return false;
    const near = img.parentElement?.parentElement || img.parentElement;
    return el === img || el.contains(img) || !!near?.contains(el);
  }

  function placeOverlays() {
    overlayRaf = 0;
    const vw = innerWidth;
    const vh = innerHeight;
    for (const [img, o] of overlays) {
      if (!img.isConnected) {
        o.el.remove();
        overlays.delete(img);
        continue;
      }
      const r = img.getBoundingClientRect();
      let c = { l: Math.max(r.left, 0), t: Math.max(r.top, 0), r: Math.min(r.right, vw), b: Math.min(r.bottom, vh) };
      // 화면 밖이거나 다른 사진으로 바뀌었으면 가볍게 숨기고, 보이는 것만 잘림·가림을 따진다.
      let show = o.key === imageSrcKey(img) && c.r - c.l > 1 && c.b - c.t > 1;
      if (show) {
        // 잘라 보이는 조상은 매번 다시 찾는다(설명 칸의 '더 보기' 처럼 나중에 바뀐다).
        for (const a of clippingAncestors(img)) {
          const ar = a.getBoundingClientRect();
          c = { l: Math.max(c.l, ar.left), t: Math.max(c.t, ar.top), r: Math.min(c.r, ar.right), b: Math.min(c.b, ar.bottom) };
        }
        show = c.r - c.l > 1 && c.b - c.t > 1 && imageOnTop(img, (c.l + c.r) / 2, (c.t + c.b) / 2);
        // 위·아래 가장자리가 고정 메뉴(라자다 상단 검색줄, 하단 구매 막대)에 가려 있으면 그만큼 잘라 낸다.
        const cx = (c.l + c.r) / 2;
        for (let i = 0; show && i < 30 && c.b - c.t > 16 && !imageOnTop(img, cx, c.t + 1); i++) c.t += 8;
        for (let i = 0; show && i < 30 && c.b - c.t > 16 && !imageOnTop(img, cx, c.b - 1); i++) c.b -= 8;
      }
      if (!show) {
        o.el.style.display = 'none';
        continue;
      }
      const s = getComputedStyle(img);
      Object.assign(o.el.style, {
        display: 'block',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        objectFit: s.objectFit,
        objectPosition: s.objectPosition,
        borderRadius: s.borderRadius,
        clipPath: `inset(${c.t - r.top}px ${r.right - c.r}px ${r.bottom - c.b}px ${c.l - r.left}px)`,
      });
    }
    if (overlays.size) overlayRaf = requestAnimationFrame(placeOverlays);
  }

  function showTranslatedImage(img, url) {
    if (!overlayLayer) {
      overlayLayer = document.createElement('div');
      overlayLayer.id = 'lzk-overlays';
      markNoTranslate(overlayLayer);
      document.body.appendChild(overlayLayer);
    }
    overlays.get(img)?.el.remove();
    const el = document.createElement('img');
    el.className = 'lzk-overlay';
    el.alt = '';
    el.src = url;
    overlayLayer.appendChild(el);
    overlays.set(img, { key: imageSrcKey(img), el });
    if (!overlayRaf) placeOverlays();
  }

  function showOriginalImage(img) {
    overlays.get(img)?.el.remove();
    overlays.delete(img);
  }

  async function translateImage(img, auto, pre) {
    const key = imageSrcKey(img);
    let url = ocrDone.get(key);
    if (url === undefined) {
      ocrBusy.add(img);
      ocrRunning++;
      refreshImageButton();
      if (!pageRunning) {
        setBadge(ocrPoolP ? '사진 글자 읽는 중…' : '사진 글자 읽는 중… (처음 한 번은 인식 자료를 받느라 10초쯤 걸립니다)');
      }
      try {
        url = (await renderTranslatedImage(img, pre)) || '';
        ocrDone.set(key, url);
        if (!url && !auto) toast(`이 사진에서는 번역할 ${hsLangName(ocrGoogle()) || '외국어'} 글자를 찾지 못했습니다.`);
      } catch (e) {
        ocrFailed.add(key);
        console.warn(`[${APP_NAME}] 사진 번역 실패:`, e);
        toast(`사진 번역 실패: ${e.message || e}`, 5000);
        return;
      } finally {
        ocrBusy.delete(img);
        ocrRunning--;
        if (!pageRunning) setBadge(null);
        refreshImageButton();
        setTimeout(autoTranslateHovered, 0); // 읽는 사이 마우스가 옮겨 간 사진이 있으면 이어서
      }
    }
    // 태국어가 없었거나, 읽는 사이에 갤러리가 다른 사진으로 넘어갔으면 바꾸지 않는다.
    if (!url || imageSrcKey(img) !== key) return;
    showTranslatedImage(img, url);
    refreshImageButton();
  }

  function onImageButton(img) {
    if (ocrBusy.has(img)) return;
    const key = imageSrcKey(img);
    if (isShowingTranslation(img)) {
      showOriginalImage(img);
      ocrKeepOriginal.add(key);
      refreshImageButton();
      return;
    }
    ocrKeepOriginal.delete(key);
    ocrFailed.delete(key);
    translateImage(img, false);
  }

  // ---- 페이지 전체 ----
  const PAGE_MAX_IMAGES = 36; // 한 번에 다루는 사진 수(콜라주 3~4장 = Vision 3~4건)
  let pageRunning = false;
  let imgAllBtn = null;

  // 지금 페이지에 받아진 큰 사진들(같은 사진은 한 번만). 아직 안 받아진 설명 사진은 빠지니, 설명을
  // 끝까지 내려 본 뒤 누르면 더 많이 잡힌다.
  function pageImages() {
    const list = [];
    const seen = new Set();
    for (const img of document.images) {
      if (!img.complete || img.naturalWidth < OCR_MIN_SIDE || img.closest('[id^="lzk-"]')) continue;
      const src = img.currentSrc || img.src;
      if (!/^https?:/.test(src)) continue;
      const r = img.getBoundingClientRect();
      if (r.width < OCR_MIN_SIDE || r.height < OCR_MIN_SIDE) continue;
      const k = ocrSourceUrl(img);
      if (seen.has(k)) continue;
      seen.add(k);
      if (isShowingTranslation(img) || ocrKeepOriginal.has(imageSrcKey(img)) || ocrBusy.has(img)) continue;
      list.push(img);
      if (list.length >= PAGE_MAX_IMAGES) break;
    }
    return list;
  }

  async function translatePageImages() {
    if (pageRunning) return;
    const imgs = pageImages();
    if (!imgs.length) {
      toast('번역할 큰 사진이 없습니다(이미 번역했거나 아직 안 받아진 사진뿐입니다).');
      return;
    }
    pageRunning = true;
    refreshImageButton();
    try {
      // 전에 읽은 사진은 저장된 결과로(건수 없이). 태국어가 없던 사진은 건너뛴다.
      const known = (img) => ocrDone.has(imageSrcKey(img)) || ocrCacheGet(ocrSourceUrl(img));
      const fresh = imgs.filter((img) => !known(img));
      for (const img of imgs.filter(known)) translateImage(img, true);
      if (!fresh.length) return;
      setBadge(`사진 ${fresh.length}장 받는 중…`);
      const items = (
        await Promise.all(
          fresh.map((img) =>
            imageToCanvas(img).then(
              (canvas) => ({ img, canvas }),
              (e) => console.warn(`[${APP_NAME}] 사진 받기 실패:`, e)
            )
          )
        )
      ).filter(Boolean);
      let read = [];
      if (visionUsable()) {
        const before = visionUsage().count;
        setBadge(`사진 ${items.length}장을 한 장으로 붙여 Google Vision 으로 읽는 중…`);
        try {
          read = await visionReadMany(items);
        } catch (e) {
          console.warn(`[${APP_NAME}] Google Vision 실패, 무료 인식으로 대신합니다:`, e);
          toast(`Google Vision 을 쓸 수 없어 무료 인식으로 읽습니다.\n(${e.message || e})`, 6000);
        }
        if (read.length) toast(`사진 ${read.length}장을 Google Vision ${visionUsage().count - before}건으로 읽었습니다.`, 4000);
      }
      const done = new Set(read.map((x) => x.img));
      for (const x of read) await translateImage(x.img, true, x);
      // Vision 을 못 쓴(한도·거절·키 없음) 사진은 무료 인식으로 한 장씩.
      const rest = items.filter((x) => !done.has(x.img));
      for (let i = 0; i < rest.length; i++) {
        setBadge(`사진 글자 읽는 중… (${i + 1}/${rest.length})`);
        await translateImage(rest[i].img, true, { canvas: rest[i].canvas });
      }
    } finally {
      pageRunning = false;
      setBadge(null);
      refreshImageButton();
    }
  }

  function autoTranslateHovered() {
    const img = hoverImg;
    if (!img || !cfg.imageTranslate || !img.isConnected || ocrBusy.has(img)) return;
    const key = imageSrcKey(img);
    if (isShowingTranslation(img) || ocrKeepOriginal.has(key) || ocrFailed.has(key)) return;
    // 자동이 꺼져 있으면 전에 번역해 둔 사진만 바로 보여 준다(글자를 다시 읽지 않는다).
    if (!cfg.imageAuto && !ocrDone.get(key) && !ocrCacheGet(ocrSourceUrl(img))?.lines?.length) return;
    if (ocrRunning && !ocrDone.has(key)) return; // 한 장씩 읽는다. 끝나면 여기로 다시 온다.
    translateImage(img, true);
  }

  function onHoverImage(img) {
    const key = img && imageSrcKey(img);
    if (img === hoverImg && key === hoverKey) return;
    hoverImg = img;
    hoverKey = key;
    clearTimeout(hoverTimer);
    if (!img) return;
    hoverTimer = setTimeout(autoTranslateHovered, OCR_HOVER_MS);
    if (!ocrDone.has(key) && !ocrCacheGet(ocrSourceUrl(img)) && !visionUsable()) warmOcr();
  }

  function refreshImageButton() {
    if (!imgBtn || !imgBtnTarget) return;
    const busy = ocrBusy.has(imgBtnTarget);
    const key = imageSrcKey(imgBtnTarget);
    imgBtn.textContent = busy
      ? '사진 읽는 중…'
      : isShowingTranslation(imgBtnTarget)
        ? '원래 사진'
        : ocrDone.get(key) === ''
          ? '읽을 글자 없음'
          : '사진 번역';
    imgBtn.toggleAttribute('data-busy', busy);
    if (imgAllBtn) {
      imgAllBtn.textContent = pageRunning ? '페이지 사진 읽는 중…' : '페이지 전체';
      imgAllBtn.toggleAttribute('data-busy', pageRunning);
      imgAllBtn.title = visionUsable()
        ? '이 페이지의 큰 사진들을 한 장으로 붙여 Google Vision 1건(12장 남짓마다 1건)으로 번역합니다'
        : '이 페이지의 큰 사진들을 모두 번역합니다';
    }
  }

  // 커서 아래의 큰 사진. 라자다 갤러리처럼 사진 위에 투명한 층(확대경 등)이 덮여 있어도
  // 찾도록 이벤트 대상이 아니라 그 자리의 요소들을 훑는다.
  function imageUnder(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === imgBtn || el === imgAllBtn) return imgBtnTarget;
      if (!(el instanceof HTMLImageElement)) continue;
      const src = el.currentSrc || el.src;
      if (!src || src.startsWith('data:')) return null;
      const r = el.getBoundingClientRect();
      if (r.width < OCR_MIN_SIDE || r.height < OCR_MIN_SIDE) return null;
      if (el.naturalWidth && el.naturalWidth < OCR_MIN_SIDE) return null;
      return el;
    }
    return null;
  }

  function hideImageButton() {
    if (imgBtn) imgBtn.style.display = 'none';
    if (imgAllBtn) imgAllBtn.style.display = 'none';
  }

  function makeImageButton(id, onClick) {
    const b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    markNoTranslate(b);
    // 사진을 누르면 확대 창을 여는 사이트가 많다. 버튼 누름이 사진까지 내려가지 않게 막는다.
    for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      b.addEventListener(type, (e) => e.stopPropagation());
    }
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    document.body.appendChild(b);
    return b;
  }

  function showImageButton(img) {
    if (!imgBtn) {
      imgBtn = makeImageButton('lzk-imgbtn', () => imgBtnTarget && onImageButton(imgBtnTarget));
      imgAllBtn = makeImageButton('lzk-imgall', translatePageImages);
    }
    imgBtnTarget = img;
    const r = img.getBoundingClientRect();
    // 사진의 보이는 왼쪽 위. 위가 고정 메뉴(라자다 상단 검색줄 등)에 가려 있으면 보이는 곳까지 내린다.
    const left = Math.max(4, r.left + 8);
    let top = Math.max(4, r.top + 8);
    for (let i = 0; i < 15 && top < r.bottom - 40 && !imageOnTop(img, left + 12, top + 10); i++) top += 20;
    imgBtn.style.left = `${left}px`;
    imgBtn.style.top = `${top}px`;
    imgBtn.style.display = '';
    refreshImageButton();
    imgAllBtn.style.left = `${left + imgBtn.offsetWidth + 6}px`;
    imgAllBtn.style.top = `${top}px`;
    imgAllBtn.style.display = '';
  }

  function installImageUI() {
    let pending = false;
    let lastX = 0;
    let lastY = 0;
    document.addEventListener(
      'mousemove',
      (e) => {
        lastX = e.clientX;
        lastY = e.clientY;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          // 무료 사진 글자 읽기는 그 쇼핑몰 말의 모델로(30개 언어 — 1.34.2 까지는 태국어뿐). 모델이 없는 말은 Vision 키가 있을 때만.
          if (!cfg.imageTranslate || (!ocrModel() && !cfg.visionKey)) return hideImageButton();
          const img = imageUnder(lastX, lastY);
          if (img) showImageButton(img);
          else hideImageButton();
          onHoverImage(img);
        });
      },
      { passive: true }
    );
    window.addEventListener('scroll', hideImageButton, { passive: true });
  }

  function glossaryToText(obj) {
    return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n');
  }
  function glossaryFromText(text) {
    const out = {};
    for (const line of text.split('\n')) {
      const i = line.indexOf('=');
      if (i <= 0) continue;
      // 붙여넣은 글자가 조합형이면 조회가 빗나가므로 넣을 때 정규화해 둔다.
      const k = normKey(line.slice(0, i));
      const v = line.slice(i + 1).trim();
      if (k && v) out[k] = v;
    }
    return out;
  }

  function togglePanel() {
    // 용어집 사본을 아직 안 읽었으면(확장은 처음 쓸 때 읽는다) 읽은 뒤에 연다 — 수십 ms.
    if (!glossaryStoreReady && !document.getElementById('lzk-panel')) return void glossaryStoreLoad().then(togglePanel);
    const existing = document.getElementById('lzk-panel');
    if (existing) {
      existing.remove();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'lzk-panel';
    markNoTranslate(panel);
    panel.innerHTML = `
      <h3>${APP_NAME} 설정 <span id="lzk-site-label" style="font-weight:400;opacity:.6"></span></h3>

      <label>용어집 (한국어=그 언어 낱말, 한 줄에 하나)</label>
      <select id="lzk-gl-lang"></select>
      <textarea id="lzk-glossary" style="margin-top:6px"></textarea>
      <div class="lzk-actions" style="margin-top:6px">
        <button id="lzk-gl-save" type="button">저장</button>
      </div>
      <div class="lzk-hint">언어를 고르고 적은 뒤 <b>저장</b>을 누르면 그 언어의 GitHub 용어집에 바로 저장되고 칸은 비워집니다. 모든 PC가 같이 쓰고, 입력칸·메신저·검색에서 구글보다 먼저 씁니다. 이미 있는 단어를 적으면 그 뜻으로 고칩니다.</div>
      <div class="lzk-hint" id="lzk-gl-status" style="white-space:pre-line"></div>

      <details id="lzk-gh-setup">
        <summary>GitHub 연결 <span id="lzk-gh-state" style="font-weight:400"></span></summary>
        <div class="lzk-hint">용어집을 저장하려면 PC마다 처음 한 번 필요합니다. 한 번 만든 토큰을 모든 PC에 똑같이 넣어도 됩니다.</div>
        <ol class="lzk-hint" style="padding-left:18px;margin:6px 0">
          <li><b>토큰 만들기</b>를 누르면 GitHub 화면이 열립니다</li>
          <li>Expiration: 길게 (고를 수 있으면 No expiration)</li>
          <li>Repository access: <b>Only select repositories → th-korean-glossary</b> (이것만)</li>
          <li>Permissions: <b>Contents → Read and write</b></li>
          <li><b>Generate token</b> → 나온 토큰(github_pat_…)을 아래에 붙여 넣고 <b>연결 확인</b></li>
        </ol>
        <input type="password" id="lzk-gh-token" autocomplete="off" placeholder="github_pat_...">
        <div class="lzk-actions" style="margin-top:6px">
          <button class="lzk-ghost" id="lzk-gh-create" type="button">토큰 만들기</button>
          <button class="lzk-ghost" id="lzk-gh-check" type="button">연결 확인</button>
        </div>
      </details>

      <div id="lzk-helper" ${IS_WINDOWS ? '' : 'hidden'}>
        <label>번역 도우미 (LINE PC · 화면 번역, 윈도우)</label>
        <div class="lzk-actions" style="margin-top:0">
          <button id="lzk-helper-run" type="button">번역 도우미 켜기</button>
          <button class="lzk-ghost" id="lzk-helper-install" type="button">번역 도우미 설치</button>
        </div>
        <div class="lzk-hint">크롬 밖에서 도는 프로그램입니다. LINE PC 에서 상대 언어(30개 언어)로 바꿔 보내고 받은 말을 ${MY_KO ? '한국어' : '내 언어'}로 보여 주며, 아무 프로그램 창에서 <b>Ctrl+Alt+K</b> 를 누르면 30개 언어 글자를 그 자리에 ${MY_KO ? '한국어' : '내 언어'}로 덮습니다. 설치는 PC마다 한 번이고, 그 뒤로는 윈도우를 켜면 같이 켜지고 새 판도 스스로 받습니다.</div>
        <div class="lzk-hint" id="lzk-helper-note" style="white-space:pre-line"></div>
        <input type="text" id="lzk-helper-cmd" readonly hidden>
      </div>

      <label>페이지 표시 번역 엔진</label>
      <select id="lzk-page-engine">
        <option value="free">무료 API (빠름, 키 불필요)</option>
        <option value="ai">AI (정밀, 느림, 키 필요)</option>
        <option value="off">끄기</option>
      </select>

      <label>용어집에 없는 검색어는</label>
      <select id="lzk-search-engine">
        <option value="free">그 말만 무료 API로 채우기 (빠름)</option>
        <option value="ai">통째로 AI에 맡기기 (정확, 검색마다 몇 초)</option>
      </select>
      <div class="lzk-hint">검색어는 먼저 용어집 단어로 쪼개 봅니다. 다 쪼개지면 API 없이 바로 검색합니다.</div>

      <div class="lzk-check">
        <input type="checkbox" id="lzk-auto"><span>쇼핑몰 페이지를 열면 자동으로 ${MY_KO ? '한국어' : '내 언어'}로 표시</span>
      </div>
      <div class="lzk-check">
        <input type="checkbox" id="lzk-confirm"><span>검색 전 바뀐 검색어 확인 (Enter 한 번 더)</span>
      </div>
      <div class="lzk-check">
        <input type="checkbox" id="lzk-page-lang"><span>외국어 페이지에서는 입력칸에 쓴 ${MY_KO ? '한국어' : '내 언어'}를 그 페이지 언어로 바꾸기</span>
      </div>
      <div class="lzk-hint">30개 언어 페이지 어디서나(태국어·영어·일본어·베트남어 …). 번역 단추에서 언어를 고르면 고른 언어가 먼저입니다.</div>

      <div class="lzk-check">
        <input type="checkbox" id="lzk-chat-translate"><span>메신저: 외국어 메시지 밑에 ${MY_KO ? '한국어' : '내 언어'} 표시 (30개 언어)</span>
      </div>
      <label>메신저: 내 성별 (존댓말 끝말)</label>
      <select id="lzk-chat-particle">
        <option value="ครับ">남자 — 태국어 ครับ (크랍)</option>
        <option value="ค่ะ">여자 — 태국어 ค่ะ / คะ (카)</option>
        <option value="">정하지 않음 — 붙이지 않음</option>
      </select>
      <div class="lzk-hint">메신저에서 ~요·~니다로 쳤을 때, 말끝에 남녀가 갈리는 존댓말을 붙이는 언어(태국어)에서 성별에 맞춰 붙입니다. 다른 언어는 존댓말을 번역이 맞춥니다. 반말에는 붙이지 않습니다.</div>
      <div class="lzk-check">
        <input type="checkbox" id="lzk-selection"><span>글자를 드래그하면 '한국어로' 버튼 표시</span>
      </div>
      <div class="lzk-hint">페이지 번역을 끄고 크롬 자동번역을 쓸 때, 뭉개진 상품명만 골라 보는 용도입니다. AI 키가 있으면 AI가 처리합니다.</div>
      <div class="lzk-check">
        <input type="checkbox" id="lzk-image"><span>사진에 마우스를 올리면 '사진 번역' 버튼 표시</span>
      </div>
      <div class="lzk-check">
        <input type="checkbox" id="lzk-image-auto"><span>누르지 않아도, 마우스를 올려 두면 자동 번역</span>
      </div>
      <div class="lzk-hint">'사진 번역'은 그 사진만, 옆의 '페이지 전체'는 지금 페이지에 받아진 큰 사진을 모두 번역합니다(Google Vision 은 사진들을 한 장으로 붙여 12장 남짓마다 1건). 버튼을 누른 사진만 읽어 한국어로 덮어 보여 줍니다. 한 번 번역한 사진은 다시 올리면 저장된 결과로 바로 보입니다(다시 읽지 않아 Google Vision 건수도 안 듭니다). 자동 번역을 켜면 0.5초 머문 사진을 모두 읽으니 Vision 건수가 빨리 쌓입니다.</div>

      <label>표시 고정 (원문=한국어, 한 줄에 하나)</label>
      <textarea id="lzk-page-glossary" placeholder="Quiescent=Quiescent"></textarea>
      <div class="lzk-hint">브랜드명이 일반 단어로 번역될 때 씁니다. 원문 그대로 두려면 양쪽을 같게 적으세요.</div>

      <details id="lzk-ai-setup">
        <summary>AI 설정 (선택) — 없어도 동작합니다</summary>

        <label>AI 공급자</label>
        <select id="lzk-provider">
          <option value="nvidia">NVIDIA NIM (무료, build.nvidia.com)</option>
          <option value="groq">Groq (console.groq.com)</option>
        </select>

        <label><span id="lzk-key-label">API 키</span></label>
        <input type="password" id="lzk-key" autocomplete="off">
        <div class="lzk-hint" id="lzk-key-hint"></div>

        <label>모델</label>
        <div class="lzk-row">
          <select id="lzk-model"></select>
          <button class="lzk-ghost" id="lzk-load-models" type="button">불러오기</button>
        </div>
        <div class="lzk-hint">키를 넣고 '불러오기'를 누르면 실제 쓸 수 있는 모델만 나옵니다. 키 확인도 겸합니다.</div>

        <label>Google Vision API 키 (사진 글자 인식)</label>
        <input type="password" id="lzk-vision-key" autocomplete="off" placeholder="AIza...">
        <label>Google Vision 이 PC 월 한도 (건)</label>
        <input type="number" id="lzk-vision-cap" min="0" max="1000" step="10">
        <div class="lzk-hint" id="lzk-vision-usage"></div>
        <div class="lzk-hint">있으면 사진 속 글자를 Google Vision 으로 더 정확히 읽습니다. 무료는 Google 계정 전체 월 1,000건입니다. 이 PC에서 이번 달 한도에 닿으면 Vision 을 부르지 않고 무료 인식으로 읽습니다. PC가 여러 대면 한도를 나눠 적으세요(2대면 450씩). 키는 이 브라우저에만 저장됩니다. 콘솔에서 키를 'Cloud Vision API' 전용으로 제한해 두세요.</div>
      </details>

      <div class="lzk-actions">
        <button id="lzk-save" type="button">저장</button>
        <button class="lzk-ghost" id="lzk-translate-now" type="button">지금 번역</button>
        <button class="lzk-ghost" id="lzk-show-original" type="button">원문 보기</button>
        <button class="lzk-ghost" id="lzk-clear-cache" type="button">캐시 비우기</button>
      </div>
      <div class="lzk-actions" style="margin-top:8px">
        <button class="lzk-ghost" id="lzk-fab-reset" type="button">단추 처음 자리로</button>
      </div>
      <div class="lzk-hint">이 단추와 번역 단추는 끌어서 화면 아무 데나 옮길 수 있습니다. 놓은 자리를 기억합니다.</div>
    `;
    document.body.appendChild(panel);
    placeLzk();

    const $ = (id) => panel.querySelector(id);
    // 사이트 이름은 원격 설정(config.json shops.label)에서 올 수 있다 — 글자로만 넣는다(HTML 로 읽히지 않게).
    $('#lzk-site-label').textContent = `· ${SITE.label}`;
    $('#lzk-provider').value = cfg.aiProvider;
    // 저장된 값이 구버전('groq')이어도 'AI' 항목이 선택되도록 맞춰준다.
    $('#lzk-page-engine').value = usesAI(cfg.pageEngine) ? 'ai' : cfg.pageEngine;
    $('#lzk-search-engine').value = usesAI(cfg.searchEngine) ? 'ai' : 'free';
    $('#lzk-auto').checked = cfg.autoTranslatePage;
    $('#lzk-confirm').checked = cfg.confirmSearch = GM_getValue('confirmSearch', cfg.confirmSearch);
    $('#lzk-chat-particle').value = cfg.chatParticle;
    $('#lzk-chat-translate').checked = cfg.chatTranslate;
    $('#lzk-selection').checked = cfg.selectionTranslate;
    $('#lzk-image').checked = cfg.imageTranslate;
    $('#lzk-image-auto').checked = cfg.imageAuto;
    $('#lzk-vision-key').value = cfg.visionKey;
    $('#lzk-vision-cap').value = cfg.visionMonthlyCap;
    const vu = visionUsage();
    $('#lzk-vision-usage').textContent =
      `이 PC 이번 달(${vu.month}) 사용: ${vu.count} / ${cfg.visionMonthlyCap}건` +
      (visionBlocked ? ` — 지금은 쓸 수 없음: ${visionBlocked}` : '');
    $('#lzk-page-glossary').value = glossaryToText(cfg.pageGlossary);
    $('#lzk-page-lang').checked = cfg.pageLangAuto;

    // --- 용어집 언어 (2026-11-21: 태국어만이 아니라 30개 언어 — 언어마다 GitHub 파일 하나) ---
    const glLangs = TYPE_LANGS.filter((l) => l.id === 'th' || l.glossary);
    const glSel = $('#lzk-gl-lang');
    for (const l of glLangs) {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = langName(l);
      glSel.appendChild(o);
    }
    glSel.value = glossaryDefaultLang(glLangs);
    const glPick = () => glLangs.find((l) => l.id === glSel.value) || glLangs[0];
    const glShow = async () => {
      const l = glPick();
      $('#lzk-glossary').placeholder = `사무실=${GLOSSARY_EXAMPLE[l.id] || '…'}`;
      if (l.id === 'th') return showThaiStatus();
      $('#lzk-gl-status').textContent = `${langName(l)} 용어집: 받는 중…`;
      const m = await langGlossaryMap(glossaryFileOf(l)).catch(() => null);
      if (glPick() !== l) return;
      $('#lzk-gl-status').textContent = m ? `현재 ${langName(l)} 용어집: ${m.size}개` : `${langName(l)} 용어집을 받지 못했습니다(저장은 됩니다).`;
    };
    glSel.addEventListener('change', () => {
      GM_setValue('glLang', glSel.value);
      glShow();
    });

    // --- 태국어 용어집(glossary.txt) → GitHub ---
    // 예전 방식으로 이 PC에만 넣어 둔 단어 중 GitHub 에 없는 것은 칸에 미리 넣어 둔다.
    // 저장을 누르면 GitHub 로 옮겨지고 이 PC 목록은 비워진다.
    const remoteNow = remoteGlossary();
    const legacyNew = Object.entries(cfg.glossary || {})
      .map(([k, v]) => [normKey(k), v])
      .filter(([k, v]) => k && v && !(k in remoteNow));
    if (legacyNew.length) glSel.value = 'th'; // 예전 단어는 태국어다
    $('#lzk-glossary').value = legacyNew.map(([k, v]) => `${k}=${v}`).join('\n');
    function showThaiStatus() {
      $('#lzk-gl-status').textContent =
        `현재 태국어 용어집: ${Object.keys(remoteNow).length}개` +
        (glossaryStore ? ` (${new Date(glossaryStore.at).toLocaleString()} 받음)` : ' (아직 받지 못함)') +
        (legacyNew.length
          ? `\n이 PC에만 있던 예전 단어 ${legacyNew.length}개를 칸에 넣어 두었습니다. 저장하면 GitHub로 옮겨집니다.`
          : '');
    }
    glShow();

    const showGhState = () => {
      $('#lzk-gh-state').textContent = !cfg.githubToken
        ? '— 연결 안 됨 (저장하려면 처음 한 번)'
        : cfg.githubUser
          ? `— 연결됨 (${cfg.githubUser})`
          : '— 토큰 있음';
    };
    $('#lzk-gh-token').value = cfg.githubToken || '';
    showGhState();
    $('#lzk-gh-create').addEventListener('click', () => window.open(GITHUB_TOKEN_URL, '_blank', 'noopener'));
    $('#lzk-gh-check').addEventListener('click', async () => {
      const token = $('#lzk-gh-token').value.trim();
      if (!token) return toast('만든 토큰을 붙여 넣으세요.');
      try {
        const login = await checkGitHubToken(token);
        cfg.githubToken = token;
        cfg.githubUser = login;
        saveCfg('githubToken');
        saveCfg('githubUser');
        showGhState();
        toast(`GitHub 연결됨: ${login}\n이제 용어집 칸에 적고 저장하면 GitHub에 바로 저장됩니다.`, 6000);
      } catch (e) {
        toast(`연결 실패: ${githubErrorMessage(e)}`, 7000);
      }
    });

    // --- 번역 도우미 ---
    const helperNote = $('#lzk-helper-note');
    $('#lzk-helper-run').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = HELPER_LINK;
      a.click();
      helperNote.textContent =
        '크롬이 "번역 도우미 열기?" 를 물으면 "항상 허용"에 체크하고 열기를 누르세요. 켜지면 화면에 알림이 뜹니다.\n' +
        '아무 반응이 없으면 이 PC에는 아직 설치하지 않은 것입니다 → 번역 도우미 설치.';
    });
    $('#lzk-helper-install').addEventListener('click', async () => {
      const copied = await copyText(HELPER_INSTALL);
      const cmd = $('#lzk-helper-cmd');
      cmd.value = HELPER_INSTALL;
      cmd.hidden = copied;
      helperNote.textContent =
        (copied ? '설치 명령을 복사했습니다.' : '복사하지 못했습니다 — 아래 칸의 글을 모두 복사하세요(Ctrl+C).') +
        '\n① 키보드에서 윈도우 키 + R  ② Ctrl + V  ③ Enter' +
        '\n파란 창에 "설치 끝!" 이 나오면 그 창을 닫으세요(10초쯤). 이 PC에서 한 번만 하면 됩니다.';
      if (!copied) cmd.select();
    });

    const modelSelect = $('#lzk-model');
    const setModelOptions = (ids) => {
      modelSelect.innerHTML = '';
      for (const id of ids) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        modelSelect.appendChild(opt);
      }
      const current = aiModel();
      modelSelect.value = ids.includes(current) ? current : ids[0];
    };

    // 공급자를 바꾸면 키·모델 칸도 그 공급자 것으로 갈아끼운다.
    const syncProvider = () => {
      cfg.aiProvider = $('#lzk-provider').value;
      const p = provider();
      $('#lzk-key-label').textContent = `${p.label} API 키`;
      $('#lzk-key').value = cfg[p.keyField] || '';
      $('#lzk-key').placeholder = cfg.aiProvider === 'groq' ? 'gsk_...' : 'nvapi-...';
      $('#lzk-key-hint').textContent = `${p.signup} 에서 직접 발급해 붙여넣으세요. 이 브라우저에만 저장됩니다.`;
      setModelOptions([aiModel()]);
    };
    syncProvider();
    $('#lzk-provider').addEventListener('change', syncProvider);

    $('#lzk-load-models').addEventListener('click', async () => {
      const p = provider();
      cfg[p.keyField] = $('#lzk-key').value.trim();
      saveCfg(p.keyField);
      if (!cfg[p.keyField]) return toast(`먼저 ${p.label} API 키를 입력하세요.`);
      toast('모델 목록을 불러오는 중…', 8000);
      let ids;
      try {
        ids = await aiListModels();
        if (!ids.length) return toast('사용 가능한 모델이 없습니다.');
        setModelOptions(ids);
      } catch (e) {
        return toast(`모델 목록 실패: ${e.message}`, 6000);
      }

      // NVIDIA 는 모델 목록을 키 없이도 내준다. 목록이 떴다고 키가 유효한 게 아니므로
      // 짧은 번역을 실제로 한 번 시켜서 확인한다.
      cfg[p.modelField] = modelSelect.value || cfg[p.modelField];
      saveCfg(p.modelField);
      toast(`모델 ${ids.length}개. 키를 확인하는 중…`, 8000);
      try {
        const out = await aiChat(
          [
            { role: 'system', content: SEARCH_SYSTEM },
            { role: 'user', content: '무선 이어폰' },
          ],
          { temperature: 0 }
        );
        toast(
          `${p.label} 정상 동작합니다.\n모델 ${ids.length}개\n시험 번역: 무선 이어폰 → ${out.trim().slice(0, 40)}`,
          7000
        );
      } catch (e) {
        toast(`키 확인 실패: ${e.message}`, 7000);
      }
    });

    // 위(용어집 칸 옆)와 아래 저장 버튼이 같은 일을 한다. 설정은 이 PC에, 용어집은 GitHub 에.
    let saving = false;
    const saveButtons = [$('#lzk-gl-save'), $('#lzk-save')];
    const saveAll = async () => {
      if (saving) return;
      cfg.aiProvider = $('#lzk-provider').value;
      const p = provider();
      cfg[p.keyField] = $('#lzk-key').value.trim();
      if (modelSelect.value) cfg[p.modelField] = modelSelect.value;
      cfg.pageEngine = $('#lzk-page-engine').value;
      cfg.searchEngine = $('#lzk-search-engine').value;
      cfg.autoTranslatePage = $('#lzk-auto').checked;
      cfg.confirmSearch = $('#lzk-confirm').checked;
      cfg.chatParticle = $('#lzk-chat-particle').value;
      cfg.chatTranslate = $('#lzk-chat-translate').checked;
      cfg.selectionTranslate = $('#lzk-selection').checked;
      cfg.imageTranslate = $('#lzk-image').checked;
      cfg.imageAuto = $('#lzk-image-auto').checked;
      if (!cfg.imageTranslate) hideImageButton();
      const vKey = $('#lzk-vision-key').value.trim();
      if (vKey !== cfg.visionKey) visionBlocked = ''; // 키를 바꿨으면 다시 시도해 본다
      cfg.visionKey = vKey;
      cfg.visionMonthlyCap = Math.max(0, Math.min(1000, Math.floor(Number($('#lzk-vision-cap').value) || 0)));
      cfg.pageGlossary = glossaryFromText($('#lzk-page-glossary').value);
      const token = $('#lzk-gh-token').value.trim();
      if (token !== cfg.githubToken) {
        cfg.githubToken = token;
        cfg.githubUser = '';
      }
      for (const k of Object.keys(DEFAULTS)) saveCfg(k);

      cfg.pageLangAuto = $('#lzk-page-lang').checked;
      saveCfg('pageLangAuto');
      if (!cfg.pageLangAuto && genericPageLang) {
        genericPageLang = '';
        refreshLangBar();
        updateGenericChip();
      }
      const glLang = glPick();
      const { entries, bad } = parseEntries($('#lzk-glossary').value);
      if (bad.length) {
        toast(`'한국어=${langName(glLang)}' 모양이 아닌 줄이 있습니다. 고친 뒤 다시 저장하세요.\n` + bad.slice(0, 5).join('\n'), 8000);
        return;
      }
      if (!entries.length) {
        // 미리 넣어 둔 예전 단어를 지우고 저장했다 = 옮기지 않고 버린다.
        if (legacyNew.length) {
          cfg.glossary = {};
          saveCfg('glossary');
        }
        toast('저장했습니다.');
        panel.remove();
        return;
      }
      if (!cfg.githubToken) {
        $('#lzk-gh-setup').open = true;
        $('#lzk-gh-setup').scrollIntoView({ block: 'nearest' });
        toast(
          '용어집을 GitHub에 저장하려면 이 PC에서 처음 한 번 GitHub 연결이 필요합니다.\n' +
            "아래 'GitHub 연결' 안내대로 토큰을 넣어 주세요. 적은 단어는 칸에 그대로 있습니다.",
          9000
        );
        return;
      }

      saving = true;
      const labels = saveButtons.map((b) => b.textContent);
      saveButtons.forEach((b) => {
        b.disabled = true;
        b.textContent = 'GitHub에 저장 중…';
      });
      try {
        const r = await saveGlossaryToGitHub(entries, glossaryFileOf(glLang));
        if (glLang.id === 'th') {
          cfg.glossary = {}; // 예전 단어는 방금 GitHub 로 옮겼다
          saveCfg('glossary');
        }
        $('#lzk-glossary').value = '';
        if (!cfg.githubUser) {
          checkGitHubToken(cfg.githubToken)
            .then((login) => {
              cfg.githubUser = login;
              saveCfg('githubUser');
            })
            .catch(() => {});
        }
        const lines = [];
        if (r.added.length) lines.push(`새로 ${r.added.length}개: ${r.added.slice(0, 8).join(', ')}`);
        if (r.changed.length) lines.push(`고침 ${r.changed.length}개: ${r.changed.slice(0, 8).join(', ')}`);
        toast(
          `GitHub ${langName(glLang)} 용어집에 저장했습니다.\n` +
            (lines.join('\n') || '(이미 같은 내용이었습니다)') +
            '\n이 PC는 바로, 다른 PC는 10분 안에 반영됩니다.',
          7000
        );
        panel.remove();
      } catch (e) {
        toast(`GitHub 저장 실패: ${githubErrorMessage(e)}\n적은 단어는 칸에 그대로 있습니다.`, 10000);
        if (/HTTP 40[134]/.test(e.message)) $('#lzk-gh-setup').open = true;
      } finally {
        saving = false;
        saveButtons.forEach((b, i) => {
          b.disabled = false;
          b.textContent = labels[i];
        });
      }
    };
    saveButtons.forEach((b) => b.addEventListener('click', saveAll));

    $('#lzk-translate-now').addEventListener('click', () => {
      panel.remove();
      translatePage();
    });
    $('#lzk-show-original').addEventListener('click', () => {
      panel.remove();
      restoreOriginal();
      toast('원문을 표시합니다. "지금 번역"을 누르면 다시 한국어로 바뀝니다.');
    });
    $('#lzk-clear-cache').addEventListener('click', () => {
      cache = {};
      GM_setValue(CACHE_KEY, cache);
      toast('번역 캐시를 비웠습니다.');
    });
    $('#lzk-fab-reset').addEventListener('click', () => {
      fabReset();
      toast('단추를 처음 자리(오른쪽 아래)로 돌렸습니다. 모든 사이트에 같이 적용됩니다.');
    });
  }

  const SCRIPT_VERSION =
    (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?';

  // 옛 스크립트(라자다 …)가 같이 돌면 그쪽이 검색 Enter 를 먼저 가로채, 여기 용어집을
  // 아무리 고쳐도 옛 번역이 나온다(도시락 → อาหารกลางวัน 이 실제로 그랬다).
  // 옛것도 같은 id 의 '한' 버튼을 달므로, 버전 표시가 없는 버튼이 보이면 알린다.
  function warnIfOldScript() {
    const foreign = [...document.querySelectorAll('#lzk-fab')].some((b) => !b.dataset.lzkVersion);
    if (!foreign) return;
    toast(
      '옛 버전 스크립트가 함께 돌고 있습니다.\n' +
        '검색어가 옛 번역(예: 도시락 → อาหารกลางวัน)으로 나갈 수 있습니다.\n' +
        "Tampermonkey 대시보드에서 '라자다 …' 로 시작하는 스크립트를 지우세요.",
      12000
    );
  }

  function mountFab() {
    if (document.getElementById('lzk-fab')) {
      warnIfOldScript();
      return;
    }
    const fab = document.createElement('button');
    fab.id = 'lzk-fab';
    fab.dataset.lzkVersion = SCRIPT_VERSION;
    markNoTranslate(fab);
    fab.type = 'button';
    // 한국어가 아니면 '한' 대신 내 언어 코드(EN·TH …) — '한' 을 옮기면 엉뚱한 글자가 된다.
    fab.textContent = MY_KO ? '한' : MY2.toUpperCase();
    fab.title = `${APP_NAME} 설정 (${SITE.label}) — 끌어서 옮길 수 있습니다`;
    if (MESSENGER) fab.toggleAttribute('data-high', true); // 메신저는 오른쪽 아래에 보내기 단추가 있다
    fab.addEventListener('click', togglePanel);
    fabDraggable(fab, false);
    document.body.appendChild(fab);
    placeLzk();
    refreshLangBar(); // 태·미·중 막대를 '한' 왼쪽으로
  }

  // ---------------------------------------------------------------------------
  // 시작
  // ---------------------------------------------------------------------------

  // 가로채기를 놓쳐 한국어가 그대로 주소에 들어간 경우의 안전망.
  // 라자다는 한국어 q 를 못 알아듣고 엉뚱한 결과를 주므로, 태국어로 바꿔 다시 검색한다.
  // 자동완성 클릭, 북마크, 외부 링크 등 어떤 경로로 들어와도 여기서 걸린다.
  // 같은 검색어로 오가는 무한 이동을 막는다. 방금 이 검색어로 바꿔 이동했으면 true.
  function alreadyRescued(q) {
    let already = null;
    try {
      already = sessionStorage.getItem('lzk-rescued');
      sessionStorage.setItem('lzk-rescued', q);
    } catch {
      /* 저장소가 막혀 있으면 그냥 진행한다 */
    }
    return already === q;
  }

  // 예전에 틀리게 옮긴 태국어가 사이트의 '최근 검색어'에 남는다. 크롬 번역은 그 태국어를
  // 다시 한국어로 보여 주므로(หมูหมากช้าง → '돼지막창'), 사용자는 한국어를 누른 줄 알지만
  // 실제로는 옛 오역으로 검색된다. 태국어라 위 안전망에도 안 걸린다.
  // 주소의 태국어가 예전에 우리가 낸 번역(캐시)인데, 지금 용어집은 그 한국어를 다르게
  // 옮긴다면 옛 오역이다. 용어집 값을 돌려준다.
  async function findStaleTranslation(q) {
    const flat = (s) => String(s).replace(/\s+/g, ' ').trim();
    const target = flat(q);
    for (const [key, val] of Object.entries(cache)) {
      if (!key.startsWith('th|') || flat(val) !== target) continue;
      const ko = key.slice(3);
      const now = await translateSearchKeyword(ko);
      // 용어집만으로 옮긴 값일 때만 믿는다. 무료 API 가 섞이면 그것도 틀릴 수 있다.
      if (now.thai && flat(now.thai) !== target && (now.via === '용어집' || now.via === '용어집 조합')) {
        return { ko, thai: now.thai };
      }
    }
    return null;
  }

  async function rescueKoreanQuery() {
    if (!SITE.searchUrl) return; // 표에 없는 사이트에서는 주소를 건드리지 않는다
    const params = new URLSearchParams(location.search);
    const q = params.get(SITE.queryParam);
    if (!q) return;

    if (!MY_KO) return; // 주소의 검색어 고치기는 한국어 용어집으로만 한다
    if (!HANGUL.test(q)) {
      if (!THAI.test(q) || SITE_LANG2 !== 'th') return; // 옛 오역 고치기는 태국어 용어집으로만
      const fix = await findStaleTranslation(q);
      if (!fix || alreadyRescued(fix.thai)) return;
      toast(
        `최근 검색어에 남은 옛 번역으로 검색됐습니다.\n"${fix.ko}": ${q} → ${fix.thai}  (용어집)\n` +
          '용어집 값으로 다시 검색합니다.',
        5000
      );
      params.set(SITE.queryParam, fix.thai);
      const target = location.pathname + '?' + params.toString();
      setTimeout(() => location.replace(target), 900);
      return;
    }

    if (alreadyRescued(q)) return;

    setBadge('검색어 변환 중…');
    try {
      const { thai, via, note } = await translateShopQuery(q);
      if (!thai || HANGUL.test(thai)) return;
      const msg = `주소의 한국어를 ${langName(siteLangObj())}로 바꿔 다시 검색합니다.\n"${q}" → "${thai}"  (${via})` +
        (note ? `\n${note}` : '');
      toast(msg, 4000);
      if (note) carryToast(msg, 8000);
      params.set(SITE.queryParam, thai);
      const target = location.pathname + '?' + params.toString();
      setTimeout(() => location.replace(target), 700); // 안내를 잠깐 보여주고 이동
    } catch (e) {
      toast(`검색어 변환 실패: ${e.message}`, 4000);
    } finally {
      setBadge(null);
    }
  }

  function init() {
    GM_addStyle(LZK_CSS);
    mountFab();
    mountLangTools();
    setTimeout(warnIfOldScript, 3000); // 옛것이 우리보다 늦게 뜨는 경우
    hookSearch();
    installSelectionUI();
    installImageUI();
    showCarriedToast();
    rescueKoreanQuery();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    if (cfg.autoTranslatePage && cfg.pageEngine !== 'off') translatePage();

    // 검색창이 늦게 그려지는 페이지가 있어 잠깐 동안 재시도한다.
    let tries = 0;
    const retry = setInterval(() => {
      hookSearch();
      if (++tries > 20 || getSearchInput()?.dataset.lzkHooked) clearInterval(retry);
    }, 500);

    // 쇼피는 SPA 라 페이지를 다시 불러오지 않고 주소만 바뀐다.
    // 검색 결과로 넘어간 시점을 잡아 안전망과 검색창 연결을 다시 돌린다.
    if (SITE.spa) {
      const onRoute = () => {
        hookSearch();
        rescueKoreanQuery();
        if (cfg.autoTranslatePage && cfg.pageEngine !== 'off') enqueue(document.body);
      };
      for (const method of ['pushState', 'replaceState']) {
        const orig = history[method];
        history[method] = function () {
          const r = orig.apply(this, arguments);
          setTimeout(onRoute, 60);
          return r;
        };
      }
      window.addEventListener('popstate', () => setTimeout(onRoute, 60));
    }
  }

  // 쇼피처럼 구조를 확인하지 못한 사이트에서 무엇이 인식됐는지 바로 볼 수 있게 한다.
  function reportSiteInfo() {
    if (!glossaryStoreReady) return void glossaryStoreLoad().then(reportSiteInfo);
    const input = getSearchInput();
    // 업데이트가 실제로 올라갔는지 여기서 바로 보이게 한다. 서버가 꺼진 채로
    // '업데이트 확인' 을 누르면 Tampermonkey 는 조용히 실패하고 옛 버전이 그대로 돈다.
    const lines = [
      `버전: ${SCRIPT_VERSION} / 용어집 ${glossaryStatus()}`,
      `용어집 저장(GitHub 연결): ${
        cfg.githubToken ? (cfg.githubUser ? `연결됨 (${cfg.githubUser})` : '토큰 있음') : '연결 안 됨'
      }`,
      `사이트: ${SITE.label} (${location.hostname})`,
      `검색창 찾음: ${input ? '예' : '아니오'}`,
    ];
    if (input) {
      lines.push(`  선택자 일치: ${isSearchInput(input) ? '예' : '아니오 (대체 경로로 인식)'}`);
      lines.push(`  id="${input.id}" name="${input.name}" type="${input.type}"`);
      lines.push(`  class="${String(input.className).slice(0, 60)}"`);
      // 위젯·버튼 선택자가 빗나가면 Enter 는 되는데 버튼 클릭만 안 되는 식으로 어긋난다.
      const inWidget = (() => {
        try {
          return !!(SITE.widgetSelector && input.closest(SITE.widgetSelector));
        } catch {
          return false;
        }
      })();
      lines.push(`  위젯 선택자 일치: ${inWidget ? '예' : '아니오'}`);
    }
    const btn = (() => {
      try {
        return SITE.buttonSelector ? document.querySelector(SITE.buttonSelector) : null;
      } catch {
        return null;
      }
    })();
    lines.push(`검색 버튼 찾음: ${btn ? '예' : '아니오'}`);
    // 크롬 번역이 뜨는지와 직결된다. 비어 있으면 크롬이 언어를 못 정한다.
    lines.push(
      `문서 언어(lang): ${document.documentElement.lang || '(없음)'}` +
        (SITE.langHint ? ` / 이 스크립트가 넣는 값: ${SITE.langHint}` : '')
    );
    lines.push(`검색 주소 형식: ${SITE.searchUrl('테스트')}`);
    const cur = new URLSearchParams(location.search).get(SITE.queryParam);
    lines.push(`현재 ${SITE.queryParam} 값: ${cur || '(없음)'}`);
    toast(lines.join('\n'), 15000);
    console.log(`[${APP_NAME}]\n` + lines.join('\n'));
  }

  // 검색 가로채기는 window 에만 붙으므로 DOM 을 기다릴 필요가 없다.
  // 페이지가 다 그려지기 전에 사용자가 검색어를 치고 Enter 를 눌러도 놓치지 않으려면
  // document-start 인 지금 바로 장착해야 한다. (이전 버전이 검색을 놓친 원인)
  // 용어집도 지금부터 받아 둔다. 사본이 있으면 바로 끝나고, 오래됐으면 뒤에서 새로 받는다.
  // 처음 설치한 PC라도 사용자가 검색어를 치는 사이에 받아진다.
  // (표에 없는 사이트는 태국어가 보여 켜질 때 받는다 — 모든 사이트에서 GitHub 을 부르지 않게)
  if (!GENERIC) {
    installSearchInterceptors();
    if (SITE_LANG2 === 'th') ensureGlossary(); // 다른 나라 쇼핑몰은 그 언어 용어집을 검색할 때 받는다
  }

  // 크롬에게 이 페이지가 무슨 언어인지 알려 준다. 크롬은 페이지를 다 읽은 시점에
  // 언어를 한 번 정하고 그 뒤로는 바꾸지 않으므로, 사이트 스크립트보다 먼저 도는
  // 지금(document-start) 박아야 한다. 사이트가 이미 선언해 둔 값은 건드리지 않는다.
  function applyLangHint() {
    if (!SITE.langHint) return;
    const html = document.documentElement;
    if (html && !html.lang) html.lang = SITE.langHint;
  }
  applyLangHint();
  // document-start 가 <html> 보다 먼저 도는 판도 있어 한 번 더 시도한다.
  document.addEventListener('DOMContentLoaded', applyLangHint, { once: true });

  // 특정 단어가 왜 엉뚱하게 번역되는지 바로 가리기 위한 도구.
  // "용어집에 있는데 왜 안 걸리지" 를 추측으로 풀다 오래 헤맨 적이 있어서 넣었다.
  function lookupWord() {
    if (!glossaryStoreReady) return void glossaryStoreLoad().then(lookupWord);
    const raw = prompt('용어집에서 찾아볼 한국어 단어나 검색어를 넣으세요', '차량 핸드폰 거치대');
    if (raw == null) return;
    const key = normKey(raw);
    const legacy = cfg.glossary || {};
    const remote = remoteGlossary();
    const codePoints = (s) => [...s].map((c) => c.codePointAt(0).toString(16)).join(' ');
    const lines = [
      `입력: "${raw}"`,
      `정규화 후: "${key}"${raw !== key ? '  ← 원래 글자와 다름(조합형/공백)' : ''}`,
      `  코드포인트: ${codePoints(key)}`,
      `GitHub 용어집: ${remote[key] || '(없음)'}   [${glossaryStatus()}]`,
    ];
    if (Object.keys(legacy).length) lines.push(`이 PC 예전 단어: ${legacy[key] || '(없음)'}`);
    const whole = buildGlossary()[key];
    if (whole) {
      lines.push(`실제로 쓰일 값: ${whole}`);
    } else {
      // 통째로는 없을 때 어떻게 쪼개지는지 보여 준다. 어느 말을 채우면 되는지 바로 보인다.
      const { pieces, unknown } = composeFromGlossary(key);
      const label = { glossary: '', literal: ' 그대로', noise: ' 뺌', unknown: ' ?' };
      lines.push(
        '쪼갠 결과: ' +
          pieces.map((p) => `${p.ko}(${p.th || ''}${label[p.kind]})`).join(' · ')
      );
      if (!unknown.length) lines.push(`실제로 쓰일 값: ${assembleThai(pieces)}  ← API 없이 바로 검색`);
      else lines.push(`용어집에 없는 말: ${unknown.map((p) => p.ko).join(', ')}  ← 이 말만 API 로 채움`);
    }
    toast(lines.join('\n'), 15000);
    console.log(`[${APP_NAME}] 용어집 조회\n` + lines.join('\n'));
  }

  function registerMenus() {
    if (!GENERIC) GM_registerMenuCommand('검색창 인식 상태 확인', reportSiteInfo);
    GM_registerMenuCommand('용어집에서 단어 찾아보기', lookupWord);
    GM_registerMenuCommand('용어집 새로 받기', async () => {
      toast('GitHub에서 용어집을 받는 중…');
      const ok = await refreshGlossary();
      toast(ok ? `용어집을 새로 받았습니다.\n${glossaryStatus()}` : '용어집을 받지 못했습니다. 이 PC의 사본을 계속 씁니다.', 5000);
    });
    GM_registerMenuCommand('용어집 편집 (GitHub)', () => window.open(GLOSSARY_EDIT_URL, '_blank', 'noopener'));
    if (!GENERIC) GM_registerMenuCommand('설정 열기', togglePanel); // 다른 사이트는 genericBase 가 이미 달았다
    GM_registerMenuCommand('지금 한국어로 번역', translatePage);
    GM_registerMenuCommand('원문 보기', restoreOriginal);
  }

  // ---------------------------------------------------------------------------
  // 다른 사이트 — 입력칸의 내 말(한국어)을 그 페이지 언어로 (1.35.0 부터 30개 언어 — 예전엔 태국어 페이지만)
  //
  // 라자다·쇼피처럼 검색창 구조를 아는 곳이 아니면 검색을 대신 해 줄 수 없다. 대신 입력칸의
  // 글자만 바꾸고 검색은 그 사이트에 맡긴다: 한국어를 치고 Enter → 그 언어로 바뀜 →
  // 확인하고 Enter 한 번 더 → 사이트가 원래대로 검색. 사이트가 검색을 어떻게 처리하든 상관없다.
  // 그 언어 글자가 한글보다 많이 보이는 페이지에서만 켠다(태국어가 조금 섞인 한국 여행 블로그 등에서
  // 한국어 검색을 바꿔 버리지 않게 — detectPageLang). 페이지 번역은 크롬 자동번역에 맡긴다.
  // ---------------------------------------------------------------------------

  const GENERIC_MIN_THAI = 30;
  let genericChip = null;
  let genericBusy = false;

  // 입력 언어 고르기(태·미·중, '한' 버튼 옆). 하나를 고르면 해제할 때까지 모든 일반 사이트(한국
  // 사이트 포함)의 입력칸에서 한국어 + Enter → 그 언어. 아무것도 안 고르면 전처럼 태국어 페이지만
  // 태국어로 바꾼다. 태국어는 용어집, 영어·중국어는 샘플 용어집(KO_EN_ZH_TSV)에 통째로 맞으면 그 값, 아니면 무료 번역.
  const TYPE_LANG_KEY = 'typeLang';
  // 언어 목록은 원격 설정(config.json 의 languages — 받기 전에는 RC_DEFAULT, 같은 22개와 언어별 용어집). 언어를 더하거나
  // 이름·번역 코드·용어집 파일을 바꿀 때 이 코드는 고치지 않는다(config.json 과 RC_DEFAULT 를 같이 고친다).
  const TYPE_LANGS = RC.languages;
  // 언어 막대에 보일 목록. 내 언어가 한국어가 아니면 맨 앞에 한국어(KO)를 넣고 내 언어 자신은 뺀다 —
  // 사용자(2026-11-05): 다른 언어로 바꾸면 아래 언어 목록에 한국(KO)이 없다.
  const KO_LANG = { id: 'ko', label: '한', name: '한국어', mt: 'ko', chip: '→ 한국어' };
  function myTypeLangs() {
    if (MY_KO) return TYPE_LANGS;
    // 내 언어 자신만 뺀다. 중국어는 간체(zh, mt zh-CN)·번체(zh-TW)가 따로 있어 서로 남긴다 — 전에는 앞 두 글자(zh)로도
    // 빼서 번체 사용자에게 간체 칸이 없었다. 지역 없는 칸만 있는 언어면(zh-CN 에 zh) 그 칸을 뺀다(번역 도우미 LangBar 와 같다).
    const exact = TYPE_LANGS.some((l) => l.id === MY);
    return [KO_LANG, ...TYPE_LANGS.filter((l) => l.id !== MY && (l.mt || l.id) !== MY && !(l.id === MY2 && !exact))];
  }
  // 영어·중국어 샘플 용어집(2026-10-23, 한국어 키 188개 — 지금의 태국어 값을 뜻 힌트로 만들었다: 차=茶·면=棉·수도=自来水).
  // 미·중 을 고르면 입력 전체가 이 키와 맞을 때만 쓰고, 나머지는 무료 번역. 원본 .dev-tools/data/multilang/sample-en-zh.tsv.
  const KO_EN_ZH_TSV = `
수학숙제야	It's math homework	是数学作业
뭐하자	What shall we do?	我们做什么呢
레진아트	resin art	滴胶艺术
잘안들려	I can't hear you well	听不太清楚
요리중이야	I'm cooking	我在做饭
베타딘	Betadine	碘伏
조절식	adjustable	可调节
경마장	racecourse	赛马场
기업파산	corporate bankruptcy	企业破产
개발	development	开发
벤처캐피탈	venture capital	风险投资
태국국가	Thai national anthem	泰国国歌
숯있어	Do you have charcoal?	有木炭吗
군청	district office	县政府
위약금	cancellation penalty	违约金
드레스	dress	连衣裙
캠샤프트	camshaft	凸轮轴
육교	pedestrian overpass	天桥
대형쓰레기	bulky waste	大件垃圾
해고수당	severance pay	解雇补偿金
생활잡화	household goods	生活杂货
블라우스	blouse	女式衬衫
코킹	caulk	填缝剂
어디있었어	Where were you?	你刚才在哪儿
하면안되는	not allowed	不能做的
믿기지않아	I can't believe it	难以置信
나도찬성	I agree too	我也赞成
포장재	packaging material	包装材料
짜증나	I'm annoyed	好烦
피나요	It's bleeding	流血了
태국가는	going to Thailand	去泰国的
자금	funds	资金
산세베리아	snake plant	虎尾兰
물떨어짐	water dripping	滴水
시인	poet	诗人
쏘였을때	when stung	被蜇的时候
막힘	clogged	堵塞
아침밥	breakfast	早饭
투명색	clear	透明
고속철	high-speed rail	高铁
없애는	removing	去除
짜이옌	calm down	冷静点
귀세정제	ear cleaner	洗耳液
김치찌개	kimchi stew	泡菜汤
튀김반죽	frying batter	炸物面糊
영업허가증	business license	营业执照
마지막인사	final farewell	最后的道别
차웽해변	Chaweng Beach	查汶海滩
도수안경	prescription glasses	度数眼镜
돈세탁	money laundering	洗钱
시카다마켓	Cicada Market	蝉夜市
하이드로겔	hydrogel	水凝胶
나머지는	the rest	剩下的
믿어줘제발	Please believe me	求你相信我
마트상품권	supermarket gift card	超市购物卡
골프쳐	play golf	打高尔夫
손잡이	handle	把手
신나요	It's fun	好开心
초소형	ultra-compact	超小型
규칙	rule	规则
만약	if	如果
토오픈	open-toe	露趾
구취	bad breath	口臭
화상영어	online English lessons	在线英语课
안마셨어	I didn't drink	没喝
대사관	embassy	大使馆
불교	Buddhism	佛教
수동변속	manual transmission	手动挡
할인중	on sale	打折中
가변저항	variable resistor	可变电阻
보건소	public health center	卫生所
열두시반에	at 12:30	十二点半
과외	private tutoring	补习
락스뿌려	spray bleach	喷漂白水
진보라	dark purple	深紫色
공지봤어요	I saw the notice	我看到通知了
센트럴푸켓	Central Phuket	普吉中央购物中心
시츄	Shih Tzu	西施犬
혼다드림	Honda Dream	本田Dream
무쇠냄비	cast-iron pot	铸铁锅
국끓였어	I made soup	煮了汤
찍었어	I took it	拍了
비닐접착기	bag sealer	封口机
그만	enough	够了
캔선물세트	canned food gift set	罐头礼盒
낚시쿨백	fishing cooler	钓鱼保温箱
놀자	Let's hang out	一起玩吧
양복점	tailor shop	西装店
어린이날	Children's Day	儿童节
멀다	far	远
자양강장	tonic	滋补强身
세단	sedan	轿车
랜툴	LAN crimping tool	网线钳
세게조여	tighten it firmly	拧紧
일본산	made in Japan	日本产
전략	strategy	战略
헌팅캡	flat cap	报童帽
어려움	difficulty	困难
너희	you all	你们
방문	room door	房门
부채	hand fan	扇子
바가지	water scoop	水瓢
코인	coin	硬币
부츠	boots	靴子
볼트	bolt	螺栓
플래시	flashlight	手电筒
화장	makeup	化妆
충전	charging	充电
연기	smoke	烟
코스	travel itinerary	行程
차	tea	茶
일	day	天
눈	eye	眼睛
다리	leg	腿
지도	map	地图
기사	news article	新闻
관리실	skincare room	美容护理室
행사	promotion	促销
재료	material	材料
신나	paint thinner	稀释剂
사고	accident	事故
가면	mask	面具
하자	defect	瑕疵
편	slice	片
면	cotton	棉
수도	tap water	自来水
대금	daegeum (bamboo flute)	大笒
외상	on credit	赊账
진짜	genuine	正品
시즌	season	季节
머리	head	头
필터	filter	过滤器
향수	perfume	香水
장바구니	reusable shopping bag	购物袋
결석	kidney stone	结石
지방	fat	脂肪
전복	abalone	鲍鱼
자수	embroidery	刺绣
어머님선물같이고르자	Let's pick a gift for your mom together	我们一起给妈妈挑礼物吧
한장에얼마야	How much per sheet?	一张多少钱
나도오늘정신없었어	I was swamped today too	我今天也忙得晕头转向
오늘저녁뭐먹지	What should I eat tonight?	今晚吃什么呢
아직모든게낯설어	Everything still feels unfamiliar	一切都还很陌生
다음달에태국갈거야	I'm going to Thailand next month	我下个月要去泰国
노래번호찾아줘	Find the song number for me	帮我找一下歌号
친구들다갔어	My friends all left	朋友们都走了
나이가몇이야	How old are you?	你多大了
짐좀맡아줄래	Can you hold my bag for me?	能帮我看一下行李吗
메시지왔는데뭐라는거야	I got a message, what does it say?	来了条消息，说的是什么
지금모습보여줘	Show me how you look now	让我看看你现在的样子
편의점들르자	Let's stop by the convenience store	我们去一下便利店吧
오래오래함께하자	Let's be together for a long time	我们要一直在一起
면허시험붙었어	I passed my driving test	驾照考试通过了
한국어잘썼어	You wrote Korean well	韩语写得很好
녹음해서보내줘	Record it and send it to me	录下来发给我
아이가엄마그림그렸어	The kid drew a picture of mom	孩子画了妈妈
며칠계실거야	How many days will you stay?	您要待几天
얘기들어줄수있어	Can you listen to me?	能听我说说吗
잘해주고싶어	I want to treat you well	我想对你好
운명인것같아	It feels like fate	好像是命中注定
그법바뀌었어	That law changed	那条法律改了
만나서반가웠어	It was nice meeting you	很高兴认识你
나는고기없으면못살아	I can't live without meat	没有肉我活不下去
여유있게가자	Let's go without rushing	我们慢慢去吧
주소다시알려줘	Tell me the address again	再告诉我一下地址
유튜브로공부해	I study with YouTube	我用YouTube学习
한복입으면예쁠거야	You'll look pretty in a hanbok	穿韩服一定很漂亮
사정이안좋아	Money is tight right now	经济状况不太好
귀엽게생겼어	You have a cute face	长得很可爱
일끝나고데리러갈게	I'll pick you up after work	下班后我去接你
소리질러서미안해	Sorry for yelling	对不起，我吼你了
일주일에며칠일해	How many days a week do you work?	你一周工作几天
케이크사갈게	I'll bring a cake	我买蛋糕过去
선생님소개해줄수있어	Can you introduce me to a teacher?	能给我介绍个老师吗
집보러같이갈래	Want to go see the house together?	要一起去看房吗
언제든전화해	Call me anytime	随时给我打电话
점심도못먹었어	I didn't even get to eat lunch	午饭都没吃上
그냥소문일거야	It's probably just a rumor	应该只是谣言
스토리올렸어	I posted a story	我发了动态
담배냄새싫어해	I hate the smell of cigarettes	讨厌烟味
너랑있으면편해	I feel at ease with you	和你在一起很自在
몸무게많이늘었어	I've gained a lot of weight	体重涨了很多
생일선물뭐갖고싶어	What do you want for your birthday?	生日想要什么礼物
한국어할수있어	I can speak Korean	我会说韩语
너없었으면못했어	I couldn't have done it without you	没有你我做不到
병원놀이하자	Let's play doctor	来玩医生游戏吧
내가다준비할게	I'll prepare everything	我来准备一切
비오니까기분이우울해	The rain is making me feel down	下雨了心情很郁闷
`;
  let koEnZh = null;
  // 물음표 줄은 영어 값이 물음일 때만 쓴다(한국어할수있어=I can speak Korean 을 '할 수 있어?' 에 쓰면 틀린다).
  function koEnZhLookup(value, id) {
    if (!koEnZh) {
      koEnZh = new Map();
      for (const line of KO_EN_ZH_TSV.split('\n')) {
        const [k, en, zh] = line.split('\t');
        if (k && en && zh) koEnZh.set(k, { en, zh });
      }
    }
    const asks = /[?？]\s*$/.test(value);
    const row = koEnZh.get(squash(value.replace(/[\s.!?~,？！]+$/, '')));
    if (!row || (asks && !row.en.endsWith('?'))) return '';
    return id === 'en' ? row.en : row.zh;
  }

  let typeLang = GM_getValue(TYPE_LANG_KEY, '');
  // 이 페이지의 언어(30개 언어 중 내 언어가 아닌 것, 모르면 ''). 1.34.2 까지는 태국어 페이지만 알아봤다
  // (2026-11-21 사용자: 태국어에만 되던 것을 모든 언어에).
  let genericPageLang = '';
  const genericLang = () =>
    myTypeLangs().find((l) => l.id === (typeLang || (cfg.pageLangAuto ? genericPageLang : ''))) || null;

  // 글자 갈래(코드 범위 — 정규식보다 훨씬 가볍다; 30만 자를 몇 ms 에 센다). 제 글자로 언어를 아는 것(태국어·가나 …)과
  // 여러 언어가 같이 쓰는 것(로마자·키릴·아랍·데바나가리·한자).
  const PAGE_SCRIPT_RANGES = [
    ['ko', 0xac00, 0xd7a3], ['ko', 0x1100, 0x11ff], ['ko', 0x3130, 0x318f], ['th', 0x0e00, 0x0e7f], ['lo', 0x0e80, 0x0eff],
    ['ja', 0x3040, 0x30ff], ['he', 0x0590, 0x05ff], ['bn', 0x0980, 0x09ff], ['ta', 0x0b80, 0x0bff], ['te', 0x0c00, 0x0c7f],
    ['km', 0x1780, 0x17ff], ['my', 0x1000, 0x109f], ['lat', 0x41, 0x5a], ['lat', 0x61, 0x7a], ['lat', 0xc0, 0x24f],
    ['lat', 0x1e00, 0x1eff], ['cyr', 0x0400, 0x04ff], ['arab', 0x0600, 0x06ff], ['deva', 0x0900, 0x097f], ['han', 0x4e00, 0x9fff],
  ];
  const PAGE_OWN = ['ko', 'th', 'lo', 'ja', 'he', 'bn', 'ta', 'te', 'km', 'my'];
  const PAGE_SHARED = ['lat', 'cyr', 'arab', 'deva', 'han'];
  // 언어 → 그 글자 갈래(제 글자 언어는 자기 이름). 여기 없는 로마자 언어는 'lat'.
  const PAGE_LANG_SCRIPT = {
    ru: 'cyr', uk: 'cyr', mn: 'cyr', ar: 'arab', ur: 'arab', fa: 'arab', hi: 'deva', mr: 'deva', ne: 'deva',
    zh: 'han', 'zh-TW': 'han', yue: 'han',
  };
  const pageScriptOf = (id) => PAGE_LANG_SCRIPT[id] || (PAGE_OWN.includes(id) ? id : 'lat');
  // html lang → 목록의 언어 id. zh-Hant·zh-TW·zh-HK = 번체, 옛 코드(iw·in·fil)도.
  function pageLangId(raw) {
    const v = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
    if (!v) return '';
    if (/^zh-(hant|tw|hk|mo)/.test(v)) return 'zh-TW';
    if (v === 'yue' || v.startsWith('yue-')) return 'yue';
    const base = v.split('-')[0];
    return { iw: 'he', in: 'id', fil: 'tl', jw: 'jv' }[base] || base;
  }

  // 페이지 언어 알아보기. 글자 수만 센다(앞 30만 자까지). 그 언어 글자가 30자 이상이고 내 언어 글자보다 많아야
  // (여러 언어가 같이 쓰는 글자는 두 배) — 태국어가 조금 섞인 한국 여행 블로그에서 한국어 검색을 바꿔 버리지 않게.
  //  1) html lang 이 목록의 언어면 그것(글자 수로 맞는지 본다). 태국어는 예전처럼 lang=th 이면 바로.
  //  2) 없거나 안 맞으면 제 글자로 아는 언어(가장 많은 것), 한자만 있으면 간체·번체·광둥어, 키릴 = 러시아어,
  //     아랍 글자 = 아랍어, 데바나가리 = 힌디어. 로마자만 있고 lang 이 없으면 모른다('').
  function detectPageLang() {
    const langs = myTypeLangs();
    const usable = (id) => {
      if (!id || id.split('-')[0] === MY2) return '';
      const hit = langs.find((l) => l.id === id) || langs.find((l) => l.id === id.split('-')[0]);
      return hit ? hit.id : '';
    };
    const attr = usable(pageLangId(document.documentElement.lang));
    if (attr === 'th') return 'th';
    const text = (document.body?.textContent || '').slice(0, 300000);
    const counts = Object.create(null);
    let han = '';
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x41) continue;
      for (const [k, lo, hi] of PAGE_SCRIPT_RANGES) {
        if (c >= lo && c <= hi) {
          counts[k] = (counts[k] || 0) + 1;
          if (k === 'han' && han.length < 400) han += text[i];
          break;
        }
      }
    }
    // 내 언어 글자(로마자 언어면 셀 수 없다 — 견주지 않는다).
    const mineKey = MY_SCRIPT ? pageScriptOf(MY2) : '';
    const mine = mineKey ? counts[mineKey] || 0 : 0;
    const enough = (k) => k !== mineKey && (counts[k] || 0) >= GENERIC_MIN_THAI && counts[k] > mine * (PAGE_SHARED.includes(k) ? 2 : 1);
    if (attr && enough(pageScriptOf(attr))) return attr;
    let best = '';
    for (const k of PAGE_OWN) if (enough(k) && (!best || counts[k] > counts[best])) best = k;
    if (best) return usable(best === 'ko' ? 'ko' : best);
    if (enough('han')) return usable(chatHanLang(han));
    if (enough('cyr')) return usable('ru');
    if (enough('arab')) return usable('ar');
    if (enough('deva')) return usable('hi');
    return '';
  }


  function genericTarget(el) {
    if (!el || el.readOnly || el.disabled || el.closest('[id^="lzk-"]')) return null;
    if (!GENERIC && isSearchInput(el)) return null; // 쇼핑몰 검색창은 쇼핑몰 쪽이 태국어로 바꾼다
    if (isTypableText(el)) return el;
    // 구글처럼 검색칸이 textarea 인 사이트(name=q, role=combobox). 글쓰기 칸 textarea 는 건드리지 않는다.
    if (el.tagName === 'TEXTAREA' && (el.getAttribute('role') === 'combobox' || looksLikeSearchBox(el))) return el;
    return null;
  }

  // 문장(낱말 다섯 개 이상, 물음표·마침표로 끝남)은 용어집 조합 대신 문장째 번역한다.
  // 용어집은 쇼핑 검색어용이라 문장을 낱말로 쪼개 이으면 뜻이 흐트러진다.
  // 다만 낱말이 모두 용어집에 있으면('혹시 방콕 한인마트 아시는 분', '콘도 월세 얼마인가요')
  // 용어집으로 잇는다. 검색창에는 문장보다 핵심 낱말이 잘 걸리고, 태국 지명·기관 이름도
  // 용어집 쪽이 정확하다.
  async function koreanToThai(value) {
    const sentence = value.split(/\s+/).length >= 5 || /[?.!？]$|요$|니다$/.test(value);
    if (!sentence) return translateSearchKeyword(value);
    await ensureGlossary();
    const { pieces, unknown } = composeFromGlossary(value.replace(/[?.!？]+$/, ''));
    if (!unknown.length) {
      const thai = assembleThai(pieces);
      if (thai) return { thai, via: '용어집 조합' };
    }
    return { thai: await freeTranslateOne(value, 'ko', 'th'), via: '문장 번역' };
  }

  // 바꾼 뒤 그 사이트의 검색을 실행한다. 폼이 있으면 폼 제출(사이트의 submit 처리가 그대로 돈다),
  // 없으면 Enter 를 흉내 낸다(keyCode 를 보는 사이트가 많아 13 을 박아 둔다).
  // 검색 결과를 새 탭으로 열거나(Pantip — 팝업 차단에 걸린다) 검색칸이 폼 밖에 숨어 있는
  // (카오솟) 사이트는 확인해 둔 검색 주소로 바로 간다. 검색칸으로 보이는 칸에만 쓴다 —
  // 글쓰기 제목 칸에서 Enter 를 쳤는데 검색 페이지로 가 버리면 안 된다.
  const GENERIC_SEARCH_URLS = [
    [/(^|\.)pantip\.com$/, 'https://pantip.com/search?q='],
    [/(^|\.)khaosod\.co\.th$/, 'https://www.khaosod.co.th/search?s='],
  ];

  function looksLikeSearchBox(input) {
    const hint = [input.type, input.name, input.id, input.placeholder, input.getAttribute('aria-label')]
      .join(' ')
      .toLowerCase();
    return /search|ค้นหา|검색|(^|\s)q(\s|$)/.test(hint);
  }

  function submitGeneric(input) {
    const known = GENERIC_SEARCH_URLS.find(([re]) => re.test(location.hostname));
    const q = input.value.trim();
    if (known && q && looksLikeSearchBox(input)) {
      location.href = known[1] + encodeURIComponent(q);
      return;
    }
    if (input.form) {
      try {
        input.form.requestSubmit();
        return;
      } catch {
        /* requestSubmit 을 못 쓰는 폼 — 아래 Enter 로 */
      }
    }
    for (const type of ['keydown', 'keypress', 'keyup']) {
      const ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      for (const k of ['keyCode', 'which']) Object.defineProperty(ev, k, { get: () => 13 });
      input.dispatchEvent(ev);
    }
  }

  // 언어별 용어집(config.json 의 languages[].glossary) — th-korean-glossary 저장소의 '한국어=그 언어' 파일(태국어
  // glossary.txt 와 같은 꼴). 처음 쓸 때 받아 이 브라우저에 사본으로 두고 1시간마다 새로 받는다. 언어를 더할 때 용어집도
  // 파일 하나와 config.json 한 줄이면 된다(코드는 그대로).
  const LANG_GLOSSARY_TTL = 60 * 60 * 1000;
  const langGlossaryMaps = new Map(); // 파일 → Map(squash(한국어) → 그 언어)

  // 메신저는 줄 여러 개를 한꺼번에 찾는다 — 같은 파일을 동시에 여러 번 받지 않게 받는 중인 것을 나눠 쓴다.
  const langGlossaryLoading = new Map();
  function langGlossaryMap(file) {
    if (!langGlossaryLoading.has(file)) {
      langGlossaryLoading.set(file, loadLangGlossary(file).finally(() => langGlossaryLoading.delete(file)));
    }
    return langGlossaryLoading.get(file);
  }

  async function loadLangGlossary(file) {
    const key = `langGlossary:${file}`;
    let store = await gmLazyGet(key, null); // 확장은 탭마다 미리 읽지 않는다(glossaryStoreLoad 위 설명)
    if (!store || Date.now() - store.at > LANG_GLOSSARY_TTL) {
      try {
        const text = await request({
          method: 'GET',
          url: `https://raw.githubusercontent.com/${GLOSSARY_REPO}/main/${file}`,
          timeout: 8000,
        });
        store = { text: String(text || ''), at: Date.now() };
        GM_setValue(key, store);
        langGlossaryMaps.delete(file);
      } catch {
        if (!store) return null; // 처음인데 못 받았다 — 이번엔 구글 번역만
      }
    }
    if (!langGlossaryMaps.has(file)) {
      const m = new Map();
      for (const [k, v] of Object.entries(parseGlossary(store.text).map)) m.set(squash(k), v);
      langGlossaryMaps.set(file, m);
    }
    return langGlossaryMaps.get(file);
  }

  // 입력 전체가 용어집 키와 맞을 때만(KO_EN_ZH_TSV 와 같은 규칙: 끝 문장부호는 떼고, 물음이면 값도 물음이어야).
  // 아랍어·우르두어 물음표는 '؟' 라서 함께 본다(없으면 '얼마예요?' 가 아랍어 용어집을 못 썼다).
  async function langGlossaryLookup(value, lang) {
    if (!lang.glossary) return '';
    const m = await langGlossaryMap(lang.glossary);
    const v = m && m.get(squash(value.replace(/[\s.!?~,？！]+$/, '')));
    if (!v || (/[?？]\s*$/.test(value) && !/[?？؟]\s*$/.test(v))) return '';
    return v;
  }

  // 태국어 사전 파일(config.json 태국어 줄의 glossary — 값을 지우면 심사 없이 꺼진다). 사전의 첫 대역어라 딱딱한 말이 섞여
  // 있어, 사람이 고른 glossary.txt 로 못 옮긴 말에만 쓴다. 첫 내려받기가 늦으면 기다리지 않고 구글로(받기는 뒤에서 끝난다).
  function thaiDictLookup(value) {
    const lang = TYPE_LANGS.find((l) => l.id === 'th');
    if (!lang || !lang.glossary) return '';
    return Promise.race([
      langGlossaryLookup(value, lang).catch(() => ''),
      new Promise((resolve) => setTimeout(() => resolve(''), 1500)),
    ]);
  }

  // 언어 교차(한국어기초사전): 그 언어 낱말 → 한국어(거꾸로 표 reverse-xx.txt) → 다른 언어(glossary-yy.txt). 표에는 사전 전체에서
  // 한국어 한 표기로만 이어지는 낱말만 있어(fire 처럼 뜻이 여럿인 말은 없다) 없으면 지금처럼 구글로 간다. 입력·메시지 전체가 맞을
  // 때만 쓰고, 페이지 글·자막·화면 번역에는 쓰지 않는다 — 메뉴 낱말과 상표는 앞뒤 없이 옮기면 드문 말이 나온다.
  const CROSS_MAX_LEN = 40;
  async function crossLookupNow(text, from, to) {
    const src = TYPE_LANGS.find((l) => l.id === from);
    if (!src || !src.reverse || from === to || /[?？؟]\s*$/.test(text)) return '';
    if (to === 'ko' && src.toKo === false) return '';
    const word = text.replace(/[\s.!~,。！…]+$/, '').replace(/^[¡¿\s]+/, '');
    if (!word || [...word].length > CROSS_MAX_LEN) return '';
    const key = squash(normKey(word)).replace(/[ً-ْٰ]/g, ''); // 아랍어 모음 부호는 보지 않는다
    const back = await langGlossaryMap(src.reverse);
    let ko = back && back.get(key);
    // 한국어 쪽 뜻이 여럿인 말은 한국어까지만 — 다른 언어로 건너가면 다른 뜻이 나온다(consciousness → 의식 → พิธี 예식).
    if (!ko && to === 'ko' && src.reverseKo) {
      const koOnly = await langGlossaryMap(src.reverseKo);
      ko = koOnly && koOnly.get(key);
    }
    if (!ko || to === 'ko') return ko || '';
    if (to === 'th') {
      await ensureGlossary();
      const reviewed = buildGlossary()[ko]; // 태국어는 사람이 고른 말 먼저
      if (reviewed) return reviewed;
    }
    const dst = TYPE_LANGS.find((l) => l.id === to);
    if (!dst || !dst.glossary) return '';
    const there = await langGlossaryMap(dst.glossary);
    return (there && there.get(squash(ko))) || '';
  }

  // 언어 코드는 zh-CN 처럼 와도 된다. 표를 처음 받느라 늦으면 기다리지 않고 구글로(받기는 뒤에서 끝난다).
  function crossLookup(text, from, to) {
    const base = (c) => String(c || '').split('-')[0].toLowerCase();
    return Promise.race([
      crossLookupNow(String(text || '').trim(), base(from), base(to)).catch(() => ''),
      new Promise((resolve) => setTimeout(() => resolve(''), 1500)),
    ]);
  }

  // 고른 언어로. 태국어는 용어집(+문장 번역), 다른 언어는 그 언어의 용어집(있으면) → 영어·중국어 샘플 용어집 →
  // 무료 번역.
  async function koreanToLang(value, lang) {
    // 내 언어가 한국어가 아니면 용어집(한국어=…)은 맞지 않는다 — 구글 번역(원문 언어는 구글이 알아본다: 영어 사용자가
    // 한국어를 섞어 써도 맞게. 내 언어로 못 박았더니 일본어 사용자의 '내일 봐요' 가 엉뚱한 태국어가 됐다 — 2026-11-05 시험).
    if (!MY_KO) {
      const crossed = await crossLookup(value, MY2, lang.id);
      if (crossed) return { thai: crossed, via: '사전' };
      return { thai: await freeTranslateOne(value, 'auto', lang.mt || lang.id), via: freeLabel('번역') };
    }
    if (lang.id === 'th') {
      await ensureGlossary();
      return koreanToThai(value);
    }
    const own = await langGlossaryLookup(value, lang).catch(() => '');
    if (own) return { thai: own, via: '용어집' };
    const hit = (lang.id === 'en' || lang.id === 'zh') && koEnZhLookup(value, lang.id);
    if (hit) return { thai: hit, via: '용어집' };
    return { thai: await freeTranslateOne(value, 'ko', lang.mt), via: freeLabel('번역') };
  }

  async function convertInputToThai(input) {
    const value = input.value.trim();
    const lang = genericLang();
    if (genericBusy || !lang || !value || !isMine(value, lang.id)) return;
    genericBusy = true;
    setBadge(`${MY_KO ? '한국어를 ' : ''}${langName(lang)}로 바꾸는 중…`);
    try {
      const { thai, via, note } = await koreanToLang(value, lang);
      if (!thai || untranslated(thai, value)) throw new Error('번역 결과가 비어 있습니다');
      setInputValue(input, thai);
      input.focus();
      try {
        input.setSelectionRange(thai.length, thai.length);
      } catch {
        /* 선택 범위를 못 쓰는 칸 */
      }
      const msg = `"${value}" → "${thai}"  (${via})` + (note ? `\n${note}` : '');
      // 설정 '검색 전 번역된 태국어 확인 (Enter 한 번 더)' 를 라자다·쇼피와 똑같이 따른다.
      cfg.confirmSearch = GM_getValue('confirmSearch', cfg.confirmSearch);
      if (cfg.confirmSearch) {
        toast(`${msg}\n확인 후 Enter 를 다시 누르면 이 사이트에서 검색합니다. 직접 고쳐도 됩니다.`, note ? 9000 : 6000);
      } else {
        toast(msg, note ? 8000 : 2500);
        submitGeneric(input);
      }
    } catch (e) {
      toast(`${MY_KO ? '한국어를 ' : ''}${langName(lang)}로 바꾸지 못했습니다: ${e.message || e}`, 4000);
    } finally {
      genericBusy = false;
      setBadge(null);
      updateGenericChip();
    }
  }

  // 한국어가 든 입력칸 오른쪽에 '→ ไทย'. 누르면 Enter 와 같다(자동완성 목록이 Enter 를
  // 먼저 가져가는 사이트용).
  function updateGenericChip() {
    const input = genericTarget(document.activeElement);
    const lang = genericLang();
    if (!lang || !input || !isMine(input.value, lang.id)) {
      if (genericChip) genericChip.style.display = 'none';
      return;
    }
    if (!genericChip) {
      genericChip = document.createElement('button');
      genericChip.id = 'lzk-thchip';
      genericChip.type = 'button';
      markNoTranslate(genericChip);
      genericChip.addEventListener('mousedown', (e) => e.preventDefault()); // 입력칸 포커스 유지
      genericChip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const i = genericTarget(document.activeElement);
        if (i) convertInputToThai(i);
      });
      document.body.appendChild(genericChip);
    }
    genericChip.textContent = lang.chip;
    genericChip.title = `입력한 한국어를 ${lang.name}로 바꿉니다 (Enter 와 같음)`;
    const r = input.getBoundingClientRect();
    const w = 58;
    const outside = r.right + 6 + w < innerWidth;
    genericChip.style.left = `${outside ? r.right + 6 : r.right - w - 4}px`;
    genericChip.style.top = `${Math.max(2, r.top + (r.height - 24) / 2)}px`;
    genericChip.style.display = '';
  }

  function installGenericSearch() {
    document.addEventListener('input', updateGenericChip, true);
    document.addEventListener('focusin', updateGenericChip, true);
    document.addEventListener('focusout', () => setTimeout(updateGenericChip, 150), true);
    window.addEventListener('scroll', () => genericChip?.style.display === '' && updateGenericChip(), {
      passive: true,
      capture: true,
    });
    // 사이트의 어떤 리스너보다 먼저(window 캡처) 잡는다. 한글 조합 중의 Enter(글자 확정)는 그냥 둔다.
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !genericLang()) return;
        const input = genericTarget(e.target);
        if (!input || !isMine(input.value, genericLang().id)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        convertInputToThai(input);
      },
      true
    );
    window.addEventListener(
      'submit',
      (e) => {
        if (!genericLang()) return;
        const input = [...(e.target?.elements || [])].find((el) => genericTarget(el) && isMine(el.value, genericLang().id));
        if (!input) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        convertInputToThai(input);
      },
      true
    );
  }

  // 입력 언어 막대. '한' 버튼 왼쪽에 '번역' 단추 하나만 두고, 누르면 태·미·중·일·러·이·폴이 펼쳐진다
  // (2026-10-24 사용자: 일곱 개를 늘 띄우지 말고 '번역' 하나로 합쳐 달라). 고르면 접히고, 고른 언어는
  // '번역·태' 처럼 단추에 남아 켜져 있는 줄 안다. '한' 버튼이 없으면 오른쪽 끝.
  function mountLangBar() {
    if (document.getElementById('lzk-langbar')) return refreshLangBar();
    const bar = document.createElement('div');
    bar.id = 'lzk-langbar';
    markNoTranslate(bar);
    const langs = document.createElement('div');
    langs.className = 'lzk-langs';
    for (const l of myTypeLangs()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = langLabel(l);
      b.dataset.lang = l.id;
      b.title = `${MY_KO ? '한국어로' : '내 언어로'} 쓰고 Enter → ${langName(l)}로 바꿉니다 (한 번 누르면 계속 켜짐, 다시 누르면 꺼짐)`;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // 입력칸 포커스 유지
      b.addEventListener('click', () => {
        bar.removeAttribute('data-open');
        // 메신저 대화방에서는 그 대화방의 보낼 언어만 바꾼다(다른 사이트 입력칸 선택은 그대로).
        if (MESSENGER && chatThreadId()) return chatPickLang(l.id);
        setTypeLang(typeLang === l.id ? '' : l.id);
      });
      langs.appendChild(b);
    }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lzk-lang-toggle';
    toggle.title = `입력 언어 고르기 — 고르면 어느 사이트든 입력칸에 ${MY_KO ? '한국어로' : '내 언어로'} 쓰고 Enter 를 누르면 그 언어로 바꿉니다. 끌어서 옮길 수 있습니다`;
    toggle.addEventListener('mousedown', (e) => e.preventDefault());
    toggle.addEventListener('click', () => bar.toggleAttribute('data-open'));
    fabDraggable(toggle, true);
    bar.append(langs, toggle);
    // 막대 밖을 누르면 접는다.
    document.addEventListener('mousedown', (e) => {
      if (bar.hasAttribute('data-open') && !bar.contains(e.target)) bar.removeAttribute('data-open');
    }, true);
    document.body.appendChild(bar);
    refreshLangBar();
  }

  function refreshLangBar() {
    const bar = document.getElementById('lzk-langbar');
    if (!bar) return;
    const fab = document.getElementById('lzk-fab');
    bar.toggleAttribute('data-solo', !fab);
    bar.toggleAttribute('data-high', !!fab && fab.hasAttribute('data-high'));
    // 메신저 대화방에서는 그 대화방이 보낼 언어(상대 언어 또는 직접 고른 것)를 켜진 것으로 보인다.
    const on = MESSENGER && chatThreadId() ? chatTarget() : myTypeLangs().find((l) => l.id === typeLang);
    for (const b of bar.querySelectorAll('[data-lang]')) b.toggleAttribute('data-on', !!on && b.dataset.lang === on.id);
    const toggle = bar.querySelector('.lzk-lang-toggle');
    // 다른 언어면 '번역' 이 그 나라 말(翻訳·terjemahan)로 바뀌어 같은 단추인 줄 모르기 쉽다 — 🌐 를 붙여 늘 같은 모양으로.
    const word = MY_KO ? '번역' : '🌐 번역';
    toggle.textContent = on ? `${word}·${langLabel(on)}` : word;
    toggle.toggleAttribute('data-on', !!on);
    placeLzk(); // 단추 글이 길어지면 언어 줄 너비가 바뀐다
  }

  function setTypeLang(id) {
    typeLang = id;
    GM_setValue(TYPE_LANG_KEY, id);
    refreshLangBar();
    const l = genericLang();
    toast(
      id
        ? `${langName(l)} 입력 켬: 어느 사이트든 입력칸에 ${MY_KO ? '한국어로' : '내 언어로'} 쓰고 Enter 를 누르면 ${langName(l)}로 바꿉니다.\n끄려면 '번역·${langLabel(l)}' 을 눌러 같은 글자를 다시 누르세요.`
        : cfg.pageLangAuto && genericPageLang && genericLang()
          ? `입력 언어 선택을 껐습니다. 이 ${langName(genericLang())} 페이지에서는 ${langName(genericLang())}로 바꿉니다.`
          : MY_KO ? '입력 언어 선택을 껐습니다. 한국어가 그대로 입력됩니다.' : '입력 언어 선택을 껐습니다. 쓴 말이 그대로 입력됩니다.',
      4000
    );
    updateGenericChip();
  }

  // 모든 일반 사이트: 태·미·중 막대와 입력칸 가로채기만 단다(고른 언어가 없으면 Enter 를 건드리지 않는다).
  // 네트워크·용어집은 실제로 바꿀 때까지 쓰지 않는다. 다른 탭에서 바꾼 선택은 이 탭으로 돌아올 때 맞춘다.
  function genericBase() {
    GM_addStyle(LZK_CSS);
    // '한' 버튼은 모든 사이트에 단다 — 예전에는 태국어 페이지에만 달아서 네이버·구글 같은 데서는 설정 창
    // (번역 도우미 설치·켜기 등)을 열 길이 없었다(2026-10-24 사용자 요청). Tampermonkey 메뉴에도 둔다.
    mountFab();
    mountLangTools();
    GM_registerMenuCommand('설정 열기', togglePanel);
  }

  // '한' 옆 언어 막대('번역')와 입력칸 가로채기 — 모든 사이트(일반·라자다·쇼피·메신저). 사용자(2026-11-05): 어떤 언어로
  // 바꿔도 '한' 옆 언어 메뉴는 늘 있어야 한다. 쇼핑몰 검색창은 쇼핑몰 쪽(태국어로 검색)이 맡고(genericTarget 에서 뺀다),
  // 메신저 입력칸(글 상자)은 입력칸이 아니라 여기서 잡지 않는다. 다른 탭에서 바꾼 선택은 이 탭으로 돌아올 때 맞춘다.
  let langToolsOn = false;
  function mountLangTools() {
    mountLangBar();
    if (langToolsOn) return;
    langToolsOn = true;
    installGenericSearch();
    window.addEventListener('focus', () => {
      const v = GM_getValue(TYPE_LANG_KEY, '');
      if (v !== typeLang) {
        typeLang = v;
        refreshLangBar();
      }
    });
  }

  let genericOn = false;
  function activateGeneric(lang) {
    if (genericOn) return;
    genericOn = true;
    genericPageLang = lang;
    mountFab();
    if (lang === 'th') {
      ensureGlossary(); // 태국어 용어집(glossary.txt) 메뉴는 태국어 페이지에서만
      registerMenus();
    }
    updateGenericChip();
  }

  // 글이 늦게 그려지는 페이지(SPA)도 있어 15초 동안 몇 번 더 본다.
  function genericInit() {
    genericBase();
    const first = detectPageLang();
    if (first) return activateGeneric(first);
    let n = 0;
    const t = setInterval(() => {
      const lang = detectPageLang();
      if (lang) {
        clearInterval(t);
        activateGeneric(lang);
      } else if (++n >= 6) clearInterval(t);
    }, 2500);
  }

  // ---------------------------------------------------------------------------
  // 영상 더빙 — 유튜브와 웹 페이지의 영상을 한국어 자막 + 한국어 목소리(TTS)로.
  //
  // 대본(자막)을 미리 통째로 받아 문장으로 묶고 옮겨 둔 뒤, 영상 시간에 맞춰 한 문장씩 읽는다.
  //  - 유튜브: 영상의 자막 목록에서 고른다. 사람이 만든 한국어 자막이 있으면 그대로(번역 없음), 아니면 말한
  //    언어의 자막(사람이 만든 것 > 자동 생성). 자막 주소에는 유튜브 보안 표(pot)가 붙어야 받히는데 그 표는
  //    영상마다 다르다(다른 영상 주소에 붙이면 거절, 2026-11-01 확인). 그래서 그 영상의 자막(CC)을 잠깐 켜서
  //    플레이어가 부른 주소를 PerformanceObserver 로 잡는다 — 유튜브는 요청 기록을 수시로 비워서
  //    performance.getEntries 로는 못 찾았다. 같은 영상이면 lang·kind·tlang 만 바꿔 다른 자막도 받힌다.
  //  - 다른 사이트: <video> 의 자막 트랙(textTracks — WebVTT·HLS 자막)을 읽는다. 자막이 없는 영상은 소리를
  //    알아들어야 해서(음성 인식) 아직 못 한다.
  // 번역은 메신저 받는 쪽과 같은 길: 태국어는 손질 → 대화 표(TH_CHAT_KO) → 용어집 거꾸로 → 구글 → 뒷손질,
  // 다른 언어는 구글. 구글이 막히면(429) 유튜브가 옮긴 한국어 자막(tlang=ko)을 시간으로 맞춰 쓴다.
  // 목소리는 브라우저에 든 한국어 음성(speechSynthesis — 엣지는 SunHi·InJoon 자연 음성, 크롬은 Google 한국의,
  // 윈도우는 Heami). 문장 사이 시간에 맞춰 빠르기를 1~2배로 올린다. 영상 소리와 번역 소리는 따로 조절한다.
  // ---------------------------------------------------------------------------

  const YOUTUBE = /(^|\.)youtube\.com$/.test(location.hostname);
  const DUB_KEY = 'videoDub'; // { videoVol, dubVol, subs, voice }
  // 한국어 자막이 기본이고 목소리(더빙)는 고를 때만(사용자 요청 2026-11-01). autoSubs: 외국어 영상이면
  // 사람이 만든 한국어 자막이 없을 때 우리 한국어 자막을 저절로 켠다.
  // maxSpeed: 목소리를 보통의 몇 배까지 빠르게 할지(알아들을 수 있는 한도, 창에서 1~2.5배).
  // subScale: 자막 글씨 크기(창에서 50~150%).
  const DUB_DEFAULTS = {
    videoVol: 0.25,
    dubVol: 1,
    subs: true,
    voice: '',
    voiceOn: false,
    autoSubs: true,
    maxSpeed: 1.6,
    subScale: 1,
    // 유튜브 밖(페이스북 등): 켜 두면 재생하는 영상마다 한국어 자막 — 자막 파일이 있으면 그것을, 없으면 크롬
    // 실시간 자막(번역 도우미)을. 사용자(2026-11-01): 릴스를 넘길 때마다 꺼져서 다시 켜야 했다.
    pageSubs: true,
  };
  const DUB_GAP_MS = 700; // 이만큼 쉬면 문장을 끊는다
  const DUB_MAX_MS = 7000; // 자동 자막은 마침표가 없어 길이로도 끊는다
  const DUB_MAX_CHARS = 90;
  const DUB_BATCH = 40; // 한 번에 옮기는 문장 수 — 지금 보는 곳부터
  const DUB_KO_PER_SEC = 5.8; // 한국어 음성이 1배 빠르기로 1초에 읽는 글자 수(대략)
  const DUB_MALE = /InJoon|Hyunsu|Bong|Gook|남성/i;
  let dubCfg = { ...DUB_DEFAULTS, ...GM_getValue(DUB_KEY, {}) };
  let dub = null; // 더빙 중인 영상 { video, sentences, cur, lang, ... }
  let dubWanted = false; // 유튜브에서 손으로 켜 두면 다음 영상도 이어서
  let dubAutoTried = ''; // 저절로 켜 본 유튜브 영상 id
  let dubPanel = null;
  let dubSubEl = null;
  let dubChip = null;
  let dubReverse = null; // 용어집 거꾸로: 태국어(띄어쓰기 없앤 꼴) → 한국어
  let dubVolumeTouchedAt = 0; // 사람이 사이트의 소리 막대·키를 만진 때
  const ytTimedtext = new Map(); // 유튜브 영상 id → 플레이어가 부른 자막 주소들(보안 표 포함, 새것이 끝)

  const saveDubCfg = () => GM_setValue(DUB_KEY, dubCfg);

  function dubVoices() {
    try {
      // 자막은 내 언어로 나오니 목소리도 내 언어(한국어 사용자면 한국어 — 예전 그대로)
      return speechSynthesis.getVoices().filter((v) => YT_MY_RE.test(v.lang || ''));
    } catch {
      return [];
    }
  }

  // 고른 목소리가 없으면 자연 음성 > 구글 > 윈도우 순. 태국어 말끝(ครับ)으로 남자라고 보이면 남자 목소리가
  // 있을 때(엣지 InJoon) 그것으로.
  function dubVoice(gender) {
    const all = dubVoices();
    const chosen = dubCfg.voice && all.find((v) => v.name === dubCfg.voice);
    if (chosen) return chosen;
    const score = (v) => (/Natural|Neural|Online/i.test(v.name) ? 4 : /Google/i.test(v.name) ? 2 : 0);
    const male = all.filter((v) => DUB_MALE.test(v.name));
    const female = all.filter((v) => !DUB_MALE.test(v.name));
    const pool = gender === 'm' && male.length ? male : female.length ? female : all;
    return pool.sort((a, b) => score(b) - score(a))[0] || null;
  }

  function dubEndsSentence(src, lang) {
    return lang === 'th' ? TH_END_PARTICLES.test(src) : /[.!?。！？…]["'”’)\]]*$/.test(src);
  }

  // 태국어 자동 자막은 한 줄에 문장 여럿이 붙어 오기도 한다(…ร้านกาแฟนะคะเป็นบ้านหมาครบวงจรนะคะใครยัง…).
  // 말끝(ค่ะ·ครับ…) 뒤에서 나누고 시간은 글자 수로 나눈다. คะแนน(점수) 같은 낱말 속 คะ 는 두고.
  const TH_SPLIT = /(?<=ค่ะ|คะ(?!แนน|เน|น้า)|ครับ|คับ|จ้า)(?=[฀-๿])/;
  function dubSplitThai(cues) {
    const out = [];
    for (const c of cues) {
      const parts = String(c.text || '').split(TH_SPLIT).filter(Boolean);
      if (parts.length < 2) {
        out.push(c);
        continue;
      }
      const total = parts.reduce((n, p) => n + p.length, 0);
      let t = c.start;
      for (const p of parts) {
        const dur = ((c.end - c.start) * p.length) / total;
        out.push({ start: Math.round(t), end: Math.round(t + dur), text: p });
        t += dur;
      }
    }
    return out;
  }

  // 자막 조각(cue)들을 읽을 문장으로 묶는다. [음악]·[เพลง] 같은 표시는 버리고, >> (말하는 사람 바뀜)·쉼·말끝·
  // 길이에서 끊는다. 태국어는 줄이 낱말 가운데서 갈리기도 해서 띄어쓰기 없이 잇는다.
  function dubSentences(cues, lang) {
    if (lang === 'th') cues = dubSplitThai(cues);
    const out = [];
    let cur = null;
    let gender = '';
    const flush = () => {
      if (cur) out.push(cur);
      cur = null;
    };
    for (const c of cues) {
      let text = String(c.text || '')
        .replace(/\[[^\]]*\]|♪+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const turn = /^(?:>>|-\s)/.test(text);
      text = text.replace(/^(?:>>\s*|-\s+)/, '').replace(/\s*>>\s*/g, ' ').trim();
      if (!text) {
        flush(); // 음악·효과음 사이
        continue;
      }
      if (turn) {
        flush();
        gender = '';
      }
      if (
        cur &&
        (c.start - cur.end > DUB_GAP_MS ||
          c.start - cur.start > DUB_MAX_MS ||
          cur.src.length + text.length > DUB_MAX_CHARS ||
          dubEndsSentence(cur.src, lang))
      ) {
        flush();
      }
      if (!cur) cur = { start: c.start, end: c.end, src: text, gender: '' };
      else {
        const glue = lang === 'th' && THAI.test(cur.src.slice(-1)) && THAI.test(text[0]) ? '' : ' ';
        cur.src += glue + text;
        cur.end = Math.max(cur.end, c.end);
      }
      if (lang === 'th') gender = thaiSpeakerGender(cur.src) || gender;
      cur.gender = gender;
    }
    flush();
    out.forEach((s, i) => {
      s.next = i + 1 < out.length ? out[i + 1].start : s.end + 1500;
      s.ko = null;
    });
    return out;
  }

  // 용어집(한국어=태국어)을 거꾸로 — 문장 전체가 어느 값과 같을 때만(먼저 적힌 한국어).
  function dubFromGlossary(th) {
    if (!dubReverse && glossaryStore) {
      dubReverse = new Map();
      for (const [ko, v] of Object.entries(remoteGlossary())) {
        const k = String(v).replace(/\s+/g, '');
        if (HANGUL.test(ko) && THAI.test(k) && !dubReverse.has(k)) dubReverse.set(k, ko);
      }
    }
    const key = th.replace(TH_END_PARTICLES, '').replace(/\s+/g, '');
    return (dubReverse && key && dubReverse.get(key)) || '';
  }

  async function dubTranslateBatch(d, batch) {
    await glossaryStoreLoad(); // 태국어 자막은 용어집을 거꾸로도 본다(dubFromGlossary)
    const ask = [];
    for (const s of batch) {
      s.tried = true;
      // 태국어 밖의 자막: 속어·욕·상표를 구글이 아는 말로(SUB_PREP — 태국어는 아래 chatPrepThai 가 맡는다).
      if (d.lang !== 'th') {
        const p = subPrep(s.src, d.from || d.lang);
        if (p !== s.src) s.prep = p;
      }
      // 이미 내 언어인 자막은 옮기지 않는다(히브리어 iw·필리핀어 fil 처럼 유튜브 코드가 다른 언어도 — YT_MY_RE).
      if (d.lang && YT_MY_RE.test(d.lang)) {
        s.ko = s.src;
        continue;
      }
      if (MY_KO && d.lang === 'th') {
        // 영상은 나에게 하는 말이 아니라서 호칭(พี่→오빠)은 바꾸지 않는다(mine = true).
        s.prep = chatPrepThai(s.src, true, '');
        const hit = chatThaiWhole(s.prep) || dubFromGlossary(s.prep);
        if (hit) {
          s.ko = hit;
          continue;
        }
      }
      ask.push(s);
    }
    if (!ask.length) return;
    let got = [];
    try {
      got = await translateToKorean(ask.map((s) => s.prep || s.src), d.from || 'auto');
    } catch (e) {
      console.warn(`[${APP_NAME}] 더빙 번역 실패:`, e.message);
    }
    ask.forEach((s, i) => {
      let ko = got[i];
      if (ko && d.lang === 'th' && MY2 !== 'th') ko = THAI.test(ko) ? null : MY_KO ? chatFixKorean(ko, s.prep) : ko;
      s.ko = ko || null;
    });
  }

  // 지금 보는 곳부터 차례로 옮긴다(앞부분이 먼저 준비돼야 바로 들린다). 못 옮긴 것은 유튜브 한국어 자막으로.
  async function dubTranslate(d) {
    if (d.translating) return;
    d.translating = true;
    try {
      while (d === dub) {
        const now = d.video.currentTime * 1000;
        const todo = d.sentences.filter((s) => s.ko == null && !s.tried);
        if (!todo.length) break;
        todo.sort((a, b) => (a.next < now) - (b.next < now) || a.start - b.start);
        await dubTranslateBatch(d, todo.slice(0, DUB_BATCH));
        dubStatus();
      }
      if (d === dub && d.koFallback && d.sentences.some((s) => !s.ko)) await dubUseFallback(d);
    } finally {
      d.translating = false;
      dubStatus();
    }
  }

  async function dubUseFallback(d) {
    let ko;
    try {
      ko = await d.koFallback();
    } catch {
      return;
    }
    for (const s of d.sentences) {
      if (s.ko) continue;
      const text = ko
        .filter((c) => c.start < s.end && c.end > s.start)
        .map((c) => c.text)
        .join(' ')
        .replace(/\[[^\]]*\]|>>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      s.ko = text || null;
    }
  }

  // 새 자막 조각으로 문장을 다시 묶는다(HLS 자막처럼 보면서 늘어나는 것도). 이미 옮긴 문장은 그대로 둔다.
  function dubSetCues(d, cues) {
    if (!d.lang) {
      const all = cues.map((c) => c.text).join(' ');
      d.lang = THAI.test(all) ? 'th' : HANGUL.test(all) && !/[A-Za-z]{3}/.test(all) ? 'ko'
        : !MY_KO && MY_SCRIPT && MY_SCRIPT.test(all) ? MY2 : '';
    }
    const old = new Map(d.sentences.map((s) => [`${s.start}|${s.src}`, s]));
    d.sentences = (d.tt ? ttSentences(cues) : dubSentences(cues, d.lang)).map((s) => {
      const o = old.get(`${s.start}|${s.src}`);
      return o ? Object.assign(s, { ko: o.ko, tried: o.tried, prep: o.prep }) : s;
    });
    d.cueCount = cues.length;
    d.cur = -1;
    dubStatus();
    dubTranslate(d);
  }

  function dubFind(list, t) {
    let lo = 0;
    let hi = list.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].start <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  // 목소리마다 실제 읽는 빠르기. 빠르기 값(rate)과 실제 속도가 비례하지 않는다 — 크롬 Google 한국의(2026-11-01
  // 측정, 43글자): 1배 5.9자/초, 1.5배 11.7자/초, 2배 22.5자/초, 2.5배부터는 아예 읽지 않았다. 그래서
  // 속도 = base × rate^pow 로 보고, 읽을 때마다 걸린 시간으로 base 를 고쳐 간다(목소리 이름별로 저장).
  function dubVoiceProfile(voice) {
    const name = (voice && voice.name) || '';
    const google = /Google/i.test(name) && !(voice && voice.localService);
    const saved = (dubCfg.tts || {})[name];
    return {
      name,
      base: saved > 2 && saved < 15 ? saved : DUB_KO_PER_SEC,
      pow: google ? 1.8 : 1,
      maxRate: google ? 2 : 2.5,
    };
  }

  let dubSaying = null; // 읽는 중인 것 { started, expect(ms), canceled, done }

  // 지금 문장을 읽을지 정한다(dubTick 이 0.15초마다 부른다). 앞 문장을 중간에 끊지 않는다 — 2.5배까지 빨리
  // 읽었더니 말이 긴 영상(4m-qSU7Sdjg)에서 알아들을 수 없었다(사용자). 앞 문장이 1.5초 넘게 남았으면 기다렸다
  // 읽고, 문장 시간의 절반이 지나도록 못 읽었으면 그 문장은 목소리를 건너뛴다(자막에는 나온다).
  function dubMaybeSpeak(d, s, t) {
    if (s.said) return;
    const late = t - s.start;
    if (late > Math.max(1500, (s.next - s.start) * 0.5)) {
      s.said = true; // 너무 늦었다
      d.skipped = (d.skipped || 0) + 1;
      dubStatus();
      return;
    }
    let wait = 0;
    if (dubSaying && !dubSaying.done && speechSynthesis.speaking) {
      const left = dubSaying.expect - (performance.now() - dubSaying.started);
      if (left > 1500) return; // 앞 문장을 마저 읽는다
      wait = Math.max(0, left) / 1000;
    }
    s.said = true;
    d.spoken = (d.spoken || 0) + 1;
    dubSpeak(d, s, t, wait);
    dubStatus();
  }

  function dubSpeak(d, s, t, wait) {
    try {
      if (!dubCfg.voiceOn || !(dubCfg.dubVol > 0)) {
        dubHush();
        return;
      }
      if (!wait) dubHush(); // 남은 것 없이 새로 — 쌓인 줄을 비운다
      const voice = dubVoice(s.gender);
      const prof = dubVoiceProfile(voice);
      const chars = (s.ko.match(/[가-힣0-9A-Za-z]/g) || []).length;
      // 다음 문장이 시작하기 전에 끝나도록, 앞 문장이 남은 만큼 더 빨리. 영상을 빨리 돌리면 그만큼 남는 시간이 준다.
      // 그래도 알아들을 수 있게 창의 '최대 빠르기'(기본 1.6배)까지만 — 넘치면 다음 문장을 건너뛴다.
      const room = Math.max(0.6, (s.next - t) / 1000 / (d.video.playbackRate || 1) - wait);
      const speed = Math.min((chars + 1) / (room * 0.92), prof.base * Math.max(1, dubCfg.maxSpeed || 1.6));
      const rate = Math.min(prof.maxRate, Math.max(1, (speed / prof.base) ** (1 / prof.pow)));
      const u = new SpeechSynthesisUtterance(s.ko);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : MY_KO ? 'ko-KR' : MY;
      u.rate = rate;
      u.volume = dubCfg.dubVol;
      if (dubSubEl) dubSubEl.dataset.rate = rate.toFixed(2); // 시험·문제 찾기용
      const rec = {
        started: performance.now() + wait * 1000,
        expect: (chars / (prof.base * rate ** prof.pow)) * 1000,
        canceled: false,
        done: false,
      };
      u.onstart = () => {
        rec.started = performance.now();
      };
      u.onend = () => {
        rec.done = true;
        // 끝까지 읽은 것만으로 이 목소리의 1배 빠르기를 고쳐 둔다.
        const sec = (performance.now() - rec.started) / 1000;
        if (rec.canceled || sec < 0.4 || chars < 4) return;
        const base = chars / sec / rate ** prof.pow;
        if (!(base > 2 && base < 15)) return;
        dubCfg.tts = { ...(dubCfg.tts || {}), [prof.name]: +(prof.base * 0.7 + base * 0.3).toFixed(2) };
        if (++dubTtsLearned % 8 === 0) saveDubCfg();
      };
      u.onerror = () => {
        rec.canceled = true;
        rec.done = true;
      };
      dubSaying = rec;
      speechSynthesis.speak(u); // 앞 문장이 남아 있으면 그 뒤에 이어 읽는다
    } catch (e) {
      console.warn(`[${APP_NAME}] 더빙 목소리 실패:`, e.message);
    }
  }
  let dubTtsLearned = 0;

  // 읽던 것을 멈춘다(앞뒤로 감기·멈춤·광고·끄기). 끊긴 것은 빠르기를 배우는 데 쓰지 않는다.
  function dubHush() {
    if (dubSaying) dubSaying.canceled = true;
    try {
      speechSynthesis.cancel();
    } catch {
      /* 목소리를 못 쓰는 브라우저 */
    }
  }

  // 자막·창은 화면 맨 위(position: fixed)에 영상 자리를 따라 둔다. 영상을 감싼 상자가 전체 화면이면
  // (유튜브) 그 안에 넣어야 보인다. <video> 자체가 전체 화면이면 자막은 못 보이고 목소리만 나온다.
  function dubHost(v) {
    const fs = document.fullscreenElement;
    return fs && v && fs !== v && fs.contains(v) ? fs : document.body;
  }

  function dubShowSub(text) {
    if (!dubSubEl) {
      dubSubEl = markNoTranslate(document.createElement('div'));
      dubSubEl.className = 'lzk-dubsub';
      dubSubEl.appendChild(document.createElement('span'));
    }
    const t = dubCfg.subs ? text || '' : '';
    if (dubSubEl.firstChild.textContent !== t) dubSubEl.firstChild.textContent = t;
    dubSubEl.hidden = !t;
    // 우리 한국어 자막을 보이는 동안에는 유튜브 원래 자막(태국어 등)을 가린다 — 두 줄이 겹쳤다.
    document.documentElement.toggleAttribute('data-lzk-dubsubs', !!(dub && !dub.failed && dubCfg.subs));
  }

  // video: 자막을 붙일 영상(크롬 실시간 자막이면 지금 재생 중인 영상, 아니면 우리 자막의 dub.video).
  // above: 화면에 박힌 자막 줄의 윗변(영상 높이에 대한 비율) — 우리 자막을 그 줄 바로 위에 둔다(겹치지 않게).
  function dubPlaceSub(video = liveVideo || (dub && dub.video), above = 0) {
    if (!video || !dubSubEl) return;
    const host = dubHost(video);
    if (dubSubEl.parentNode !== host) host.appendChild(dubSubEl);
    const r = video.getBoundingClientRect();
    dubSubEl.style.left = `${r.left + r.width * 0.06}px`;
    dubSubEl.style.width = `${r.width * 0.88}px`;
    // 세로 영상(쇼츠)은 폭이 좁아 높이로만 정하면 글자가 커서 다섯 줄이 됐다 — 폭으로도 줄이고, 아래쪽 채널 이름·
    // 제목을 가리지 않게 조금 위에 둔다.
    // 사용자(2026-11-01): 쇼츠에서 폭/18 도 아직 크다 → 세로는 폭/26, 가로는 높이/19. 창의 '자막 크기' 로 더 조절.
    const tall = r.height > r.width;
    // 나누는 값·띄우는 높이는 원격 설정(video.subFontTall·subFontWide·subBottomTall·subBottomWide).
    const base = tall ? r.width / RC.video.subFontTall : Math.min(r.height / RC.video.subFontWide, r.width / (RC.video.subFontWide * 1.58));
    let bottom = window.innerHeight - r.bottom + r.height * (tall ? RC.video.subBottomTall : RC.video.subBottomWide);
    if (above > 0) bottom = Math.max(bottom, window.innerHeight - (r.top + r.height * above) + r.height * 0.01);
    dubSubEl.style.bottom = `${bottom}px`;
    dubSubEl.style.fontSize = `${Math.round(Math.max(12, Math.min(40, base * (dubCfg.subScale || 1))))}px`;
  }

  // 틱톡 자막을 띄우는 동안 1초에 한 번 화면에 박힌 자막 줄을 찾아, 있으면 그 줄 바로 위에 둔다 — 중국 틱톡은 대개
  // 중국어 자막이 박혀 있어 한국어가 그 줄을 반쯤 덮었다(2026-11-21 시험 화면). 4초 넘게 못 찾으면 보통 자리로.
  function dubAbove(d, v) {
    if (!d.tt || d.noGrab) return 0;
    const now = Date.now();
    // 아직 줄을 못 찾았으면 0.3초마다(자막 줄이 처음 뜨는 순간 한국어가 그 위를 덮지 않게), 찾았으면 1초마다.
    if (now - (d.aboveAt || 0) > (d.above ? 1000 : 300)) {
      d.aboveAt = now;
      let f = null;
      try {
        f = hsGrab(v);
      } catch {
        d.noGrab = true; // 그림을 읽을 수 없는 영상 — 다시 보지 않는다
      }
      if (f) {
        d.above = f.above;
        d.aboveSeen = now;
      } else if (now - (d.aboveSeen || 0) > 4000) d.above = 0;
    }
    return d.above || 0;
  }

  function dubTick() {
    const d = dub;
    if (!d || d.failed) return;
    const v = d.video;
    // 다른 사이트: 이 영상은 멈췄거나 사라졌고 다른 영상이 재생 중이면(넘겼다) 이 자막은 끈다. 새 영상의 'play' 가
    // 앞 영상이 멈추기 전에 오면 남아서, 마지막 문장이 새 영상 위에 그대로 떠 있었다.
    if (!YOUTUBE && (v.paused || !v.isConnected)) {
      const now = livePlayingVideo();
      if (now && now !== v) return dubStop();
    }
    // 유튜브(쇼츠를 넘김): 주소의 영상 id 가 바뀌면 바로 끈다. 1초마다 보는 ytOnNavigate 를 기다리면 앞 쇼츠의
    // 문장이 다음 쇼츠 위에 남아 있었다(사용자 2026-11-02). 손으로 켜 둔 것(dubWanted)은 다음 영상으로 잇는다.
    // 틱톡: <video> 를 다른 영상에 다시 쓴다(주소 blob 도 그대로) — 영상 id 가 바뀌면 바로 끈다(사용자 2026-11-21:
    // 넘겨도 앞 영상 자막이 몇 초 남아 새 영상 위에 나왔다).
    if (TIKTOK && d.itemId && ttItemId(v) !== d.itemId) return dubStop();
    if (YOUTUBE && d.videoId && ytVideoId() !== d.videoId) {
      const keep = dubWanted;
      dubStop();
      dubWanted = keep;
      return;
    }
    // 자막 파일을 아직 받는 중(문장 0) — 화면에 박힌 자막을 읽어 띄우는 중이면 그 자막을 지우거나 옮기지 않는다.
    if (!d.sentences.length && hsOwns(v)) return;
    // 자동 자막(asr)뿐인 영상에 화면에 박힌 자막이 있으면 화면 자막(사람이 쓴 글)을 보인다 — 목소리(더빙)는 자동 자막대로.
    const hsSubs = hsOwns(v) && d.asr;
    if (!hsSubs) dubPlaceSub(v, dubAbove(d, v));
    if (YOUTUBE && v.closest('.html5-video-player')?.classList.contains(RC.youtube.adShowing)) {
      if (d.cur !== -2) {
        d.cur = -2;
        dubHush();
        dubShowSub('');
      }
      return;
    }
    // 목소리를 켠 동안 영상 소리는 창의 값으로 둔다. 유튜브는 광고가 끝나거나 다음 영상이 뜰 때 제 값으로
    // 되돌리므로 다시 맞추고, 사람이 플레이어의 소리 막대·키를 막 만졌을 때만 그 값을 따른다.
    if (d.ducked && Math.abs(v.volume - dubCfg.videoVol) > 0.005) {
      if (Date.now() - dubVolumeTouchedAt < 2500) {
        dubCfg.videoVol = v.volume;
        saveDubCfg();
        dubSyncPanel();
      } else v.volume = dubCfg.videoVol;
    }
    if (v.paused || v.seeking) return;
    const t = v.currentTime * 1000;
    const i = dubFind(d.sentences, t);
    const s = d.sentences[i];
    d.cur = i;
    if (s && s.ko && dubCfg.voiceOn) dubMaybeSpeak(d, s, t);
    if (!hsSubs) dubShowSub(s && t < Math.min(s.next, s.end + 1500) ? s.ko || '' : '');
  }

  // 목소리를 켜면 영상 소리를 창의 값으로 줄이고, 끄면 원래대로 돌린다.
  function dubDuck(d, on) {
    if (on && !d.ducked) {
      d.origVolume = d.video.volume;
      d.video.volume = dubCfg.videoVol;
      d.ducked = true;
    } else if (!on && d.ducked) {
      if (d.video.isConnected) d.video.volume = d.origVolume;
      d.ducked = false;
    }
  }

  function dubSetVoice(on) {
    dubCfg.voiceOn = on;
    saveDubCfg();
    if (!dub) return;
    dubDuck(dub, on);
    if (!on) dubHush();
    dubStatus();
  }

  // auto: 사람이 누른 것이 아니라 외국어 영상이라 저절로 켠 것 — 한국어 자막이 있는 영상·한국어 영상·자막이
  // 없는 영상이면 조용히 그만둔다.
  async function dubStart(video, auto = false) {
    if (!video) return;
    if (dub) dubStop();
    const d = { video, sentences: [], cur: -1, lang: '', status: '대본 받는 중…', auto, startedAt: Date.now() };
    if (YOUTUBE) d.videoId = ytVideoId();
    if (TIKTOK) d.itemId = ttItemId(video);
    dub = d;
    if (YOUTUBE && !auto) dubWanted = true;
    ensureGlossary();
    dubDuck(d, dubCfg.voiceOn);
    // 감거나 멈추면 읽던 것을 멈추고, 다시 볼 때 그 자리 문장부터 읽을 수 있게 '읽음' 표시를 지운다.
    d.onSeek = () => {
      dubHush();
      d.cur = -1;
      for (const s of d.sentences) s.said = false;
    };
    video.addEventListener('seeking', d.onSeek);
    video.addEventListener('pause', d.onSeek);
    d.timer = setInterval(dubTick, 150);
    dubStatus();
    dubSyncButton();
    try {
      const cues = YOUTUBE && video.closest(`${RC.youtube.player}, ${RC.youtube.shortsPlayerAny}`)
        ? await ytLoadCues(d)
        : TIKTOK && d.itemId && ttItems.has(d.itemId)
          ? await ttLoadCues(d)
          : dubTrackCues(d);
      if (d !== dub) return;
      if (cues) dubSetCues(d, cues);
      else if (auto) return dubStop();
      else d.failed = true; // 자막이 없다 — 이 영상 자리는 크롬 실시간 자막에 내준다
    } catch (e) {
      if (auto && d === dub) return dubStop();
      d.status = `자막을 받지 못했습니다: ${e.message}`;
      d.failed = true;
    }
    dubStatus();
  }

  function dubStop() {
    const d = dub;
    if (!d) return;
    dub = null;
    dubWanted = false;
    clearInterval(d.timer);
    clearInterval(d.trackPoll);
    d.video.removeEventListener('seeking', d.onSeek);
    d.video.removeEventListener('pause', d.onSeek);
    dubHush();
    if (dubTtsLearned) saveDubCfg(); // 배운 목소리 빠르기
    dubDuck(d, false);
    dubShowSub('');
    dubStatus();
    dubSyncButton();
  }

  // --- 틱톡: 영상마다 가진 자동 자막(WebVTT) ---
  // 사용자(2026-11-21, 중국어 틱톡 7676390705278815495): 번역이 잘 안 되고(번역률이 낮다), 넘겨도 앞 영상 자막이 몇 초
  // 남아 새 영상 위에 나온다. 그때까지 틱톡은 크롬 실시간 자막(소리 → 받아 적기 → 번역, 한 문장 늦고 자주 틀림)뿐이었다.
  // 틱톡은 영상 정보에 자기 자동 자막(Whisper 받아쓰기, 말한 시각까지 — 그 영상: '小明一加一等于几' 0.2~1.88초 …)을
  // 갖고 있고, 그 주소는 페이지에서 그대로 받힌다(2026-11-21 확인). 확장의 tt-main.js(페이지 쪽)가 영상 id → 자막 주소를
  // 넘겨 주면(문서 이벤트 'lzk-tt-items'), 재생 중인 영상의 자막을 받아 한 줄씩 옮겨 그 시각에 띄운다. 영상 id 는
  // 플레이어 상자(xgwrapper-n-<id>)에서 — 틱톡은 <video> 두 개를 번갈아 다시 쓰고 영상 주소(blob)도 그대로라, 넘겼는지는
  // id 로만 알 수 있다. 자막이 없는 영상은 예전처럼 화면 자막 읽기·크롬 실시간 자막.
  const TIKTOK = /(^|\.)tiktok\.com$/.test(location.hostname);
  const ttItems = new Map(); // 영상 id → { caps: [{ lang, raw, urls, auto, orig, tr }], orig, desc }
  const ttCues = new Map(); // 영상 id → 받은 자막 줄(다시 볼 때 다시 받지 않는다)
  const ttNone = new Set(); // 자막이 없거나 내 언어로 말하는 영상 — 다시 보지 않는다
  let ttHooked = false;

  // 영상 정보 JSON 에서 { id, video: { claInfo | subtitleInfos } } 를 찾아 담는다(몽키판: 첫 페이지 것만 — 페이지 쪽 엿보기가 없다).
  function ttTake(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 9) return;
    if (Array.isArray(node)) {
      for (const x of node) ttTake(x, depth + 1);
      return;
    }
    const v = node.video;
    if (v && typeof v === 'object' && (v.claInfo || v.subtitleInfos) && /^\d{8,}$/.test(String(node.id || '')) && !ttItems.has(String(node.id))) {
      const caps = [];
      for (const c of (v.claInfo && v.claInfo.captionInfos) || []) {
        const urls = [...(c.urlList || []), c.url].filter((u) => typeof u === 'string' && u);
        if (urls.length) caps.push({ lang: String(c.languageCode || ''), raw: String(c.language || ''), urls, auto: !!c.isAutoGen, orig: !!c.isOriginalCaption, tr: String(c.translationType || '0') });
      }
      for (const s of v.subtitleInfos || []) {
        if (s && typeof s.Url === 'string') caps.push({ lang: '', raw: String(s.LanguageCodeName || ''), urls: [s.Url], auto: s.Source === 'ASR', orig: s.Source === 'ASR', tr: s.Source === 'MT' ? '1' : '0' });
      }
      ttItems.set(String(node.id), { caps, orig: '', desc: String(node.desc || '') });
    }
    for (const k in node) if (node[k] && typeof node[k] === 'object') ttTake(node[k], depth + 1);
  }

  function ttListen() {
    if (ttHooked || !TIKTOK) return;
    ttHooked = true;
    document.addEventListener('lzk-tt-items', (e) => {
      try {
        for (const [id, it] of Object.entries(JSON.parse(String(e.detail || '{}')))) {
          if (it && Array.isArray(it.caps)) ttItems.set(id, it);
        }
      } catch {
        /* 모양이 다르다 */
      }
    });
    document.dispatchEvent(new CustomEvent('lzk-tt-ask')); // 페이지 쪽이 먼저 모아 둔 것
    try {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (el) ttTake(JSON.parse(el.textContent));
    } catch {
      /* 첫 페이지 정보가 없다 */
    }
  }

  // 이 <video> 가 보여 주는 틱톡 영상 id. 플레이어 상자 id(xgwrapper-0-7676…) → 영상 링크 → 주소(/video/<id>).
  function ttItemId(v) {
    if (!TIKTOK || !v || !v.closest) return '';
    const w = v.closest('[id^="xgwrapper-"]');
    const m = w && /-(\d{8,})$/.exec(w.id);
    if (m) return m[1];
    const box = v.closest('article, [data-e2e*="item"], [class*="ItemContainer"]');
    const a = box && box.querySelector('a[href*="/video/"]');
    const h = a && /\/video\/(\d{8,})/.exec(a.getAttribute('href') || '');
    if (h) return h[1];
    const u = /\/video\/(\d{8,})/.exec(location.pathname);
    return u ? u[1] : '';
  }

  // 틱톡 언어 이름 → 구글 코드. languageCode(zh-Hans·ko …)가 있으면 그것, 없으면 cmn-Hans-CN 같은 ISO 639-3.
  const TT_ISO3 = {
    cmn: 'zh-CN', zho: 'zh-CN', yue: 'yue', kor: 'ko', eng: 'en', jpn: 'ja', tha: 'th', vie: 'vi', ind: 'id', msa: 'ms', zsm: 'ms',
    fil: 'tl', tgl: 'tl', spa: 'es', por: 'pt', fra: 'fr', deu: 'de', ita: 'it', rus: 'ru', ukr: 'uk', pol: 'pl', tur: 'tr',
    ara: 'ar', heb: 'he', hin: 'hi', ben: 'bn', urd: 'ur', tam: 'ta', tel: 'te', mar: 'mr', khm: 'km', lao: 'lo', mya: 'my',
    mon: 'mn', kaz: 'kk', nld: 'nl', ron: 'ro', ces: 'cs', ell: 'el', hun: 'hu', swe: 'sv', fin: 'fi', dan: 'da', nob: 'no',
  };
  function ttLang(c) {
    const code = String(c.lang || '').toLowerCase();
    const raw = String(c.raw || '');
    if (/^zh-(hant|tw|hk|mo)/.test(code) || /^(?:cmn|zho)-Hant|-(?:TW|HK|MO)$/.test(raw)) return 'zh-TW';
    if (/^zh/.test(code)) return 'zh-CN';
    if (code) return code.split('-')[0];
    const iso = raw.split('-')[0].toLowerCase();
    return TT_ISO3[iso] || iso.slice(0, 2);
  }
  const ttMine = (lang) => !!lang && (lang.split('-')[0].toLowerCase() === MY2 || YT_MY_RE.test(lang));

  // 옮길 자막: 원래 말 자막(틱톡이 옮긴 것 말고). 원래 말이 내 언어면 null(한국 영상에 한국어 자막을 덮지 않는다).
  function ttPick(it) {
    const caps = (it && it.caps) || [];
    const orig = caps.find((c) => c.orig) || caps.find((c) => c.tr === '0') || null;
    if (orig) return ttMine(ttLang(orig)) ? null : orig;
    // 틱톡이 옮겨 둔 자막만 있으면 내 언어 것을 그대로(번역 없이), 아니면 아무것이나 옮긴다.
    return caps.find((c) => ttMine(ttLang(c))) || caps[0] || null;
  }

  function ttParseVtt(text) {
    const cues = [];
    const ms = (s) => {
      const p = s.trim().split(':').map(Number);
      const sec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
      return Math.round(sec * 1000);
    };
    for (const block of String(text || '').replace(/\r/g, '').split(/\n{2,}/)) {
      const lines = block.split('\n');
      const at = lines.findIndex((l) => l.includes('-->'));
      if (at < 0) continue;
      const [a, b] = lines[at].split('-->');
      const t = lines
        .slice(at + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const start = ms(a);
      const end = ms(String(b).split(/\s/).filter(Boolean)[0] || '0');
      if (t && Number.isFinite(start) && Number.isFinite(end) && end > start) cues.push({ start, end, text: t });
    }
    return cues;
  }

  async function ttFetchVtt(urls) {
    let last = null;
    for (const url of urls.slice(0, 3)) {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl && setTimeout(() => ctl.abort(), 5000);
      try {
        const r = await fetch(url, ctl ? { signal: ctl.signal } : {});
        const t = r.ok ? await r.text() : '';
        if (/^﻿?WEBVTT/.test(t)) return t;
        last = new Error(`자막 파일이 아닙니다 (HTTP ${r.status})`);
      } catch (e) {
        last = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw last || new Error('자막 주소가 없습니다');
  }

  async function ttLoadCues(d) {
    const id = d.itemId;
    const it = ttItems.get(id);
    const cap = ttPick(it);
    if (!cap) {
      ttNone.add(id);
      d.status = it && it.caps.length ? '내 언어로 말하는 영상이라 자막을 띄우지 않습니다' : '틱톡 자막이 없는 영상 — 화면 자막·크롬 실시간 자막으로';
      return null;
    }
    const lang = ttLang(cap);
    d.from = lang;
    d.lang = lang.split('-')[0].toLowerCase();
    d.tt = true;
    d.asr = false; // 틱톡 자막(Whisper)은 시각이 정확하다 — 화면 자막 읽기보다 이쪽
    let cues = ttCues.get(id);
    if (!cues) {
      cues = ttParseVtt(await ttFetchVtt(cap.urls));
      if (ttCues.size > 200) ttCues.clear();
      ttCues.set(id, cues);
    }
    if (!cues.length) {
      ttNone.add(id);
      return null;
    }
    d.status = '틱톡 자막 옮기는 중…';
    return cues;
  }

  const ttPrefetching = new Set();
  async function ttPrefetch(id) {
    if (ttCues.has(id) || ttNone.has(id) || ttPrefetching.has(id) || ttPrefetching.size >= 3) return;
    const cap = ttPick(ttItems.get(id));
    if (!cap) return;
    ttPrefetching.add(id);
    try {
      const cues = ttParseVtt(await ttFetchVtt(cap.urls));
      ttCues.set(id, cues);
      const lang = ttLang(cap);
      // 번역은 저장해 두는 번역(cache)에 남는다 — 그 영상을 틀면 dubTranslate 가 바로 꺼내 쓴다. 태국어는 다듬기를 거쳐
      // 다른 글로 묻기 때문에 미리 옮기지 않는다(용어집이라 빠르다).
      if (cues.length && !ttMine(lang) && !(MY_KO && lang === 'th')) await translateToKorean(ttSentences(cues).map((s) => subPrep(s.src, lang)), lang);
    } catch {
      /* 그 영상을 틀 때 다시 받는다 */
    } finally {
      ttPrefetching.delete(id);
    }
  }

  // 0.3초마다: 재생 중인 틱톡 영상이 바뀌었고 그 영상에 자막이 있으면 바로 그 자막으로(앞 영상 자막은 dubTick 이 이미 내렸다).
  function ttTick() {
    if (!dubCfg.pageSubs || !dubCfg.subs || document.visibilityState !== 'visible') return;
    const v = livePlayingVideo();
    // 틱톡이 미리 받아 둔 다음 영상(<video> 가 하나 더 있다)의 자막도 미리 받아 옮겨 둔다 — 넘기는 순간 바로 나오게.
    for (const o of document.querySelectorAll('video')) {
      const pid = o !== v && ttItemId(o);
      if (pid) ttPrefetch(pid);
    }
    const id = v && ttItemId(v);
    if (!id || (dub && dub.video === v && dub.itemId === id) || ttNone.has(id)) return;
    const it = ttItems.get(id);
    if (!it) return; // 영상 정보가 아직 — 다음 번에
    if (!ttPick(it)) {
      ttNone.add(id);
      return;
    }
    if (dub) dubStop();
    dubStart(v, true);
  }

  // 틱톡 자막은 이미 말 한 덩이씩(1~3초) 나뉘어 있다 — 이어 붙이지 않고 한 줄씩 그 시각에. 한 글자 줄도 따로 둔다
  // (그 영상: '妈一加一等于几' 다음 '滚' 은 다른 사람의 대답이다 — 붙이면 한 사람의 말이 된다).
  function ttSentences(cues) {
    const out = [];
    for (const c of cues) {
      const text = String(c.text || '').replace(/\[[^\]]*\]|♪+/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) out.push({ start: c.start, end: c.end, src: text, gender: '' });
    }
    out.forEach((s, i) => {
      s.next = i + 1 < out.length ? out[i + 1].start : s.end + 1500;
      s.ko = null;
    });
    return out;
  }

  // --- 다른 사이트의 <video>: 자막 트랙 ---
  function dubTrackList(t) {
    return [...(t.cues || [])].map((c) => ({
      start: c.startTime * 1000,
      end: c.endTime * 1000,
      text: String(c.text || '').replace(/<[^>]+>/g, ''),
    }));
  }

  function dubTrackCues(d) {
    const tracks = [...(d.video.textTracks || [])].filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
    if (!tracks.length) {
      d.status = '이 영상에는 자막이 없습니다. 자막 없는 영상(음성 인식)은 아직 못 합니다.';
      return null;
    }
    // 내 언어 자막이 있으면 그것(한국어 사용자면 한국어 — 예전 그대로)
    const t = tracks.find((x) => YT_MY_RE.test(x.language || '')) || tracks.find((x) => x.mode === 'showing') || tracks[0];
    if (t.mode === 'disabled') t.mode = 'hidden'; // 화면에 띄우지 않고 내용만 읽는다
    d.track = t;
    d.lang = (t.language || '').split('-')[0].toLowerCase();
    // 자막을 조금씩 받는 영상(HLS)도 있어 늘어나는지 계속 본다.
    d.trackPoll = setInterval(() => {
      if (d !== dub) return;
      const cues = dubTrackList(t);
      if (cues.length !== d.cueCount) dubSetCues(d, cues);
    }, 2000);
    d.status = '자막 읽는 중…';
    return dubTrackList(t);
  }

  // --- 유튜브 ---
  // 보통 영상은 /watch?v=ID 와 #movie_player, 쇼츠는 /shorts/ID 와 #shorts-player(지금 보이는 것).
  const ytIsShorts = () => location.pathname.startsWith('/shorts/');
  const ytVideoId = () =>
    new URL(location.href).searchParams.get('v') || (/^\/shorts\/([\w-]+)/.exec(location.pathname) || [])[1] || '';
  const ytPlayer = () =>
    ytIsShorts()
      ? document.querySelector(RC.youtube.shortsPlayer) || document.querySelector(RC.youtube.shortsPlayerAny)
      : document.querySelector(RC.youtube.player);
  const ytVideo = () => ytPlayer()?.querySelector('video') || null;

  function ytCues(j) {
    const out = [];
    for (const e of (j && j.events) || []) {
      if (!e.segs) continue;
      const text = e.segs
        .map((s) => s.utf8 || '')
        .join('')
        .replace(/\s*\n\s*/g, ' ')
        .trim();
      if (text) out.push({ start: e.tStartMs || 0, end: (e.tStartMs || 0) + (e.dDurationMs || 0), text });
    }
    // 자동 자막은 줄이 겹쳐 흘러가므로(두 줄 표시) 다음 줄이 나오면 앞 줄은 끝난 것으로 본다.
    for (let i = 0; i + 1 < out.length; i++) {
      if (out[i + 1].start > out[i].start) out[i].end = Math.min(out[i].end, out[i + 1].start);
    }
    return out;
  }

  // 쇼츠 플레이어의 자막(CC) 보기(cmd 'peek')·켜기('on')·끄기('off'). 플레이어 기능은 페이지 쪽 자바스크립트에만
  // 있어서 확장의 페이지 쪽 조각(extension/src/yt-main.js)에 문서 이벤트로 부탁한다. 답: { was: 부르기 전 CC
  // 'on'/'off', id, tracks: 이 영상의 자막 목록('th:asr' 꼴, 모르면 null) }. 조각이 없으면(몽키) null.
  // sel: 물을 플레이어(없으면 쇼츠 플레이어). 보통 영상(#movie_player)도 자막 목록은 같은 방법으로 읽는다.
  function ytCaptions(cmd, sel) {
    return new Promise((resolve) => {
      let timer = 0;
      const done = (e) => {
        clearTimeout(timer);
        document.removeEventListener('lzk-yt-cc-done', done);
        let r = null;
        try {
          r = e ? JSON.parse(e.detail) : null;
        } catch {
          r = null;
        }
        resolve(r);
      };
      timer = setTimeout(done, 500);
      document.addEventListener('lzk-yt-cc-done', done);
      // 플레이어 선택자도 함께 넘긴다 — 원격 설정(youtube.shortsPlayer)을 고치면 페이지 쪽 조각도 따른다.
      const detail = JSON.stringify({ cmd, player: sel || RC.youtube.shortsPlayer, any: sel || RC.youtube.shortsPlayerAny });
      document.dispatchEvent(new CustomEvent('lzk-yt-cc', { detail }));
    });
  }

  // 유튜브 영상의 말 언어 — 자막 목록의 자동 자막(asr) 언어가 곧 말 언어다(자동 자막 없이 한국어 자막뿐이면 한국어로 본다).
  // 한국어 영상에는 우리 자막(자막 파일·크롬 실시간 자막)을 띄우지 않는다: 크롬 '실시간 번역' 을 켜 두면 도우미가 한국어
  // 말을 가려내지 못해, 영상의 한국어 자막 위에 우리 한국어 자막이 겹쳤다(사용자 2026-11-03). 영상 id → 'ko' 등('' = 모름).
  const ytSpoken = new Map();
  const ytMeta = new Map(); // 영상 id → { title, author, keywords } (자막 목록과 같이 온다) — 화면 자막 언어 가늠(hsGuessLangs)
  // 내 언어(한국어가 아니면 그 언어)로 — 내 말 영상에는 자막을 덧붙이지 않고, 모자란 줄은 유튜브가 그 언어로 옮긴 자막(tlang)으로.
  // 유튜브 자막 언어 코드가 구글 번역 코드와 다른 언어(2026-11-18 유튜브 자료로 확인): 히브리어 = iw, 필리핀어 = fil.
  // 앞의 것이 유튜브에 물을 때 쓰는 코드. 다른 사이트의 자막·목소리는 구글 쪽 코드(he·tl)로 올 수도 있어 둘 다 본다.
  const YT_CODES = { he: ['iw', 'he'], tl: ['fil', 'tl'] };
  // 유튜브 자동 자막은 말레이어 말을 인도네시아어(id)로 받아 적는다(말레이시아 뉴스 3개 모두 id:asr) — 말 언어를 가늠할
  // 때만(내 말 영상인가) 내 말로 친다. 자막을 옮길지는 YT_MY_RE(정확한 언어)로 정한다.
  const YT_SPOKEN_ALSO = { ms: ['id'] };
  let YT_MY, YT_MY_RE, YT_SPOKEN_RE, YT_TLANG;
  function ytMyRecalc() {
    const base = MY_KO ? 'ko' : MY2;
    const codes = YT_CODES[base] || [base];
    YT_MY = codes[0];
    // 뒤에 '-'·':'(자막 목록의 'ko:asr') 나 끝이 와야 한다(ko-KR·zh-Hans 는 맞고, ko 로 시작하는 다른 언어 kok 는 아니다).
    YT_MY_RE = new RegExp(`^(${codes.join('|')})([-:]|$)`, 'i');
    YT_SPOKEN_RE = new RegExp(`^(${[...codes, ...(YT_SPOKEN_ALSO[base] || [])].join('|')})([-:]|$)`, 'i');
    YT_TLANG = MY === 'zh-CN' ? 'zh-Hans' : MY === 'zh-TW' ? 'zh-Hant' : YT_MY;
  }
  ytMyRecalc();
  const ytSpokenBusy = new Map(); // 영상 id → 묻는 중인 약속(같이 기다린다)
  // 자동 자막이 없는 영상(라이브 등 — 사용자 2026-11-03: 한국어 라이브 뉴스 위에 우리 자막이 겹쳤다)은 제목·채널 이름·
  // 태그의 글자로 가늠한다. 태그와 채널 이름은 유튜브가 번역해 보이지 않는다. 한글 한 글자는 라틴 글자 2.5개로 친다
  // ('MBC 뉴스 LIVE' 같은 섞인 제목).
  const ytMostlyHangul = (meta) => {
    if (!meta) return false;
    const s = [meta.title, meta.author, ...(meta.keywords || [])].join(' ');
    const mineRe = MY_KO ? /[가-힣]/g : MY_SCRIPT ? new RegExp(MY_SCRIPT.source, 'g') : null;
    if (!mineRe) return false; // 로마자 언어는 제목 글자로 못 가른다
    const ko = (s.match(mineRe) || []).length;
    const other = (s.match(/[A-Za-z가-힣฀-๿぀-ヿ一-鿿Ѐ-ӿ؀-ۿऀ-ॿ]/g) || []).length - ko;
    return ko > 0 && ko * 2.5 >= other;
  };
  // 유튜브는 2026-11 부터 진짜 자동 자막(말 언어) 말고도 말과 상관없는 언어의 자동 자막(variant=timing-optimized)을
  // 하나 더 붙인다 — 한국어 쇼츠 AdgTEqVRQ54 = ['en:asr'(timing-optimized), 'ko:asr'(gemini)]. 첫 자동 자막을 말
  // 언어로 믿었더니 한국어 쇼츠를 영어 영상으로 보고 화면을 가리는 한국어 자막을 띄웠다(사용자 2026-11-18: 한국 영상에도
  // 자막 — 내 언어를 고른 사람에게 내 언어 영상의 번역 자막이 저절로 나오면 안 된다). 그래서 그런 자막
  // (RC.youtube.extraAsr — variants 는 확장의 페이지 쪽 조각이 알려 준다)은 빼고 보고, 자동 자막이 여럿이면(자동 더빙
  // 등) 그중 하나라도 내 언어면 내 언어 영상으로 친다.
  const ytSpokenFrom = (tracks, meta, variants) => {
    const list = (tracks || []).filter((t, i) => !(Array.isArray(variants) && RC.youtube.extraAsr.includes(variants[i])));
    const asr = list.filter((t) => t.endsWith(':asr')).map((t) => t.split(':')[0].toLowerCase());
    if (asr.length) return asr.some((l) => YT_SPOKEN_RE.test(l)) ? YT_MY : asr[0];
    if (list.length && list.every((t) => YT_MY_RE.test(t))) return YT_MY;
    return ytMostlyHangul(meta) ? YT_MY : '';
  };
  const ytKoreanVideo = () => YOUTUBE && YT_MY_RE.test(ytSpoken.get(ytVideoId()) || '');

  // 확장의 페이지 쪽 조각에 지금 영상의 자막 목록을 묻는다(넘긴 직후면 플레이어가 바뀔 때까지 0.3초씩 3초까지).
  // 묻는 중이면 그 약속을 돌려준다 — 자막 파일을 받기 전(ytLoadCues)에도 기다릴 수 있게.
  function ytLearnSpoken() {
    const id = ytVideoId();
    if (!YOUTUBE || !id || ytSpoken.has(id)) return Promise.resolve();
    if (ytSpokenBusy.has(id)) return ytSpokenBusy.get(id);
    const job = (async () => {
      const sel = ytIsShorts() ? null : RC.youtube.player;
      for (let i = 0; i < 10 && ytVideoId() === id; i++) {
        const cc = await ytCaptions('peek', sel);
        // 조각이 없다(몽키) — '' (모름)로 적어 둔다. 안 적으면 0.7초마다(liveTick) 0.5초씩 기다리며 다시 물었다.
        if (!cc) return ytSpoken.set(id, '');
        if (cc.id === id && cc.meta) ytMeta.set(id, cc.meta);
        if (cc.id === id && cc.tracks) return ytSpoken.set(id, ytSpokenFrom(cc.tracks, cc.meta, cc.variants));
        await sleep(300);
      }
    })().finally(() => ytSpokenBusy.delete(id));
    ytSpokenBusy.set(id, job);
    return job;
  }

  // 플레이어가 이 영상의 자막을 부르게 한다: 자막(CC)을 껐다 켜거나, 꺼져 있으면 켰다가 원래대로 끈다.
  // 돌려주는 것은 잡힌 주소들(새것부터). 못 잡으면 왜 못 잡았는지 d.why 에 적는다.
  async function ytCaptureTimedtext(id, d, fresh) {
    const got = () => ytTimedtext.get(id) || [];
    if (got().length && !fresh) return got();
    const player = ytPlayer();
    for (let i = 0; i < 180 && player && player.classList.contains(RC.youtube.adShowing); i++) {
      if (d !== dub) return [];
      d.status = '광고가 끝나면 시작합니다…';
      dubStatus();
      await sleep(1000);
    }
    if (d !== dub) return [];
    d.status = '자막 주소 받는 중…';
    dubStatus();
    // 플레이어의 CC 상태와 자막 목록(확장의 페이지 쪽 조각). 쇼츠는 CC 가 꺼져 있으면 플레이어가 자막을 부르지
    // 않으니 아래에서 기다리지 않고 바로 켠다.
    // 넘긴 직후에는 플레이어가 아직 앞 영상을 들고 있다 — 이 영상으로 바뀔 때까지 0.2초씩 2초까지 다시 본다.
    const sel = ytIsShorts() ? null : RC.youtube.player;
    let cc = await ytCaptions('peek', sel);
    for (let i = 0; i < 10 && cc && cc.id !== id && d === dub; i++) {
      await sleep(200);
      cc = await ytCaptions('peek', sel);
    }
    const tracks = cc && cc.id === id ? cc.tracks : null;
    if (tracks) {
      d.tracks = tracks;
      ytSpoken.set(id, ytSpokenFrom(tracks, cc.meta, cc.variants));
      if (cc.meta) ytMeta.set(id, cc.meta);
    }
    const mineVideo = !!tracks && YT_MY_RE.test(ytSpoken.get(id) || '');
    // 자막이 하나도 없는 영상, 또는 저절로 켰는데 한국어 자막뿐인 영상(한국어 영상) — CC 를 켜지 않고 기다리지도
    // 않는다. 자막이 없는 영상은 바로 크롬 실시간 자막으로 넘어간다. 보통 영상도 그렇다: 전에는 '자막 사용 불가'
    // CC 단추를 눌러 보며 15초씩 두 번 기다려, 그 35초 동안 실시간 자막까지 막혀 있었다(사용자 2026-11-06:
    // 자막이 아예 없는 유튜브 영상은 번역이 안 된다 — 페이스북·틱톡은 되는데). 한국어 쇼츠에 CC 를 켜 두면
    // 유튜브 한국어 자막이 떴다.
    // 내 언어 영상(ytSpokenFrom)도 — 쇼츠 CC 를 켜 보면 유튜브 자막이 뜬다.
    if (tracks && (!tracks.length || mineVideo || (d.auto && tracks.every((t) => YT_MY_RE.test(t))))) {
      d.noCaptions = true;
      d.why = tracks.length ? `${MY_KO ? '한국어' : '내 언어'} ${ytIsShorts() ? '쇼츠' : '영상'}` : `자막이 없는 ${ytIsShorts() ? '쇼츠' : '영상'} — 크롬 실시간 자막으로`;
      return got();
    }
    const ccOff = !!(cc && cc.id === id && cc.was === 'off');
    // 광고가 끝나며 플레이어가 이미 자막을 불렀으면 그것으로 — 다시 켜도 새로 부르지 않아 기다리기만 했다.
    if (!ccOff) await sleep(1500);
    if (got().length && !fresh) return got();
    const btn = player && player.querySelector(RC.youtube.ccButton);
    if (!btn || btn.style.display === 'none' || btn.getAttribute('aria-disabled') === 'true') {
      // 쇼츠 플레이어에는 CC 단추가 없다. 대신 영상을 틀 때 스스로 자막을 부르므로 조금 더 기다린다. 유튜브 CC 를
      // 꺼 둔 계정이면 부르지 않으니(사용자 2026-11-02: 외국어가 나오면 CC 가 켜지고 한국어 자막도 저절로) 잠깐
      // 켜서 부르게 하고 받으면 원래대로 끈다 — 우리 한국어 자막만 보이게. (자막이 없는 영상은 위에서 이미 돌아갔다.)
      if (ccOff) await ytCaptions('on', sel);
      for (let i = 0; i < 16 && !got().length && ytIsShorts(); i++) await sleep(250);
      if (ccOff) await ytCaptions('off', sel);
      if (!got().length) {
        d.why = ytIsShorts()
          ? '쇼츠 자막을 못 찾음 — 자막이 없는 쇼츠이거나, 쇼츠 ⋮ 메뉴에서 자막을 한 번 켜 주세요'
          : '자막(CC) 단추가 없거나 꺼져 있음 — 자막이 없는 영상';
      }
      return got();
    }
    const before = got().length;
    const wasOn = btn.getAttribute('aria-pressed') === 'true';
    if (wasOn) {
      btn.click();
      await sleep(400);
    }
    btn.click(); // 켜면 플레이어가 이 영상의 자막 주소를 부른다
    for (let i = 0; i < 60 && got().length <= before; i++) await sleep(250);
    if (!wasOn) btn.click(); // 원래대로 끈다 — 우리 한국어 자막만 보이게
    if (got().length <= before) d.why = `자막을 켜도 플레이어가 자막 주소를 부르지 않음 (CC ${wasOn ? '켜져' : '꺼져'} 있었음)`;
    return got();
  }

  // 자막 목록을 따로 받지 않는다 — 영상 페이지를 다시 받으면 유튜브가 자막 정보를 빼고 줄 때가 있었다
  // (2026-11-01, 사용자 영상 KUZEfOmTQpY). 플레이어가 부른 주소(그 영상의 보안 표가 붙은)에서 lang·kind 만
  // 바꿔 차례로 받아 본다: 사람이 만든 한국어 → 같은 언어의 사람이 만든 자막 → 플레이어가 고른 그대로.
  // 없는 자막은 빈 답이 온다.
  async function ytLoadCues(d) {
    const id = ytVideoId();
    d.videoId = id;
    d.status = '자막 주소 받는 중…';
    dubStatus();
    // 한국어 영상이면(자막 목록 — ytSpokenFrom) CC 를 껐다 켜 보지도 않는다.
    const koVideo = () => YT_MY_RE.test(ytSpoken.get(id) || ''); // 내 언어 영상(한국어 사용자면 한국어)
    const KO_VIDEO = MY_KO ? '한국어 영상이라 한국어 자막을 덧붙이지 않습니다' : '내 언어 영상이라 자막을 덧붙이지 않습니다';
    await ytLearnSpoken();
    if (d !== dub) return null;
    if (koVideo()) {
      d.status = KO_VIDEO;
      return null;
    }
    let urls = await ytCaptureTimedtext(id, d);
    if (d !== dub) return null;
    if (d.noCaptions && !urls.length) {
      d.status = d.why;
      return null;
    }
    // ms: 이만큼 답이 없으면 그만 기다린다(없는 것으로 친다).
    const get = async (u, ms = 0) => {
      const ctl = new AbortController();
      const timer = ms ? setTimeout(() => ctl.abort(), ms) : 0;
      try {
        const text = await (await fetch(u, { credentials: 'include', signal: ctl.signal })).text();
        return text ? ytCues(JSON.parse(text)) : null;
      } finally {
        clearTimeout(timer);
      }
    };
    // 플레이어가 알려 준 이 영상의 자막 목록(d.tracks, 쇼츠·보통 영상) — 없는 자막은 묻지 않는다.
    const has = (lang, kind) => !d.tracks || d.tracks.includes(lang + (kind ? `:${kind}` : ''));
    const mk = (base, lang, kind, tlang) => {
      const u = new URL(base);
      u.searchParams.set('lang', lang);
      if (kind) u.searchParams.set('kind', kind);
      else u.searchParams.delete('kind');
      for (const p of ['name', 'tlang']) u.searchParams.delete(p);
      if (tlang) u.searchParams.set('tlang', tlang);
      u.searchParams.set('fmt', 'json3');
      return u.href;
    };
    d.status = '대본 받는 중…';
    dubStatus();
    for (let round = 0; round < 2; round++) {
      // 보안 표(pot)가 붙은 주소부터, 새것부터
      const bases = [...urls].reverse().sort((a, b) => /[?&]pot=./.test(b) - /[?&]pot=./.test(a));
      for (const base of bases) {
        const p = new URL(base).searchParams;
        const spoken = p.get('lang') || '';
        const asr = p.get('kind') === 'asr';
        // 한국어 영상 — 우리 한국어 자막은 영상의 한국어 자막과 겹치기만 한다. 손으로 켜 둔 것이 다음 영상으로 이어져도
        // 띄우지 않는다(사용자 2026-11-03). 플레이어가 부른 자막이 한국어라도 사람이 만든 것(kind 없음)이면 말은 외국어일
        // 수 있다 — 한국어 화면의 계정은 TED 같은 외국어 영상에서도 한국어 자막을 먼저 부른다. 그래서 자막 목록으로 안
        // 말 언어(ytSpoken)를 먼저 보고, 모를 때만 한국어 자동 자막(asr)을 한국어 말로 친다.
        if (koVideo() || (!ytSpoken.get(id) && asr && YT_SPOKEN_RE.test(spoken))) {
          ytSpoken.set(id, YT_MY);
          d.status = KO_VIDEO;
          return null;
        }
        if (d.auto && YT_MY_RE.test(spoken)) return null; // 사람이 만든 한국어 자막이 있는 외국어 영상 — 유튜브 CC 로 보면 된다
        const tries = [];
        if (!YT_MY_RE.test(spoken) && has(YT_MY, '')) tries.push([YT_MY, '']);
        if (asr && has(spoken, '')) tries.push([spoken, '']);
        tries.push([spoken, asr ? 'asr' : '']);
        // 한꺼번에 묻고 앞 순서부터 고른다 — 차례로 물었더니 없는 자막 하나에 5.7초가 걸려 쇼츠 자막이 그만큼
        // 늦었다(2026-11-02 시험, 사용자: 영어 쇼츠 자막이 늦다).
        const asked = tries.map(([lang, kind]) => get(mk(base, lang, kind), 3000).catch(() => null));
        for (let k = 0; k < tries.length; k++) {
          const [lang, kind] = tries[k];
          const cues = await asked[k];
          if (d !== dub) return null;
          if (cues && cues.length) {
            // 사람이 만든 한국어 자막이 있는 영상 — 저절로는 켜지 않는다(유튜브 CC 로 보면 된다).
            if (d.auto && lang === YT_MY) return null;
            d.lang = lang.split('-')[0].toLowerCase(); // 앞 두 글자만 자르면 fil → fi(핀란드어), yue → yu 가 됐다
            d.asr = kind === 'asr'; // 자동 자막 — 화면에 박힌 자막이 있으면 그쪽을 보인다(hsTick)
            if (d.lang !== YT_MY) d.koFallback = async () => (await get(mk(base, lang, kind, YT_TLANG))) || [];
            return cues;
          }
        }
        // 플레이어가 받은 그대로(자동 번역 tlang 까지)도 한 번
        try {
          const u = new URL(base);
          u.searchParams.set('fmt', 'json3');
          const cues = await get(u.href);
          if (cues && cues.length) {
            d.lang = (p.get('tlang') || spoken).split('-')[0].toLowerCase();
            d.asr = p.get('kind') === 'asr';
            return cues;
          }
        } catch {
          /* 다음 주소 */
        }
      }
      if (round === 0) {
        // 잡아 둔 주소가 낡았다(보안 표 만료 등) — 자막을 다시 켜서 새 주소로 한 번 더.
        urls = await ytCaptureTimedtext(id, d, true);
        if (d !== dub) return null;
      }
    }
    const withPot = urls.filter((u) => /[?&]pot=./.test(u)).length;
    d.status =
      '자막을 받지 못했습니다' +
      (d.why ? ` — ${d.why}` : urls.length ? ` — 잡은 주소 ${urls.length}개(보안 표 ${withPot}개)가 모두 빈 답` : '');
    return null;
  }

  function ytMountButton() {
    if (!/^\/watch/.test(location.pathname)) return;
    const bar = document.querySelector(`${RC.youtube.player} ${RC.youtube.rightControls}`);
    if (!bar || bar.querySelector('.lzk-dub-btn')) return;
    const b = markNoTranslate(document.createElement('button'));
    b.className = 'ytp-button lzk-dub-btn';
    b.title = '한국어 자막 · 더빙';
    b.textContent = '한';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      dubTogglePanel(document.querySelector(`${RC.youtube.player} video`), b);
    });
    bar.prepend(b);
    dubSyncButton();
  }

  // 영상이 바뀌면: 손으로 켜 두었으면 이어서, 아니면 '외국어 영상은 자동' 일 때 저절로.
  function ytOnNavigate(tries = 0) {
    const id = ytVideoId();
    const keep = dubWanted;
    if (dub && dub.videoId !== id) dubStop();
    dubWanted = keep && !!id;
    if (!id || dub) return;
    const v = ytVideo();
    if (!v) {
      // 넘긴 바로 뒤라 새 쇼츠의 플레이어가 아직 없다 — 0.3초 뒤 다시(3초까지).
      if (tries < 10) setTimeout(() => ytVideoId() === id && ytOnNavigate(tries + 1), 300);
      return;
    }
    if (dubWanted) dubStart(v);
    else if (dubCfg.autoSubs && dubAutoTried !== id) {
      dubAutoTried = id; // 한 영상에 한 번만 — 손으로 끈 뒤 다시 켜지지 않게
      dubStart(v, true);
    }
  }

  function ytDubInit() {
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.name.includes('/api/timedtext')) continue;
          // 보안 표(pot)가 없는 주소는 빈 답이 오기도 하지만, 로그인 등에 따라 다를 수 있어 다 모으고 받을 때 고른다.
          const v = new URL(e.name).searchParams.get('v');
          if (!v) continue;
          const list2 = ytTimedtext.get(v) || [];
          if (!list2.includes(e.name)) list2.push(e.name);
          ytTimedtext.set(v, list2.slice(-6));
        }
      }).observe({ type: 'resource', buffered: true });
    } catch {
      /* 옛 브라우저 */
    }
    ytMountButton();
    setInterval(ytMountButton, 1500);
    document.addEventListener('yt-navigate-finish', () => setTimeout(ytOnNavigate, 800));
    setTimeout(ytOnNavigate, 2500); // 처음 열린 영상(이미 켜져 있으면 두 번 켜지 않는다)
    // 쇼츠는 넘길 때 주소만 바뀌기도 한다 — 영상 id 가 바뀌었는지 0.3초마다 본다(1초마다 + 0.8초 기다림이던 것을
    // 줄였다 — 사용자 2026-11-02: 쇼츠 자막이 늦다. 플레이어가 새 쇼츠로 바뀌기를 기다리는 것은 ytCaptureTimedtext 가 한다).
    let lastId = ytVideoId();
    setInterval(() => {
      const id = ytVideoId();
      if (id === lastId) return;
      lastId = id;
      setTimeout(ytOnNavigate, ytIsShorts() ? 200 : 800);
    }, 300);
  }

  // --- 창: 한국어 자막 켜기·끄기, 목소리(더빙), 자동, 영상 소리·번역 소리, 목소리 고르기 ---
  function dubSyncButton() {
    const on = !!dub;
    document.querySelectorAll('.lzk-dub-btn').forEach((b) => b.toggleAttribute('data-on', on));
    const chipOn = YOUTUBE ? on && dub.video === dubChip?.lzkVideo : dubCfg.pageSubs;
    if (dubChip) dubChip.textContent = chipOn ? '한국어 자막 중' : '한국어 자막';
  }

  function dubStatus() {
    if (!dubPanel) return;
    const st = dubPanel.querySelector('.lzk-dub-status');
    const toggle = dubPanel.querySelector('.lzk-dub-toggle');
    const mine = dub && dub.video === dubPanel.lzkVideo;
    // 유튜브는 영상마다(다음 영상은 dubWanted 로 잇는다), 다른 사이트는 켜 두면 넘겨도 계속.
    const on = YOUTUBE ? mine : dubCfg.pageSubs;
    toggle.textContent = on ? '한국어 자막 끄기' : '한국어 자막 켜기';
    toggle.toggleAttribute('data-on', !!on);
    const cc = dubPanel.querySelector('.lzk-dub-cc');
    if (cc) {
      cc.hidden = !(on && (!mine || dub.failed) && ['ccoff', 'quiet', 'dead'].includes(liveState));
      cc.textContent = liveState === 'dead' ? '크롬 실시간 자막 고치기' : '크롬 실시간 자막 설정 열기';
    }
    // 유튜브에서 자막 파일이 없어 크롬 실시간 자막이 이 영상 위에 나오는 중 — 창에 '꺼짐' 이라고 쓰면 고장처럼 보인다.
    const liveHere = YOUTUBE && !mine && liveFor && liveFor === dubPanel.lzkVideo && ['ok', 'pause'].includes(liveState);
    // 화면에 박힌 자막을 읽어 옮기는 중(hsTick)
    const hsHere = (!mine || dub.failed || dub.asr) && hsOwns(dubPanel.lzkVideo);
    if (!on && !liveHere && !hsHere)
      st.textContent = YOUTUBE ? '꺼짐 — 자막을 미리 받아 한국어로 옮겨 보여 줍니다' : '꺼짐 — 켜 두면 다음 영상으로 넘겨도 계속 한국어 자막';
    else if (hsHere) st.textContent = `화면에 박힌 ${hsLangName(hs.last)} 자막을 읽어 옮기는 중 · ${hs.lines}줄 (번역 도우미)`.replace('  ', ' ');
    else if (!mine || dub.failed) st.textContent = `${mine ? `${dub.status} ` : liveHere ? '자막 파일이 없는 영상 · ' : '켜짐 · '}${liveNote()}`;
    else if (!dub.sentences.length) st.textContent = dub.status;
    else {
      const n = dub.sentences.length;
      const done = dub.sentences.filter((s) => s.ko).length;
      // 30개 언어 모두 이름으로(예전엔 태국어·영어·중국어·일본어만 — 나머지는 'vi' 같은 코드가 보였다).
      const lang = dub.lang ? hsLangName(dub.from || dub.lang) : '?';
      const waiting = dub.translating || dub.sentences.some((s) => !s.ko && !s.tried);
      const mode = dubCfg.voiceOn ? '자막 + 목소리' : '한국어 자막';
      // 목소리로 읽은 문장과 너무 밀려 건너뛴 문장 — 건너뜀이 많으면 '최대 빠르기' 를 올리면 된다.
      const said = dubCfg.voiceOn && dub.spoken ? ` · 읽음 ${dub.spoken}, 건너뜀 ${dub.skipped || 0}` : '';
      st.textContent =
        waiting && done < n
          ? `${lang} → 한국어 번역 중 ${done}/${n}`
          : `${mode} · ${lang} ${n}문장` + (done < n ? ` (못 옮긴 ${n - done})` : '') + (dub.auto ? ' · 자동' : '') + said;
    }
  }

  function dubSyncPanel() {
    if (!dubPanel) return;
    for (const r of dubPanel.querySelectorAll('input[type=range]')) {
      r.value = Math.round(dubCfg[r.dataset.k] * 100);
      r.previousSibling.textContent = `${r.dataset.label} ${r.value}%`;
    }
    for (const c of dubPanel.querySelectorAll('input[type=checkbox]')) c.checked = c.dataset.k === 'chromeTr' ? !!liveCc.tr : !!dubCfg[c.dataset.k];
    dubPanel.querySelector('.lzk-dub-voicebox').hidden = !dubCfg.voiceOn;
  }

  function dubFillVoices() {
    const sel = dubPanel && dubPanel.querySelector('select');
    if (!sel) return;
    sel.textContent = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = '자동 (가장 좋은 것)';
    sel.appendChild(auto);
    for (const v of dubVoices()) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = v.name.replace(/^Microsoft /, '') + (v.localService ? '' : ' (온라인)');
      sel.appendChild(o);
    }
    sel.value = dubVoices().some((v) => v.name === dubCfg.voice) ? dubCfg.voice : '';
  }

  function dubBuildPanel(video) {
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const p = markNoTranslate(el('div', 'lzk-dubpanel'));
    p.lzkVideo = video;
    const head = el('div', 'lzk-dub-head');
    const close = el('button', 'lzk-dub-x', '×');
    close.title = '닫기';
    close.addEventListener('click', () => {
      p.remove();
      dubPanel = null;
    });
    head.append(el('b', '', '한국어 자막 · 더빙'), close);
    const toggle = el('button', 'lzk-dub-toggle');
    toggle.addEventListener('click', () => {
      if (!YOUTUBE) pageSubsSet(!dubCfg.pageSubs, video);
      else if (dub && dub.video === video) dubStop();
      else dubStart(video);
    });
    // 크롬 '실시간 자막' 이 꺼져 있거나 받아 적힌 말이 없을 때만 보인다. 멈췄으면(dead) '고치기' — 껐다 켜 준다.
    const cc = el('button', 'lzk-dub-cc', '크롬 실시간 자막 설정 열기');
    cc.hidden = true;
    cc.addEventListener('click', () => (liveState === 'dead' ? chromeLiveReset() : GM_openInTab(LIVE_SETTINGS)));
    p.append(head, el('div', 'lzk-dub-status'), cc, toggle);
    const check = (text, k, onChange) => {
      const lab = el('label', 'lzk-dub-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.dataset.k = k;
      cb.addEventListener('change', () => {
        if (onChange) onChange(cb.checked);
        else {
          dubCfg[k] = cb.checked;
          saveDubCfg();
        }
      });
      lab.append(cb, document.createTextNode(` ${text}`));
      return lab;
    };
    const range = (label, k, apply, min = 0, max = 100) => {
      const lab = el('label');
      const r = el('input');
      r.type = 'range';
      r.min = String(min);
      r.max = String(max);
      r.step = max > 100 ? '10' : '1';
      r.dataset.k = k;
      r.dataset.label = label;
      r.addEventListener('input', () => {
        dubCfg[k] = r.value / 100;
        lab.firstChild.textContent = `${label} ${r.value}%`;
        if (apply) apply(dubCfg[k]);
      });
      r.addEventListener('change', saveDubCfg);
      lab.append(document.createTextNode(''), r);
      return lab;
    };
    // 목소리(더빙)는 고를 때만. 켜면 영상 소리·번역 소리·목소리 고르기가 보인다.
    const voiceBox = el('div', 'lzk-dub-voicebox');
    const vl = el('label', '', '목소리');
    const sel = el('select');
    sel.addEventListener('change', () => {
      dubCfg.voice = sel.value;
      saveDubCfg();
    });
    vl.appendChild(sel);
    voiceBox.append(
      range('영상 소리', 'videoVol', (v) => {
        if (dub && dub.video === video && dub.ducked) video.volume = v;
      }),
      range('번역 소리', 'dubVol'),
      // 대본이 말소리보다 길 때 얼마나 빨리 읽을지. 높이면 덜 건너뛰지만 알아듣기 어려워진다.
      range('최대 빠르기', 'maxSpeed', null, 100, 250),
      vl
    );
    p.append(
      check('목소리로 읽기 (더빙)', 'voiceOn', (on) => {
        dubSetVoice(on);
        voiceBox.hidden = !on;
      }),
      voiceBox,
      check('화면에 한국어 자막 보이기', 'subs', (on) => {
        dubCfg.subs = on;
        saveDubCfg();
        if (!on) dubShowSub('');
      }),
      range('자막 크기', 'subScale', dubPlaceSub, 50, 150),
      // 크롬 설정의 '실시간 번역'(사용자 2026-11-03: 이 창에서 껐다 켜게). 상태는 도우미가 읽은 크롬 설정(liveCc.tr).
      check("크롬 '실시간 번역' (끄면 한국어 영상엔 자막을 안 띄우고, 외국어는 단어집으로 옮김)", 'chromeTr', chromeLiveTranslate),
      // 다른 사이트는 '한국어 자막 켜기' 자체가 자동(켜 두면 영상마다)이라 따로 두지 않는다.
      ...(YOUTUBE ? [check('외국어 영상은 한국어 자막 자동으로 (한국어 CC 없을 때)', 'autoSubs')] : [])
    );
    // 창 안의 클릭·키가 영상(재생·멈춤, 화살표 = 앞뒤로 감기)으로 새지 않게.
    for (const t of ['click', 'mousedown', 'keydown', 'keyup', 'wheel']) p.addEventListener(t, (e) => e.stopPropagation());
    return p;
  }

  function dubTogglePanel(video, anchor) {
    if (dubPanel && dubPanel.isConnected && dubPanel.lzkVideo === video) {
      dubPanel.remove();
      dubPanel = null;
      return;
    }
    dubPanel?.remove();
    dubPanel = dubBuildPanel(video);
    dubHost(video).appendChild(dubPanel);
    dubFillVoices();
    dubSyncPanel();
    dubStatus();
    const r = anchor.getBoundingClientRect();
    const h = dubPanel.offsetHeight || 300;
    dubPanel.style.left = `${Math.max(8, Math.min(window.innerWidth - 288, r.right - 270))}px`;
    dubPanel.style.top = `${r.top - h - 10 > 8 ? r.top - h - 10 : Math.min(window.innerHeight - h - 8, r.bottom + 8)}px`;
  }

  // 다른 사이트: 영상 위에 마우스를 올리면 '한국어 자막' 단추.
  // 자리(원격 설정 chip.place, 사이트마다 chip.hosts): auto = 영상 왼쪽 밖에 자리가 있으면 거기(릴스·쇼츠처럼 세로
  // 영상 옆이 비어 있는 곳), 없으면 영상 안 왼쪽 위에서 48px 아래. 예전처럼 안쪽 왼쪽 위에 두니 페이스북 릴스의 소리
  // 켜기 단추를 덮어, 소리를 켜려다 우리 창이 열렸다(2026-11-02 진짜 크롬 시험).
  function dubChipPlace(r) {
    const place = RC.chip.hosts[location.hostname] || RC.chip.place;
    const w = dubChip.offsetWidth || 90;
    const h = dubChip.offsetHeight || 26;
    const out = r.left - w - 6;
    if ((place === 'auto' || place === 'outside-left') && out >= 4) return [out, r.top + 8];
    if (place === 'top-left') return [r.left + 8, r.top + 8];
    if (place === 'top-right') return [r.right - w - 8, r.top + 8];
    if (place === 'bottom-left') return [r.left + 8, Math.max(r.top + 8, r.bottom - h - 64)];
    return [r.left + 8, r.top + Math.min(48, Math.max(8, r.height / 2 - h))];
  }

  function dubChipAt(x, y) {
    if (dubChip && dubChip.matches(':hover')) return;
    // 단추가 영상 밖(왼쪽)에 있으면 영상에서 단추로 마우스를 옮기는 사이에도 사라지지 않게 그쪽을 조금 넓혀 본다.
    const pad = (el) => (dubChip && !dubChip.hidden && dubChip.lzkVideo === el ? (dubChip.offsetWidth || 90) + 16 : 0);
    const v = [...document.querySelectorAll('video')].find((el) => {
      if (YOUTUBE && !el.closest(RC.youtube.shortsPlayerAny)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 135 && r.height >= 135 && x >= r.left - pad(el) && x <= r.right && y >= r.top && y <= r.bottom;
    });
    if (!v) {
      if (dubChip) dubChip.hidden = true;
      return;
    }
    if (!dubChip) {
      dubChip = markNoTranslate(document.createElement('button'));
      dubChip.id = 'lzk-dubchip';
      dubChip.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        dubTogglePanel(dubChip.lzkVideo, dubChip);
      });
    }
    dubChip.lzkVideo = v;
    const host = dubHost(v);
    if (dubChip.parentNode !== host) host.appendChild(dubChip);
    dubChip.hidden = false;
    dubSyncButton(); // 글자가 바뀌면 폭도 바뀐다 — 자리를 재기 전에
    const [cx, cy] = dubChipPlace(v.getBoundingClientRect());
    dubChip.style.left = `${Math.round(cx)}px`;
    dubChip.style.top = `${Math.round(cy)}px`;
  }

  // --- 크롬 실시간 자막 → 영상 위 (자막 파일이 없는 영상: 페이스북·틱톡·자막 없는 유튜브) ---
  // 크롬이 소리를 받아 적은 실시간 자막을 번역 도우미(line-helper/LiveCaption.cs)가 용어집 + 번역으로 옮겨
  // 127.0.0.1:38291 에 놓아 둔다. 영상이 재생 중인 보이는 탭이 0.7초마다 가져가 그 영상 위에 유튜브 자막처럼
  // 띄운다(사용자 2026-11-01: 크롬 자막 창 말고 영상에 합쳐서). 그 영상에 우리 자막(자막 파일·유튜브 대본)이
  // 나오고 있으면 쓰지 않는다. 도우미가 없으면 점점 드물게(최대 30초) 묻는다.
  const LIVE_URL = 'http://127.0.0.1:38291/caption';
  const LIVE_MAX_AGE = RC.video.liveMaxAgeMs; // 이만큼 새 말이 없으면 자막을 내린다(원격 설정 video.liveMaxAgeMs)
  // 크롬 자막 창은 말을 문단으로 쌓아 가서(사용자 크롬 2026-11-02: 한 문단이 줄 3~5개) 끝의 두 줄도 길다. 유튜브 자막처럼
  // 끝에서 60자 안쪽만, 문장이나 낱말 경계에서 잘라 보인다.
  const LIVE_MAX_CHARS = RC.video.liveMaxChars; // 원격 설정 video.liveMaxChars
  function liveTail(t) {
    if (t.length <= LIVE_MAX_CHARS) return t;
    const s = t.slice(-LIVE_MAX_CHARS);
    const end = s.search(/[.!?]\s/);
    if (end >= 0 && end < LIVE_MAX_CHARS / 2) return s.slice(end + 1).trim();
    const sp = s.indexOf(' ');
    return sp >= 0 && sp < 15 ? s.slice(sp + 1) : s;
  }
  let liveVideo = null;
  // 묻기 시작한 시각(0 = 쉬는 중). 확장 뒤쪽이 막 깨어나는 사이에 보낸 요청은 답이 영영 안 올 때가 있어(시험 크롬에서
  // 두 번에 한 번 꼴로 이 탭의 실시간 자막이 끝까지 멈췄다), 5초가 지나면 그 요청은 버리고 다시 묻는다.
  let liveBusy = 0;
  let liveSeq = 0;
  let liveFails = 0;
  let liveNext = 0;
  // ok: 띄우는 중, pause: 이 영상에서 자막을 띄우다 말이 멈춤, quiet: 받아 적힌 말 없음, muted: 영상 소리 꺼짐,
  // korean: 한국어 말이라 비워 둠, ccoff: 크롬 설정에서 실시간 자막을 꺼 둠, dead: 크롬 자막 창이 닫혀 받아 적기가 멈춤,
  // off: 도우미에서 꺼 둠, none: 도우미 없음
  let liveState = '';
  let liveCc = {}; // 도우미가 읽은 크롬 설정: lang(받아 적는 언어), tr(크롬 실시간 번역)
  let liveCcHoldUntil = 0;
  let liveDeadHoldUntil = 0; // 방금 고쳤다 — 도우미가 새 자막 창을 다시 볼 때까지(5초마다) 'dead' 를 믿지 않는다

  // 크롬 '실시간 번역'(설정 › 접근성) 켜기·끄기. 확장은 크롬 설정을 바꿀 수 없어 설정 창을 작게 열고 번역 도우미가 그
  // 단추를 눌러 준다(background.js ccTranslate). 도우미가 없거나 몽키면 설정을 열어 직접 누르게 한다.
  async function chromeLiveTranslate(on) {
    const cb = dubPanel && dubPanel.querySelector('input[data-k="chromeTr"]');
    if (cb) cb.disabled = true;
    let r = null;
    try {
      if (typeof GM_chromeLiveTranslate === 'function') r = await GM_chromeLiveTranslate(on);
    } catch {
      r = null;
    }
    if (cb) cb.disabled = false;
    // 누른 뒤 상태(state)가 와야 바꾼 것이다 — 1.28.3 전의 번역 도우미는 이 명령을 모르면서도 ok 만 돌려줘, 크롬 설정은
    // 그대로인데 '껐습니다' 가 떴다(2026-11-03, 도우미가 아직 새 판을 받기 전). 그때는 설정을 열어 직접 누르게 한다.
    const done = r && r.ok && (r.state === 'on' || r.state === 'off');
    if (done) {
      liveCc = { ...liveCc, tr: r.state === 'on' };
      liveCcHoldUntil = Date.now() + 30000;
      toast(on ? "크롬 '실시간 번역' 을 켰습니다 — 크롬이 번역합니다(한국어 영상에도 자막)" : "크롬 '실시간 번역' 을 껐습니다 — 외국어는 단어집으로 옮기고 한국어 영상은 비워 둡니다", 5000);
    } else {
      const why = r && r.ok ? '번역 도우미가 옛 판이라 직접 눌러야 합니다 — 도우미는 6시간 안에 저절로 새 판이 됩니다' : r && r.error;
      GM_openInTab(LIVE_SETTINGS);
      toast(`크롬 설정을 열었습니다 — '실시간 번역' 을 ${on ? '켜' : '꺼'} 주세요${why ? ` (${why})` : ''}`, 7000);
    }
    dubSyncPanel();
    dubStatus();
  }

  // 크롬 '실시간 자막' 껐다 켜기. 크롬은 실시간 자막 창(숨은 창)을 켤 때 한 번 만들고, 그 창이 닫히면 크롬을 다시 켤
  // 때까지 어떤 영상도 받아 적지 않는다(2026-11-03 사용자 크롬 — 창을 닫아도 최소화된 다른 크롬 창 때문에 크롬이 안
  // 꺼져 '다시 켰는데도' 그대로였다). 설정에서 껐다 켜면 그 창이 새로 생긴다 — 번역 도우미가 그 단추를 눌러 준다.
  async function chromeLiveReset() {
    const btn = dubPanel && dubPanel.querySelector('.lzk-dub-cc');
    if (btn) btn.disabled = true;
    let r = null;
    try {
      if (typeof GM_chromeLiveReset === 'function') r = await GM_chromeLiveReset();
    } catch {
      r = null;
    }
    if (btn) btn.disabled = false;
    if (r && r.ok && r.state === 'on') {
      liveDeadHoldUntil = Date.now() + 15000;
      liveSetState('quiet');
      toast("크롬 '실시간 자막' 을 껐다 켰습니다 — 이제 소리가 나는 영상을 다시 받아 적습니다", 5000);
    } else {
      const why = r && r.ok ? '번역 도우미가 옛 판이라 직접 눌러야 합니다 — 도우미는 6시간 안에 저절로 새 판이 됩니다' : r && r.error;
      GM_openInTab(LIVE_SETTINGS);
      toast(`크롬 설정을 열었습니다 — '실시간 자막' 을 껐다가 다시 켜 주세요${why ? ` (${why})` : ''}`, 8000);
    }
    dubStatus();
  }
  let liveHad = false; // 지금 영상에서 자막을 띄운 적이 있다(말이 멈춘 사이를 '받아 적힌 말 없음' 으로 알리지 않게)
  const LIVE_SETTINGS = 'chrome://settings/accessibility';
  // 크롬 실시간 자막이 꺼져 있으면 탭마다 한 번, 재생 중인 영상 아래에 잠깐 알린다(창을 열지 않아도 보이게).
  // (1.27.5 의 '크롬이 한국어로 듣는 중' 안내는 뺐다 — 크롬 156 은 받아 적는 언어를 스스로 알아내서(사용자 2026-11-02
  // 화면: 설정은 한국어인데 '태국어(자동 감지됨)') 틀린 안내가 한국 영상 위에까지 떴다.)
  const LIVE_CC_HINT = "크롬 '실시간 자막' 이 꺼져 있어 한국어 자막을 만들 수 없습니다 — 영상 위 '한국어 자막' 단추 › 크롬 실시간 자막 설정 열기";
  // 페이스북·틱톡은 영상이 소리 꺼진 채로 돈다 — 크롬은 소리 꺼진 영상은 받아 적지 않아, 소리를 켜기 전에는 자막이
  // 없다(2026-11-02 진짜 크롬 시험). 탭마다 한 번, 소리가 꺼져 있는 동안만 영상 위에 알린다.
  const LIVE_MUTED_HINT = '소리를 켜면 한국어 자막이 나옵니다 (크롬은 소리 꺼진 영상은 받아 적지 않습니다)';
  const LIVE_DEAD_HINT = "크롬 실시간 자막이 멈췄습니다 — 영상 위 '한국어 자막' 단추 › 크롬 실시간 자막 고치기";
  let liveHinted = false;
  let liveMutedHinted = false;
  let liveDeadHinted = false;
  let liveHintUntil = 0;
  let liveHintText = '';
  // 자막을 꺼 두었거나 우리 자막이 나오는 영상에서 도우미에게 마지막으로 물은 때(크롬 자막 창 치우기용)
  let liveQuietAt = 0;
  // 지금 재생 중인 영상(과 그 주소), 그 영상이 재생되기 시작한 때 — 넘긴 뒤 앞 영상의 말을 버리는 데 쓴다
  let liveFor = null;
  let liveForSrc = '';
  let liveSince = 0;
  // 넘긴 뒤 처음 받은 도우미 글의 줄들 = 앞 영상의 말. 그 줄과 그 줄을 마저 받아 적은 것은 새 영상에 띄우지 않는다 —
  // 크롬은 앞 영상의 마지막 문장을 넘긴 뒤에야 끝맺어(번역까지) 보내서, 글이 '새로 바뀐' 것처럼 와 새 영상 위에 떴다
  // (사용자 2026-11-21 틱톡: 전 화면의 자막이 나온다). null = 아직 못 받음.
  let liveBase = null;
  // 넘긴 직후 이만큼은 실시간 자막을 띄우지 않는다 — 앞 영상 소리의 마지막 받아 적기가 늦게 온다. 새 영상의 첫 말도
  // 받아 적히기까지 1초는 걸려 잃는 것이 거의 없다.
  const LIVE_SWITCH_GUARD_MS = 1200;
  // 같은 줄을 크롬이 고쳐 쓴 것인가 — 크롬은 줄 끝만 고친다: 빈칸 빼고 같은 앞부분이 짧은 쪽의 60% 이상(6글자 이상).
  const liveSameLine = (a, b) => {
    const x = String(a).replace(/\s+/g, '');
    const y = String(b).replace(/\s+/g, '');
    if (x === y) return true;
    let n = 0;
    while (n < x.length && n < y.length && x[n] === y[n]) n++;
    return n >= 6 && n >= Math.min(x.length, y.length) * 0.6;
  };

  function livePlayingVideo() {
    let best = null;
    let area = 0;
    for (const v of document.querySelectorAll('video')) {
      if (v.paused || v.ended || v.readyState < 2) continue;
      const r = v.getBoundingClientRect();
      if (r.width < 160 || r.height < 120 || r.bottom < 0 || r.top > window.innerHeight) continue;
      if (r.width * r.height > area) {
        area = r.width * r.height;
        best = v;
      }
    }
    return best;
  }

  function liveHide() {
    if (!liveVideo) return;
    liveVideo = null;
    dubShowSub(''); // 우리 자막이 나오는 영상이면 다음 dubTick(0.15초)에 다시 쓴다
  }

  // 이 영상의 자막 자리를 우리 자막이 쓰고 있는가 — 자막을 못 받은 것(failed)은 실시간 자막에 내준다.
  const dubOwns = (v) => !!(dub && !dub.failed && dub.video === v);

  function liveSetState(state) {
    if (state === liveState) return;
    liveState = state;
    dubStatus();
  }

  function liveNote() {
    const why = {
      // 크롬 '실시간 번역' 을 켜 두면 한국 영상도 한국어로 와서 가려낼 수 없다 — 끄면 도우미가 한국어 말은 비워 둔다.
      ok: `크롬 실시간 자막을 한국어로 띄우는 중 (${
        liveCc.tr
          ? "크롬이 번역 중이라 한국어 영상에도 자막이 나옵니다 — 아래 '크롬 실시간 번역' 을 끄면 단어집으로 옮기고 한국어 영상은 비워 둡니다"
          : '단어집 먼저 · 한국 영상은 비워 둠'
      })`,
      korean: '한국어로 말하는 영상이라 자막을 띄우지 않습니다',
      // 크롬은 소리가 꺼진 영상은 받아 적지 않는다(라자다 상품 영상은 소리 꺼진 채로 돈다 — 사용자 2026-11-01).
      muted: '영상 소리가 꺼져 있습니다. 영상의 소리를 켜야 크롬이 말을 받아 적습니다',
      // 크롬 156 은 말의 언어를 스스로 알아낸다(설정의 받아 적는 언어와 상관없이 '태국어(자동 감지됨)' — 사용자
      // 2026-11-02) — 그래서 설정 언어는 말하지 않는다. 진짜 페이스북 릴스에서 말이 잠깐 멈출 때마다 이 글이 떠서
      // 고장처럼 보였다 — 이 영상에서 자막을 띄운 적이 있으면 'pause' 로 알린다.
      pause: '말이 멈춘 사이 — 다시 말하면 자막이 나옵니다',
      quiet: '크롬이 받아 적은 말이 아직 없습니다. 말이 없는(음악만 있는) 영상이거나, 크롬이 그 언어를 받아 적지 못합니다',
      ccoff: "크롬 '실시간 자막' 이 꺼져 있습니다 — 아래 단추로 크롬 설정을 열어 '실시간 자막' 을 켜 주세요",
      dead: "크롬 실시간 자막이 멈췄습니다(크롬의 자막 창이 닫혀 다시 생기지 않음) — 아래 '크롬 실시간 자막 고치기' 를 누르세요",
      off: "번역 도우미 트레이의 '크롬 실시간 자막을 한국어로 덮기' 를 켜 주세요",
      none: '번역 도우미가 꺼져 있습니다',
    }[liveState];
    return ['ok', 'pause', 'ccoff', 'dead', 'korean'].includes(liveState) ? why : `자막 파일이 없는 영상은 크롬 실시간 자막으로${why ? ` — ${why}` : ''}`;
  }

  // 다른 사이트의 '한국어 자막 켜기·끄기' — 영상 하나가 아니라 켜 둔 동안 재생하는 영상마다.
  function pageSubsSet(on, video) {
    dubCfg.pageSubs = on;
    saveDubCfg();
    if (!on) {
      dubStop();
      liveHide();
    } else if (video && [...(video.textTracks || [])].some((t) => t.kind === 'subtitles' || t.kind === 'captions')) dubStart(video);
    dubStatus();
    dubSyncButton();
  }

  function liveTick() {
    const want = YOUTUBE || dubCfg.pageSubs;
    if (!want) liveHide();
    if ((liveBusy && Date.now() - liveBusy < 5000) || document.visibilityState !== 'visible' || Date.now() < liveNext) return;
    const v = livePlayingVideo();
    if (!v) return liveHide();
    // 영상을 넘기면(재생 중인 영상이나 그 주소가 바뀌면) 그 뒤에 새로 받아 적힌 말만 쓴다 — 크롬 자막 창은 앞 영상의
    // 마지막 문장을 들고 있어서 새 영상 위에 6초까지 남았다(사용자 2026-11-02: 쇼츠·페이스북·틱톡에서 내리면 기존
    // 자막이 그대로). 쇼츠·틱톡처럼 <video> 하나에 영상만 바꿔 끼우는 곳도 있어 영상 주소와 페이지 주소까지 본다.
    // 틱톡은 <video> 와 그 주소를 다음 영상에 그대로 다시 쓰고, 추천 목록에서는 페이지 주소도 안 바뀐다 — 영상 id 까지 본다.
    const src = `${v.currentSrc}|${location.pathname}|${ttItemId(v)}`;
    if (v !== liveFor || src !== liveForSrc) {
      liveFor = v;
      liveForSrc = src;
      liveSince = Date.now();
      liveHad = false;
      liveBase = null;
      liveHide();
    }
    // 자막을 꺼 두었거나 우리 자막(자막 파일)이 나오는 영상도 5초마다 묻기는 한다 — 확장이 묻는 동안 도우미가 크롬
    // 자막 창(검은 상자)을 화면 밖으로 치워 둔다(사용자 2026-11-02: 쇼츠·페이스북에서 그 창이 댓글을 가려 불편). 답은 안 쓴다.
    if (YOUTUBE) ytLearnSpoken();
    const korean = ytKoreanVideo();
    // 화면에 박힌 자막을 읽어 옮기는 영상이면 그쪽이 정확하다(타이밍·글자 모두) — 실시간 자막은 띄우지 않는다.
    const quiet = !want || dubOwns(v) || korean || hsOwns(v);
    if (quiet) {
      if (want) liveVideo = null;
      if (korean) {
        liveHide();
        liveSetState('korean');
      }
      if (Date.now() - liveQuietAt < 5000) return;
      liveQuietAt = Date.now();
    }
    liveBusy = Date.now();
    const seq = ++liveSeq;
    const done = (text, state) => {
      if (seq !== liveSeq) return; // 버린 요청의 늦은 답
      liveBusy = 0;
      if (quiet) return;
      if (text) liveHad = true;
      liveSetState(state === 'quiet' && liveHad ? 'pause' : state);
      if (dubOwns(v) || hsOwns(v) || (!YOUTUBE && !dubCfg.pageSubs)) return;
      if (!liveHinted && state === 'ccoff') {
        liveHinted = true;
        liveHintUntil = Date.now() + 9000;
        liveHintText = LIVE_CC_HINT;
      } else if (!liveDeadHinted && state === 'dead') {
        liveDeadHinted = true;
        liveHintUntil = Date.now() + 9000;
        liveHintText = LIVE_DEAD_HINT;
      } else if (!liveMutedHinted && state === 'muted') {
        liveMutedHinted = true;
        liveHintUntil = Date.now() + 7000;
        liveHintText = LIVE_MUTED_HINT;
      }
      if (liveHintText === LIVE_MUTED_HINT && state !== 'muted') liveHintUntil = 0; // 소리를 켰다 — 안내를 거둔다
      if (Date.now() < liveHintUntil) text = liveHintText;
      if (!text) return liveHide();
      liveVideo = v;
      dubShowSub(text);
      dubPlaceSub(v);
    };
    const fail = () => {
      liveFails++;
      hsHelperOk = false;
      // 도우미가 답하지 않는다(꺼졌다) — 확장이면 '크롬과 함께 켜기' 설정에 따라 다시 켜 달라고 한다(1분에 한 번).
      if (typeof GM_helperAutoStart === 'function') GM_helperAutoStart();
      liveNext = Date.now() + Math.min(30000, 1500 * liveFails);
      done('', 'none');
    };
    GM_xmlhttpRequest({
      method: 'GET',
      url: LIVE_URL,
      timeout: 1500,
      onload: (r) => {
        liveFails = 0;
        let j = null;
        try {
          j = JSON.parse(r.responseText);
        } catch {
          j = null;
        }
        hsHelperOk = !!(j && j.ocr); // 화면 자막 그림을 읽는 도우미(1.32.0 과 함께 나온 판)
        // 이 영상을 틀고 나서 바뀐 말 중 앞 영상의 줄(liveBase)이 아닌 것만.
        let lines = String((j && j.text) || '').split('\n').map((l) => l.trim()).filter(Boolean);
        if (liveBase === null) liveBase = lines.slice();
        else lines = lines.filter((l) => !liveBase.some((b) => liveSameLine(b, l)));
        const since = Date.now() - liveSince;
        const fresh = j && j.on && j.age < LIVE_MAX_AGE && j.age < since && since > LIVE_SWITCH_GUARD_MS;
        const text = fresh ? liveTail(lines.slice(-2).join(' ')) : '';
        if (j && Date.now() < liveCcHoldUntil) j.ccTr = liveCc.tr; // 방금 창에서 바꿨다 — 크롬이 설정 파일을 쓰기까지
        if (j && Date.now() < liveDeadHoldUntil) j.dead = false;
        if (j && (j.ccLang || '') + !!j.ccTr !== (liveCc.lang || '') + !!liveCc.tr) {
          liveCc = { lang: j.ccLang || '', tr: !!j.ccTr };
          dubStatus();
          dubSyncPanel();
        }
        // dead 는 소리를 켜도 소용없어 muted 보다 먼저 알린다.
        done(text, !j ? 'none' : !j.on ? 'off' : text ? 'ok' : j.ko ? 'korean' : j.cc === 'off' ? 'ccoff' : j.dead ? 'dead' : v.muted || v.volume === 0 ? 'muted' : 'quiet');
      },
      onerror: fail,
      ontimeout: fail,
    });
  }

  // --- 화면에 박힌 자막(하드 자막) → 영상 위 한국어 ---
  // 사용자(2026-11-18, 중국 드라마 vrGIeGBPXwc '자막이 너무 맞지 않아서 보기 힘들어요'): 자막 파일이 없는 영상은 크롬
  // 실시간 자막(소리 → 받아 적기 → 번역)이라 한 문장씩 늦게 나와 화면의 중국어 자막과 엇갈렸다. 중국 드라마는 거의 다
  // 중국어 자막이 화면에 박혀 있어, 그 줄을 읽으면 글자도 타이밍도 원본 그대로다.
  // 영상 아래쪽(hsTop~끝)을 hsEveryMs 마다 영상 높이 360 으로 줄여 보고, '획'(밝은 무채색이 짧게 이어지고 양 끝이 어두운
  // 테두리)이 몰린 가운데 줄을 찾는다. 같은 줄이 두 번 이어 보이면 원본 크기로 잘라 번역 도우미(POST 127.0.0.1:38291/ocr,
  // engine.js hardsub — 흑백으로 바꿔 Tesseract 간체·번체)에 읽히고, 옮겨서 그 줄 바로 위에 띄운다. 줄이 바뀌면 바로
  // 내리고 새 줄을 읽는다. 한 영상에서 자막을 두 번(아주 또렷하면 한 번) 읽어 내면 그 영상은 이쪽이 맡고 실시간 자막은 쉰다.
  // 시험(드라마 5개 64장): 자막 27줄 모두 찾음, 잘못 찾은 3곳은 읽기에서 걸러짐, 읽기 21/25줄 정확(글자 오류 4.7%).
  const HS_URL = 'http://127.0.0.1:38291/ocr';
  const HS_GW = 48;
  const HS_GH = 6;
  let hsHelperOk = false; // liveTick 이 도우미 답(ocr: 1)으로 정한다 — 옛 도우미·도우미 없음이면 묻지 않는다
  let hs = null; // 지금 영상: { v, key, on, hits, lines, seen(지금 화면의 줄), cand, same, read(읽은 줄), busy, showing }
  let hsCv = null;
  let hsG = null;
  let hsNext = 0;
  let hsFails = 0;
  const hsOwns = (v) => !!(hs && hs.on && hs.v === v);
  const HS_CJK = /[㐀-鿿豈-﫿]/g;

  // 띠(px, w×h — 영상 높이 360 기준)에서 자막 줄 상자 { x, y, w, h, sig } 또는 null.
  // 노란 자막(예능·중국 드라마·동남아 영상에 흔하다): 빨강·초록이 높고 파랑이 낮으며 초록이 빨강의 70% 넘게(주황·피부색은 아님).
  // 흰 자막처럼 밝은 글자로 본다(1.35.6 — 전에는 흰색·회색만 글자라 노란 자막 94줄 중 5줄만 찾았다). 번역 도우미 엔진도 같은 꼴.
  const hsYellow = (r, g, b) => r >= 170 && g >= 140 && b <= g - 50 && g >= r * 0.7;
  function hsFind(px, w, h) {
    const n = w * h;
    const lum = new Uint8Array(n);
    const ok = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = px[p];
      const g = px[p + 1];
      const b = px[p + 2];
      const l = (r * 299 + g * 587 + b * 114) / 1000;
      lum[i] = l;
      ok[i] = l >= 170 && (Math.max(r, g, b) - Math.min(r, g, b) <= 70 || hsYellow(r, g, b)) ? 1 : 0;
    }
    // 가로로만 본다(줄 찾기에는 충분하고 절반 빠르다). 획 두께 한계 10(영상 높이의 2.8%), 테두리 3화소 안.
    const ink = new Uint8Array(n);
    const rows = new Uint16Array(h);
    const x0 = Math.floor(w * 0.08);
    const x1 = Math.ceil(w * 0.92);
    for (let y = 0; y < h; y++) {
      const s = y * w;
      let a = -1;
      for (let x = 0; x <= w; x++) {
        const on = x < w && ok[s + x];
        if (on && a < 0) a = x;
        if (on || a < 0) continue;
        if (x - a <= 10) {
          let peak = 0;
          for (let t = a; t < x; t++) if (lum[s + t] > peak) peak = lum[s + t];
          const lim = peak - 70;
          let L = false;
          let R = false;
          for (let d = 1; d <= 3 && !L; d++) if (a - d >= 0 && lum[s + a - d] <= lim) L = true;
          for (let d = 0; d < 3 && !R; d++) if (x + d < w && lum[s + x + d] <= lim) R = true;
          if (L && R) {
            ink.fill(1, s + a, s + x);
            if (a >= x0 && x <= x1) rows[y]++;
          }
        }
        a = -1;
      }
    }
    let peak = 0;
    for (let y = 0; y < h; y++) if (rows[y] > peak) peak = rows[y];
    if (peak < RC.video.hsMinPeak) return null;
    // 획 토막이 많은 줄들(빈 줄 둘까지는 잇는다), 높이 7~40(영상 높이의 2~11%). 로마자 자막은 획이 몰린 띠가 x 높이(글자
    // 크기의 절반쯤)뿐이라 작은 글씨는 7 화소까지 본다.
    const thr = Math.max(3, Math.round(peak * 0.3));
    const lines = [];
    let s0 = -1;
    let gap = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && rows[y] >= thr) {
        if (s0 < 0) s0 = y;
        gap = 0;
      } else if (s0 >= 0 && (++gap > 2 || y === h)) {
        const e = y - gap + 1;
        if (e - s0 >= 7 && e - s0 <= 40) lines.push([s0, e]);
        s0 = -1;
        gap = 0;
      }
    }
    if (!lines.length) return null;
    const score = ([a, b]) => rows.slice(a, b).reduce((x, y) => x + y, 0);
    const sc = lines.map(score);
    let bi = 0;
    lines.forEach((l, i) => sc[i] > sc[bi] && (bi = i));
    const used = new Set();
    const main = hsLineBox(w, h, lum, ok, ink, lines, bi, used);
    if (!main) return null;
    // 위·아래에 따로 선 다른 자막 줄(중국 드라마의 '중국어 줄 + 아래 영어 줄' — 두 줄은 따로 나왔다 따로 사라진다). 어느 줄을
    // 읽을지는 hsTick 이 고른다: 획이 가장 많은 줄만 보면 두 줄이 장면마다 번갈아 뽑혀 같은 줄을 두 번 보지 못했다
    // (사용자 2026-11-20 M_rR7v-_wNc — 60초에 번역이 4초만 보였다).
    main.alts = [];
    for (const i of lines.map((_, i) => i).sort((p, q) => sc[q] - sc[p])) {
      if (used.has(i) || main.alts.length >= 2) continue;
      const lh = lines[i][1] - lines[i][0];
      if (Math.min(Math.abs(lines[i][0] - main.cb), Math.abs(main.ct - lines[i][1])) > 2.5 * Math.max(lh, main.lc)) continue;
      const g = hsLineBox(w, h, lum, ok, ink, lines, i, used);
      if (g) main.alts.push(g);
    }
    return main;
  }

  // 띠 줄 lines[seed] 에서 시작한 자막 줄 상자 { x, y, w, h, n, ct, cb, ch, lc, sig } 또는 null. used 에 쓴 띠 줄을 적는다.
  function hsLineBox(w, h, lum, ok, ink, lines, seed, used) {
    // 두 줄 자막: 띠(획이 몰린 줄) 높이가 비슷하고(0.55~1.8배) 띠 높이의 2배 안에 있는 위·아래 줄. 로마자는 띠가 x 높이(글자
    // 크기의 절반쯤)뿐이라 두 줄의 띠 사이가 띠 높이의 1.6배쯤 된다 — 전처럼 0.8배로는 영어·스페인어·러시아어·태국어 두 줄
    // 자막이 모두 윗줄만 잡혔다(2026-11-19 30개 언어 시험). 중국 드라마의 '중국어 줄 + 아래 영어 줄' 은 띠 높이가 절반쯤이라
    // 따로 둔다(묶으면 간체 인식기가 영어 줄까지 읽어 뒤범벅이 된다).
    const cores = [lines[seed]];
    used.add(seed);
    const hb = lines[seed][1] - lines[seed][0];
    // 0.55~1.8 — 태국어 줄의 띠(몸통)는 같은 크기 한자 줄 띠의 0.6 쯤이라 0.7 로는 '태국어 + 중국어' 두 언어 자막이 장면마다
    // 묶였다 떨어졌다 해서(상자가 흔들려) 번역을 거의 띄우지 못했다. 중국어 줄 아래 영어 줄(x 높이)은 0.4 아래라 그대로 따로.
    const like = (k) => !used.has(k) && (lines[k][1] - lines[k][0]) / hb >= 0.55 && (lines[k][1] - lines[k][0]) / hb <= 1.8;
    let ctop = lines[seed][0];
    let cbot = lines[seed][1];
    for (let k = seed - 1; k >= 0 && ctop - lines[k][1] <= hb * 2 && like(k); k--) {
      ctop = lines[k][0];
      cores.push(lines[k]);
      used.add(k);
    }
    for (let k = seed + 1; k < lines.length && lines[k][0] - cbot <= hb * 2 && like(k); k++) {
      cbot = lines[k][1];
      cores.push(lines[k]);
      used.add(k);
    }
    const nl = cores.length; // 글줄 수
    const lhc = Math.max(...cores.map(([a, b]) => b - a)); // 띠 한 줄 높이
    const ch = cores.reduce((s, [a, b]) => s + b - a, 0);
    let top = ctop;
    let bot = cbot;
    // 줄 안에서는 세로로도 본다(작은 구역이라 싸다). 三·二·一 처럼 가로획뿐인 글자는 가로로 보면 긴 밝은 토막이라 획으로
    // 치지 않아, 줄 앞의 '三号 二号' 가 잘려 '号交替跟踪目标车辆' 만 읽혔다(사용자 캡처 2026-11-19).
    const ya = Math.max(0, top - 3);
    const yb = Math.min(h, bot + 3);
    for (let x = 0; x < w; x++) {
      let a = -1;
      for (let y = ya; y <= yb; y++) {
        const on = y < yb && ok[y * w + x];
        if (on && a < 0) a = y;
        if (on || a < 0) continue;
        if (y - a <= 10) {
          let pk = 0;
          for (let t = a; t < y; t++) if (lum[t * w + x] > pk) pk = lum[t * w + x];
          const lim = pk - 70;
          let U = false;
          let D = false;
          for (let d = 1; d <= 3 && !U; d++) if (a - d >= 0 && lum[(a - d) * w + x] <= lim) U = true;
          for (let d = 0; d < 3 && !D; d++) if (y + d < h && lum[(y + d) * w + x] <= lim) D = true;
          if (U && D) for (let t = Math.max(a, top); t < Math.min(y, bot); t++) ink[t * w + x] = 1;
        }
        a = -1;
      }
    }
    const cols = new Uint16Array(w);
    for (const [a, b] of cores) for (let y = a; y < b; y++) for (let x = 0; x < w; x++) cols[x] += ink[y * w + x];
    // 가로 덩어리(글자 높이 2.2배 넘는 빈 틈에서 끊는다) 중 획이 가장 많은 것 — 띄어 쓴 자막('三号 二号 交替…',
    // '为你生 为你爱')도 하나로. 1.5배로는 구절 사이 빈칸(한 글자 + 양쪽 여백)에서 끊겨 앞 구절이 빠졌다.
    let best = null;
    let cs = -1;
    let cg = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && cols[x] > 0) {
        if (cs < 0) cs = x;
        cg = 0;
      } else if (cs >= 0 && (++cg > lhc * 2.2 || x === w)) {
        const b = x - cg + 1;
        let m = 0;
        for (let t = cs; t < b; t++) m += cols[t];
        if (!best || m > best.n) best = { a: cs, b, n: m };
        cs = -1;
        cg = 0;
      }
    }
    if (!best) return null;
    const bw = best.b - best.a;
    const fill = best.n / (bw * ch);
    if (bw < lhc * 1.5 || fill < 0.05 || fill > 0.6 || Math.abs((best.a + best.b) / 2 - w / 2) > w * 0.16) return null;
    // 띠 위·아래의 획이 드문 줄(로마자 b·d·g·p, 태국어·힌디어·크메르어의 위아래 부호)까지 늘린다 — 띠만 자르면 위아래가
    // 잘린다. 자막의 가로 범위 안 획만 센다: 화면 전체로 세면 배경(흰 옷·창틀)의 획을 따라 띠 높이만큼 늘어나, 중국어
    // 자막 위에 배경이 붙어 읽기가 망가졌다(정확 22 → 20줄). 띠 한 줄의 평균 획 양의 6% 넘는 줄까지, 띠 높이의 0.9배까지.
    let inkSum = 0;
    for (const [a, b] of cores) for (let y = a; y < b; y++) for (let x = best.a; x < best.b; x++) inkSum += ink[y * w + x];
    const minRow = Math.max(2, (inkSum / ch) * 0.06);
    const inRow = (y) => {
      let m = 0;
      for (let x = best.a; x < best.b; x++) m += ink[y * w + x];
      return m;
    };
    while (top > 0 && ctop - top < lhc * 0.9 && inRow(top - 1) >= minRow) top--;
    while (bot < h && bot - cbot < lhc * 0.9 && inRow(bot) >= minRow) bot++;
    const lh = bot - top;
    // 모양 지문(48×6 칸) — 줄이 바뀌었는지 견준다. 띠(획이 몰린 줄)에서 뜬다 — 위아래로 늘린 높이는 배경에 따라 장면마다
    // 몇 화소씩 흔들려, 그것으로 견주면 베트남어 자막이 늘 '다른 줄' 이 되어 한 줄도 띄우지 못했다(1분에 10줄 읽고 0줄 보임).
    const sig = new Uint8Array(HS_GW * HS_GH);
    const sh = cbot - ctop;
    for (let gy = 0; gy < HS_GH; gy++) {
      const ya = ctop + Math.floor((gy * sh) / HS_GH);
      const yb = Math.max(ya + 1, ctop + Math.floor(((gy + 1) * sh) / HS_GH));
      for (let gx = 0; gx < HS_GW; gx++) {
        const xa = best.a + Math.floor((gx * bw) / HS_GW);
        const xb = Math.max(xa + 1, best.a + Math.floor(((gx + 1) * bw) / HS_GW));
        let m = 0;
        for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) m += ink[y * w + x];
        sig[gy * HS_GW + gx] = m / ((yb - ya) * (xb - xa)) > 0.15 ? 1 : 0;
      }
    }
    return { x: best.a, y: top, w: bw, h: lh, n: nl, ct: ctop, cb: cbot, ch, lc: lhc, sig };
  }

  // 같은 자막 줄인가(자리가 거의 같고 모양 지문이 85% 넘게 같다). 시험(2026-11-18): 같은 줄끼리 0~32칸(짧은 '定有文章'
  // 은 칸이 작아 화질 잡음이 커서 32 — 10% 로는 다른 줄로 보고 다시 읽느라 깜빡였다), 다른 줄은 130칸 넘게 달랐다.
  function hsSame(a, b) {
    if (!a || !b) return false;
    const ay = a.ct != null ? a.ct : a.y; // 띠 위치(늘린 상자 위치는 흔들린다)
    const by = b.ct != null ? b.ct : b.y;
    if (Math.abs(a.x - b.x) > Math.max(6, b.w * 0.08) || Math.abs(a.w - b.w) > Math.max(6, b.w * 0.1) || Math.abs(ay - by) > 4) return false;
    let d = 0;
    for (let i = 0; i < a.sig.length; i++) d += a.sig[i] !== b.sig[i];
    return d <= a.sig.length * 0.15;
  }

  // 영상 아래쪽 띠를 떠서 자막 줄을 찾는다. 다른 곳에서 온 영상(그림을 읽을 수 없음)은 SecurityError 를 던진다.
  function hsGrab(v) {
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return null;
    const top = Math.floor(vh * RC.video.hsTop);
    const k = 360 / vh;
    const w = Math.max(1, Math.round(vw * k));
    const h = Math.max(1, Math.round((vh - top) * k));
    if (!hsCv) {
      hsCv = document.createElement('canvas');
      hsG = hsCv.getContext('2d', { willReadFrequently: true });
    }
    if (hsCv.width !== w || hsCv.height !== h) {
      hsCv.width = w;
      hsCv.height = h;
    }
    hsG.drawImage(v, 0, top, vw, vh - top, 0, 0, w, h);
    const f = hsFind(hsG.getImageData(0, 0, w, h).data, w, h);
    if (!f) return null;
    const put = (g) => ({ ...g, k, top, vw, vh, above: (top + g.y / k) / vh });
    return { ...put(f), alts: (f.alts || []).map(put) };
  }

  // 찾은 줄을 원본 크기로 잘라(줄 높이 72화소 안쪽으로 줄여 — 읽기 시험이 이 크기였다) RGBA 그대로 보낸다.
  // 줄 높이는 획이 몰린 띠(core)로 잰다(두 줄 자막은 줄마다 72). rows = 위아래 부호까지 늘린 줄, core = 띠 —
  // 엔진(번역 도우미)이 한자·가나·한글은 띠만, 다른 글자는 늘린 줄까지 흑백으로 바꿔 읽는다.
  function hsCrop(v, f) {
    const lineH = f.h / f.k;
    const coreH = ((f.cb != null ? f.cb - f.ct : f.h) || 1) / f.k;
    const sc = Math.min(1, (72 * (f.n || 1)) / coreH);
    // 여백은 띠 한 줄 높이의 0.6 — 0.3 으로는 태국어·라오어·크메르어의 위 부호(성조·모음)가 잘렸다.
    const pad = Math.round((coreH / (f.n || 1)) * 0.6);
    const sx = Math.max(0, Math.floor(f.x / f.k) - pad);
    const sy = Math.max(0, f.top + Math.floor(f.y / f.k) - pad);
    const sw = Math.min(f.vw - sx, Math.ceil(f.w / f.k) + 2 * pad);
    const sh = Math.min(f.vh - sy, Math.ceil(lineH) + 2 * pad);
    const W = Math.max(1, Math.round(sw * sc));
    const H = Math.max(1, Math.round(sh * sc));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let bin = '';
    for (let i = 0; i < d.length; i += 32768) bin += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
    const ry = (f.top + Math.floor(f.y / f.k) - sy) * sc;
    const span = (y0, hh) => [Math.max(0, Math.floor(y0) - 2), Math.min(H, Math.ceil(y0 + hh) + 2)];
    const core = f.cb != null ? span((f.top + Math.floor(f.ct / f.k) - sy) * sc, coreH * sc) : null;
    return { w: W, h: H, vh: Math.round(f.vh * sc), rows: span(ry, lineH * sc), core, n: f.n || 1, px: btoa(bin) };
  }

  // 읽은 글이 자막인가. 1.33 도우미는 언어마다 엔진이 가른다(j.ok — 그 언어 글자 비율·확신도·뒤범벅 꼴). 옛 도우미(중국어만):
  // 한자가 둘 넘고 글자·숫자의 80% 넘게 한자, 확신도 40 넘게(자막이 아닌 곳은 0~4, 광고의 한글은 숫자·부스러기가 섞였다).
  function hsAccept(j) {
    if (!j || !j.ocr) return false;
    if (typeof j.ok === 'boolean') return j.ok;
    const t = String(j.text || '');
    const cjk = (t.match(HS_CJK) || []).length;
    const all = (t.match(/[\p{L}\p{N}]/gu) || []).length;
    return cjk >= 2 && cjk >= all * 0.8 && j.conf >= 40;
  }

  // ---- 화면 자막의 언어(2026-11-19, 사용자: '30개 언어 모두 자막이 있으면 중국어 영상과 동일하게') ----
  // 번역 도우미가 읽는 언어(구글 코드) — 내 언어 30개 + 한국어(한국어가 내 언어가 아닌 사람이 보는 한국 영상).
  const HS_LANGS = ['th', 'en', 'zh-CN', 'zh-TW', 'yue', 'ja', 'ko', 'vi', 'id', 'ms', 'tl', 'pt', 'es', 'fr', 'de', 'tr', 'pl',
    'it', 'ru', 'mn', 'ar', 'ur', 'hi', 'mr', 'bn', 'ta', 'te', 'he', 'km', 'lo', 'my'];
  const HS_LATIN = new Set(['en', 'vi', 'id', 'ms', 'tl', 'pt', 'es', 'fr', 'de', 'tr', 'pl', 'it']);
  // 유튜브·구글 코드(zh, zh-Hans, zh-Hant, iw, fil, in, pt-BR, es-419)를 위 코드로. 모르는 언어는 ''.
  function hsNorm(c) {
    const [a, b = ''] = String(c || '').replace('_', '-').split('-');
    const l = a.toLowerCase();
    if (l === 'zh') return /^(tw|hk|mo|hant)$/i.test(b) ? 'zh-TW' : 'zh-CN';
    const x = { iw: 'he', fil: 'tl', in: 'id' }[l] || l;
    return HS_LANGS.includes(x) ? x : '';
  }
  // 내 언어 자막 — 그대로 읽으면 되니 옮기지 않는다. 중국어·광둥어 사용자는 간체·번체·광둥어 자막 모두.
  const hsMine = (l) => !!l && (l === hsNorm(MY) || (/^(zh|yue)/.test(MY2) && /^(zh|yue)/.test(l)));
  const hsLangName = (c) => {
    if (!c) return '';
    if (/^zh|^yue/.test(c)) return c === 'zh-CN' ? '중국어' : c === 'yue' ? '광둥어' : '중국어(번체)';
    try {
      return new Intl.DisplayNames(['ko'], { type: 'language' }).of(c) || c;
    } catch {
      return c;
    }
  };

  // 영상의 화면 자막 언어 후보(번역 도우미가 앞에서부터 읽어 본다, 4개까지):
  //  1) 제목·채널 이름·태그의 글자 — 많은 글자 둘까지. 태국·가나·한글·크메르… 는 글자로 정해지고, 한자는 간체·번체·광둥어를
  //     글자로 가르고, 로마자·키릴·아랍·데바나가리는 구글이 알아본 언어(스페인어·몽골어·우르두어·마라티어 …).
  //  2) 유튜브 자동 자막의 말 언어. 3) config.json hardsub.fallback(중국어·영어 — 제목이 영어인 중국 드라마 등).
  // 번역 자막을 박아 올린 영상(중국 드라마 + 태국어 자막, 태국어 제목)은 제목 언어가 자막 언어라 제목을 먼저 본다.
  const hsGuessMemo = new Map();
  function hsGuessLangs(key) {
    if (hsGuessMemo.has(key)) return hsGuessMemo.get(key);
    const job = (async () => {
      const out = [];
      const add = (c) => {
        const x = hsNorm(c);
        if (x && !out.includes(x)) out.push(x);
      };
      let text = document.title.replace(/\s*[-–]\s*YouTube\s*$/i, '');
      let spoken = '';
      if (YOUTUBE) {
        await ytLearnSpoken().catch(() => {});
        const m = ytMeta.get(ytVideoId());
        if (m) text = [m.title, m.author, ...(m.keywords || []).slice(0, 8)].filter(Boolean).join(' ');
        spoken = ytSpoken.get(ytVideoId()) || '';
      }
      const s = text.replace(CHAT_NOT_WORDS, ' ');
      const SCR = [['th', /[฀-๿]/g], ['ja', /[぀-ヿ]/g], ['ko', /[가-힣]/g], ['he', /[֐-׿]/g], ['bn', /[ঀ-৿]/g], ['te', /[ఀ-౿]/g],
        ['ta', /[஀-௿]/g], ['km', /[ក-៿]/g], ['lo', /[຀-໿]/g], ['my', /[က-႟]/g], ['han', /[一-鿿]/g], ['cyr', /[Ѐ-ӿ]/g],
        ['arab', /[؀-ۿ]/g], ['deva', /[ऀ-ॿ]/g], ['lat', /[A-Za-zÀ-ɏḀ-ỿ]/g]];
      const counts = SCR.map(([c, re]) => [c, (s.match(re) || []).length]).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
      const kana = counts.some(([c]) => c === 'ja');
      for (const [c] of counts.slice(0, 2)) {
        if (c === 'han') add(kana ? 'ja' : chatHanLang(s));
        else if (['cyr', 'arab', 'deva', 'lat'].includes(c)) {
          // 그 글자가 든 낱말만 구글에 — 'EP12 [ENG SUB]' 같은 로마자 꼬리가 몽골어 제목의 언어를 흐리지 않게
          const re = SCR.find((x) => x[0] === c)[1];
          const part = (s.match(new RegExp(`\\S*${re.source}\\S*`, 'g')) || []).join(' ').slice(0, 300);
          const [d] = await detectLangs([part || s.slice(0, 300)]).catch(() => ['']);
          add(hsNorm(d) || { cyr: 'ru', arab: 'ar', deva: 'hi', lat: 'en' }[c]);
        } else add(c);
      }
      add(spoken);
      for (const c of RC.hardsub.fallback) add(c);
      return out.slice(0, 4);
    })();
    hsGuessMemo.set(key, job);
    if (hsGuessMemo.size > 50) hsGuessMemo.delete(hsGuessMemo.keys().next().value);
    return job;
  }

  // 자막 자리 — 줄 아래 끝 높이와 띠(글자 몸통) 높이로 가른다. 중국어 줄과 그 아래 영어 줄은 다른 자리라 읽을 언어를
  // 자리마다 정한다: 영상 하나에 하나로 정하면 영어로 굳은 뒤 중국어 줄을 영어 모델로 읽어 버렸다('TREAT', 빈 글 —
  // 사용자 2026-11-20 M_rR7v-_wNc).
  function hsSlot(st, f, make = true) {
    const lc = f.lc || f.ch / (f.n || 1);
    let s = st.slots.find((x) => Math.abs(x.cb - f.cb) <= Math.max(5, lc * 0.6) && lc < x.lc * 1.5 && x.lc < lc * 1.5);
    if (!s && make) {
      s = { cb: f.cb, lc, lang: '', votes: {}, bad: 0, n: 0, ok: 0, conf: 0 };
      st.slots.push(s);
      if (st.slots.length > 4) st.slots.shift();
    }
    return s;
  }

  // 자리의 읽기 성적(읽어 낸 비율 × 평균 확신도). 두 번 넘게 읽어 본 자리만 — 모르는 자리는 60 으로 쳐서 한 번은 읽어 본다.
  function hsSlotScore(st, f) {
    const s = hsSlot(st, f, false);
    return s && s.n >= 2 ? (s.ok ? s.conf / s.ok : 0) * (s.ok / s.n) : 60;
  }

  // 화면 자막 한 줄 옮기기. 한 줄이라 설정(translate.order)의 차례대로 gtx 주소부터 묻는다 — 처음 보는 문장을 옮기는 데
  // gtx 는 0.4~0.6초, translateToKorean 이 먼저 쓰는 dict-chrome-ex(여러 줄 묶음용)는 0.9~1.5초였다(2026-11-20 잰 값).
  // 드라마 자막은 1~2초면 바뀌어, 그 1초 때문에 번역이 줄이 사라진 뒤에 와서 아예 못 보이는 일이 많았다.
  async function hsTranslate(text, from, lang = from) {
    text = subPrep(text, lang); // 속어·욕·상표·글자 인식 실수를 구글이 아는 말로(아래 SUB_PREP)
    if (MY_KO && usesAI(cfg.pageEngine) && aiKey()) return (await translateToKorean([text], from))[0] || '';
    const hit = cacheGet(text, MY);
    if (hit) return hit;
    const out = (await freeRaw(text, from, MY, 5000)).trim();
    if (out && out !== text) cacheSet(text, MY, out);
    return out;
  }

  async function hsRead(st, f) {
    let crop;
    try {
      crop = hsCrop(st.v, f);
    } catch {
      return;
    }
    st.busy = true;
    st.readAt = Date.now();
    const failed = () => {
      st.busy = false;
      hsFails++;
      hsNext = Date.now() + Math.min(30000, 2000 * hsFails);
    };
    const sl = hsSlot(st, f);
    // 그 자리의 언어가 정해졌으면 그 언어만, 아니면 영상으로 가늠한 후보(처음 한 번 — 제목 언어를 구글에 묻느라 조금
    // 걸린다). 다른 자리가 정한 언어는 뒤로 — 중국어 줄이 중국어로 정해졌으면 아래 줄은 다른 후보부터 읽어 본다.
    if (!st.cands) st.cands = await hsGuessLangs(st.key).catch(() => [...RC.hardsub.fallback]);
    const taken = st.slots.filter((x) => x !== sl && x.lang).map((x) => x.lang);
    crop.langs = sl.lang ? [sl.lang] : [...st.cands.filter((c) => !taken.includes(c)), ...st.cands.filter((c) => taken.includes(c))];
    GM_xmlhttpRequest({
      method: 'POST',
      url: HS_URL,
      data: JSON.stringify(crop),
      headers: { 'Content-Type': 'text/plain' },
      timeout: 8000,
      onload: async (r) => {
        let j = null;
        try {
          j = JSON.parse(r.responseText);
        } catch {
          j = null;
        }
        if (!j || !j.ocr) return failed();
        hsFails = 0;
        let good = hsAccept(j);
        sl.n++;
        if (good) {
          sl.ok++;
          sl.conf += +j.conf || 0;
        }
        let ko = '';
        if (good) {
          // 언어 정하기: 같은 언어로 두 번 읽히면 그 언어만 읽는다. 로마자 언어는 구글이 알아본 언어를 믿는다 — 제목이 영어인
          // 스페인어 영상을 영어 모델로 읽어도(악센트 빠짐) 다음 줄부터 스페인어 모델로 읽는다. 옛 도우미는 j.lang 이 zh-*.
          let from = hsNorm(j.lang) || 'zh-CN';
          if (!sl.lang && HS_LATIN.has(from) && st.detects < 3) {
            st.detects++;
            const [d] = await detectLangs([j.text]).catch(() => ['']);
            const dn = hsNorm(d);
            if (dn && HS_LATIN.has(dn)) {
              if (dn !== from) st.cands = [dn, ...(st.cands || []).filter((c) => c !== dn)].slice(0, 4);
              from = dn;
            }
          }
          // 두 번 넘게, 그리고 다른 언어 표의 두 배 넘게 — 한 줄을 엉뚱한 언어로 읽은 것만으로 굳지 않게
          const fam = /^(zh|yue)/.test(from) ? 'zh' : from;
          sl.votes[fam] = (sl.votes[fam] || 0) + 1;
          sl.bad = 0;
          const rival = Math.max(0, ...Object.entries(sl.votes).filter(([k]) => k !== fam).map(([, n]) => n));
          if (!sl.lang && sl.votes[fam] >= 2 && sl.votes[fam] >= rival * 2) sl.lang = from;
          st.last = from;
          if (hsMine(from)) {
            // 내 언어 자막 — 옮길 것이 없다. 두 번이면 이 영상은 더 읽지 않는다.
            good = false;
            if (sl.lang) st.mine = true;
          } else {
            st.hits++;
            st.lines++;
            if (!st.on && (st.hits >= 2 || (j.conf >= 80 && (j.text.match(/\p{L}/gu) || []).length >= 6))) {
              st.on = true;
              if (st.v === liveVideo) liveVideo = null; // 실시간 자막을 띄우던 영상 — 이제 이쪽이 쓴다
              dubStatus();
            }
            try {
              // 로마자 언어는 원문 언어를 알려 준다 — 짧은 줄은 구글이 다른 로마자 언어로 잘못 알아보기도 한다
              ko = await hsTranslate(j.text, HS_LATIN.has(from) ? from : 'auto', from);
            } catch {
              ko = '';
            }
          }
        }
        // 정한 언어로 네 번 이어 못 읽으면(언어를 잘못 정했거나 자막 언어가 바뀌었다) 다시 후보 언어들로 읽는다
        if (!hsAccept(j) && sl.lang && ++sl.bad >= 4) {
          sl.lang = '';
          sl.votes = {};
          sl.bad = 0;
        }
        st.read = { ...f, text: j.text, ko, good };
        st.busy = false;
        if (hs !== st) return;
        // 줄이 번역보다 먼저 사라졌어도(1~2초짜리 자막) 방금까지 보이던 줄이면 띄운다 — hsRender 가 잠깐 더 둔다.
        // 예전에는 늦게 온 번역을 버려서, 짧은 대사가 이어지는 장면은 읽어 놓고도 한 줄도 못 보였다.
        if (good && ko && st.on && !(st.seen && hsSame(st.seen, f)) && Date.now() - st.readAt < 2500) hsShow(st, st.read);
        hsRender();
      },
      onerror: failed,
      ontimeout: failed,
    });
  }

  // 지금 화면의 줄이 읽어 옮긴 줄과 같으면 그 번역을. 줄이 바뀌었거나 사라졌으면 내리되, 띄운 지 얼마 안 된 번역은
  // 조금 더 둔다 — 짧은 자막은 번역이 0.4~1초 늦게 떠서 읽기도 전에 사라졌다(사용자 2026-11-20). 새 번역은 바로 바뀐다.
  function hsRender() {
    const st = hs;
    if (!st) return;
    const r = st.read;
    const now = Date.now();
    if (st.on && st.seen && r && r.good && r.ko && hsSame(st.seen, r)) hsShow(st, r);
    else if (st.showing) {
      const s = st.shown;
      const V = RC.video;
      if (s && st.on && now - st.shownAt < Math.min(V.hsShowMaxMs, V.hsShowMs + V.hsShowCharMs * s.ko.length)) return;
      dubShowSub('');
      st.showing = false;
      st.shown = null;
    }
  }

  function hsShow(st, r) {
    if (st.shown !== r) st.shownAt = Date.now();
    st.shown = r;
    dubShowSub(r.ko);
    dubPlaceSub(st.v, r.above);
    st.showing = true;
  }

  function hsStop() {
    if (hs && hs.showing) dubShowSub('');
    hs = null;
  }

  function hsTick() {
    // 내 언어 자막인 영상은 읽어 보고 알면(hsMine → st.mine) 그 영상만 쉰다(예전에는 중국어 사용자면 늘 껐다).
    if (!RC.video.hsOn || !hsHelperOk || !dubCfg.subs) return hsStop();
    if (document.visibilityState !== 'visible' || Date.now() < hsNext) return;
    let v = livePlayingVideo();
    if (!v && hs && hs.v.isConnected && hs.v.paused && !hs.v.ended) v = hs.v; // 멈춘 동안에는 보이던 번역을 그대로
    if (!(YOUTUBE || dubCfg.pageSubs) || !v) return hsStop();
    if (YOUTUBE && v.closest('.html5-video-player')?.classList.contains(RC.youtube.adShowing)) return hsStop();
    // 자막 파일 자막(dub)이 문장을 가졌으면 그쪽. 아직 받는 중(광고 기다림 등, 문장 0)이면 화면 자막을 먼저 읽는다 —
    // 시험 크롬에서 자막 파일이 없는 이 드라마도 '광고가 끝나면 시작합니다…' 로 10~30초를 붙잡고 있었다.
    // 자동 자막(asr, 기계 받아쓰기)뿐이면 화면 자막도 읽는다 — 있으면 사람이 쓴 그쪽을 보인다(dubTick 이 비켜 준다).
    if ((dubOwns(v) && dub.sentences.length && !dub.asr) || ytKoreanVideo()) return hsStop();
    const key = `${YOUTUBE ? ytVideoId() : v.currentSrc}|${location.pathname}|${ttItemId(v)}`;
    if (!hs || hs.v !== v || hs.key !== key) {
      hsStop();
      hs = { v, key, on: false, hits: 0, lines: 0, ticks: 0, miss: 0, seen: null, cand: null, same: 0, read: null, busy: false, showing: false,
        shown: null, shownAt: 0, slots: [], cands: null, detects: 0, last: '', mine: false };
    }
    const st = hs;
    if (st.tainted || st.mine || v.paused || v.seeking) return hsRender();
    // 2분 넘게 자막을 한 줄도 못 읽은 영상(박힌 자막이 없는 영상)은 2초에 한 번만 본다.
    if (++st.ticks > 120000 / RC.video.hsEveryMs && !st.hits && st.ticks % 8) return;
    let f = null;
    try {
      f = hsGrab(v);
    } catch {
      st.tainted = true; // 다른 곳에서 온 영상 — 그림을 읽을 수 없다
      return;
    }
    if (!f) {
      // 한 번 못 찾은 것은 넘긴다(장면 바뀜·흔들림) — 두 번 이어 없으면 자막이 사라진 것
      if (++st.miss >= 2) {
        st.seen = null;
        st.cand = null;
        st.same = 0;
      }
      return hsRender();
    }
    st.miss = 0;
    if (f.alts.length) {
      // 따로 선 줄이 둘 넘으면(중국어 줄 + 아래 영어 줄) 하나를 꾸준히 따라간다: 번역을 띄운 줄 → 지켜보던 줄 → 새 줄이면
      // 읽기 성적이 좋은 자리의 줄, 같으면 글자 몸통이 작은 줄(로마자 — 영어 인식이 한자보다 훨씬 정확했다: 이 드라마의 가는
      // 한자 글꼴은 '在你哈马的时候' 처럼 자주 틀렸고 영어 줄은 확신도 90~95 로 거의 그대로). 못 읽은 줄은 다른 줄이 있으면 넘긴다.
      const all = [f, ...f.alts];
      const r = st.read;
      const pool = r && !r.good ? all.filter((g) => !hsSame(g, r)) : all;
      const from = pool.length ? pool : all;
      const pick = (a, b) => {
        const d = hsSlotScore(st, b) - hsSlotScore(st, a);
        return d > 5 || (d >= -5 && b.lc < a.lc * 0.8) ? b : a;
      };
      f = (r && r.good && from.find((g) => hsSame(g, r))) || from.find((g) => hsSame(g, st.cand)) || from.reduce(pick);
    }
    st.seen = f;
    if (hsSame(f, st.cand)) st.same++;
    else {
      st.cand = f;
      st.same = 1;
    }
    if (st.same >= 2 && !st.busy && !(st.read && hsSame(f, st.read))) hsRead(st, f);
    hsRender();
  }

  function videoDubInit() {
    setInterval(liveTick, 700);
    if (TIKTOK) {
      ttListen();
      setInterval(ttTick, 300);
    }
    setInterval(hsTick, RC.video.hsEveryMs);
    // 넘기면 앞 영상이 멈춘다 — 다음 liveTick(0.7초)을 기다리지 않고 그 영상의 실시간 자막을 바로 내린다.
    document.addEventListener('pause', (e) => e.target === liveVideo && liveHide(), true);
    try {
      speechSynthesis.getVoices(); // 목록을 미리 불러 둔다
      speechSynthesis.addEventListener('voiceschanged', dubFillVoices);
    } catch {
      /* 목소리를 못 쓰는 브라우저 — 자막만 */
    }
    document.addEventListener('fullscreenchange', () => {
      dubPanel?.remove();
      dubPanel = null;
      dubPlaceSub();
    });
    // 사이트의 소리 막대·음소거 단추를 직접 만졌는지 — 누른 것과 그 위 두 겹만 본다. 유튜브 새 플레이어는
    // 플레이어 전체에 ytp-delhi-horizontal-volume-controls 를 달아 두어, 조상을 다 보면 '한' 단추를 누른 것까지
    // 소리를 만진 것으로 잘못 알았다(유튜브가 되돌린 100% 를 사용자 값으로 저장했다).
    const volumeish = (el) => {
      if (el && el.closest && el.closest('.lzk-dubpanel, .lzk-dub-btn, #lzk-dubchip')) return false;
      for (let i = 0; el && i < 3; i++, el = el.parentElement) {
        const cls = typeof el.className === 'string' ? el.className : '';
        if (/volume|mute/i.test(`${cls} ${(el.getAttribute && el.getAttribute('aria-label')) || ''}`)) return true;
      }
      return false;
    };
    const touched = (e) => {
      const t = e.target;
      const onBar = volumeish(t);
      const key = e.type === 'keydown' && /^(ArrowUp|ArrowDown|m|M)$/.test(e.key) && !(t && t.closest && t.closest('input, textarea, [contenteditable]'));
      if (onBar || key) dubVolumeTouchedAt = Date.now();
    };
    for (const type of ['pointerdown', 'wheel', 'keydown', 'input']) document.addEventListener(type, touched, { capture: true, passive: true });
    // 영상 위 '한국어 자막' 단추 — 유튜브는 쇼츠에만(보통 영상은 플레이어 단추, 목록의 미리보기 영상에는 안 단다).
    let last = 0;
    document.addEventListener(
      'mousemove',
      (e) => {
        const now = Date.now();
        if (now - last < 250) return;
        last = now;
        dubChipAt(e.clientX, e.clientY);
      },
      { passive: true, capture: true }
    );
    if (YOUTUBE) return ytDubInit();
    // 한국어 자막을 켜 둔 동안(pageSubs) 영상을 틀면: 앞 영상(넘겨서 멈췄거나 화면 밖)의 자막은 끄고, 새 영상에
    // 자막 트랙이 있으면 그것을 한국어로(한국어 트랙이 있으면 그대로 둔다). 트랙이 없는 영상은 liveTick 이
    // 크롬 실시간 자막으로 덮는다. 사용자(2026-11-01): 페이스북 릴스를 넘길 때마다 꺼져서 다시 켜야 했다.
    document.addEventListener(
      'play',
      (e) => {
        const v = e.target;
        if (!dubCfg.pageSubs || !(v instanceof HTMLVideoElement)) return;
        const r = v.getBoundingClientRect();
        if (r.width < 240 || r.height < 135) return;
        if (dub && dub.video !== v) {
          const o = dub.video;
          const or = o.getBoundingClientRect();
          if (!o.isConnected || o.paused || o.ended || or.bottom < 0 || or.top > window.innerHeight) dubStop();
        }
        if (dub) return;
        const tracks = [...v.textTracks].filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
        // 내 언어 자막이 이미 있는 영상은 저절로 켜지 않는다(사이트 자막으로 보면 된다) — 한국어 사용자면 한국어(예전 그대로).
        if (!tracks.length || tracks.some((t) => YT_MY_RE.test(t.language || ''))) return;
        dubStart(v, true);
      },
      true
    );
  }

  // ---------------------------------------------------------------------------
  // 페이스북 메신저 (messenger.com) — 외국 사람과의 대화를 양쪽으로 옮긴다(1.30.0 부터 태국어만이 아니라 모든 언어)
  //
  //  - 내 말이 아닌 말풍선 밑에 내 언어(한국어) 뜻을 작게 붙인다(내가 보낸 외국어도 — 되옮긴 뜻으로 확인).
  //  - 입력칸에 한국어를 치고 Enter 한 번 → 상대가 쓰는 언어(태국어·영어·일본어·베트남어 …)로 바꿔 바로 보낸다.
  //    외국어를 못 읽으니 확인용 Enter 는 쓸모가 없다(사용자 요청). 뜻은 보낸 말풍선 밑의 한국어로 확인한다.
  // 한국 사람과의 대화도 같은 메신저에서 한다. 그래서 대화방마다 상대가 어떤 언어를 쓰는지 보고
  // 켠다. 입력칸 위 칩을 누르면 그 대화방만 직접 켜고 끌 수 있고, '한' 옆 '번역' 막대에서 언어를 고를 수 있다(기억해 둔다).
  // 태국어 말투 다듬기(호칭·끝말·표)는 태국어에만 쓴다.
  // 화면 구조(2026-10 확인): 메시지 = [data-message-id], 글자 = 그 안 맨 안쪽 div[dir=auto].
  // 입력칸 = role=main 안의 Lexical 편집기 [contenteditable][role=textbox], Enter 로 보낸다.
  // ---------------------------------------------------------------------------

  const MESSENGER = /(^|\.)messenger\.com$/.test(location.hostname);
  const CHAT_THREADS = 'chatThreads'; // { 대화방 id: true | false } — 칩으로 직접 고른 것만
  const CHAT_RETRY_MS = 60000;
  let chatThreads = GM_getValue(CHAT_THREADS, {});
  // 보낸 말 기록 [{ ko, th }] — 내 말풍선 아래에 쓴 한국어 원문을 함께 보여 주려고(되옮김과 견주면
  // 오번역이 바로 보인다). 최근 300개만.
  const CHAT_SENT = 'chatSentLog';
  let chatSentLog = GM_getValue(CHAT_SENT, []);
  const sentKey = (th) => th.replace(/\s+/g, '');
  let chatChip = null;
  let chatBusy = false;
  let chatSending = false; // 우리가 흉내 낸 Enter 는 가로채지 않는다
  let chatScanTimer = null;
  const chatPending = new Set();
  const chatFailed = new WeakMap(); // 말풍선 → { src, at } 번역 실패. 잠시 뒤 다시 본다

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function chatThreadId() {
    const m = /\/t\/([^/?#]+)/.exec(location.pathname);
    return m ? m[1] : '';
  }

  function chatComposer(el) {
    const ed = el && el.closest ? el.closest('[contenteditable="true"][role="textbox"]') : null;
    return ed && ed.closest('[role="main"]') ? ed : null;
  }

  // Lexical 은 문단마다 <p> 라 innerText 가 빈 줄을 끼운다.
  function flatText(s) {
    return s.replace(/\u00a0/g, ' ').replace(/\n{2,}/g, '\n').trim();
  }
  function composerText(ed) {
    return flatText(ed.innerText);
  }

  // 말풍선의 원문 — 우리가 붙인 한국어는 뺀다.
  function bubbleText(el) {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1 && !n.classList.contains('lzk-msgko') && !n.classList.contains('lzk-msgsrc')) s += n.textContent;
    }
    return s.trim();
  }

  function chatBubbles(root = document) {
    return [...root.querySelectorAll('[data-message-id] div[dir="auto"]')].filter(
      (d) => !d.querySelector('div[dir="auto"]')
    );
  }

  // 상대 이름. 대화방 머리의 제목 중 입력칸 이름표('… 님에게 메시지 쓰기')에 들어 있는 가장 긴 것.
  // 화면 언어마다 이름표 문구가 달라도 이름은 그대로 들어 있다.
  function chatPartnerName() {
    const main = document.querySelector('[role="main"]');
    const ed = main && main.querySelector('[contenteditable="true"][role="textbox"]');
    const label = (ed && ed.getAttribute('aria-label')) || '';
    let name = '';
    for (const h of main ? main.querySelectorAll('h1, h2, h3') : []) {
      if (h.closest('[role="log"]')) continue;
      const t = h.textContent.trim();
      if (t.length > name.length && label.includes(t)) name = t;
    }
    return name;
  }

  // ---- 상대의 언어 (2026-11-05 사용자: 메신저는 태국어만이 아니라 모든 언어로) ----
  // 받기: 내 말이 아닌 말풍선은 어느 언어든 내 언어로 옮긴다. 보내기: 상대가 쓰는 언어로 바꿔 보낸다.
  // 글자만 보고 아는 언어는 바로 정하고, 한자·키릴·아랍·데바나가리·로마자(영어·베트남어·인도네시아어…)는 여러 언어가
  // 같이 쓰는 글자라 구글이 알아본 언어를 쓴다(sl=auto 답에 붙어 오는 언어 — 말풍선마다 한 번만 묻는다).
  const CHAT_SCRIPT_LANGS = [
    ['th', THAI], ['ja', /[぀-ヿ]/], ['ko', HANGUL], ['he', /[֐-׿]/], ['bn', /[ঀ-৿]/], ['te', /[ఀ-౿]/],
    ['ta', /[஀-௿]/], ['km', /[ក-៿]/], ['lo', /[຀-໿]/], ['my', /[က-႟]/], ['ka', /[Ⴀ-ჿ]/], ['el', /[Ͱ-Ͽ]/],
  ];
  const CHAT_NOT_WORDS = /https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g; // 주소·메일은 말이 아니다
  const chatLangCache = new Map(); // 말풍선 글 → 구글이 알아본 언어('' = 모름)
  let chatLangMemo = null; // { id, at, v } — 칩은 글자 칠 때마다 다시 그려서 잠깐 기억해 둔다
  let chatDetecting = false;
  let chatDetectRetryAt = 0;
  let chatSame = new WeakMap(); // 말풍선 → 옮겨 보니 그대로 온 글(이미 내 말) — 다시 묻지 않는다
  // 대화방 상대들이 마지막으로 쓴 언어(말이 없는 대화방의 로마자 이름 상대에게). 처음엔 없음 — 한국어 사용자의 예전 판은 태국어로 봤다.
  let chatLastLang = String(GM_getValue('chatLastLang', '') || '');

  // 한자만 쓴 글(가나 없음)은 중국어 — 구글은 번체를 알아보지 못하고 'ko'·'en' 을 돌려줬다(2026-11-05 시험, 간체는 맞음).
  // 그래서 글자로 가른다: 광둥어 글자가 있으면 광둥어, 번체에만 있는 글자가 간체에만 있는 글자보다 많으면 번체(대만·홍콩).
  const ZH_TRAD = '們嗎這來個說時會對還過為麼學國長門問間開關點東車電話語讀錢買賣飯麵廳樂歡親愛謝請讓應該發現經機給聽見覺實號寫邊遠運進選業媽爺鐘頭難聯網場館雲飛魚鳥馬龍風熱氣體從決單無貓萬與專務師歲當廣圖書總';
  const ZH_SIMP = '们吗这来个说时会对还过为么学国长门问间开关点东车电话语读钱买卖饭厅乐欢亲爱谢请让应该发现经机给听见觉实号写边远运进选业妈爷钟头难联网场馆飞鱼鸟马龙风热气体从决单无猫万与专务师岁当广图书总';
  const YUE_MARK = /[嘅咗冇佢喺嚟啲嘢嗰]|唔(?:係|好|該|使|知|得)/;
  function chatHanLang(t) {
    if (YUE_MARK.test(t)) return 'yue';
    let trad = 0;
    let simp = 0;
    for (const ch of t) {
      if (ZH_TRAD.includes(ch)) trad++;
      else if (ZH_SIMP.includes(ch)) simp++;
    }
    return trad > simp ? 'zh-TW' : 'zh-CN';
  }

  function chatScriptLang(t) {
    for (const [code, re] of CHAT_SCRIPT_LANGS) if (re.test(t)) return code;
    const han = (t.match(/[一-鿿]/g) || []).length; // 한자가 다른 글자보다 많으면('我们去KFC吧')
    if (han && han >= (t.match(/[A-Za-zЀ-ӿ؀-ۿऀ-ॿ]/g) || []).length) return chatHanLang(t);
    return null;
  }

  // 옮길 말풍선인가: 글자가 두 개 넘고 내 언어 글자가 거의 없으면. 태국어가 있으면 예전처럼 늘 옮긴다
  // ('พี่คิดถึง 푸이' 처럼 한글 이름이 섞여도). 내 언어가 로마자 언어(영어 등)면 글자로는 못 가르니 옮겨 보고,
  // 그대로 오면 내 말로 본다(chatSame).
  function chatForeign(t) {
    if (THAI.test(t) && MY2 !== 'th') return true;
    const s = t.replace(CHAT_NOT_WORDS, '');
    const all = (s.match(/\p{L}/gu) || []).length;
    const mine = MY_SCRIPT ? (s.match(new RegExp(MY_SCRIPT.source, 'g')) || []).length : 0;
    return all - mine >= 2 && mine * 5 < all - mine;
  }

  const chatNorm = (s) => String(s).replace(/\s+/g, ' ').replace(/[\s.!?~,。！？]+$/, '').trim().toLowerCase();

  // 구글이 알아본 언어(여러 줄을 한 번에). dict-chrome-ex 는 [["번역", "en"], …], 막혔으면 gtx 로 하나씩(답의 세 번째 칸).
  async function detectLangs(texts) {
    if (Date.now() >= dictBlockedUntil) {
      try {
        const url = `${FREE_ALT_ENDPOINT}?client=dict-chrome-ex&sl=auto&tl=${MY}&` + texts.map((t) => `q=${encodeURIComponent(t)}`).join('&');
        const data = JSON.parse(await request({ method: 'GET', url, timeout: 6000 }));
        if (Array.isArray(data) && data.length === texts.length) {
          return data.map((d) => (Array.isArray(d) && typeof d[1] === 'string' ? d[1] : ''));
        }
      } catch (e) {
        if (isBlocked(e)) dictBlockedUntil = Date.now() + 10 * 60 * 1000;
      }
    }
    const got = await runPool(texts, 3, async (t) => {
      const url = `${FREE_ENDPOINT}?client=gtx&sl=auto&tl=${MY}&dt=t&q=${encodeURIComponent(t)}`;
      const data = JSON.parse(await request({ method: 'GET', url, timeout: 6000 }));
      return Array.isArray(data) && typeof data[2] === 'string' ? data[2] : '';
    });
    const res = texts.map((t, i) => got[i] || '');
    // 구글이 답하지 않은 글은 글자·크롬 언어 알아보기로(페이지 언어로 짐작하지는 않는다 — 메신저 화면 언어는 상대 말이 아니다).
    if (BUILTIN_OK) for (let i = 0; i < res.length; i++) if (!res[i]) res[i] = (await builtinSource(texts[i], 'auto', false)) || '';
    return res;
  }

  // 상대가 쓰는 언어(내 언어가 아닌 것) — 최근 말풍선 40개 가운데 가장 많은 것. collect 를 주면 아직 구글에 묻지 않은
  // 글을 거기 담는다. 'ok'·'555' 같은 짧은 로마자 말은 세지 않는다(태국 친구도 쓴다).
  function chatPartnerLang(collect) {
    const id = chatThreadId();
    if (!collect && chatLangMemo && chatLangMemo.id === id && Date.now() - chatLangMemo.at < 800) return chatLangMemo.v;
    const log = document.querySelector('[role="main"] [role="log"]');
    let best = '';
    if (log) {
      const lr = log.getBoundingClientRect();
      const counts = new Map();
      for (const d of chatBubbles(log).slice(-40)) {
        if (chatBubbleMine(d, lr)) continue;
        const t = bubbleText(d);
        if (!chatForeign(t)) continue;
        const code = chatScriptLang(t) || chatLangCache.get(t);
        if (code === undefined) {
          if (collect && (t.replace(CHAT_NOT_WORDS, '').match(/\p{L}/gu) || []).length >= 4) collect.push(t);
          continue;
        }
        if (code && code.split('-')[0].toLowerCase() !== MY2) counts.set(code, (counts.get(code) || 0) + 1);
      }
      let n = 0;
      for (const [code, k] of counts) {
        if (k > n) {
          best = code;
          n = k;
        }
      }
    }
    chatLangMemo = { id, at: Date.now(), v: best };
    return best;
  }

  // 아직 모르는 상대 말풍선의 언어를 구글에 묻는다(새 말풍선이 있을 때만, 한 번에 8개까지).
  async function chatDetectLangs() {
    if (chatDetecting || Date.now() < chatDetectRetryAt) return;
    const ask = [];
    chatPartnerLang(ask);
    const todo = [...new Set(ask)].filter((t) => !chatLangCache.has(t)).slice(-8);
    if (!todo.length) return;
    chatDetecting = true;
    try {
      const codes = await detectLangs(todo);
      if (codes.every((c) => !c)) chatDetectRetryAt = Date.now() + 60000; // 구글이 답을 못 줬다 — 잠시 뒤에
      else todo.forEach((t, i) => chatLangCache.set(t, codes[i]));
      if (chatLangCache.size > 3000) chatLangCache.clear();
    } catch {
      chatDetectRetryAt = Date.now() + 60000;
    } finally {
      chatDetecting = false;
      chatLangMemo = null;
    }
    updateChatChip();
  }

  // 언어 코드 → 언어 막대의 언어(용어집·단추 글자). 목록에 없는 언어(zh-TW·ms …)는 그 코드로 구글 번역만.
  function chatLangObj(code) {
    if (!code) return null;
    const list = myTypeLangs();
    const hit = list.find((l) => l.mt === code || l.id === code) || (!code.includes('-') && list.find((l) => l.id === code.split('-')[0]));
    if (hit) return hit;
    const dn = (loc) => {
      try {
        return new Intl.DisplayNames([loc], { type: 'language' }).of(code) || code;
      } catch {
        return code;
      }
    };
    return { id: code, mt: code, name: dn('ko'), label: code.toUpperCase(), chip: `→ ${dn(code)}` };
  }

  // 이 대화방에서 Enter 로 바꿔 보낼 언어(없으면 null = 쓴 그대로).
  //  1) 칩·언어 막대로 직접 고른 것(대화방마다 기억). false = 그대로. 1.29 까지의 true = 태국어.
  //  2) 상대가 쓰는 언어(위). 상대가 내 말(한국어)로 쓰면 세지 않는다 — 태국 사람이 번역기로 한국어를 보내오는
  //     방도 있다(Paphawee 방).
  //  3) 상대 말이 없으면 이름: 한글이면 한국 사람(그대로), 태국 글자나 영문이면 태국 사람으로 본다(한국어 사용자만).
  // 말풍선이 오른쪽에 붙어 있으면 내 것이다(화면 언어와 상관없이 맞는다).
  function chatTarget() {
    const id = chatThreadId();
    const set = id && Object.prototype.hasOwnProperty.call(chatThreads, id) ? chatThreads[id] : undefined;
    if (set === false) return null;
    if (set === true) return chatLangObj('th');
    if (typeof set === 'string' && set) return chatLangObj(set);
    const seen = chatPartnerLang();
    if (seen) {
      // 상대들이 쓰는 언어를 기억해 둔다 — 아직 말이 없는 대화방의 로마자 이름 상대에게 쓴다(아래).
      if (seen !== chatLastLang) GM_setValue('chatLastLang', (chatLastLang = seen));
      return chatLangObj(seen);
    }
    // 상대 말이 없으면 이름 글자로(2026-11-21: 예전엔 태국 글자·로마자 이름이면 무조건 태국어였다 — 이제 30개 언어 기준).
    // 태국·일본·히브리·크메르… 글자 이름은 그 언어, 키릴 = 러시아어, 아랍 글자 = 아랍어, 데바나가리 = 힌디어. 로마자 이름은
    // 어느 나라 사람인지 글자로 모른다 — 다른 대화방에서 상대가 마지막으로 쓴 언어로(없으면 쓴 그대로 보낸다).
    const name = chatPartnerName();
    if (!name) return null;
    const byName =
      chatScriptLang(name) ||
      (/[Ѐ-ӿ]/.test(name) ? 'ru' : /[؀-ۿ]/.test(name) ? 'ar' : /[ऀ-ॿ]/.test(name) ? 'hi' : '');
    if (byName) return byName.split('-')[0].toLowerCase() === MY2 ? null : chatLangObj(byName);
    return /[A-Za-z]/.test(name) && chatLastLang && chatLastLang.split('-')[0].toLowerCase() !== MY2 ? chatLangObj(chatLastLang) : null;
  }

  // 언어 막대에서 고른 언어 — 메신저에서는 지금 대화방에만(대화방마다 상대 언어가 다르다). 켜져 있는 언어를 다시 누르면 그대로 보냄.
  function chatPickLang(code) {
    const id = chatThreadId();
    if (!id) return;
    const cur = chatTarget();
    chatThreads[id] = cur && cur.id === code ? false : code;
    GM_setValue(CHAT_THREADS, chatThreads);
    const l = chatThreads[id] ? chatLangObj(code) : null;
    toast(l ? `이 대화방: ${MY_KO ? '한국어를 ' : ''}${langName(l)}로 바꿔 보냅니다.` : `이 대화방: ${MY_KO ? '한국어 ' : ''}그대로 보냅니다.`, 3000);
    refreshLangBar();
    updateChatChip();
  }

  // ---- 보내기: 한국어 → 태국어 ----

  // ㅋㅋㅋ 같은 자모 줄임말. 구글 번역은 그대로 두거나 엉뚱하게 옮긴다.
  const JAMO_RUN = /[ㄱ-ㅎㅏ-ㅣ]{2,}/g;
  function jamoToThai(run, idx) {
    if (/^ㅋ+$/.test(run)) return '5'.repeat(Math.max(3, run.length));
    return idx.get(run) || idx.get(run.slice(0, 2)) || '';
  }
  // 이모지·이모티콘(^^ ;; ♡). 붙어 있으면 '잘 자 😊' 가 통째 항목 '잘자' 와 안 맞는다 — 떼어 찾고 끝에 그대로 붙인다.
  const EMOJI_RUN = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️\u{1f3fb}-\u{1f3ff}])+|\^[_\-.]?\^+|;{2,}|[♡♥]+/gu;

  // 태국어 존댓말 끝(ครับ/ค่ะ). 말하는 사람의 성별로 갈린다. 구글 번역은 성별을 몰라 존댓말
  // 물음에 คะ(여자 말)를 붙이곤 한다 — 설정이 있으면 번역이 붙인 끝말은 떼고, 한국어를
  // 존댓말(~요·~니다)로 썼을 때만 설정한 끝말을 붙인다. 반말에는 붙이지 않는다.
  // 낱말 끝과 겹치는 꼴은 떼지 않는다: คุ้มค่า·ตั้งค่า(ค่า), บังคับ(คับ), โยคะ(คะ).
  const TH_PARTICLE_END = /\s*(ครับผม|ครับ|(?<![ก-๙])คับ|ค่ะ|(?<!โย)คะ|(?<![ก-๙])ค่า)(?=[\s?!.？！]*$)/;
  function addPoliteParticle(ko, th) {
    const p = cfg.chatParticle;
    if (!p) return th;
    th = th.replace(TH_PARTICLE_END, '');
    // 값·번역 가운데 박힌 끝말도 설정한 성별로 맞춘다: 안녕히계세요=สวัสดีครับ ไว้คุยกัน 이 여성 설정이면
    // สวัสดีค่ะ. สครับ(스크럽)·คะแนน(점수)은 낱말이라 그대로 둔다. 반말에도 적용.
    // 두 끝말이 다 들어 있으면 끝말 자체를 말하는 문장(카랑 크랍 차이가 뭐야)이라 건드리지 않는다.
    const male = /(?<!ส)ครับ/.test(th);
    const female = /ค่ะ|(?<!โย)คะ(?=[\s?!.？！]|$)/.test(th); // โยคะ(요가)는 끝말이 아니다
    if (p === 'ค่ะ' && male && !female) th = th.replace(/(?<!ส)ครับ(?:ผม)?/g, 'ค่ะ').replace(/นะค่ะ/g, 'นะคะ');
    else if (p === 'ครับ' && female && !male) th = th.replace(/ค่ะ|(?<!โย)คะ(?=[\s?!.？！]|$)/g, 'ครับ');
    // '~니까' 는 받침 ㅂ 다음(갑니까·입니까·습니까)만 존댓말이다. '그러니까·아프니까' 는 반말.
    const m = ko.match(/(.)니까[\s?!.~？！]*$/);
    const formalAsk = !!m && (m[1] === '습' || (m[1] >= '가' && m[1] <= '힣' && (m[1].charCodeAt(0) - 0xac00) % 28 === 17));
    if (!formalAsk && !/(요|니다|세요|십시오|죠)[\s?!.~？！]*$/.test(ko)) return th;
    const word = p === 'ค่ะ' && (/[?？]\s*$/.test(ko) || /นะ[\s?!.？！]*$/.test(th)) ? 'คะ' : p; // นะคะ
    return th.replace(/([\s?!.？！]*)$/, `${word}$1`);
  }

  // 물음표로 끝난 말에 묻는 꼴이 아닌 용어집 값을 쓰면 뜻이 바뀐다(밥먹었어요=กินข้าวแล้ว).
  const TH_QUESTION = /ไหม(?!้)|มั้ย|ยัง$|หรือ|เหรอ|หรอ(?!ก)|ป่าว|(?<!ไม่มี|ไม่ได้|ไม่ไป|ไม่)(?:อะไร|ไหน|ใคร)(?!ก็)|เมื่อไ(?!รก็)|ทำไม|อย่างไร|ไง(?!ก็)|กี่|เท่าไ(?!รก็)/;
  // 물음표 붙은 평서 끝(피곤해?·갔어?·좋아요?)과 물음말(이게 있으면 '…ไหม' 를 붙이면 틀린다).
  // ~세요?·~할게요? 는 부탁·약속이라 뺀다(미터기 켜 주세요?·나중에 전화할게요?).
  const CHAT_ASK_END = /(어|아|야|해|워|와|려|여|커|내|돼|나|요|파|뻐|퍼|싸|빠|때|셔|춰|봐|가|져|자|러|라|짜|대|쳐|켜|[이그저]래)$/;
  const CHAT_ASK_NOT = /(세요|게요|잖아|잖아요)$/;
  const CHAT_ASK_WORD = /뭐|어디|언제|누구|누가|왜|몇|얼마|어떻게|어때|무슨|어느/;
  // 물음표 없이도 묻거나 부탁하는 끝(~니·~냐·~까·~래·~나요·~ㄴ가요·~지·~죠, ~줘·~세요·~자·~봐, 있나·했나).
  const CHAT_PLAIN_NOT = /(니|냐|까|까요|래|래요|나요|[은는인]가요?|지|죠|지요|줘|줘요|주세요|세요|십시오|자|봐|봐요|[있없았었겠했]나)$/;
  // 평서 값 → 예/아니오 물음. 띄어 쓴 값(두 마디)·끝말(นะ·สิ…)·부탁·금지·부정으로 시작하는 값은 '' (번역에 맡김).
  // past: 한국어가 ~었어(요)·~했어(요) 꼴이면 true — ไปหาหมอมา 같은 ~มา 값을 หรือยัง 으로 물을 때만.
  function thaiAsk(v, past) {
    if (!v || /\s/.test(v) || TH_QUESTION.test(v)) return '';
    if (/กันเถอะ$/.test(v)) return v.slice(0, -4) + 'ไหม'; // 같이 청소하자? = ทำความสะอาดด้วยกันไหม
    if (/^ไม่เป็นไร(นะ)?$/.test(v)) return 'โอเคไหม'; // 괜찮아? = โอเคไหม(ไม่เป็นไรไหม 는 어색하다)
    // 우산 가져와? = เอาร่มมาด้วยไหม, 걔도 온대? = เขาบอกว่าจะมาด้วยเหรอ
    const hearsay = /^(?:(?:เขา|หมอ|เพื่อน|แม่|พ่อ)(?:บอก)?|บอก)ว่า(?!ย)/.test(v);
    if (/มาด้วย$/.test(v) && !/^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!พร|ง)|ไม่)/.test(v)) return v + (hearsay ? 'เหรอ' : 'ไหม');
    if (/(นะ|สิ|เถอะ|เลย|หน่อย|ด้วย|จ้า|จ้ะ|ค่ะ|คะ|ครับ|(?<!โคชู|ทเวน|เทน)จัง|ๆ|นี่|นา|น่ะ|ล่ะ|หรอก|เอง|ไม่เป็นไร)$/.test(v) || /^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!พร|ง)|ไม่เป็นไร)/.test(v)) return ''; // ขอพร(소원 빌다)·ของ(물건)은 부탁이 아니다
    if (/^ยังไม่/.test(v)) return v + 'เหรอ'; // 밥 못 먹었어? = ยังไม่ได้กินข้าวเหรอ (ไหม 아님)
    // '고장 안 났어?' = ไม่เสียเหรอ: 부정 값은 ไหม 대신 เหรอ(안 …했어?). 위의 끝말·부탁 거름을 지난 뒤에만.
    if (/^ไม่(?!เป็นไร)/.test(v) && !/(นะ|สิ|เถอะ|เลย|หน่อย|ด้วย|จ้า|จ้ะ|ค่ะ|คะ|ครับ|จัง|ๆ|นี่|นา|น่ะ|ล่ะ|หรอก|เอง)$/.test(v)) return v + 'เหรอ';
    // '오늘 못 와?' = วันนี้มาไม่ได้เหรอ — …ไม่ได้ไหม 는 '…하지 말아 줄래?' 처럼 들린다.
    if (/[ก-๙]ไม่ได้$/.test(v)) return v + 'เหรอ';
    if (hearsay) return v + 'เหรอ'; // 수술해야 된대? = หมอบอกว่าต้องผ่าตัดเหรอ
    // ~แล้ว 은 한국어가 지난 일(~었어)일 때만 หรือยัง: 맞아요?=ใช่แล้ว 를 ใช่หรือยัง 으로 만들지 않는다.
    if (v.endsWith('แล้ว')) return past && v.length > 4 ? v.slice(0, -4) + 'หรือยัง' : v.length > 4 ? v + 'เหรอ' : '';
    // 다녀온 일(~มา)은 หรือเปล่า: 친구랑 싸웠어? = ทะเลาะกับเพื่อนมาหรือเปล่า(หรือยัง 이면 '벌써 싸웠어?').
    // 연기가 나요? = มีควันออกมาไหม(지난 일 아님).
    if (past && /[ก-๙]มา$/.test(v)) return v + 'หรือเปล่า';
    return v.replace(/(.)มาก$/, '$1') + 'ไหม'; // สนุกมาก → สนุกไหม
  }

  // 한국어로 쓴 태국 사람 별명. 구글 번역은 '푸이' 를 ปุย·ผู่อี๋·ผู่ยี่·Puyi(청 황제)로 그때그때
  // 다르게 옮겼다. 로마자로 바꿔 넘기면 이름으로 알아보고(Pui → ปุย/ปุ้ย), 나온 표기를 하나로 맞춘다.
  const CHAT_NAMES = [{ ko: '푸이|뿌이', latin: 'Pui', th: 'ปุ้ย', out: /Pui|ปุ้?ย(?!ฝ้าย|นุ่น)/gi }];
  const CHAT_NAME_RES = CHAT_NAMES.map((n) => ({ ...n, re: new RegExp(`(^|[^가-힣])(?:${n.ko})`, 'g') }));

  // 학년. 태국은 중·고를 ม.1~ม.6 으로 잇따라 센다(고1 = ม.4). 구글 번역은 '고등학교 1학년' 을
  // มัธยมศึกษาปีที่ 1(중1), 홑 '1학년' 을 ประถมศึกษาปีที่ 1(초1)로 옮겼다. 태국 표기로 미리 바꿔
  // 넘기면 그대로 둔다(내년에 ม.4으로? → ปีหน้า…ม.4). 홑 'N학년' 은 같은 말에 학교가 나올 때만.
  function chatGradesToThai(s) {
    const hi = (n) => `ม.${+n + 3}`;
    // 줄인 꼴(고1·중2)은 앞이 낱말 경계일 때만 — '공부하고 1학년 때' 의 고는 학교가 아니다.
    s = s
      .replace(/고등학교\s*([1-3])\s*학년/g, (m, n) => hi(n))
      .replace(/중학교\s*([1-3])\s*학년/g, 'ม.$1')
      .replace(/초등학교\s*([1-6])\s*학년/g, 'ป.$1')
      .replace(/(^|[^가-힣\d])고([1-3])(?:\s*학년)?(?!\d)/g, (m, p, n) => p + hi(n))
      .replace(/(^|[^가-힣\d])중([1-3])(?:\s*학년)?(?!\d)/g, '$1ม.$2')
      .replace(/(^|[^가-힣\d])초([1-6])(?:\s*학년)?(?!\d)/g, '$1ป.$2');
    const school = /고등학|고딩/.test(s) ? 'hi' : /중학/.test(s) ? 'mid' : /초등학/.test(s) ? 'ele' : '';
    if (school) {
      s = s.replace(/(^|[^\d])([1-6])\s*학년/g, (m, p, n) =>
        school === 'hi' ? (n <= 3 ? p + hi(n) : m) : school === 'mid' ? (n <= 3 ? `${p}ม.${n}` : m) : `${p}ป.${n}`
      );
    }
    return s;
  }

  // 번역에 넘기기 전 한국어 손질 → [넘길 글, 번역 뒤 고칠 함수]
  function chatPrepKorean(core) {
    let s = chatGradesToThai(core);
    const used = [];
    for (const n of CHAT_NAME_RES) {
      const t = s.replace(n.re, `$1${n.latin}`);
      if (t !== s) used.push(n);
      s = t;
    }
    // 번역이 이름 앞에 붙인 พี่(손윗사람 호칭)는 뗀다 — ตอนนี้ฉันไม่โกรธพี่ปุ้ยแล้ว. 상대가 손아래다.
    const fix = (th) =>
      used.reduce((acc, n) => acc.replace(n.out, n.th).replace(new RegExp(`พี่(?:สาว)?\\s*(?=${n.th})`, 'g'), ''), th);
    return [koBigNumbers(s), fix];
  }

  // '2억 15만명' 처럼 억·만·천을 섞어 쓴 수. 번역은 '200 ล้านคน' 으로 뒤를 버렸다 — 숫자로 바꿔 넘긴다.
  function koBigNumbers(s) {
    const num = (v) => v.toLocaleString('en-US');
    return s
      .replace(/(\d+)\s*([천백])\s*만/g, (m, a, u) => `${a * (u === '천' ? 1000 : 100)}만`) // 2천만 = 2000만
      .replace(/(\d+)\s*억\s*(\d+)\s*만(?:\s*(\d+)\s*천)?/g, (m, a, b, c) => num(a * 1e8 + b * 1e4 + (c || 0) * 1e3))
      .replace(/(\d+)\s*억\s*(\d+)\s*천/g, (m, a, c) => num(a * 1e8 + c * 1e7)) // 말로는 '3억 5천' = 3억 5천만
      .replace(/(\d+)\s*만\s*(\d+)\s*천/g, (m, b, c) => num(b * 1e4 + c * 1e3));
  }

  // 통째 항목이 반말·존댓말 한쪽만 있어도 찾는다: '잘 지냈어' ↔ '잘 지냈어요', '얼마야' ↔ '얼마예요',
  // '오랜만이야' ↔ '오랜만이에요'. 한 글자 반말('가' → 가요=เพลงเกาหลี)에는 요를 붙이지 않는다.
  // 혼자 보낸 맞장구·감탄사. 용어집에선 쇼핑 뜻이 이기거나(진짜=ของแท้) 낱말을 깨뜨려(나도X 식물 이름,
  // 아마씨) 넣지 못한 말. 줄 전체가 이 말일 때만 쓴다.
  const CHAT_WORDS = {
    응: 'อืม', 웅: 'อืม', 엉: 'อืม', 어: 'อืม', 와: 'ว้าว', 우와: 'ว้าว', 에이: 'โธ่',
    진짜: 'จริงเหรอ', 진짜로: 'จริงๆ', 정말로: 'จริงๆ', 나도: 'ฉันก็เหมือนกัน', 아마: 'อาจจะ', 됐어: 'พอแล้ว',
    // 혼자 쓴 대답. 네·예 = 태국어로는 끝말(ครับ/ค่ะ)이 곧 '네' — 설정한 성별로 바뀐다.
    // 가요(=เพลงเกาหลี K팝)·돼요(=ได้ไหม 묻는 꼴)·안돼요(=ใช้ไม่ได้ 고장) 는 쇼핑 뜻 대신 대답 뜻으로.
    네: 'ครับ', 예: 'ครับ', 응응: 'อืมๆ', 가요: 'ไป', 돼요: 'ได้', 돼: 'ได้', 안돼요: 'ไม่ได้', 안돼: 'ไม่ได้',
    있어요: 'มี', 있어: 'มี', 됐어요: 'พอแล้ว',
    // 맛 한마디(혼자 쓴 줄만 — 짜 는 짐 싸·짜다 겹침 때문에 용어집 낱말로 못 넣는다).
    짜: 'เค็ม', 짜요: 'เค็ม', 싱거워: 'จืด', 싱거워요: 'จืด',
    // '혼자 가' — 용어집 키 혼자가 는 검색어 '혼자가 아니야'(혼자 + 가)를 깨뜨린다.
    혼자가: 'ไปคนเดียว', 혼자가요: 'ไปคนเดียว',
    // 신나 = 용어집에선 ทินเนอร์(페인트 희석제). 최고·짱·굿 은 최고급·짱구 같은 낱말을 깨뜨려 표에만.
    신나: 'สนุกจัง', 신난다: 'สนุกจัง', 최고: 'ดีที่สุด', 최고야: 'ดีที่สุด', 짱: 'สุดยอด', 짱이야: 'สุดยอด',
    굿: 'ดีมาก', 아싸: 'เย้', 화이팅: 'สู้ๆ', 파이팅: 'สู้ๆ', 잘가: 'ไปดีๆ นะ', 별로: 'ก็งั้นๆ',
    별로야: 'ไม่ค่อยดี', 끝: 'จบแล้ว', 끝났어: 'จบแล้ว', 뭐: 'อะไรนะ',
    // 화나 = 용어집에 넣으면 죽도화나무·매화나무 같은 낱말이 '화나+무' 로 쪼개져 표에만.
    화나: 'โกรธ', 화나요: 'โกรธ',
    // 금방(=금은방)·곧(한 글자) 은 낱말을 깨뜨리고, 두 개 주세요·하나 더 주세요·알려 주세요 는 용어집에 넣으면
    // '칫솔 두 개 주세요'·'치수 알려 주세요' 같은 긴 검색 문장 어순을 망쳐 대화 한 줄일 때만 쓴다.
    금방: 'เดี๋ยวเดียว', 곧: 'อีกไม่นาน', 두개주세요: 'ขอสองอัน', 하나더주세요: 'ขออีกอันหนึ่ง', 알려주세요: 'บอกหน่อย',
    // 역시(역시간)·착해(착해방수) 도 용어집에 넣으면 상품 낱말을 쪼갠다.
    역시: 'สมแล้ว', 착해: 'ใจดี', 착해요: 'ใจดี',
    // 콜 = 용어집에선 콜라·콜센터 앞머리. 대화 한 줄 '콜' 은 좋아(ตกลง).
    콜: 'ตกลง', 콜콜: 'ตกลง',
    // 사자 = 용어집에선 동물(สิงโต). 대화 마디 끝 '한국 가서 사자' 는 사다 + 자(ซื้อกันเถอะ).
    // 하자 = 용어집에선 흠(ตำหนิ), 타요 = 꼬마버스 Tayo — '주말에 하자'·'같이 타요' 는 하다·타다.
    사자: 'ซื้อกันเถอะ', 사자요: 'ซื้อกันเถอะ', 하자: 'ทำกันเถอะ', 타요: 'ขึ้นรถ',
    // '잘 어울려. 사' — 혼자 쓴 '사' 는 사라(ซื้อเลย). 한 글자라 용어집 키로는 못 넣는다.
    사: 'ซื้อเลย',
    // 웃음 '하하' = 태국식 555(ห้าห้าห้า).
    하하: '555', 하하하: '5555', 히히: 'อิอิ', 헤헤: 'อิอิ',
    // 혼자 쓴 '붙었어' = 합격(용어집 붙었어요 는 검색 '수수료 붙었어요' 의 ถูกคิดเพิ่ม), '한국에서?' 되묻기.
    붙었어: 'สอบติดแล้ว', 한국에서: 'ที่เกาหลี',
    // 흥·치(삐친 소리)는 한 글자라 용어집에 넣으면 흥정·치마 같은 낱말을 쪼갤 수 있다.
    흥: 'หึ', 치: 'ชิ',
    // '어디 가' = 어디 가니(ไปไหน). 용어집 어디가=ที่ไหน 는 '어디가 좋아요' 의 '어디가'.
    어디가: 'ไปไหน', 어디가요: 'ไปไหน',
    // 용어집에 넣으면 검색 조합(데리러 갈까 → ไปกันไหม ไปรับ)을 망가뜨리는 홑 말.
    갈까: 'ไปกันไหม', 갈까요: 'ไปกันไหม', 먹을까: 'กินกันไหม', 먹을까요: 'กินกันไหม',
  };

  // ok: 값 거르개 — 물음표로 끝난 줄이면 묻는 꼴 값만 받는다('밥 먹었어요?' 는 밥먹었어요=กินข้าวแล้ว 를
  // 건너뛰고 밥먹었어=กินข้าวยัง 을 쓴다).
  // 줄 맨 앞에 오는 대답말. 뒤 말과 나눠 찾는다(chatFromGlossary).
  const CHAT_LEADS = new Set(
    ('네 예 응 웅 엉 어 아니 아니요 아뇨 아니야 그래 그래요 좋아 좋아요 알았어 알겠어 알았어요 알겠어요 ' +
      '오케이 고마워 고마워요 감사합니다 미안 미안해 미안해요 괜찮아 괜찮아요 진짜 정말 헐 와 대박 ' +
      // 인사·사과·맞장구로 여는 줄: '안녕하세요 옆집이에요'·'죄송해요 금방 뺄게요'·'그럼 내일 봐'
      '안녕하세요 안녕 죄송해요 죄송합니다 감사해요 실례합니다 여보세요 저기요 맞아 맞아요 그럼 그럼요 ' +
      '물론이죠 당연하지 알겠습니다 축하해 축하해요 수고했어 수고하셨어요').split(' ')
  );

  // 부르는 말. 줄 앞이나 끝에 오면 떼어 따로 옮긴다: '자기야 일어났어' → ที่รัก ตื่นหรือยัง,
  // '잘 자 자기야' → ฝันดี ที่รัก. 줄 앞의 엄마·오빠 는 '아빠 번호도 적어 둘게요'(아빠의) 일 수 있어
  // 쉼표가 붙었을 때만(엄마, 나 늦어) 뗀다. 홑 '자기' 는 '자기 전에'(잠자기) 와 겹쳐 넣지 않는다.
  const CHAT_CALLS = {
    자기야: 'ที่รัก', 여보: 'ที่รัก', 여보야: 'ที่รัก', 애기야: 'ที่รัก', 오빠: 'พี่', 언니: 'พี่', 누나: 'พี่',
    형: 'พี่', 형님: 'พี่', 엄마: 'แม่', 아빠: 'พ่อ',
  };
  const CHAT_CALLS_HEAD = /^(자기야|여보야?|애기야)[\s.!?~,？！]*$|^[가-힣]+[,!~]+$/;

  function chatWhole(bare, idx, ok = () => true) {
    const get = (k) => (idx.has(k) && ok(idx.get(k)) ? idx.get(k) : '');
    const look = (k) => {
      if (get(k)) return get(k);
      const forms = [];
      if (k.endsWith('요')) {
        if (k.endsWith('이에요')) forms.push(k.slice(0, -3) + '이야');
        else if (k.endsWith('예요')) forms.push(k.slice(0, -2) + '야');
        forms.push(k.slice(0, -1));
      } else if (k.length >= 2) {
        if (k.endsWith('이야')) forms.push(k.slice(0, -2) + '이에요');
        else if (k.endsWith('야')) forms.push(k.slice(0, -1) + '예요');
        forms.push(k + '요');
      }
      const hit = forms.find((f) => f.length >= 2 && get(f));
      if (hit) return get(hit);
      // 합쇼체 '있었습니다'·'벌어집니다'·'학생입니다' — ~습니다·~ㅂ니다 는 ~어 꼴 평서 값으로(있었어·벌어져),
      // ~입니다 는 ~이야·~야 로. 묻는 값은 안 쓴다.
      const fm = k.length >= 4 && k.match(/^(.+)니다$/);
      if (fm) {
        const L = fm[1].charCodeAt(fm[1].length - 1) - 0xac00;
        const st = fm[1].endsWith('습')
          ? fm[1].slice(0, -1)
          : L >= 0 && L <= 11171 && L % 28 === 17 ? fm[1].slice(0, -1) + String.fromCharCode(0xac00 + L - 17) : '';
        const cop = st.length >= 2 && st.endsWith('이') ? [st + '야', st.slice(0, -1) + '야'] : [];
        const f = st && [...koInfinitives(st), ...cop].find((x) => x.length >= 2 && get(x) && !TH_QUESTION.test(get(x)));
        if (f) return get(f);
      }
      // '졸리다'·'보고 싶다' — 혼잣말 ~다 는 ~어 꼴 평서 값으로(졸려·보고싶어). 묻는 값(밥먹었어=กินข้าวยัง)은 안 쓴다.
      // '싸더라'·'맛있더라고' — 겪어 본 일 ~더라 도 같은 평서 값으로.
      const dm = k.length >= 3 && k.match(/^(.+?)(더라고요|더라고|더라|다)$/);
      if (!dm) return '';
      // ~어 꼴과 ~어요 꼴 키(무서워요=น่ากลัว)를 함께 본다.
      const plainOf = (st) => {
        const ys = koInfinitives(st).flatMap((y) => [y, y + '요']);
        const x = ys.find((y) => y.length >= 2 && get(y) && !TH_QUESTION.test(get(y)));
        return x ? get(x) : '';
      };
      const f = plainOf(dm[1]);
      if (f || dm[2] !== '다' || dm[1].length < 2) return f;
      // '비 온다'·'밥 먹는다'·'태국에 산다' — ~ㄴ다·~는다 는 받침 ㄴ·는 을 뗀 줄기(비오 → 비와)로.
      // ㄹ 줄기(살다 → 산다)도 따져 보고, 둘 다 값이 있는데 다르면(사다·살다) 쓰지 않는다.
      if (dm[1].endsWith('는')) return plainOf(dm[1].slice(0, -1));
      const L = dm[1].charCodeAt(dm[1].length - 1) - 0xac00;
      if (L < 0 || L > 11171 || L % 28 !== 4) return '';
      const a = plainOf(dm[1].slice(0, -1) + String.fromCharCode(0xac00 + L - 4));
      const b = plainOf(dm[1].slice(0, -1) + String.fromCharCode(0xac00 + L + 4));
      return a && b && a !== b ? '' : a || b;
    };
    const k = squash(bare);
    if (CHAT_WORDS[k] && ok(CHAT_WORDS[k])) return CHAT_WORDS[k];
    const th = look(k);
    if (th) return th;
    // '밥은 먹었어'·'차가 막혀'·'오늘은 쉬는 날이야' — 끝 낱말이 아닌 데의 은·는·이·가·을·를 을 떼고 한 번 더.
    const words = bare.split(/\s+/);
    if (words.length < 2) return '';
    const stripped = words
      .map((w, i) => (i < words.length - 1 && w.length >= 2 && !CHAT_FRAME_NOT.has(w) ? w.replace(/(은|는|이|가|을|를|도)$/, '') : w))
      .join('');
    const th2 = stripped !== k ? look(stripped) : '';
    if (th2) return th2;
    // '물 좀 주세요'·'사진 좀 보내 줘' — 홑 '좀' 은 뜻을 안 바꾸니 빼고 한 번 더(물주세요).
    if (!words.includes('좀') || words.length < 3) return '';
    return chatWhole(words.filter((w) => w !== '좀').join(' '), idx, ok);
  }

  // 한 줄 옮기기. 용어집에 통째로 있는 말(사람이 고른 자연스러운 태국어)이 먼저, 아니면 문장째
  // 무료 번역. 낱말을 이어 붙이는 용어집 조합은 대화에선 어색해서 번역이 안 될 때만 쓴다.
  async function chatLine(line, idx) {
    const jamo = line.match(JAMO_RUN) || [];
    const emoji = line.match(EMOJI_RUN) || [];
    const core = line.replace(JAMO_RUN, ' ').replace(EMOJI_RUN, ' ').replace(/\s+/g, ' ').trim();
    const tail = [...jamo.map((r) => jamoToThai(r, idx)).filter(Boolean), ...emoji].join(' ');
    if (!core || !HANGUL.test(core)) return { thai: [core, tail].filter(Boolean).join(' '), via: '용어집' };

    let thai = chatFromGlossary(core, idx);
    let via = '용어집';
    if (!thai) {
      const [src, fix] = chatPrepKorean(core);
      thai = cacheGet(src, 'thc') || '';
      via = '번역';
      if (!HANGUL.test(src)) thai = fix(src); // 이름·학년뿐인 말(푸이 → ปุ้ย)
      if (!thai) {
        try {
          thai = fix((await freeRaw(src, 'ko', 'th', SEARCH_FREE_TIMEOUT)).trim());
          if (thai && !HANGUL.test(thai)) cacheSet(src, 'thc', thai);
        } catch (e) {
          console.warn(`[${APP_NAME}] 메시지 번역 실패, 용어집으로 대신:`, e.message);
          const r = await koreanToThai(core);
          thai = r.thai;
          via = r.via;
        }
      }
      if (!thai) return { thai: '', via };
      thai = addPoliteParticle(core, thai);
    }
    return { thai: tail ? `${thai} ${tail}` : thai, via };
  }

  // 용어집 통째 항목으로 한 줄을 옮긴다(끝말 ครับ 까지). 줄 전체가 없으면 문장부호(. ! ? , ~)로 나눈
  // 조각이 모두 있을 때만 이어 붙인다: '고마워. 잘 자' → ขอบคุณ ฝันดี. 하나라도 없으면 '' (줄째 번역).
  // 물음표로 끝난 말에 묻는 꼴이 아닌 값은 쓰지 않는다(밥먹었어요=กินข้าวแล้ว).
  // 앞말(용어집 한 항목, 끝 조사는 뗌) + 자주 쓰는 틀 → 태국어 틀에 그 말을 넣는다:
  // '커피 좋아해' → ชอบกาแฟ, '물 있어' → มีน้ำ, '망고 먹고 싶어' → อยากกินมะม่วง, '우유 사 줘' → ซื้อนมให้หน่อย.
  // 맨 '좋아' 는 '맛 좋아'(좋다)와 겹쳐 뺀다. 앞말이 두 글자 미만·~수/거/데 같은 매인 말·~아/어 로 끝나는
  // 동사(보내 줘)면, 값이 두 마디·영문·묻는 꼴·ไม่ 로 시작하면 '' (번역에 맡김).
  const CHAT_FRAMES = [
    // 겪어 봄: '김치 먹어 봤어?' → เคยกินกิมจิไหม, '한국 가 본 적 없어' → ไม่เคยไปเกาหลี. 끝이 있어·없어 라
    // 아래 '있어' 틀보다 먼저, 안 ~ 은 그보다 먼저 본다.
    [/^(.+?)\s+안\s*먹어\s*봤어요?$/, 'ไม่เคยกิน#'],
    [/^(.+?)\s+안\s*가\s*봤어요?$/, 'ไม่เคยไป#'],
    [/^(.+?)\s+먹어\s*본\s*적\s*없어요?$/, 'ไม่เคยกิน#'],
    [/^(.+?)\s+가\s*본\s*적\s*없어요?$/, 'ไม่เคยไป#'],
    [/^(.+?)\s+먹어\s*(봤어|봤어요|본\s*적\s*있어|본\s*적\s*있어요)$/, 'เคยกิน#'],
    [/^(.+?)\s+마셔\s*(봤어|봤어요|본\s*적\s*있어|본\s*적\s*있어요)$/, 'เคยดื่ม#'],
    [/^(.+?)\s+가\s*(봤어|봤어요|본\s*적\s*있어|본\s*적\s*있어요)$/, 'เคยไป#'],
    // 해 보라는 말: '망고 먹어 봐' → ลองกินมะม่วงดู. 물음표면 ลองกินมะม่วงดูไหม(먹어 볼래?).
    [/^(.+?)\s+먹어\s*(봐|봐요|보세요)$/, 'ลองกิน#ดู'],
    [/^(.+?)\s+마셔\s*(봐|봐요|보세요)$/, 'ลองดื่ม#ดู'],
    [/^(.+?)\s+입어\s*(봐|봐요|보세요)$/, 'ลองใส่#ดู'],
    [/^(.+?)\s+먹어\s*보고\s*싶(?:어|었어)요?$/, 'อยากลองกิน#'],
    [/^(.+?)\s+마셔\s*보고\s*싶(?:어|었어)요?$/, 'อยากลองดื่ม#'],
    [/^(.+?)\s+가\s*보고\s*싶(?:어|었어)요?$/, 'อยากไป#'],
    // 묻는 틀(값이 이미 묻는 꼴): '한국 어때?' → เกาหลีเป็นยังไง, '커피 마실래?' → ดื่มกาแฟไหม.
    [/^(.+?)\s+어때요?$/, '#เป็นยังไง'],
    [/^(.+?)\s+먹을래요?$/, 'กิน#ไหม'],
    [/^(.+?)\s+마실래요?$/, 'ดื่ม#ไหม'],
    [/^(.+?)\s+볼래요?$/, 'ดู#ไหม'],
    [/^(.+?)\s+갈래요?$/, 'ไป#กันไหม'], // 산책 갈래? → ไปเดินเล่นกันไหม
    // 해 줌: '꽃다발 사 줄게' → จะซื้อช่อดอกไม้ให้, '한국어 가르쳐 줘' → สอนภาษาเกาหลีให้หน่อย.
    [/^(.+?)\s+사\s*줄게요?$/, 'จะซื้อ#ให้'],
    [/^(.+?)\s+만들어\s*줄게요?$/, 'จะทำ#ให้'],
    [/^(.+?)\s+보여\s*줄게요?$/, 'จะให้ดู#'],
    [/^(.+?)\s+가르쳐\s*줄게요?$/, 'จะสอน#ให้'],
    [/^(.+?)\s+가르쳐\s*(줘|주세요)$/, 'สอน#ให้หน่อย'],
    // 하러 감: '국수 먹으러 가자' → ไปกินก๋วยเตี๋ยวกัน, '우유 사러 가' → ไปซื้อนม.
    [/^(.+?)\s+먹으러\s*가요?$/, 'ไปกิน#'],
    [/^(.+?)\s+먹으러\s*가자$/, 'ไปกิน#กัน'],
    [/^(.+?)\s+마시러\s*가요?$/, 'ไปดื่ม#'],
    [/^(.+?)\s+마시러\s*가자$/, 'ไปดื่ม#กัน'],
    [/^(.+?)\s+사러\s*가요?$/, 'ไปซื้อ#'],
    [/^(.+?)\s+사러\s*가자$/, 'ไปซื้อ#กัน'],
    // '부모님 만나러 가' → ไปเจอพ่อแม่.
    [/^(.+?)\s+만나러\s*가요?$/, 'ไปเจอ#'],
    [/^(.+?)\s+만나러\s*가자$/, 'ไปเจอ#กัน'],
    [/^(.+?)\s+만나러\s*갈게요?$/, 'จะไปเจอ#'],
    [/^(.+?)\s+만나러\s*갔어요?$/, 'ไปเจอ#มา'],
    // 배움: '태국어 배웠어' → เรียนภาษาไทยแล้ว, '요리 배우고 있어' → กำลังเรียนทำอาหารอยู่.
    [/^(.+?)\s+배웠어요?$/, 'เรียน#แล้ว'],
    [/^(.+?)\s+배우고\s*있어요?$/, 'กำลังเรียน#อยู่'],
    [/^(.+?)\s+배우고\s*싶(?:어|었어)요?$/, 'อยากเรียน#'],
    [/^(.+?)\s+배울\s*거(?:야|예요|에요)$/, 'จะเรียน#'],
    // 사 옴·가져옴: '우유 사 와' → ซื้อนมมาด้วย, '올 때 빵 사 와' → ขามาซื้อขนมปังมาด้วย, '우산 가져와?' → เอาร่มมาด้วยไหม.
    // 아래 '사 줘'·'줘' 틀보다 먼저 본다(사다 줘·갖다 줘).
    [/^(?:올\s*때|오는\s*길에)\s+(.+?)\s+사\s*(와|와요|오세요)$/, 'ขามาซื้อ#มาด้วย'],
    [/^(.+?)\s+사\s*(와|와요|오세요)$/, 'ซื้อ#มาด้วย'],
    [/^(.+?)\s+사다\s*(줘|주세요)$/, 'ซื้อ#มาให้หน่อย'],
    [/^(.+?)\s+사\s*왔어요?$/, 'ซื้อ#มาแล้ว'],
    [/^(.+?)\s+사\s*올게요?$/, 'เดี๋ยวซื้อ#ไปให้'],
    [/^(.+?)\s+가져\s*(와|와요|오세요)$/, 'เอา#มาด้วย'],
    [/^(.+?)\s+(갖다|가져다)\s*(줘|주세요)$/, 'เอา#มาให้หน่อย'],
    [/^(.+?)\s+가져\s*왔어요?$/, 'เอา#มาแล้ว'],
    [/^(.+?)\s+가져\s*갈게요?$/, 'เดี๋ยวเอา#ไปให้'],
    // 보냄·알림: '사진 보냈어' → ส่งรูปไปแล้ว, '주소 보내 줘' → ส่งที่อยู่มาหน่อย, '번호 알려 줘' → บอกเบอร์หน่อย.
    [/^(.+?)\s+보냈어요?$/, 'ส่ง#ไปแล้ว'],
    [/^(.+?)\s+보낼게요?$/, 'เดี๋ยวส่ง#ไปให้'],
    [/^(.+?)\s+보내\s*(줘|주세요)$/, 'ส่ง#มาหน่อย'],
    [/^(.+?)\s+알려\s*(줘|주세요)$/, 'บอก#หน่อย'],
    [/^(.+?)\s+알려\s*줄게요?$/, 'เดี๋ยวบอก#ให้'],
    [/^(.+?)\s+보여\s*(?:줘|주세요)$/, 'ขอดู#หน่อย'], // 지도 보여 줘 → ขอดูแผนที่หน่อย
    // 할까: '커피 마실까?' → ดื่มกาแฟดีไหม, '망고 살까?' → ซื้อมะม่วงดีไหม.
    [/^(.+?)\s+먹을까요?$/, 'กิน#ดีไหม', 'eat'],
    [/^(.+?)\s+마실까요?$/, 'ดื่ม#ดีไหม', 'drink'],
    [/^(.+?)\s+살까요?$/, 'ซื้อ#ดีไหม'],
    [/^(.+?)에?\s+갈까요?$/, 'ไป#ดีไหม', 'go'],
    [/^(.+?)\s+볼까요?$/, 'ดู#ดีไหม', 'see'],
    // 할 수 있음: '고수 못 먹어' → กินผักชีไม่ได้, '맥주 마실 수 있어?' → ดื่มเบียร์ได้ไหม.
    [/^(.+?)\s+못\s*먹어요?$/, 'กิน#ไม่ได้'],
    [/^(.+?)\s+못\s*마셔요?$/, 'ดื่ม#ไม่ได้'],
    [/^(.+?)\s+먹을\s*수\s*있어요?$/, 'กิน#ได้'],
    [/^(.+?)\s+마실\s*수\s*있어요?$/, 'ดื่ม#ได้'],
    // 해야 함·해도 됨: '약 먹어야 돼' → ต้องกินยา, '병원 가야 돼?' → ต้องไปโรงพยาบาลไหม, '망고 먹어도 돼?' → กินมะม่วงได้ไหม.
    [/^(.+?)\s+가야\s*(돼|돼요|해|해요)$/, 'ต้องไป#'],
    [/^(.+?)\s+먹어야\s*(돼|돼요|해|해요)$/, 'ต้องกิน#'],
    [/^(.+?)\s+사야\s*(돼|돼요|해|해요)$/, 'ต้องซื้อ#'],
    [/^(.+?)\s+먹어도\s*돼요?$/, 'กิน#ได้'],
    // 하는 중·할 것: '커피 마시고 있어' → กำลังดื่มกาแฟอยู่, '시장 가는 중이야' → กำลังไปตลาด, '망고 먹을 거야' → จะกินมะม่วง.
    // 아래 '있어' 틀보다 먼저 본다.
    [/^(.+?)\s+먹고\s*있어요?$/, 'กำลังกิน#อยู่', 'eat'],
    [/^(.+?)\s+마시고\s*있어요?$/, 'กำลังดื่ม#อยู่', 'drink'],
    [/^(.+?)\s+보고\s*있어요?$/, 'กำลังดู#อยู่', 'see'],
    [/^(.+?)에?\s+가고\s*있어요?$/, 'กำลังไป#', 'go'],
    [/^(.+?)에?\s+가는\s*중이(?:야|에요)$/, 'กำลังไป#', 'go'],
    [/^(.+?)\s+먹을\s*거(?:야|예요|에요)$/, 'จะกิน#', 'eat'],
    [/^(.+?)\s+마실\s*거(?:야|예요|에요)$/, 'จะดื่ม#', 'drink'],
    [/^(.+?)\s+살\s*거(?:야|예요|에요)$/, 'จะซื้อ#'],
    [/^(.+?)에?\s+갈\s*거(?:야|예요|에요)$/, 'จะไป#', 'go'],
    // 물건 형편: '샴푸 다 썼어' → แชมพูหมดแล้ว, '냉장고 고장났어' → ตู้เย็นเสีย, '안경 찾고 있어' → กำลังหาแว่นตาอยู่,
    // '지갑 잃어버렸어' → ทำกระเป๋าสตางค์หาย. 떨어졌어 는 '시험 떨어졌어'(สอบตก)와 겹쳐 '다' 가 있을 때만.
    [/^(.+?)\s+다\s*(?:떨어졌어|썼어)요?$/, '#หมดแล้ว'],
    [/^(.+?)\s+다\s*먹었어요?$/, 'กิน#หมดแล้ว', 'eat'],
    [/^(.+?)\s+다\s*마셨어요?$/, 'ดื่ม#หมดแล้ว', 'drink'],
    [/^(.+?)\s+고장\s*났어요?$/, '#เสีย'],
    [/^(.+?)\s+찾았어요?$/, 'เจอ#แล้ว'],
    [/^(.+?)\s+찾고\s*있어요?$/, 'กำลังหา#อยู่'],
    [/^(.+?)\s+못\s*찾겠어요?$/, 'หา#ไม่เจอ'],
    [/^(.+?)\s+잃어\s*버렸어요?$/, 'ทำ#หาย'],
    // 괜찮음·쓰임: '이 옷 괜찮아?' → เสื้อผ้านี้โอเคไหม, '우산 필요해?' → ต้องใช้ร่มไหม.
    [/^(.+?)\s+괜찮아요?$/, '#โอเค'],
    [/^(.+?)\s+필요해요?$/, 'ต้องใช้#'],
    [/^(.+?)\s+필요\s*없어요?$/, 'ไม่ต้องใช้#'],
    // 다녀옴: '회사 도착했어' → ถึงบริษัทแล้ว, '시장 갔다 왔어' → ไปตลาดมา, '학교 갔다 올게' → ไปโรงเรียนก่อนนะ.
    [/^(.+?)에?\s+도착했어요?$/, 'ถึง#แล้ว', 'go'],
    [/^(.+?)에?\s+갔다\s*왔어요?$/, 'ไป#มา', 'go'],
    [/^(.+?)에?\s+갔다\s*올게요?$/, 'ไป#ก่อนนะ', 'go'],
    [/^(.+?)\s+사러\s*왔어요?$/, 'มาซื้อ#'],
    [/^(.+?)\s+먹으러\s*왔어요?$/, 'มากิน#', 'eat'],
    // 탐: '버스 타고 가' → นั่งรถเมล์ไป, '오토바이 타고 왔어' → ขี่มอเตอร์ไซค์มา(@ = ขี่·นั่ง, chatFrame 이 고른다).
    [/^(.+?)\s+타고\s*(가|가요)$/, '@#ไป', 'ride'],
    [/^(.+?)\s+타고\s*갈게요?$/, 'จะ@#ไป', 'ride'],
    [/^(.+?)\s+타고\s*(와|와요|왔어|왔어요)$/, '@#มา', 'ride'],
    [/^(.+?)\s+탈게요?$/, 'จะ@#', 'ride'],
    [/^(.+?)\s+탔어요?$/, '@#แล้ว', 'ride'],
    [/^(.+?)\s+(좋아해|좋아해요)$/, 'ชอบ#'],
    [/^(.+?)\s+(싫어|싫어요|싫어해|싫어해요)$/, 'ไม่ชอบ#'],
    [/^(.+?)(?<!어디)\s+(있어|있어요)$/, 'มี#'], // 화장실 어디 있어 = 아래 '어디' 틀
    [/^(.+?)(?<!어디)\s+(없어|없어요)$/, 'ไม่มี#'],
    [/^(.+?)\s+먹고\s*싶(?:어|었어)요?$/, 'อยากกิน#'],
    [/^(.+?)\s+마시고\s*싶(?:어|었어)요?$/, 'อยากดื่ม#'],
    [/^(.+?)\s+사고\s*싶(?:어|었어)요?$/, 'อยากซื้อ#'],
    [/^(.+?)\s+가고\s*싶(?:어|었어)요?$/, 'อยากไป#'],
    [/^(.+?)\s+사\s*(줘|주세요)$/, 'ซื้อ#ให้หน่อย'],
    // 사 감·사 옴: '팝콘 사 갈게' → จะซื้อป๊อปคอร์นไป, '우유 사 와' → ซื้อนมมาด้วยนะ.
    [/^(.+?)\s+사\s*갈게요?$/, 'จะซื้อ#ไป'],
    [/^(.+?)\s+사\s*올게요?$/, 'จะซื้อ#มา'],
    [/^(.+?)\s+사\s*갈까요?$/, 'ซื้อ#ไปไหม'],
    [/^(.+?)\s+사\s*올까요?$/, 'ซื้อ#มาไหม'],
    [/^(.+?)\s+사\s*와요?$/, 'ซื้อ#มาด้วยนะ'],
    [/^(.+?)\s+사\s*주자$/, 'ซื้อ#ให้กันเถอะ'], // 레고 사 주자 → ซื้อเลโก้ให้กันเถอะ
    [/^(.+?)\s+사\s*줄까요?$/, 'ซื้อ#ให้ไหม'],
    [/^(.+?)\s+만들어\s*줄까요?$/, 'ทำ#ให้ไหม'], // 김밥 만들어 줄까? → ทำคิมบับให้ไหม
    // 자리: '집 앞이야' → อยู่หน้าบ้าน, '역 옆이야' → อยู่ข้างสถานี.
    [/^(.+?)\s+앞(?:이야|이에요)$/, 'อยู่หน้า#', 'ask'],
    [/^(.+?)\s+옆(?:이야|이에요)$/, 'อยู่ข้าง#', 'ask'],
    [/^(.+?)\s+뒤(?:야|예요)$/, 'อยู่หลัง#', 'ask'],
    [/^(.+?)\s+(줘|주세요)$/, 'ขอ#หน่อย'],
    [/^(.+?)\s+(먹었어|먹었어요)$/, 'กิน#แล้ว'],
    [/^(.+?)\s+(샀어|샀어요)$/, 'ซื้อ#แล้ว'],
    // 홑 동사: '학교 가?' → ไปโรงเรียนไหม, '커피 마셔?' → ดื่มกาแฟไหม, '드라마 봐?' → ดูซีรีส์ไหม.
    // 나이 먹어·마음 먹어·시험 봐·눈치 봐 같은 굳은 말과 때 낱말(엊그제 봤어)은 뺀다(셋째 칸).
    // 봤어 는 넣지 않는다: 충전기 봤어? = เห็น(보았니), 드라마 봤어? = ดู — 가를 수 없다.
    [/^(.+?)에?\s+가요?$/, 'ไป#', 'go'],
    [/^(.+?)에?\s+갔어요?$/, 'ไป#มา', 'go'],
    [/^(.+?)\s+먹어요?$/, 'กิน#', 'eat'],
    [/^(.+?)\s+마셔요?$/, 'ดื่ม#', 'drink'],
    [/^(.+?)\s+마셨어요?$/, 'ดื่ม#แล้ว', 'drink'],
    [/^(.+?)\s+봐요?$/, 'ดู#', 'see'],
    // 하자: '야시장 가자' → ไปตลาดนัดกัน, '코코넛 아이스크림 먹자' → กินไอศกรีมมะพร้าวกัน.
    [/^(.+?)에?\s+가자$/, 'ไป#กัน', 'go'],
    [/^(.+?)\s+먹자$/, 'กิน#กัน', 'eat'],
    [/^(.+?)\s+마시자$/, 'ดื่ม#กัน', 'drink'],
    [/^(.+?)\s+사자$/, 'ซื้อ#กัน'],
    [/^(.+?)\s+보자$/, 'ดู#กัน', 'see'],
    // 홑 그림씨: '짐 많아?' → สัมภาระเยอะไหม, '방콕 더워' → กรุงเทพร้อน. 싸 는 '짐 싸·도시락 싸' 때문에 뺀다.
    [/^(.+?)\s+많아요?$/, '#เยอะ', 'adj'],
    [/^(.+?)\s+비싸요?$/, '#แพง', 'adj'],
    [/^(.+?)\s+맛있어요?$/, '#อร่อย', 'adj'],
    [/^(.+?)\s+매워요?$/, '#เผ็ด', 'adj'],
    [/^(.+?)\s+더워요?$/, '#ร้อน', 'adj'],
    [/^(.+?)\s+추워요?$/, '#หนาว', 'adj'],
    [/^(.+?)\s+멀어요?$/, '#ไกล', 'adj'],
    [/^(.+?)\s+가까워요?$/, '#ใกล้', 'adj'],
    [/^(.+?)\s+커요?$/, '#ใหญ่', 'adj'],
    [/^(.+?)\s+작아요?$/, '#เล็ก', 'adj'],
    [/^(.+?)\s+예뻐요?$/, '#สวย', 'adj'],
    [/^(.+?)\s+깨끗해요?$/, '#สะอาด', 'adj'],
    [/^(.+?)\s+더러워요?$/, '#สกปรก', 'adj'],
    [/^(.+?)\s+시끄러워요?$/, '#เสียงดัง', 'adj'],
    [/^(.+?)\s+조용해요?$/, '#เงียบ', 'adj'],
    [/^(.+?)\s+재밌어요?$/, '#สนุก', 'adj'],
    [/^(.+?)\s+어려워요?$/, '#ยาก', 'adj'],
    [/^(.+?)\s+쉬워요?$/, '#ง่าย', 'adj'],
    // 묻는 말: '비행기 몇 시야?' → เครื่องบินกี่โมง, '생일 언제야?' → วันเกิดเมื่อไหร่, '화장실 어디야?' → ห้องน้ำอยู่ที่ไหน.
    [/^(.+?)\s+몇\s*시(?:야|예요|에요)?$/, '#กี่โมง', 'ask'],
    [/^(.+?)\s+몇\s*시에\s*열어요?$/, '#เปิดกี่โมง', 'ask'],
    [/^(.+?)\s+몇\s*시에\s*닫아요?$/, '#ปิดกี่โมง', 'ask'],
    [/^(.+?)\s+몇\s*시에\s*끝나요?$/, '#เลิกกี่โมง', 'ask'],
    [/^(.+?)\s+언제(?:야|예요|에요)$/, '#เมื่อไหร่', 'ask'],
    [/^(.+?)\s+어디(?:야|예요|에요|\s*있어|\s*있어요)$/, '#อยู่ที่ไหน', 'ask'],
    // 당부: '원숭이 조심해' → ระวังลิงนะ, '우산 챙겨' → เอาร่มไปด้วยนะ, '등산화 신고 와' → ใส่รองเท้าเดินป่ามานะ.
    [/^(.+?)\s+조심해요?$/, 'ระวัง#นะ'],
    [/^(.+?)\s+챙겨요?$/, 'เอา#ไปด้วยนะ'],
    [/^(.+?)\s+(?:신고|입고|쓰고)\s*(?:와|와요|오세요)$/, 'ใส่#มานะ'],
    [/^(.+?)\s+얼마\s*나왔어요?$/, '#ออกมาเท่าไหร่', 'ask'],
    [/^(.+?)\s+얼마(?:야|예요|에요)$/, '#เท่าไหร่', 'ask'],
    // 돈 냄: '전기세 냈어?' → จ่ายค่าไฟหรือยัง, '관리비 내야 돼' → ต้องจ่ายค่าส่วนกลาง. 앞말 값이 요금(ค่า·ภาษี…)일
    // 때만 — 숙제·사표·화 냈어 의 '내다' 는 뜻이 다르다(CHAT_PAY).
    [/^(.+?)\s+안\s*냈어요?$/, 'ยังไม่ได้จ่าย#', 'pay'],
    [/^(.+?)\s+냈어요?$/, 'จ่าย#แล้ว', 'pay'],
    [/^(.+?)\s+내야\s*(돼|돼요|해|해요)$/, 'ต้องจ่าย#', 'pay'],
    [/^(.+?)\s+낼게요?$/, 'เดี๋ยวจ่าย#เอง', 'pay'],
  ];
  const CHAT_PAY = /^(ค่า|ภาษี|เบี้ยประกัน|ดอกเบี้ย|หนี้|เงินประกัน|เงินผ่อน|เงินดาวน์)/;
  // 틀 앞말 중 용어집 값(쇼핑 뜻)이 대화 뜻과 다른 것: 월세 = เช่ารายเดือน(월세 매물) → ค่าเช่า(월세 냈어?).
  const CHAT_FRAME_TH = { 월세: 'ค่าเช่า', 집세: 'ค่าเช่าบ้าน', 쌀국수: 'ก๋วยเตี๋ยว', 영화: 'หนัง' }; // 쌀국수 = เส้นก๋วยเตี๋ยว(쇼핑 면발)
  const CHAT_FRAME_IDIOM = {
    go: new Set(),
    drink: new Set(),
    adj: new Set(),
    ask: new Set(),
    pay: new Set(),
    ride: new Set('그네 스키 보드 눈썰매 미끄럼틀 썰매 롤러코스터 파도 리듬 간지럼 더위 추위'.split(' ')),
    eat: new Set('나이 마음 더위 골탕 꿀밤 한방 애'.split(' ')),
    see: new Set('시험 면접 손해 눈치 이익 맞선 피해 덕 고생 재미 끝장 끝 선 점 장 맛 간 망신 혼 쇼 한번 얼굴 어디'.split(' ')),
  };
  const CHAT_FRAME_TIME = /^(วัน|พรุ่งนี้|มะรืน|เมื่อวาน|เมื่อกี้|เมื่อก่อน|คืนนี้|เย็นนี้|เช้านี้|ตอน|สัปดาห์|อาทิตย์|เดือน|ปี|เดี๋ยว|ทุก|บ่อย|แล้ว)/;
  // 줄 앞 때 낱말(chatFromGlossary 가 떼고 나머지를 찾는다).
  const CHAT_TIME_LEAD =
    /^([월화수목금토일]요일\s*(?:아침|저녁|밤)?에?|이번\s*달에?|다음\s*달에?|지난\s*달에?|이번\s*주에?|지난\s*주에?|어젯밤에?|오늘\s*아침에?|내년에?|올해|작년에?|오늘\s*밤에?|오늘\s*저녁에?|내일\s*아침에?|내일\s*저녁에?|다음\s*주에?|이번\s*주말에?|오늘|내일|모레|지금|이따가?|주말에|저녁에|아침에|밤에|새벽에|낮에|점심에|요즘|어제|아까)(?:은|는)?\s+(\S.*)$/;
  const CHAT_TIME_PRED = /(어|아|야|해|워|와|려|여|자|게|까|지|다|네|요|줘|라|래|대|셔|봐|가|져|돼|나|내|파|싸|커|빠|뻐|퍼|때|춰|쳐|켜|짜|러|니|냐|혀|껴|쪄|펴|겨)$/;
  const CHAT_TIME_TH = {
    오늘: 'วันนี้', 내일: 'พรุ่งนี้', 모레: 'มะรืนนี้', 지금: 'ตอนนี้', 이따: 'เดี๋ยว', 이따가: 'เดี๋ยว',
    주말에: 'เสาร์อาทิตย์นี้', 이번주말: 'เสาร์อาทิตย์นี้', 이번주말에: 'เสาร์อาทิตย์นี้', 저녁에: 'ตอนเย็น', 아침에: 'ตอนเช้า',
    오늘밤: 'คืนนี้', 오늘밤에: 'คืนนี้', 오늘저녁: 'เย็นนี้', 오늘저녁에: 'เย็นนี้', 내일아침: 'พรุ่งนี้เช้า', 내일아침에: 'พรุ่งนี้เช้า',
    내일저녁: 'พรุ่งนี้เย็น', 내일저녁에: 'พรุ่งนี้เย็น', 다음주: 'อาทิตย์หน้า', 다음주에: 'อาทิตย์หน้า', 어제: 'เมื่อวาน', 아까: 'เมื่อกี้',
    밤에: 'ตอนกลางคืน', 새벽에: 'ตอนเช้ามืด', 낮에: 'ตอนกลางวัน', 점심에: 'ตอนเที่ยง', 요즘: 'ช่วงนี้',
    이번달: 'เดือนนี้', 이번달에: 'เดือนนี้', 다음달: 'เดือนหน้า', 다음달에: 'เดือนหน้า', 지난달: 'เดือนที่แล้ว', 지난달에: 'เดือนที่แล้ว',
    이번주: 'อาทิตย์นี้', 이번주에: 'อาทิตย์นี้', 지난주: 'อาทิตย์ที่แล้ว', 지난주에: 'อาทิตย์ที่แล้ว', 어젯밤: 'เมื่อคืน', 어젯밤에: 'เมื่อคืน',
    오늘아침: 'เช้านี้', 오늘아침에: 'เช้านี้', 내년: 'ปีหน้า', 내년에: 'ปีหน้า', 올해: 'ปีนี้', 작년: 'ปีที่แล้ว', 작년에: 'ปีที่แล้ว',
  };
  // 요일(+아침·저녁·밤)(+에): 금요일 저녁에 → วันศุกร์ตอนเย็น.
  for (const [d, dt] of Object.entries({ 월: 'จันทร์', 화: 'อังคาร', 수: 'พุธ', 목: 'พฤหัส', 금: 'ศุกร์', 토: 'เสาร์', 일: 'อาทิตย์' })) {
    for (const [p, pt] of [['', ''], ['아침', 'ตอนเช้า'], ['저녁', 'ตอนเย็น'], ['밤', 'ตอนกลางคืน']]) {
      CHAT_TIME_TH[`${d}요일${p}`] = CHAT_TIME_TH[`${d}요일${p}에`] = `วัน${dt}${pt}`;
    }
  }
  // 값 앞의 때 말(대명사를 그 뒤에 넣는다: พรุ่งนี้เราไปทะเลกัน). 긴 것부터.
  const CHAT_TIME_TH_RE = new RegExp(
    `^(?:${[...new Set(Object.values(CHAT_TIME_TH))].filter((t) => t !== 'เดี๋ยว').sort((a, b) => b.length - a.length).join('|')})`
  );
  // 줄 앞 대명사·이음말 → 값 앞에 붙일 태국어('' = 그냥 뗀다). chatFromGlossary 의 마지막 단계.
  const CHAT_LEAD_TH = new Map(
    Object.entries({
      나: '', 난: '', 나는: '', 내가: '', 아: '', 아아: '', 혹시: '',
      너: 'เธอ', 넌: 'เธอ', 너는: 'เธอ', 네가: 'เธอ', 니가: 'เธอ', 나도: 'ฉันก็', 너도: 'เธอก็',
      우리: 'เรา', 우리도: 'เราก็', 자기: 'ที่รัก', 자기도: 'ที่รักก็', 오빠: 'พี่', 오빠도: 'พี่ก็',
      근데: 'แต่', 그런데: 'แต่', 그리고: 'แล้วก็', 그래서: 'เลย', 아직: 'ยัง',
    })
  );
  // 너·우리 뒤의 이런 명사는 '~의'(너 이름·우리 엄마).
  const CHAT_LEAD_OWNED = new Set(
    ('엄마 아빠 어머니 아버지 부모님 가족 집 애 아이 애기 아기 아들 딸 남편 아내 와이프 오빠 언니 누나 형 동생 ' +
      '할머니 할아버지 친구 남친 여친 남자친구 여자친구 애인 이름 나이 생일 번호 전화 폰 핸드폰 차 방 일 회사 학교 ' +
      '선생님 사장님 동네 나라 강아지 고양이 사진 얼굴 머리 옷 돈 꿈 마음 몸 손 발 눈 목소리 말 생각 취미 직업 ' +
      '선물 가방 신발 편지 메시지 숙제 짐 차 표 여권 비자 계좌 주소 사진첩 방 침대 노트북 컴퓨터').split(' ')
  );
  // 사람을 목적어로 받는 말 — 너 보고 싶어 = คิดถึงเธอ 라 เธอ 를 앞에 붙이지 않는다.
  const CHAT_LEAD_OBJ =
    /^(?:จะ|อยาก|ไม่|ต้อง|เดี๋ยว|ยัง)?(คิดถึง|รัก|ชอบ|ไม่ชอบ|เกลียด|เชื่อ|ไม่เชื่อ|รอ|เป็นห่วง|ห่วง|อยากเจอ|อยากเห็น|หึง|ขอบคุณ|ขอโทษ|เข้าใจ|ไม่เข้าใจ|ช่วย|โทรหา|ดูแล|หา|ตาม|ไปรับ|ไปส่ง|สอน|ถาม|บอก|ให้|อวยพร|ยินดีด้วย)/;
  // 틀 앞말 끝의 개수(커피 한 잔·물 두 병·망고 3개).
  const CHAT_NATIVE = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
  const CHAT_CLASSIFIER = {
    잔: 'แก้ว', 병: 'ขวด', 개: 'อัน', 봉지: 'ถุง', 장: 'ใบ', 권: 'เล่ม', 그릇: 'ชาม', 접시: 'จาน', 마리: 'ตัว',
    캔: 'กระป๋อง', 팩: 'แพ็ค', 박스: 'กล่อง', 상자: 'กล่อง', 켤레: 'คู่', 벌: 'ชุด', 송이: 'ดอก', 조각: 'ชิ้น', 알: 'เม็ด',
  };
  const CHAT_COUNT = new RegExp(
    `^(.+?)\\s+(${Object.keys(CHAT_NATIVE).join('|')}|\\d+)\\s*(${Object.keys(CHAT_CLASSIFIER).join('|')})만?$`
  );
  // 한 글자 명사 중 틀에 넣어도 되는 것(차=ชา·눈·배·말 처럼 뜻이 갈리는 글자는 뺌).
  const CHAT_FRAME_ONE = '물돈밥약옷펜빵껌꿀술쌀집표컵방꽃문';
  // 앞말이 이런 대명사·부사면 틀에 넣지 않는다(거기 있어? = 거기 있니, 방금 먹었어 = 막 먹었다).
  const CHAT_FRAME_NOT = new Set(
    ('거기 여기 저기 이거 그거 저거 지금 방금 아까 금방 빨리 천천히 너무 진짜 정말 많이 조금 다시 먼저 같이 ' +
      '혼자 또 아직 벌써 오늘 내일 어제 매일 항상 자주 가끔 요즘 나중에 일찍 늦게 나도 너도 우리 걸어서 ' +
      '그냥 계속 제발 이미 아마 혹시 갑자기 완전 엄청 되게 아주 별로 전혀 그대로 열심히 대충 함께').split(' ')
  );
  function chatFrame(bare, idx) {
    for (const [re, th, idiom] of CHAT_FRAMES) {
      const m = bare.match(re);
      if (!m) continue;
      let head = m[1].replace(/\s+(좀|꼭)$/, ''); // '우유 좀 사 와'·'우산 꼭 챙겨' — 홑 '좀'·'꼭' 은 뜻을 안 바꾼다
      // 개수: '커피 한 잔 마실래?' → ดื่มกาแฟสักแก้วไหม, '물 두 병 사 와' → ซื้อน้ำ 2 ขวดมาด้วย.
      let cnt = '';
      const cm = head.match(CHAT_COUNT);
      if (cm) {
        const k = CHAT_NATIVE[cm[2]] || +cm[2];
        [head, cnt] = [cm[1], (k === 1 ? 'สัก' : ` ${k} `) + CHAT_CLASSIFIER[cm[3]]];
      }
      let n = squash(head);
      // '이 드라마 재밌어' → ละครนี้สนุก: 앞의 이·그·저 는 떼고 값 뒤에 นี้/นั้น.
      let demo = '';
      const dm = !idx.has(n) && head.match(/^(이|그|저)\s+(\S.*)$/);
      if (dm) [n, demo] = [squash(dm[2]), dm[1] === '이' ? 'นี้' : 'นั้น'];
      // 조사는 앞말에 붙은 것만 뗀다 — '치과 가 봐' 의 띄어 쓴 가 는 동사(가다)라 '치과' 를 보는 말이 아니다.
      if (!idx.has(n) && /[이가을를은는도]$/.test(n)) {
        if (/\s\S$/.test(head)) return '';
        n = n.slice(0, -1);
      }
      if (CHAT_FRAME_NOT.has(n) || (n.length < 2 && !CHAT_FRAME_ONE.includes(n))) return '';
      if (idiom && (CHAT_FRAME_IDIOM[idiom].has(n) || CHAT_FRAME_TIME.test(idx.get(n) || ''))) return '';
      // 보내 줘·하러 = 동사. 한국어·영어(ภาษา…) 는 ~어 로 끝나도 명사다.
      if (/(게|러|요|[아어여워와해봐려])$/.test(n) && !/^ภาษา/.test(idx.get(n) || '')) return '';
      if (/(에|번|씩|만|부터|까지|보다)$/.test(n)) return ''; // 이틀에 한 번 주세요·반 킬로만 주세요·생각보다 괜찮아 = 명사 아님
      // 할 수·먹을 거·간 데·본 적 — ㄹ/ㄴ 받침 뒤 매인 말은 명사가 아니다(쌀국수·매운탕 은 괜찮다).
      const jong = n.length >= 2 ? (n.charCodeAt(n.length - 2) - 0xac00) % 28 : 0;
      if (/(수|거|것|데|적|줄)$/.test(n) && (jong === 8 || jong === 4) && n !== '자전거') return '';
      const v = CHAT_FRAME_TH[n] || idx.get(n);
      if (!v || /[\sA-Za-z0-9]/.test(v) || TH_QUESTION.test(v) || /^ไม่/.test(v)) return '';
      // 앞말 값이 이미 문장(우산챙겨 = อย่าลืมพกร่มนะ)이면 명사가 아니다: '우산 챙겨 가' ≠ ไปอย่าลืม….
      // '없으면 사 와' 의 없으면=ถ้าไม่มี 같은 조건 마디도 명사가 아니다(ซื้อถ้าไม่มีมาด้วย ✗).
      if (/^(อย่า|ช่วย(?!ได้)|ขอ(?!ง)|ถ้า|เมื่อ(?!วาน|กี้|เช้า|คืน))/.test(v) || /(นะ|สิ|หน่อย|เถอะ|ด้วย|แล้ว|จัง)$/.test(v)) return '';
      if (idiom === 'pay' && !CHAT_PAY.test(v)) return '';
      // '모레 어때?'·'토요일 어때?' 는 날을 묻는 말 → สะดวกไหม(그날 괜찮아?).
      if (th === '#เป็นยังไง' && /^(วัน|พรุ่งนี้|มะรืน|เมื่อวาน|คืนนี้|เย็นนี้|พรุ่ง|สัปดาห์|อาทิตย์|เดือน|ปีหน้า|ตอน|ช่วง)/.test(v)) return v + 'สะดวกไหม';
      if (th === '#โอเค' && v === 'เวลา') return 'สะดวก'; // 시간 괜찮아? = สะดวกไหม
      const ride = /^(มอเตอร์ไซค์|จักรยาน|ม้า|ช้าง)/.test(v) ? 'ขี่' : 'นั่ง'; // 오토바이·자전거는 ขี่
      const out = th.replace('@', ride).replace('#', v + demo + cnt);
      return v === 'บ้าน' && !demo ? out.replace('ไปบ้าน', 'กลับบ้าน') : out; // 집에 가 = กลับบ้าน
    }
    return '';
  }

  // '하다' 말: '운동했어' → ออกกำลังกายแล้ว, '청소하자' → ทำความสะอาดกัน, '요리하고 있어' → กำลังทำอาหารอยู่.
  // 앞말 값이 동사여야 한다 — 노래=เพลง·게임=เกม 처럼 명사인 값은 CHAT_HADA_FIX 로 고치고(ร้องเพลง·เล่นเกม),
  // การ·ความ·ร้าน… 으로 시작하는 명사 값은 번역에 맡긴다. 위에서부터 차례로 본다(안 했어 를 했어 보다 먼저).
  const CHAT_HADA = [
    [/^(.+?)\s+안\s*했어요?$/, 'ไม่ได้#'],
    [/^(.+?)\s+안\s*해요?$/, 'ไม่#'],
    [/^(.+?)\s+못\s*해요?$/, '#ไม่ได้'],
    [/^(.+?)\s*하지\s*(?:마|마요|마세요)$/, 'อย่า#'],
    [/^(.+?)\s*하고\s*있어요?$/, 'กำลัง#อยู่'],
    [/^(.+?)\s*하는\s*중이(?:야|에요)$/, 'กำลัง#อยู่'],
    // '회의 중이야' → กำลังประชุมอยู่, '회의 중이었어' → ตอนนั้นประชุมอยู่.
    [/^(.+?)\s+중이(?:야|에요)$/, 'กำลัง#อยู่'],
    [/^(.+?)\s+중이었어요?$/, 'ตอนนั้น#อยู่'],
    [/^(.+?)\s*해야\s*(?:돼|돼요|해|해요)$/, 'ต้อง#'],
    [/^(.+?)\s*하러\s*가자$/, 'ไป#กัน'],
    [/^(.+?)\s*하러\s*갈게요?$/, 'จะไป#'],
    [/^(.+?)\s*하러\s*갔어요?$/, 'ไป#แล้ว'],
    [/^(.+?)\s*하러\s*가요?$/, 'ไป#'],
    [/^(.+?)\s*하고\s*싶(?:어|었어)요?$/, 'อยาก#'],
    [/^(.+?)\s*할\s*수\s*있어요?$/, '#ได้'],
    [/^(.+?)\s*할\s*거(?:야|예요|에요)$/, 'จะ#'],
    [/^(.+?)\s*해\s*봤어요?$/, 'เคย#'],
    [/^(.+?)\s*해\s*(?:줘|주세요)$/, 'ช่วย#ให้หน่อย'],
    [/^(.+?)\s*해\s*줄게요?$/, 'จะ#ให้'],
    [/^(.+?)\s*했어요?$/, '#แล้ว'],
    [/^(.+?)\s*할래요?$/, '#ไหม'],
    [/^(.+?)\s*할까요?$/, '#ดีไหม'],
    [/^(.+?)\s*할게요?$/, 'จะ#'],
    [/^(.+?)\s*하자$/, '#กัน'],
    [/^(.+?)\s*해요?$/, '#'],
  ];
  const CHAT_HADA_FIX = {
    เพลง: 'ร้องเพลง', เกม: 'เล่นเกม', ฟุตบอล: 'เล่นฟุตบอล', โยคะ: 'เล่นโยคะ', ฟิตเนส: 'เข้าฟิตเนส', โทรศัพท์: 'โทร',
    โอที: 'ทำโอที', งานพาร์ทไทม์: 'ทำงานพาร์ทไทม์', สมาธิ: 'นั่งสมาธิ', การบ้าน: 'ทำการบ้าน', คลาส: 'เรียน',
    อาหาร: 'ทำอาหาร', เล็บ: 'ทำเล็บ', ย้อม: 'ทำสีผม', เดท: 'ไปเดท', เฟซบุ๊ก: 'เล่นเฟซบุ๊ก', สั่งซื้อ: 'สั่ง',
    // 하다 가 붙으면 뜻이 정해지는 말: 사과(แอปเปิ้ล)하다 = ขอโทษ, 방문(ประตูห้อง)하다 = ไปเยี่ยม, 공연하다 = แสดง.
    แอปเปิ้ล: 'ขอโทษ', ประตูห้อง: 'ไปเยี่ยม', คอนเสิร์ต: 'แสดง',
  };
  const CHAT_HADA_ONE = { 일: 'ทำงาน', 말: 'บอก' };
  // 하다 말 앞 부사 → 동사 뒤 태국어(같이 는 따로 — ด้วยกัน 을 กัน 자리에 넣는 단계가 맡는다).
  const CHAT_HADA_ADV = {
    일찍: 'แต่เช้า', 늦게: 'ช้า', 빨리: 'เร็วๆ', 천천히: 'ช้าๆ', 열심히: 'อย่างตั้งใจ', 많이: 'เยอะๆ', 혼자: 'คนเดียว',
    다시: 'อีกครั้ง', 먼저: 'ก่อน', 매일: 'ทุกวัน', 자주: 'บ่อยๆ',
  };
  const CHAT_HADA_ADJ = new Set(
    ('위험 가능 불가능 필요 중요 피곤 행복 건강 깨끗 조용 불편 편 심심 유명 친절 이상 특별 비슷 간단 복잡 확실 정확 ' +
      '충분 부족 급 시급 안전 편리 따뜻 시원 신선 똑똑 착 솔직 단순 소중 우울 답답 궁금 미안 감사').split(' ')
  );
  const CHAT_HADA_NOUN =
    /^(ไม่|อย่า|การ|ความ|ค่า|ที่|ร้าน|โรง|เครื่อง|ชุด|ห้อง|อุปกรณ์|ผ้า|ถุง|กล่อง|วัน|หัว|ตัว|ของ|รถ|บ้าน|คน|หนังสือ|น้ำ|ยา|เงิน|เด็ก|แม่|พ่อ|ใบ|บัตร|ตั๋ว|คำ|บท|ปัญหา|โครงการ|คณะ|อาหาร|ขนม|เดลิเวอรี่)/;
  function chatHada(bare, idx) {
    for (const [re, th] of CHAT_HADA) {
      const m = bare.match(re);
      if (!m) continue;
      let n = squash(m[1]);
      if (!idx.has(n) && /[을를]$/.test(n)) n = n.slice(0, -1); // 운동을 했어
      // 목적어 + 하다 말: '캠핑장 예약했어' → จองลานกางเต็นท์แล้ว, '방 청소했어' → ทำความสะอาดห้องแล้ว(동사 + 목적어).
      // 앞 낱말이 때·부사(오늘·열심히·같이)거나 ~에·~로 처럼 조사가 붙었으면 뺀다.
      let obj = '';
      const two = !idx.has(n) && m[1].trim().match(/^(\S+)\s+(\S+)$/);
      // 부사 + 하다 말: '일찍 출근해야 돼' → ต้องเข้างานแต่เช้า(부사는 동사 뒤).
      if (two && CHAT_HADA_ADV[two[1]]) [n, obj] = [squash(two[2]), CHAT_HADA_ADV[two[1]]];
      else if (two) {
        const o = two[1].replace(/(을|를)$/, '');
        const ov = o.length >= 2 || CHAT_FRAME_ONE.includes(o) ? idx.get(o) : '';
        const objOk =
          ov && !CHAT_FRAME_NOT.has(o) && !CHAT_ASK_WORD.test(o) && !/(히|게|로|에|서|랑|도|만|이|가|은|는)$/.test(o) &&
          (!/(요|[아어여워와해봐려])$/.test(o) || /^ภาษา/.test(ov)) && // 고마워(동사) ✗, 태국어(ภาษาไทย) ○
          !/[\sA-Za-z0-9]/.test(ov) && !TH_QUESTION.test(ov) && !CHAT_FRAME_TIME.test(ov) && !/^(ไม่|ที่|ตอน)/.test(ov);
        if (objOk && !/^봉사$/.test(squash(two[2]))) [n, obj] = [squash(two[2]), ov]; // 식사 봉사 = 한 낱말
      }
      let v = CHAT_HADA_ONE[n] || (n.length >= 2 && idx.get(n));
      // ~어야 해(벗어야 해요 = ต้องถอด)는 '하다' 말이 아니다.
      if (!v || CHAT_FRAME_NOT.has(n) || CHAT_ASK_WORD.test(n)) continue;
      if (/(게|러|요|야|[아어여워와해봐려])$/.test(n) && !/^(샤워|타워)$/.test(n)) continue; // 샤워 = 명사
      if (/^(미안|고마|죄송)$/.test(n)) continue; // 미안 못 해 = 미안, (그건) 못 해
      v = CHAT_HADA_FIX[v] || v;
      if (/[\sA-Za-z0-9]/.test(v) || TH_QUESTION.test(v) || CHAT_HADA_NOUN.test(v) || CHAT_FRAME_TIME.test(v)) continue;
      if (/(นะ|สิ|ครับ|ค่ะ|จ้า|แล้ว|ๆ|มา)$/.test(v)) continue;
      // 위험해·가능해 같은 그림씨는 앞 낱말이 주어라 앞에 둔다(수술 위험해 → ผ่าตัดอันตราย).
      return th.replace('#', CHAT_HADA_ADJ.has(n) && !CHAT_HADA_ADV[two && two[1]] ? obj + v : v + obj);
    }
    return '';
  }

  // '~ 줘서 고마워' 의 한 글자 앞말(와 = 감탄사 ว้าว 와 겹친다).
  // 용어집에 낱말로도 있는 ~고 중 동사 이음꼴(광고·창고·최고 는 명사라 ~고 이음에서 뺀다).
  const CHAT_GO_VERB = new Set('먹고 씻고 마시고 끝나고 가고 오고 자고 놀고 하고 입고 타고 쉬고 만나고 일하고 공부하고 샤워하고'.split(' '));
  // 이음 마디의 한 글자 동사(올 때 → ตอนมา; 와 는 홀로 쓰면 감탄사 ว้าว).
  const CHAT_VERB_ONE = { 와: 'มา', 가: 'ไป', 자: 'นอน', 봐: 'ดู', 사: 'ซื้อ', 해: 'ทำ', 놀아: 'เล่น', 쉬어: 'พัก', 먹어: 'กิน' };
  // 사랑해 = รักกัน(ขอบคุณที่รัก 은 '고마워 자기야' 로 읽힌다).
  const CHAT_GIVE_BASE = {
    와: 'มา', 놀러와: 'มาเที่ยว', 데리러와: 'มารับ', 보러와: 'มาหา', 가: 'ไป', 들어: 'ฟัง', 연락: 'ติดต่อมา', 사랑해: 'รักกัน',
  };

  // ~아서·~어서 의 앞말: 받침 없이 ㅏ·ㅐ·ㅓ·ㅕ·ㅘ·ㅙ·ㅝ·ㅞ 로 끝난다(배고파·피곤해·와·늦어).
  function chatSeoOk(w) {
    const c = w.charCodeAt(w.length - 1) - 0xac00;
    if (c < 0 || c > 11171 || c % 28) return false;
    return [0, 1, 4, 6, 9, 10, 14, 15].includes(Math.floor((c % 588) / 28));
  }

  // 걸리는 시간: '30분 걸려' → ใช้เวลา 30 นาที, '1시간 반 정도 걸려' → ใช้เวลาประมาณ 1 ชั่วโมงครึ่ง.
  const CHAT_SPAN_UNIT = { 분: 'นาที', 시간: 'ชั่วโมง', 일: 'วัน', 주: 'สัปดาห์', 주일: 'สัปดาห์', 달: 'เดือน', 개월: 'เดือน', 년: 'ปี' };
  function chatDuration(bare, asks) {
    const m = bare
      .replace(/(^|\s)일주일/, '$11주')
      .replace(/(^|\s)이주일/, '$12주')
      .match(/^(.+?)\s*(정도|쯤)?\s*걸(려|려요|렸어|렸어요)$/);
    if (!m) return '';
    const num = `(${Object.keys(CHAT_NATIVE).join('|')}|\\d+)`;
    const unit = /(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(주일|개월|시간|분|일|주|달|년)|(반)/g;
    if (!new RegExp(`^(?:\\s*(?:${num}\\s*(?:주일|개월|시간|분|일|주|달|년)|반))+$`).test(m[1])) return '';
    let out = '';
    for (const p of m[1].matchAll(unit)) {
      out += p[3] ? 'ครึ่ง' : `${out ? ' ' : ''}${CHAT_NATIVE[p[1]] || +p[1]} ${CHAT_SPAN_UNIT[p[2]]}`;
    }
    return `ใช้เวลา${m[2] ? 'ประมาณ' : ''} ${out}${asks ? 'เหรอ' : ''}`;
  }

  // 돈: '삼천오백 바트' → 3500 บาท, '만 이천 원' → 12000 วอน, '오백 바트 정도' → ประมาณ 500 บาท.
  // 용어집엔 자주 쓰는 액수만 있어서(천오백바트) 한자어 수를 셈해 숫자로 쓴다.
  function chatMoney(bare, asks) {
    const m = bare.match(/^([일이삼사오육칠팔구십백천만\s]+?)\s*(바트|밧|원)\s*(정도|쯤)?\s*(?:이야|이에요|예요|야|요)?$/);
    if (!m || !/[십백천만]/.test(m[1]) && m[1].replace(/\s/g, '').length > 1) return '';
    const DIG = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
    const UNIT = { 십: 10, 백: 100, 천: 1000 };
    let [total, part, d] = [0, 0, 0];
    for (const ch of m[1].replace(/\s/g, '')) {
      if (DIG[ch]) d = DIG[ch];
      else if (UNIT[ch]) [part, d] = [part + (d || 1) * UNIT[ch], 0];
      else [total, part, d] = [total + (part + d || 1) * 10000, 0, 0]; // 만
    }
    const n = total + part + d;
    if (!n) return '';
    return `${m[3] ? 'ประมาณ ' : ''}${n} ${m[2] === '원' ? 'วอน' : 'บาท'}${asks ? 'เหรอ' : ''}`;
  }

  // 줄기 → ~아/어 꼴 후보: 덥→더워, 예쁘→예뻐, 졸리→졸려, 오→와, 모르→몰라, 피곤하→피곤해, 먹었→먹었어.
  function koInfinitives(stem) {
    const L = stem.charCodeAt(stem.length - 1) - 0xac00;
    if (L < 0 || L > 11171) return [];
    const head = stem.slice(0, -1);
    const syl = (c, v, j) => String.fromCharCode(0xac00 + (c * 21 + v) * 28 + j);
    const [c, v, j] = [Math.floor(L / 588), Math.floor((L % 588) / 28), L % 28];
    const P = head ? head.charCodeAt(head.length - 1) - 0xac00 : -1;
    const pv = P >= 0 && P <= 11171 ? Math.floor((P % 588) / 28) : -1;
    const bright = pv === 0 || pv === 8; // 앞 모음 ㅏ·ㅗ
    const out = [];
    if (stem.endsWith('하')) out.push(head + '해');
    if (j === 20) out.push(stem + '어'); // 았·었·있
    if (j === 17) out.push(head + syl(c, v, 0) + '워'); // ㅂ 불규칙
    if (stem.endsWith('르') && P >= 0) out.push(head.slice(0, -1) + String.fromCharCode(head.charCodeAt(head.length - 1) + 8) + (bright ? '라' : '러'));
    if (j === 0 && v === 18) out.push(head + syl(c, bright ? 0 : 4, 0)); // ㅡ 탈락
    if (j === 0 && v === 20) out.push(head + syl(c, 6, 0)); // ㅣ → ㅕ
    if (j === 0 && v === 8) out.push(head + syl(c, 9, 0)); // ㅗ → ㅘ
    if (j === 0 && v === 13) out.push(head + syl(c, 14, 0)); // ㅜ → ㅝ
    if (j === 0 && v === 11) out.push(head + syl(c, 10, 0)); // 되 → 돼
    if (j === 0 && [0, 1, 4, 5, 6].includes(v)) out.push(stem); // 가·내·서
    if (j !== 0) out.push(stem + (v === 0 || v === 8 ? '아' : '어'));
    if (j === 19) out.push(head + syl(c, v, 0) + (v === 0 || v === 8 ? '아' : '어')); // ㅅ 불규칙(낫→나아, 붓→부어) — 웃어·씻어 다음
    return out;
  }

  // 들은 말 ~래: 명사(이)래 = 그렇대('털 뭉치 때문이래' → 때문이야 꼴 값, '오백 바트래') → เขาว่า…,
  // 동사 + 래 = 하라고 했다('사료 바꾸래' → เขาบอกให้เปลี่ยน…). 할래·먹을래(ㄹ 받침)·노래·그래(앞이 한 글자)는 아니다.
  function chatHearsayRae(bare, idx, asks) {
    const m = bare.match(/^(.+?\S)래요?$/);
    if (!m || m[1].replace(/\s/g, '').length < 2) return '';
    const body = m[1];
    const st = (x) => !TH_QUESTION.test(x);
    const bad = (v) => !v || /^(ห้าม|ช่วย(?!ได้)|ขอ(?!ง))/.test(v);
    // '늦지 말래' → 늦지 마 = อย่ามาสาย → เขาบอกว่าอย่ามาสาย
    if (/지\s*말$/.test(body)) {
      const v = chatWhole(body.replace(/말$/, '마'), idx, st);
      if (v && /^อย่า/.test(v)) return asks ? `เขาบอกว่า${v}เหรอ` : `เขาบอกว่า${v}`;
      return '';
    }
    const L = body.charCodeAt(body.length - 1) - 0xac00;
    if (L < 0 || L > 11171 || L % 28 === 8 || /을$/.test(body)) return '';
    const nounForms = body.endsWith('이') ? [body + '야', body.slice(0, -1) + '이야'] : [body + '야', body + '이야'];
    for (const f of nounForms) {
      const v = chatWhole(f, idx, st);
      if (bad(v) || /^อย่า/.test(v)) continue;
      const s = 'เขาว่า' + v.replace(/^(?:เขา|หมอ|เพื่อน)?(?:บอก)?ว่า(?!ย)/, '');
      return asks ? s + 'เหรอ' : s;
    }
    const [pre, w0] = splitLastWord(body);
    const w = w0.length >= 2 && w0.endsWith('으') ? w0.slice(0, -1) : w0; // 먹으래 → 먹
    for (const f of koInfinitives(w)) {
      if ((pre + f).replace(/\s/g, '').length < 2) continue;
      const fr = [chatFrame(pre + f, idx), chatHada(pre + f, idx)].find((x) => x && st(x)) || ''; // 약 먹어 = 틀 กินยา
      const v = chatWhole(pre + f, idx, st) || fr;
      const core = bad(v) ? '' : v.replace(/\s*(นะ|หน่อย|ด้วย|สิ|เถอะ)$/, ''); // นอนเร็วๆ นะ → นอนเร็วๆ
      if (!core || /\s/.test(core)) continue;
      const s = /^อย่า/.test(core) ? 'เขาบอกว่า' + core : 'เขาบอกให้' + core;
      return asks ? s + 'เหรอ' : s;
    }
    return '';
  }
  function splitLastWord(s) {
    const i = s.lastIndexOf(' ');
    return i < 0 ? ['', s] : [s.slice(0, i + 1), s.slice(i + 1)];
  }

  // 들은 말: '사람 많이 다쳤대' → เขาว่า…, '내일 비 온대' → เขาว่าพรุ่งนี้ฝนตก. 물음표면 …เหรอ.
  // ~었대 → ~었어, ~ㄴ대·~는대 → 줄기, 그 밖(많대) → 줄기의 ~어 꼴로 평서 값을 찾는다. 침대·반대·20대 는 앞이 짧거나 한글이 아니라 건너뛴다.
  // 들은 말의 말한 사람: '의사가 괜찮대' → หมอบอกว่าไม่เป็นไร(เขาว่าหมอโอเค 아님).
  const CHAT_HEARSAY_WHO = {
    의사: 'หมอ', 엄마: 'แม่', 아빠: 'พ่อ', 친구: 'เพื่อน', 선생님: 'ครู', 사장님: 'เจ้านาย', 언니: 'พี่สาว', 누나: 'พี่สาว',
    오빠: 'พี่ชาย', 형: 'พี่ชาย', 동생: 'น้อง', 할머니: 'ยาย', 할아버지: 'ตา', 남편: 'สามี', 아내: 'ภรรยา', 걔: 'เขา',
  };
  function chatHearsay(bare, idx, asks) {
    const rae = chatHearsayRae(bare, idx, asks);
    if (rae) return rae;
    const m = bare.match(/^(.+?)대요?$/);
    if (!m || m[1].replace(/\s/g, '').length < 2) return '';
    const sm = m[1].match(/^(?:내|우리)?\s*(\S+?)(?:이|가|는|은)\s+(\S.*)$/); // 내 친구가 태국 간대
    const who = sm && CHAT_HEARSAY_WHO[sm[1]];
    const body = who ? sm[2] : m[1];
    const L = body.charCodeAt(body.length - 1) - 0xac00;
    if (L < 0 || L > 11171) return '';
    const jong = L % 28;
    const forms =
      jong === 20 ? [body + '어']
        : body.endsWith('는') ? koInfinitives(body.slice(0, -1))
          : jong === 4 ? koInfinitives(body.slice(0, -1) + String.fromCharCode(0xac00 + L - 4))
            : koInfinitives(body);
    for (const f of forms) {
      let v = chatWhole(f, idx, (x) => !TH_QUESTION.test(x));
      if (!v) { const fr = chatFrame(f, idx); v = fr && !TH_QUESTION.test(fr) ? fr : ''; } // 거기 비싸대 → 틀
      if (!v) v = chatDuration(f, false); // 30분 걸린대 → เขาว่าใช้เวลา 30 นาที
      if (!v || /^(ช่วย(?!ได้)|ขอ(?!ง|โทษ|บคุณ))/.test(v)) continue;
      // '중간에 끊으면 안 된대' → ห้ามหยุด… 처럼 금지 값은 'บอกว่า' 로 잇는다(เขาบอกว่าห้าม…).
      // '미안하대'·'고맙대' 도 한 말이라 เขาบอกว่าขอโทษ·ขอบคุณ.
      const say = who ? who + 'บอกว่า' : /^(อย่า|ห้าม|ขอโทษ|ขอบคุณ)/.test(v) ? 'เขาบอกว่า' : 'เขาว่า';
      const s = say + v.replace(/^(?:เขา|หมอ|เพื่อน)?(?:บอก)?ว่า(?!ย)/, '');
      return asks ? s + 'เหรอ' : s;
    }
    return '';
  }

  // 끝말로 붙인 느낌: '덥지?' → ร้อนใช่ไหม, '멋있네' → หล่อนะ, '힘들겠다' → คงเหนื่อยแน่ๆ.
  // 끝을 ~어 꼴로 바꿔 용어집 평서 값을 찾는다. ~네·~겠다 는 물음표가 없을 때만.
  function chatEnding(bare, idx, asks) {
    const m = bare.match(/^(.+?)(겠네요|겠네|겠다|겠어요|지요|죠|지|네요|네)$/);
    if (!m) return '';
    const kind = /^겠/.test(m[2]) ? 'guess' : /^(지|죠)/.test(m[2]) ? 'tag' : 'see';
    if (kind !== 'tag' && asks) return '';
    // 바지·돼지·동네 처럼 줄 전체가 낱말이면 끝말이 아니다. 홑 ~지 는 물음표가 있을 때만(스포츠 바지).
    // 좋지=ดีนะ 처럼 값이 말끝으로 끝나면 낱말이 아니라 대화 말이라 괜찮다.
    const kv = idx.get(squash(bare));
    if ((kv !== undefined && !/(นะ|สิ|เนอะ|ใช่ไหม)$/.test(kv)) || (m[2] === '지' && !asks)) return '';
    for (const f of koInfinitives(m[1])) {
      const v = chatWhole(f, idx, (x) => !TH_QUESTION.test(x));
      if (!v || /\s/.test(v) || /^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง))/.test(v)) continue;
      if (/(นะ|สิ|เถอะ|เลย|หน่อย|ด้วย|จ้า|จ้ะ|ค่ะ|คะ|ครับ|นี่|นา|น่ะ|ล่ะ|หรอก|เอง)$/.test(v)) continue;
      if (kind === 'tag') return /ใช่$/.test(v) ? v + 'ไหม' : v + 'ใช่ไหม';
      if (kind === 'see') return v + 'นะ';
      return 'คง' + v.replace(/(.)มาก$/, '$1') + 'แน่ๆ';
    }
    return '';
  }

  // 까닭 짐작: '비 와서 그런가 봐' → คงเพราะฝนตก, '바빠서 그런 것 같아' → น่าจะเพราะยุ่ง,
  // '피곤해서 그런 거 아닐까?' → เพราะเหนื่อยหรือเปล่า, '더워서 그래' → เพราะร้อน. ~서 앞은 이미 ~어 꼴이라 평서 값을 그대로 찾는다.
  function chatBecause(bare, idx, asks) {
    // '에어컨 때문인가 봐' → คงเพราะแอร์, '술 때문인 것 같아' → น่าจะเพราะเหล้า, '배달 음식 때문이야' → เพราะอาหารเดลิเวอรี่.
    const nm = bare.match(/^(.+?)\s*때문(이야|이에요|인가\s*봐요?|인\s*(?:것|거)\s*같아요?|일\s*거야)$/);
    if (nm) {
      const n = squash(nm[1]);
      const nv = CHAT_PRON[n] || CHAT_SUBJ_TH[n] || { 비: 'ฝน', 돈: 'เงิน' }[n] || CHAT_FRAME_TH[n] || idx.get(n) || chatWhole(nm[1], idx, (x) => !TH_QUESTION.test(x));
      if (!nv || TH_QUESTION.test(nv) || /^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง)|ถ้า|เพราะ|คง|น่าจะ|ไม่)/.test(nv) || /(นะ|สิ|เถอะ|หน่อย|ด้วย|แล้ว)$/.test(nv)) return '';
      if (/^인가/.test(nm[2])) return 'คงเพราะ' + nv;
      if (/같아|거야/.test(nm[2])) return 'น่าจะเพราะ' + nv;
      return 'เพราะ' + nv + (asks ? 'เหรอ' : '');
    }
    const m = bare.match(/^(.+?)서\s*(그런가\s*봐요?|그런\s*(?:것|거)\s*같아요?|그런\s*거\s*아닐까요?|그래요?|그런\s*거야)$/);
    if (!m || m[1].endsWith('에')) return ''; // 집에서 그래 = 까닭 아님
    // ~서 앞이 ~아·~어 꼴(받침 없는 ㅏ·ㅐ·ㅓ·ㅔ·ㅕ·ㅘ·ㅙ·ㅝ)이어야 한다 — 여기서·어디서 는 뺀다.
    const L = m[1].charCodeAt(m[1].length - 1) - 0xac00;
    if (L < 0 || L > 11171 || L % 28 !== 0 || ![0, 1, 4, 5, 6, 9, 10, 14].includes(Math.floor((L % 588) / 28))) return '';
    const plain = (x) => !TH_QUESTION.test(x);
    let v = chatWhole(m[1], idx, plain) || chatFrame(m[1], idx);
    // '덥고 습해서 그래' → เพราะร้อนและชื้น: A고 B 는 A 의 ~어 꼴 값과 B 값을 และ 로 잇는다.
    const ab = !v && m[1].match(/^(.+?)고\s+(\S.*)$/);
    if (ab) {
      const va = koInfinitives(ab[1]).map((f) => chatWhole(f, idx, plain)).find(Boolean);
      const vb = chatWhole(ab[2], idx, plain);
      if (va && vb && !/\s/.test(va + vb) && !/(นะ|สิ|เลย|จัง|แล้ว)$/.test(va)) v = va + 'และ' + vb;
    }
    if (!v || TH_QUESTION.test(v) || /\s/.test(v) || /^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง)|ถ้า|เพราะ|คง|น่าจะ)/.test(v)) return '';
    const b = v.replace(/(นะ|สิ|เลย|จัง|แล้ว)$/, '').replace(/^จะ(?=.)/, ''); // 감기걸려=จะเป็นหวัดนะ → เป็นหวัด
    if (/^그런가/.test(m[2])) return 'คงเพราะ' + b;
    if (/같아/.test(m[2])) return 'น่าจะเพราะ' + b;
    if (/아닐까/.test(m[2])) return 'เพราะ' + b + 'หรือเปล่า';
    return 'เพราะ' + b + (asks ? 'เหรอ' : '');
  }

  // 'A면 B': '시간 있으면 전화해' → ถ้ามีเวลาก็โทรมา, '비 오면 안 갈래' → ถ้าฝนตกก็ไม่ไป.
  // A 는 ~어 꼴로 바꿔 평서 값을, B 는 줄째 값을 찾는다. 라면·냉면·가면(탈) 처럼 앞마디가 낱말이면 뺀다.
  function chatIf(bare, idx, asks) {
    const m = bare.match(/^(.+?)(으면|면)\s+(.+)$/);
    if (!m) return '';
    // 앞마디가 통째 항목이면 ถ้า·เมื่อ 값(비오면=ถ้าฝนตก)만 쓴다.
    const known = idx.get(squash(m[1] + m[2]));
    if (known !== undefined && !/^(ถ้า|เมื่อ)/.test(known)) return '';
    const plain = (x) => !TH_QUESTION.test(x);
    let a = known || '';
    if (!a) for (const f of koInfinitives(m[1])) if ((a = chatWhole(f, idx, plain) || chatFrame(f, idx))) break;
    if (!known) a = a.replace(/(นะ|สิ|หน่อย|เถอะ)$/, ''); // 창문열어=เปิดหน้าต่างนะ → เปิดหน้าต่าง
    // '창문 열면 안 돼' = 열지 마라 → ห้ามเปิดหน้าต่าง (ถ้า…ก็ไม่ได้ 아님). 부탁·부정 값은 뺀다.
    if (!known && !asks && /^안\s*(?:돼|되)(?:요)?$/.test(m[3]) && a && !/\s/.test(a) && !/^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง)|ไม่|จะ)/.test(a))
      return 'ห้าม' + a.replace(/แล้ว$/, '');
    const b = a && (chatWhole(m[3], idx, asks ? (x) => TH_QUESTION.test(x) : plain) || (!asks && chatFrame(m[3], idx)));
    if (!b || /ถ้า/.test(b) || (!known && /ถ้า/.test(a))) return '';
    const lead = known || `ถ้า${a}`;
    return /ก็/.test(b) ? `${lead} ${b}` : `${lead}ก็${b}`;
  }

  // 정도 말 + 용어집 평서 값: '조금 매워' → เผ็ดนิดหน่อย, '엄청 더워' → ร้อนมาก, '제일 예뻐' → สวยที่สุด,
  // '별로 안 비싸' → ไม่ค่อยแพง, '하나도 안 아파' → ไม่เจ็บเลย. '더' 는 '더 자'(นอนกว่า), '좀' 은 '좀 치워'(부탁)
  // 처럼 틀려 뺀다. 끝이 풀이말이어야 하고(제일 더운 달 ✗) 부탁·권유(많이 파세요·먹자)는 뺀다.
  const CHAT_DEGREE = [
    [/^(조금)\s+(.+)$/, '#นิดหน่อย'],
    [/^(좀)\s+(.+)$/, '#นิดหน่อย'], // 그림씨 앞만(좀 비싸 → แพงนิดหน่อย; 좀 치워 = 부탁) — chatDegree 가 거른다
    [/^(많이|엄청|되게|너무|무척|아주)\s+(.+)$/, '#มาก'],
    [/^(진짜|정말)\s+(.+)$/, '#จริงๆ'],
    [/^(제일|가장)\s+(.+)$/, '#ที่สุด'],
    [/^(별로)\s*안\s+(.+)$/, 'ไม่ค่อย#'],
    [/^(하나도|전혀)\s*안\s+(.+)$/, 'ไม่#เลย'],
  ];
  const CHAT_PRON = { 이거: 'อันนี้', 이게: 'อันนี้', 그거: 'อันนั้น', 그게: 'อันนั้น', 나: 'ฉัน', 너: 'เธอ', 우리: 'เรา' };
  const CHAT_SUBJ = new Set('여기 거기 저기 오늘 내일 어제 요즘 지금 날씨'.split(' '));
  // 주어 자리에서 용어집 값(쇼핑 뜻)과 다른 한 글자 말.
  const CHAT_SUBJ_TH = { 차: 'รถ', 일: 'งาน', 길: 'ถนน', 집: 'บ้าน' };
  const CHAT_ADJ_END =
    /(좋아|좋다|많아|많다|비싸|비싸다|싸다|맛있어|맛있다|매워|맵다|더워|덥다|추워|춥다|멀어|멀다|가까워|가깝다|커|크다|작아|작다|예뻐|예쁘다|깨끗해|깨끗하다|더러워|더럽다|시끄러워|시끄럽다|조용해|조용하다|재밌어|재밌다|어려워|어렵다|쉬워|쉽다|귀여워|귀엽다|멋있어|멋있다|아파|아프다|달아|달다|짜|짜다|빨라|빠르다|느려|느리다|넓어|넓다|좁아|좁다)$/;
  function chatDegree(bare, idx) {
    if (!/(어|아|해|워|와|려|여|요|야|파|뻐|퍼|싸|빠|커|져|돼|나|다|네|라|혀|쳐|켜|껴|쪄|펴|겨|셔)$/.test(bare) || /(세요|줘|자|마)$/.test(bare)) return '';
    for (const [re, th] of CHAT_DEGREE) {
      const m = bare.match(re);
      if (!m) continue;
      if (/^(그래|그래요|그렇지|그렇죠)$/.test(m[2])) return '';
      if (m[1] === '좀' && !CHAT_ADJ_END.test(m[2].replace(/요$/, '')) && !/(피곤해|힘들어|졸려|무서워|늦어)$/.test(m[2].replace(/요$/, ''))) return '';
      let v = chatWhole(m[2], idx, (x) => !TH_QUESTION.test(x));
      if (!v || /\s/.test(v) || /^(ไม่|อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง))/.test(v)) return '';
      if (/(นะ|สิ|เถอะ|เลย|หน่อย|ด้วย|จ้า|จ้ะ|ค่ะ|คะ|ครับ|จัง|ๆ|นี่|นา|น่ะ|ล่ะ|หรอก|เอง|แล้ว|กว่า|ที่สุด|เกินไป)$/.test(v)) return '';
      if (th === '#มาก' && /มาก$/.test(v)) return v;
      v = v.replace(/(.)มาก$/, '$1');
      return th.replace('#', v);
    }
    // 앞에 주어 한 마디: '날씨 너무 좋아' → อากาศดีมาก, '여기 진짜 예뻐' → ที่นี่สวยจริงๆ. 조사(이·가·은·는)가
    // 붙었거나 이거·나·여기·오늘 같은 말일 때만 — '단백질 많이 먹어요' 의 단백질은 목적어라 어순이 틀린다.
    const s = bare.match(/^(\S+)\s+((?:조금|많이|엄청|되게|너무|무척|아주|진짜|정말|제일|가장)\s+.+)$/);
    if (!s) return '';
    let n = squash(s[1]);
    const marked = !idx.has(n) && !CHAT_PRON[n] && /[이가은는도]$/.test(n);
    if (marked) n = n.slice(0, -1);
    // 그림씨는 목적어를 안 받으니 조사 없는 앞말도 주어다: '경치 진짜 좋다' → ทิวทัศน์ดีจริงๆ.
    const adjTail = s[2].replace(/더라(고)?(요)?$/, '다'); // 망고 엄청 싸더라 → 싸다
    if (!marked && !CHAT_PRON[n] && !CHAT_SUBJ.has(n) && !CHAT_SUBJ_TH[n] && !CHAT_ADJ_END.test(adjTail)) return '';
    // 요즘 = ช่วงนี้(용어집 요즘 = มาแรง 은 '요즘 유행'), 차 = รถ(용어집 차 = ชา), 일 = งาน(용어집 일 = วัน).
    const sv = CHAT_PRON[n] || CHAT_TIME_TH[n] || CHAT_SUBJ_TH[n] || idx.get(n);
    if (!sv || /[\sA-Za-z0-9]/.test(sv) || TH_QUESTION.test(sv) || /^ไม่/.test(sv)) return '';
    // 정도 말로 못 풀면 뒤 통째 항목(망고 엄청 싸더라 → มะม่วง + ถูกมาก).
    const d = chatDegree(s[2], idx) || chatWhole(s[2], idx, (x) => !TH_QUESTION.test(x) && !/\s/.test(x));
    if (d && sv === 'เธอ' && CHAT_LEAD_OBJ.test(d)) return d; // 너 진짜 보고 싶어 = คิดถึงเธอ(เธอ 가 목적어)
    return d ? sv + d : '';
  }

  // 아니라고 함: '안 먹었어' → ไม่ได้กิน(먹었어=กินแล้ว 에서), '아직 안 샀어' → ยังไม่ได้ซื้อ, '안 와' → ไม่มา.
  // 뒤가 한 마디일 때만.
  // 못: '못 먹었어' → ไม่ได้กิน(지난 일은 안 과 같다), '못 가' → ไปไม่ได้(할 수 없음).
  function chatNeg(bare, idx) {
    const mm = bare.match(/^(아직\s+)?못\s+(\S+)$/);
    if (mm) {
      const v = chatWhole(mm[2], idx, (x) => !TH_QUESTION.test(x));
      if (!v || /\s/.test(v) || /^(ไม่|อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง))/.test(v)) return '';
      if (/(นะ|สิ|เถอะ|เลย|หน่อย|ด้วย|จ้า|จ้ะ|ค่ะ|คะ|ครับ|จัง|ๆ|นี่|นา|น่ะ|ล่ะ|หรอก|เอง|มาก|ได้)$/.test(v)) return '';
      const p = mm[2].replace(/요$/, '').slice(-2, -1).charCodeAt(0) - 0xac00;
      if (/어요?$/.test(mm[2]) && p >= 0 && p % 28 === 20) {
        return v.endsWith('แล้ว') && v.length > 4 ? (mm[1] ? 'ยังไม่' : 'ไม่') + (/^ได้/.test(v) ? '' : 'ได้') + v.slice(0, -4) : '';
      }
      return v.endsWith('แล้ว') ? '' : (mm[1] ? 'ยัง' : '') + v + 'ไม่ได้';
    }
    const m = bare.match(/^(아직\s+)?안\s+(\S+)$/);
    if (!m) return '';
    const v = chatWhole(m[2], idx, (x) => !TH_QUESTION.test(x));
    if (!v || /\s/.test(v) || /^(ไม่|อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง))/.test(v)) return '';
    if (/(นะ|สิ|เถอะ|เลย|หน่อย|ด้วย|จ้า|จ้ะ|ค่ะ|คะ|ครับ|จัง|ๆ|นี่|นา|น่ะ|ล่ะ|หรอก|เอง|มาก)$/.test(v)) return '';
    const pre = m[2].replace(/요$/, '').slice(-2, -1).charCodeAt(0) - 0xac00;
    const past = /어요?$/.test(m[2]) && pre >= 0 && pre % 28 === 20; // ㅆ 받침 + 어
    // 받았어 = ได้รับแล้ว → ไม่ได้รับ(ไม่ได้ได้รับ 아님)
    if (past) return v.endsWith('แล้ว') && v.length > 4 ? (m[1] ? 'ยังไม่' : 'ไม่') + (/^ได้/.test(v) ? '' : 'ได้') + v.slice(0, -4) : '';
    return v.endsWith('แล้ว') ? '' : (m[1] ? 'ยังไม่' : 'ไม่') + v;
  }

  // '왜 피곤해?' → ทำไมเหนื่อย, '왜 안 와?' → ทำไมไม่มา.
  function chatWhy(bare, idx) {
    const m = bare.match(/^왜\s+(.+)$/);
    if (!m) return '';
    const v = chatWhole(m[1], idx, (x) => !TH_QUESTION.test(x)) || chatNeg(m[1], idx);
    if (!v || /\s/.test(v) || /^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง))/.test(v)) return '';
    if (/(นะ|สิ|เถอะ|เลย|หน่อย|ด้วย|จ้า|จ้ะ|ค่ะ|คะ|ครับ|นี่|นา|น่ะ|ล่ะ|หรอก|เอง)$/.test(v)) return '';
    return 'ทำไม' + v.replace(/แล้ว$/, '');
  }

  // 높임말 → 예사말. 계셨어 → 있었어 처럼 긴 꼴부터. 드셔 는 마실 것이 앞에 있으면 마셔, 아니면 먹어.
  const CHAT_HONOR = [
    [/뵙고/g, '만나고'], [/뵈러/g, '만나러'], [/뵐게/g, '만날게'],
    [/드릴까/g, '줄까'], [/드리자/g, '주자'], [/드릴게/g, '줄게'], [/드렸어/g, '줬어'], [/드려/g, '줘'],
    [/드리는/g, '주는'], [/드리면/g, '주면'], [/드리고/g, '주고'],
    [/계셨어/g, '있었어'], [/계셔/g, '있어'],
    [/하셨어/g, '했어'], [/보셨어/g, '봤어'], [/가셨어/g, '갔어'], [/오셨어/g, '왔어'], [/주셨어/g, '줬어'], [/드셨어/g, '먹었어'],
    [/하실/g, '할'], [/보실/g, '볼'], [/가실/g, '갈'], [/오실/g, '올'], [/주실/g, '줄'],
    [/하셔/g, '해'], [/오셔/g, '와'], [/가셔/g, '가'], [/주셔/g, '줘'],
  ];
  function chatPlainKo(s) {
    let p = s.replace(/드셔/g, /(술|커피|차|물|맥주|음료|우유|주스)/.test(s) ? '마셔' : '먹어');
    for (const [re, to] of CHAT_HONOR) p = p.replace(re, to);
    return p;
  }

  function chatFromGlossary(core, idx) {
    const one = (s) => {
      const call = CHAT_CALLS[s.replace(/[\s.!?~,？！]+$/, '')]; // '고마워 오빠' 의 오빠 = พี่ (พี่ชาย 아님)
      if (call) return call;
      const asks = /[?？]\s*$/.test(s);
      const bare = s.replace(/[\s.!?~,？！]+$/, '');
      let th = chatWhole(bare, idx, (v) => !asks || TH_QUESTION.test(v));
      // '피곤해?'·'도착했어?' — 묻는 꼴 값이 없으면 평서 값을 묻는 꼴로(เหนื่อย → เหนื่อยไหม,
      // ถึงแล้ว → ถึงหรือยัง). 뭐·어디 같은 물음말이 있거나 ~줘·~자 처럼 묻는 말이 아니면 번역에 맡긴다.
      const askable = asks && CHAT_ASK_END.test(bare) && !CHAT_ASK_NOT.test(bare) && !CHAT_ASK_WORD.test(bare);
      const pre = bare.replace(/어요?$/, '').slice(-1).charCodeAt(0) - 0xac00;
      const past = /어요?$/.test(bare) && pre >= 0 && pre % 28 === 20; // ㅆ 받침 + 어
      if (!th && askable) th = thaiAsk(chatWhole(bare, idx), past);
      if (!th) th = chatDuration(bare, asks);
      if (!th) th = chatMoney(bare, asks);
      if (!th) {
        const fr = chatFrame(bare, idx);
        // 물 있어? → มีน้ำไหม, 밥 먹었어? → กินข้าวหรือยัง. 어때·먹을래 틀은 값이 이미 묻는 꼴이다.
        if (fr) th = !asks || TH_QUESTION.test(fr) ? fr : askable ? thaiAsk(fr, past) : '';
      }
      if (!th) {
        const hd = chatHada(bare, idx); // 운동했어? → ออกกำลังกายหรือยัง
        if (hd) th = !asks || TH_QUESTION.test(hd) ? hd : askable ? thaiAsk(hd, past) : '';
      }
      if (!th) th = chatHearsay(bare, idx, asks);
      if (!th) th = chatEnding(bare, idx, asks);
      if (!th) th = chatIf(bare, idx, asks);
      if (!th) th = chatBecause(bare, idx, asks);
      // '허리 아파 죽겠어' → ปวดหลังจะตายแล้ว: 앞말 평서 값 + จะตายแล้ว(용어집엔 배고파죽겠어 같은 것만 있다).
      const dz = !th && !asks && bare.match(/^(.+?)\s*죽겠(?:어요?|다)$/);
      if (dz) {
        const v = chatWhole(dz[1], idx, (x) => !TH_QUESTION.test(x));
        if (v && !/\s/.test(v) && !/^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง)|ไม่|จะ)/.test(v) && !/(นะ|สิ|เถอะ|หน่อย|ด้วย|แล้ว|จัง|เลย|ตาย)$/.test(v))
          th = v.replace(/(.)มาก$/, '$1') + 'จะตายแล้ว';
      }
      if (!th) {
        const dg = chatDegree(bare, idx);
        if (dg) th = !asks ? dg : askable ? thaiAsk(dg, past) : ''; // 많이 아파? → เจ็บไหม
      }
      if (!th && !asks) th = chatNeg(bare, idx);
      if (!th) th = chatWhy(bare, idx);
      // '내일 바다 가자' → พรุ่งนี้ไปทะเลกัน: 앞의 때 낱말을 떼고 나머지를 찾아 앞에 붙인다. 나머지 값이
      // เดี๋ยว(곧)로 시작하면 그 자리에 넣고(내일 데리러 갈게 → พรุ่งนี้ไปรับ), 다른 때 말로 시작하면 번역에 맡긴다.
      // 어제·아까 는 지난 일이라 แล้ว 를 떼고 หรือยัง → หรือเปล่า(어제 술 마셨어? → เมื่อวานดื่มเหล้าหรือเปล่า).
      // '오늘 금값'·'다음 주 날씨' 같은 명사 조각은 태국어에서 때 말이 뒤라 뺀다: 나머지가 서술어로 끝나거나
      // 값이 묻는 꼴(오늘 회의 몇 시 → วันนี้ประชุมกี่โมง)일 때만. '오늘 저녁 어때' = 그때 시간 돼?
      // '무슨 일이 있어도 늦지 마' → ไม่ว่ายังไงก็ตาม อย่ามาสาย: 앞의 '무슨·어떤 일이 있어도' 를 떼고 나머지를 찾는다.
      const any = !th && bare.match(/^(?:무슨|어떤|어떠한|어느)\s*일이\s*있(?:어도|더라도)\s+(\S.*)$/);
      const ra = any ? one(any[1] + s.slice(bare.length)) : '';
      if (ra) return 'ไม่ว่ายังไงก็ตาม ' + ra;
      const tm = !th && bare.match(CHAT_TIME_LEAD);
      if (tm && /^어때요?$/.test(tm[2])) return addPoliteParticle(s, CHAT_TIME_TH[squash(tm[1])] + 'สะดวกไหม');
      const r = tm ? one(tm[2] + s.slice(bare.length)) : '';
      if (r && (CHAT_TIME_PRED.test(tm[2]) || TH_QUESTION.test(r))) {
        const key = squash(tm[1]);
        // '주말에는 안 해요' = 주말마다(วันเสาร์อาทิตย์) — 이번 주말(เสาร์อาทิตย์นี้)이 아니다.
        const t = key === '주말에' && /는\s*$/.test(bare.slice(0, -tm[2].length)) ? 'วันเสาร์อาทิตย์' : CHAT_TIME_TH[key];
        const past = /^(어제|아까|지난달에?|지난주에?|어젯밤에?|작년에?)$/.test(key);
        if (/^เดี๋ยว/.test(r)) return past ? '' : r.replace(/^เดี๋ยว/, t);
        if (CHAT_FRAME_TIME.test(r)) return '';
        if (!past) return t + r;
        return t + r.replace(/แล้ว(?=(นะ|ครับ|ค่ะ|คะ)?$)/, '').replace(/หรือยัง(?=(ครับ|ค่ะ|คะ)?$)/, 'หรือเปล่า');
      }
      // 물음표 없는 줄에서 나머지 값이 예/아니오 물음이면(밥먹었어=กินข้าวยัง — 물음표 없이도 묻는 말이라 그렇게
      // 넣었다) 틀의 평서 값으로(กินข้าวแล้ว). 뭐·어디 같은 물음말이 있으면 그대로 둔다.
      const chatStatement = (r, rest) => {
        if (asks || !r || !TH_QUESTION.test(r) || CHAT_ASK_WORD.test(rest)) return r;
        const f = chatFrame(rest, idx);
        return f && addPoliteParticle(s, f);
      };
      // '나 배고파' → หิว, '너 바빠?' → เธอยุ่งไหม, '우리 밥 먹자' → เรากินข้าวกัน, '근데 배고파' → แต่หิว:
      // 앞의 대명사·이음말을 떼고 나머지를 찾아 그 태국어를 앞에 붙인다(나·아·혹시 는 그냥 뗀다).
      // 너 + คิดถึง·รัก·ชอบ 처럼 사람을 받는 말은 เธอ 가 목적어 자리라(너 보고 싶어 = คิดถึงเธอ) 붙이지 않고 뗀다.
      // 너·우리·자기·오빠 뒤가 사람·물건 명사면 '~의' 라(우리 엄마 아파·너 이름 뭐야) 건드리지 않는다.
      const lw = !th && !tm && bare.match(/^(\S+)\s+(\S.*)$/);
      const lp = lw ? CHAT_LEAD_TH.get(lw[1]) : undefined;
      const owner = lp && /^(เธอ|เรา|ที่รัก|พี่)$/.test(lp);
      if (lp !== undefined && !(owner && CHAT_LEAD_OWNED.has(lw[2].split(/\s+/)[0].replace(/(은|는|이|가|을|를|도)$/, '')))) {
        let r2 = one(lw[2] + s.slice(bare.length));
        if (/^(나|난|나는|내가|나도)$/.test(lw[1])) r2 = chatStatement(r2, lw[2]); // 나 밥 먹었어 = 내 일
        // 나 기다렸어? ≠ รอหรือยัง(벌써 기다렸니) — 뗀 '나' 가 목적어인 지난 일 물음은 번역에 맡긴다.
        if (r2 && !(asks && !lp && /^(나|난|나는|내가)$/.test(lw[1]) && /หรือยัง/.test(r2))) {
          if (!lp || r2.startsWith(lp)) return r2;
          // 오빠 보고 싶어? = คิดถึงพี่ไหม — 묻는 말이면 พี่·ที่รัก 도 목적어로 읽혀 뗀다.
          if (CHAT_LEAD_OBJ.test(r2) && (lp === 'เธอ' || (asks && owner))) return r2;
          const tw = owner && r2.match(CHAT_TIME_TH_RE); // 우리 내일 바다 가자 → พรุ่งนี้เราไปทะเลกัน
          return tw ? tw[0] + lp + r2.slice(tw[0].length) : lp + r2;
        }
      }
      // '배고파서 밥 먹었어' → หิวเลยกินข้าวแล้ว, '비 와서 못 가' → ฝนตกเลยไปไม่ได้: 앞마디(~아서·~어서)를 ~어 꼴로
      // 찾고 뒷마디는 한 줄처럼 찾아 เลย(그래서)로 잇는다. 가서·와서·나서·사서 는 이어지는 일이라 แล้ว.
      // 여기서·어디서·집에서 의 '서' 는 곳이라 앞말이 ㅏ·ㅓ 같은 열린 소리로 끝날 때만 본다.
      const cz = !th && bare.match(/^(.+?)서\s+(\S.*)$/);
      // '와 줘서 고마워' → ขอบคุณที่มา, '연락 줘서 고마워' → ขอบคุณที่ติดต่อ: 해 준 일에 고마워·미안 — 줘 를 떼고 앞말을 찾는다.
      const thx = cz && /^(고마워|고마워요|고맙습니다|감사해요|감사합니다)$/.test(cz[2]) ? 'ขอบคุณที่' : '';
      const give = thx && cz[1].match(/^(.+?)\s*(?:줘|주셔)$/);
      if (give) {
        const g = give[1].trim();
        const plain = (x) => !TH_QUESTION.test(x);
        const okA = (x) => x && !/\s/.test(x) && !/^(ขอ(?!ง)|ช่วย(?!ได้)|อย่า|ว้าว)/.test(x) && !/(หน่อย|นะ|สิ|ด้วย|เถอะ)$/.test(x);
        const a = [CHAT_GIVE_BASE[squash(g)], chatWhole(g, idx, plain), chatHada(/해$/.test(g) ? g : g + '해', idx)].find(okA);
        if (a) {
          return addPoliteParticle(s, thx + a.replace(/แล้ว$/, ''));
        }
      }
      // '같이 영화 보자' → ดูหนังด้วยกัน, '같이 산책할래?' → เดินเล่นด้วยกันไหม: ด้วยกัน 은 동사 뒤(กัน·ไหม 자리).
      // 같이 있어 = อยู่ด้วยกัน(มี 아님)은 번역에 맡긴다.
      const gm = !th && bare.match(/^같이\s+(\S.*)$/);
      const r3 = gm && !/^있/.test(gm[1]) ? one(gm[1] + s.slice(bare.length)) : '';
      const pm = r3 && r3.match(/^(.*?)((?:นะ)?(?:ครับ|ค่ะ|คะ)?)$/);
      if (pm && !/ด้วยกัน/.test(pm[1]) && !/(นะ|สิ|เลย|เถอะ|หน่อย|ด้วย|ๆ)$/.test(pm[1])) {
        // ไปเดินเล่นกันไหม → ไปเดินเล่นด้วยกันไหม, ดื่มกาแฟแล้ว → ดื่มกาแฟด้วยกันแล้ว
        const q = pm[1].match(/^(.*?)(?:กัน)?(ไหม|หรือยัง|หรือเปล่า|แล้ว)?$/);
        return q[1] + 'ด้วยกัน' + (q[2] || '') + (pm[2] || '');
      }
      // 걸어서·앉아서·누워서 는 하는 모양이라(걸어서 몇 분 = เดินกี่นาที) 뺀다. 뒷마디가 명사 조각이면(아파서 결석) 뺀다.
      if (cz && squash(cz[1]).length >= 2 && chatSeoOk(cz[1]) && !/(^|\s)(그래|그러|이래|저래|어째|걸어|뛰어|앉아|누워|엎드려|타)$/.test(cz[1])) {
        const oa = one(cz[1]); // 내일 일찍 출근해야 돼(서) — 앞마디도 한 줄처럼(때 낱말·하다 말)
        let a = chatWhole(cz[1], idx, (x) => !TH_QUESTION.test(x)) || chatFrame(cz[1], idx) || (oa && !TH_QUESTION.test(oa) ? oa : '');
        // '와 줘서'·'연락 줘서' 의 값은 부탁 꼴(มาหาหน่อยนะ)이라 이유로 쓸 수 없다.
        if (/^(ขอ(?!ง)|ช่วย(?!ได้)|อย่า)/.test(a) || /(หน่อย|นะ|สิ|ด้วย|เถอะ)$/.test(a)) a = '';
        // '늦어서 미안' → ขอโทษที่มาสาย, '기다려서 고마워' → ขอบคุณที่รอ.
        if (a && !/\s/.test(a) && /^(고마워|고마워요|고맙습니다|감사해요|감사합니다)$/.test(cz[2])) return addPoliteParticle(s, 'ขอบคุณที่' + a.replace(/แล้ว$/, ''));
        if (a && !/\s/.test(a) && /^(미안|미안해|미안해요|죄송해요|죄송합니다)$/.test(cz[2])) return addPoliteParticle(s, 'ขอโทษที่' + a.replace(/แล้ว$/, ''));
        const b = a && !/\s/.test(a) && chatStatement(one(cz[2] + s.slice(bare.length)), cz[2]);
        if (b && !/^(เลย|แล้ว|ก็)/.test(b) && (CHAT_TIME_PRED.test(cz[2]) || TH_QUESTION.test(b))) {
          // 하다 동작(스캔해서·세차해서 = 하고 나서)도 이어지는 일. 피곤해서 같은 그림씨와 ~야 돼서 는 까닭.
          const hw = cz[1].match(/(\S+)해$/);
          const seq =
            (/(가|와|나|사)$/.test(cz[1]) && !/^(ฝน|หิมะ|ลม)/.test(a)) || (hw && !CHAT_HADA_ADJ.has(hw[1]) && !/(못|안|싫|좋|미안)/.test(hw[1]));
          return a.replace(/แล้ว$/, '') + (seq ? 'แล้ว' : 'เลย') + b;
        }
      }
      // '배고픈데 뭐 먹을까?' → หิว กินอะไรดี, '맛있는데 비싸' → อร่อยแต่แพง: ~는데·~은데·~ㄴ데 앞마디를 ~어 꼴로
      // 되돌려(배고픈 → 배고파, 일하는 → 일해, 좋은 → 좋아, 주말인 → 주말이야) 한 줄처럼 찾고 뒷마디와 잇는다.
      // 뒤가 묻기·권하기·부탁이면 그냥 띄워 잇고(까닭), 아니면 แต่(그런데).
      // 이음 마디 공통: 앞마디 끝 낱말을 ~어 꼴로 되돌린 후보(forms)를 앞말과 붙여 한 줄처럼 찾는다 —
      // 묻는 값·부탁 값은 빼고 틀·하다 말로 한 번 더. [값, 고른 꼴].
      const stateOf = (pre, forms) => {
        for (const f of forms) {
          if (!pre && CHAT_VERB_ONE[f]) return [CHAT_VERB_ONE[f], f]; // 와 = มา(감탄사 ว้าว 아님)
          const x = one(pre + f);
          const a = x && !TH_QUESTION.test(x) ? x : chatFrame(pre + f, idx) || chatHada(pre + f, idx);
          if (a && !TH_QUESTION.test(a) && !/^(ขอ(?!ง)|ช่วย(?!ได้)|อย่า)/.test(a) && !/(หน่อย|นะ|สิ|เถอะ)$/.test(a)) return [a, f];
        }
        return ['', ''];
      };
      // 뒷마디가 묻기·권하기·부탁이면 '까닭' 이라 그냥 띄워 잇는다.
      const softB = (b, ko) =>
        asks || TH_QUESTION.test(b) || /(กัน|(?<!นิด)หน่อย|นะ|เถอะ|ด้วย|สิ)(ครับ|ค่ะ|คะ)?$/.test(b) || /^(ช่วย|ขอ|อย่า)/.test(b) ||
        /(자|까|래|게|겠다|겠어|야지|줘|주세요)요?$/.test(ko);
      // 뒷마디가 서술어로 끝나거나 묻는 값이어야 한다('여행 갈 때 필요한 것' 같은 명사 조각은 뺀다).
      const predB = (b, ko) => TH_QUESTION.test(b) || CHAT_TIME_PRED.test(ko.replace(/[\s.!?~,？！]+$/, ''));
      const splitLast = (x) => {
        const ws = x.trim().split(/\s+/);
        const w = ws.pop();
        return [ws.length ? ws.join(' ') + ' ' : '', w];
      };
      const dropJong = (w, j) => {
        const L = w.charCodeAt(w.length - 1) - 0xac00;
        return L >= 0 && L <= 11171 && L % 28 === j ? w.slice(0, -1) + String.fromCharCode(0xac00 + L - j) : '';
      };
      const tail = s.slice(bare.length);
      // '엄마가 해산물 좋아하셔' → 좋아해, '물어보셨어' → 물어봤어, '드릴까' → 줄까: 태국어는 높임을 따로 옮기지
      // 않으니 높임말을 예사말로 풀어 한 번 더 찾는다(예사말 키 하나로 높임말도 잡힌다).
      const plain = !th && chatPlainKo(bare);
      if (plain && plain !== bare) {
        const rp = one(plain + tail);
        if (rp) return rp;
      }
      // '너무 예뻐 보여' → ดูสวยมาก: 그림씨 + 보여 = ดู + 값. 앞에는 정도 말만(주어가 있으면 어순이 달라 뺀다).
      const by = !th && bare.match(/^((?:(?:너무|진짜|정말|좀|많이|엄청|되게)\s+)*)(\S+)\s+(?:보여요?|보인다|보이네요?)$/);
      if (by && CHAT_ADJ_END.test(by[2])) {
        const r4 = one(by[1] + by[2] + tail);
        if (r4 && !/^ดู/.test(r4) && !/^(อย่า|ช่วย(?!ได้)|ขอ)/.test(r4)) return 'ดู' + r4;
      }
      // '거기 사람 많더라' → ที่นั่นคนเยอะ: 겪어 본 일 ~더라(고) 는 ~어 꼴 평서로 한 번 더.
      const dr = !th && !asks && bare.match(/^(.+?)더라(?:고)?(?:요)?$/);
      if (dr) {
        const [pre, w] = splitLast(dr[1]);
        const [a] = stateOf(pre, koInfinitives(w));
        if (a) return addPoliteParticle(s, a);
      }
      // '늦게 끝날 것 같아' → น่าจะเลิกดึก, '비 올 것 같아' → น่าจะฝนตก: ~ㄹ/을 것 같아 = 아마 그럴 것.
      const gt = !th && !asks && bare.match(/^(.+?)\s*(?:것|거)\s*같아요?$/);
      if (gt) {
        const [pre, w] = splitLast(gt[1]);
        const stem = /을$/.test(w) && w.length >= 2 ? w.slice(0, -1) : dropJong(w, 8);
        const [a] = stem ? stateOf(pre, koInfinitives(stem)) : [''];
        // '맞으면 아플 것 같아' — 조건 마디(ถ้า…ก็…)면 น่าจะ 는 ก็ 뒤로(ถ้า…ก็น่าจะ…), 아니면 맨 앞.
        const ac = a && a.match(/^(ถ้า[^\s]*?ก็)(.+)$/);
        if (ac && !/^(น่าจะ|คง|จะ)/.test(ac[2])) return addPoliteParticle(s, ac[1] + 'น่าจะ' + ac[2].replace(/แล้ว$/, ''));
        if (a && !ac && !/^(น่าจะ|คง|จะ|ถ้า)/.test(a)) return addPoliteParticle(s, 'น่าจะ' + a.replace(/แล้ว$/, ''));
      }
      // '(나도 오늘 정신없었어.) 일이 너무 많아서' → เพราะงานเยอะมาก: 뒤에 홀로 남은 까닭 ~어서.
      // 서 앞이 ~어 꼴 끝소리일 때만(보고서·계약서·혼자서·집에서 는 아니다).
      const rs = !th && !asks && bare.match(/^(.+[아어여해와워돼져려쳐켜혀겨펴셔춰봐파빠때내])서$/);
      if (rs) {
        const r5 = one(rs[1] + tail);
        if (r5 && !TH_QUESTION.test(r5) && !/^(อย่า|ช่วย(?!ได้)|ขอ(?!ง)|เพราะ)/.test(r5) && !/(นะ|สิ|หน่อย|เถอะ|ด้วย)(ครับ|ค่ะ)?$/.test(r5))
          return 'เพราะ' + r5;
      }
      // '내일 출근하잖아' → ก็พรุ่งนี้ไปทำงานนี่: ~잖아 = (너도 알다시피) 그렇잖아. 줄기의 ~어 꼴 평서 값을 ก็…นี่ 로.
      const jn = !th && !asks && bare.match(/^(.+?\S)잖아(?:요)?$/);
      if (jn) {
        const [pre, w] = splitLast(jn[1]);
        // 명사 + 이잖아 = 명사이야('내일 출근이잖아' → 내일 출근이야).
        const nounJ = w.length >= 2 && w.endsWith('이') ? [w + '야', w.slice(0, -1) + '이야'] : [];
        // 받침 없는 명사 + 잖아 = 명사야('다시 쓰는 거잖아' → 쓰는 거야, '친구잖아' → 친구야) — 움직씨 꼴 다음 후보.
        const Lw = w.charCodeAt(w.length - 1) - 0xac00;
        const nounV = Lw >= 0 && Lw <= 11171 && Lw % 28 === 0 && !w.endsWith('이') ? [w + '야'] : [];
        const [a] = stateOf(pre, w.endsWith('았') || w.endsWith('었') || w.endsWith('했') ? [w + '어'] : [...nounJ, ...koInfinitives(w), ...nounV]);
        // 값에 이미 ก็ 가 있으면(เธอก็ตื่นเต้น) 앞에 또 붙이지 않는다.
        if (a && !/^(อย่า|ช่วย(?!ได้)|ขอ(?!ง))/.test(a) && !/(นะ|สิ|หน่อย|เถอะ|ด้วย)$/.test(a))
          return addPoliteParticle(s, (/ก็/.test(a) ? '' : 'ก็') + a + 'นี่');
      }
      // '어제 먹은 게 안 맞았나 봐' → คงไม่…, '바쁜가 봐' → คงยุ่ง: ~나 봐·~(으)ㄴ가 봐 = 그런가 보다.
      const nb = !th && !asks && bare.match(/^(.+?\S)(나|가)\s*봐요?$/);
      if (nb) {
        const [pre, w] = splitLast(nb[1]);
        const stem = nb[2] === '나' ? w : /[는은]$/.test(w) && w.length >= 2 ? w.slice(0, -1) : dropJong(w, 4);
        const [a] = stem ? stateOf(pre, koInfinitives(stem)) : [''];
        if (a && !/^(น่าจะ|คง|จะ)/.test(a)) return addPoliteParticle(s, 'คง' + a.replace(/แล้ว$/, ''));
      }
      const nd = !th && bare.match(/^(.+?)데\s+(\S.*)$/);
      if (nd) {
        const [pre, w] = splitLast(nd[1]);
        const nj = dropJong(w, 4);
        const forms =
          /[는은]$/.test(w) && w.length >= 2 ? koInfinitives(w.slice(0, -1))
            : /인$/.test(w) && w.length >= 2 ? [w.slice(0, -1) + '이야']
              : nj ? koInfinitives(nj) : [];
        const [a] = stateOf(pre, forms);
        const b = a && one(nd[2] + tail);
        // '시장 갔는데 망고가 싸더라' — 뒤가 겪은 일 ~더라 면 ~는데 는 배경(그랬더니)이라 แต่ 대신 띄어 잇는다.
        if (b) return a + (softB(b, nd[2]) || /더라(?:고)?(?:요)?$/.test(nd[2]) ? ' ' : 'แต่') + b;
      }
      // '바쁘니까 나중에 전화할게' → ยุ่ง เดี๋ยวโทรไปทีหลัง: ~(으)니까 = 까닭. 뒤가 평서면 เลย.
      const nk = !th && bare.match(/^(.+?)(?:으)?니까\s+(\S.*)$/);
      if (nk) {
        const [pre, w] = splitLast(nk[1]);
        if (!/^(그러|이러|저러|그렇|아)$/.test(w)) {
          const [a] = stateOf(pre, koInfinitives(w));
          const b = a && one(nk[2] + tail);
          if (b && predB(b, nk[2])) return a + (softB(b, nk[2]) ? ' ' : 'เลย') + b;
        }
      }
      // '밥 먹고 전화할게' → กินข้าวแล้วจะโทร, '싸고 맛있어' → ถูกและอร่อย: ~고(나서) = 하고 나서. 둘 다 그림씨면 และ.
      // ~고 있어·~고 싶어 는 틀이 맡고, '친구하고' 의 하고 는 '~와' 라 뺀다.
      const gk = !th && bare.match(/^(.+?)고(?:\s*나서)?\s+(\S.*)$/);
      if (gk && !/^(있|싶|계|말|보니|해서|하니)/.test(gk[2])) {
        const [pre, w] = splitLast(gk[1]);
        // 광고·창고·최고 처럼 ~고 까지가 한 낱말이면 뺀다(광 → 광어 = ปลาตาเดียว 가 된다).
        const who =
          (idx.has(w + '고') && !CHAT_GO_VERB.has(w + '고')) ||
          (/하$/.test(w) && (CHAT_LEAD_OWNED.has(w.slice(0, -1)) || CHAT_PRON[w.slice(0, -1)]));
        const [a, f] = who ? ['', ''] : stateOf(pre, koInfinitives(w));
        const b = a && one(gk[2] + tail);
        const adjs = CHAT_ADJ_END.test(f) && CHAT_ADJ_END.test(gk[2].replace(/요$/, '')); // 맵고 달아요 → เผ็ดและหวาน
        if (b && predB(b, gk[2])) return a.replace(/แล้ว$/, '') + (adjs ? 'และ' : 'แล้ว') + b;
      }
      // '밥 먹기 전에 손 씻어' → ก่อนกินข้าว ล้างมือนะ, '올 때 전화해' → ตอนมา โทรมานะ.
      const bf = !th && bare.match(/^(.+?)기\s*전에\s+(\S.*)$/);
      // '기저귀 갈 때 됐어요' = ~할 때가 됐다 는 뺀다.
      const wh = !th && !bf && bare.match(/^(.+?)\s*때\s+(?!(?:됐|되|이야|예요|에요|야)(?:\s|$|어|요))(\S.*)$/);
      const cl = bf || wh;
      if (cl) {
        const [pre, w] = splitLast(cl[1]);
        const stem = bf ? w : /을$/.test(w) && w.length >= 2 ? w.slice(0, -1) : dropJong(w, 8);
        const [a] = stem ? stateOf(pre, koInfinitives(stem)) : [''];
        const b = a && one(cl[2] + tail);
        if (b && predB(b, cl[2])) return (bf ? 'ก่อน' : 'ตอน') + a.replace(/แล้ว$/, '') + ' ' + b;
      }
      // '회사에서 혼났어' → โดนดุที่บริษัท, '집에서 밥 먹었어' → กินข้าวที่บ้านแล้ว: 곳+에서 를 떼고 찾은 값의 끝말
      // (ไหม·แล้ว·กัน·นะ…) 앞에 ที่+곳. 오다·출발하다 앞이면 จาก(한국에서 왔어 → มาจากเกาหลี). 어디·여기 는 뺀다.
      const ps = !th && bare.match(/^(\S+)에서\s+(\S.*)$/);
      if (ps && !/^(어디|여기|거기|저기)$/.test(ps[1])) {
        const pv = CHAT_SUBJ_TH[ps[1]] || idx.get(ps[1]);
        const pOk = pv && !/[\sA-Za-z0-9]/.test(pv) && !TH_QUESTION.test(pv) && !CHAT_FRAME_TIME.test(pv);
        const r = pOk && predB('', ps[2]) ? one(ps[2] + tail) : '';
        // '침대에서 일하면 허리 아파' → ถ้าทำงานที่เตียงก็ปวดหลัง: 곳은 조건 마디(ถ้า…) 안, ก็ 앞에.
        const rc = r && r.match(/^(ถ้า[^\s]*?)(ก็.+)$/);
        if (rc && !/(ที่|จาก)/.test(rc[1])) return rc[1] + (/^ที่/.test(pv) ? '' : 'ที่') + pv + rc[2];
        const pm2 = r && r.match(/^(.*?)((?:ไหม|หรือยัง|หรือเปล่า|(?<!ห)ยัง|แล้ว|(?<!เจอ)กัน|อยู่)?(?:นะ|เถอะ|ด้วย)?(?:ครับ|ค่ะ|คะ)?)$/);
        if (pm2 && pm2[1] && !/(ที่|จาก)/.test(pm2[1])) {
          // 곳 값이 이미 ที่… 이면(그늘=ที่ร่ม) ที่ 를 또 붙이지 않는다.
          return pm2[1] + (/^(왔|와|오|출발|떠나|나와|나왔|돌아|보내|보냈|가져)/.test(ps[2]) ? 'จาก' : /^ที่/.test(pv) ? '' : 'ที่') + pv + pm2[2];
        }
      }
      // '(수영복 챙겨.) 선글라스도' → แว่นกันแดดด้วย: 낱말 하나 + 도 조각. 포도·온도 처럼 도 까지 한 낱말이면 그대로.
      const nd2 = !th && bare.match(/^(.{2,}?)도$/);
      // 오렌지 주스도 처럼 띄어 써도 된다. 먹어도·가도(~해도 = 그래도) 는 아니다.
      const n2 = nd2 && squash(nd2[1]);
      if (nd2 && !idx.has(squash(bare)) && !CHAT_FRAME_NOT.has(n2) && !/[아어여해]$/.test(n2)) {
        const v2 = CHAT_FRAME_TH[n2] || idx.get(n2);
        if (v2 && !/[\sA-Za-z0-9]/.test(v2) && !TH_QUESTION.test(v2) && !/^(ไม่|อย่า|ช่วย|ขอ(?!ง))/.test(v2))
          return addPoliteParticle(s, v2 + 'ด้วย');
      }
      // '(해열제 먹고 자.) 물도 많이 마시고' → ดื่มน้ำเยอะๆ นะ: 뒤에 덧붙인 ~고 는 ~어 꼴 말(지 말고 → 지 마).
      const tg = !th && !asks && bare.match(/^(.+?\S)고$/);
      if (tg) {
        const [pre, w] = splitLastWord(tg[1]);
        const forms = w.endsWith('말') && /지$/.test(pre.trim()) ? [w.slice(0, -1) + '마'] : koInfinitives(w);
        for (const f of forms) {
          if ((pre + f).replace(/\s/g, '').length < 2) continue;
          const r6 = one(pre + f + tail);
          if (r6 && !TH_QUESTION.test(r6)) return r6;
        }
      }
      // '무슨 드라마?' → ละครอะไร, '무슨 맛?' → รสอะไร: 무슨 + 낱말 하나.
      const ms = !th && bare.match(/^무슨\s+(\S{1,8}?)(?:이야|야|이에요|예요)?$/); // 무슨 발표야? → พรีเซนต์อะไร
      // 한 글자는 뜻이 하나인 것만(무슨 일 = 무슨 날 วัน 이 되면 안 된다).
      if (ms && (ms[1].length >= 2 || '맛색돈옷술방꽃밥약책'.includes(ms[1]))) {
        const vm = CHAT_FRAME_TH[ms[1]] || idx.get(ms[1]);
        if (vm && !/[\sA-Za-z0-9]/.test(vm) && !TH_QUESTION.test(vm) && !/^(ไม่|อย่า|ช่วย|ขอ(?!ง))/.test(vm))
          return addPoliteParticle(s, vm + 'อะไร');
      }
      // '바다 아니면 산?' → ทะเลหรือภูเขา: A 아니면 B (둘 다 낱말).
      const an = !th && bare.match(/^(\S+)\s+아니면\s+(\S+)$/);
      if (an) {
        const [va, vb] = [an[1], an[2]].map((w) => CHAT_FRAME_TH[w] || idx.get(w));
        const okW = (v) => v && !/[\sA-Za-z0-9]/.test(v) && !TH_QUESTION.test(v);
        if (okW(va) && okW(vb)) return addPoliteParticle(s, va + 'หรือ' + vb);
      }
      // '갈색?'·'내일?' — 낱말 하나에 물음표만 붙은 되묻기 → 값+เหรอ(สีน้ำตาลเหรอ).
      // 두 낱말이라도 통째로 용어집 낱말이면('두 명?' = 두명) 같은 되묻기.
      // 끝이 동사 꼴이면(이거 먹을래 = 이거먹을래 쇼핑 키) 되묻기가 아니다.
      const twoNoun = bare.split(/\s+/).length === 2 && idx.has(squash(bare)) && !/(래|까|자|지|니|[어아해야요워와봐])$/.test(bare);
      if (!th && asks && bare.length >= 2 && (!/\s/.test(bare) || twoNoun)) {
        const v1 = chatWhole(bare, idx, (x) => !TH_QUESTION.test(x));
        if (v1 && !/\s/.test(v1) && !/^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง)|ไม่)/.test(v1) && !/(นะ|สิ|เถอะ|หน่อย|ด้วย|แล้ว)$/.test(v1))
          // '너는?'·'오늘은?' = 그럼 ~는? → แล้วเธอล่ะ
          return addPoliteParticle(s, /[은는]$/.test(bare) ? `แล้ว${v1}ล่ะ` : v1 + 'เหรอ');
      }
      // '송끄란이야?'·'학생이야?' — 낱말 + (이)야 되묻기도 같은 값+เหรอ.
      // 고양이야 = 고양이 + 야 이므로 ~이야 를 뗀 꼴과 ~야 만 뗀 꼴을 다 본다. 진심=ความจริงใจ 같은 ความ·การ 명사는 뺀다.
      const cop = !th && asks && !/\s/.test(bare) && /야$/.test(bare) &&
        [bare.replace(/이야$/, ''), bare.slice(0, -1)].find((n) => n.length >= 2 && !CHAT_WORDS[n] && (CHAT_FRAME_TH[n] || idx.has(n)));
      if (cop) {
        const v2 = CHAT_FRAME_TH[cop] || idx.get(cop);
        if (v2 && !/[\sA-Za-z0-9]/.test(v2) && !TH_QUESTION.test(v2) && !/^(อย่า|ห้าม|ช่วย(?!ได้)|ขอ(?!ง)|ไม่|ความ|การ)/.test(v2) && !/(นะ|สิ|เถอะ|หน่อย|ด้วย|แล้ว)$/.test(v2))
          return addPoliteParticle(s, v2 + 'เหรอ');
      }
      // '집에 휴지 있어?' → ที่บ้านมีทิชชู่ไหม, '냉장고에 우유 없어' → ในตู้เย็นไม่มีนม: 곳+에 + 것 + 있어/없어.
      // 관심·재미·약속 있어 처럼 굳은 말은 뺀다. 때 낱말(주말에 시간 있어)은 CHAT_FRAME_TIME 으로 거른다.
      const pe = !th && bare.match(/^(\S+)에\s+(\S+)\s+(있어|없어)(?:요)?$/);
      if (pe) {
        let n = pe[2];
        if (!idx.has(n) && /[이가은는도]$/.test(n)) n = n.slice(0, -1);
        const pv = CHAT_SUBJ_TH[pe[1]] || idx.get(pe[1]);
        const nv = CHAT_FRAME_TH[n] || idx.get(n);
        const okV = (v) => v && !/[\sA-Za-z0-9]/.test(v) && !TH_QUESTION.test(v) && !CHAT_FRAME_TIME.test(v) && !/^(ไม่|อย่า|ช่วย|ขอ(?!ง))/.test(v);
        if (okV(pv) && okV(nv) && !/^(관심|재미|의미|약속|볼일|문제|생각|자신|일|맛|시간|돈)$/.test(n)) {
          const pre = /^ที่/.test(pv) ? '' : /^(냉장고|가방|지갑|방|차|서랍|상자|박스|주머니|핸드폰|폰|통)$/.test(pe[1]) ? 'ใน' : 'ที่';
          const has = pe[3] === '있어';
          const c = pre + pv + (has ? 'มี' : 'ไม่มี') + nv;
          return addPoliteParticle(s, asks ? c + (has ? 'ไหม' : 'เหรอ') : c);
        }
      }
      if (th === 'ครับ') return cfg.chatParticle || th; // 네·예 = 끝말 하나(여성 설정이면 ค่ะ)
      return th && addPoliteParticle(s, th);
    };
    // 물음표 없이 끝난 평서 꼴 줄('내일 비가 와요')에 묻는 꼴 값(พรุ่งนี้ฝนตกไหม)이 잡히면 끝의 ไหม·เหรอ 를
    // 떼고 หรือยัง 은 แล้ว 로(밥을 먹었어 → กินข้าวแล้ว) — 묻는 말은 물음표로 가린다. 물음말(뭐·어디·며칠…)이나
    // 묻는·부탁하는 끝(CHAT_PLAIN_NOT)이면 그대로. 떼고도 묻는 꼴이거나 부탁 값(ขอ…ได้ไหม)이면 '' (번역에 맡김).
    const plainStatement = (s, th) => {
      if (!th || /[?？]\s*$/.test(s)) return th;
      const ko = s.replace(/[\s.!~,？！]+$/, '');
      if (CHAT_ASK_WORD.test(ko) || /어떡|어쩌|며칠|혹시/.test(ko) || CHAT_PLAIN_NOT.test(ko)) return th;
      // เปล่า 홑은 '헛되이'(เสียเงินเปล่า·ว่างเปล่า)라 묻는 끝으로 보지 않는다.
      const q = th.replace(TH_PARTICLE_END, '').match(/^(.*?)\s*(ใช่ไหม|ใช่มั้ย|หรือเปล่า|รึเปล่า|หรือยัง|รึยัง|ไหม|มั้ย|ป่าว|เหรอ|หรอ|ยัง)$/);
      // เป็นห่วงนะรู้ไหม — '알지?' 같은 덧말. ถามว่า…ไหม·เช็คว่า…หรือยัง — 물음이 안긴 마디(물어봤어·확인해)의 것.
      if (!q || /รู้$/.test(q[1]) || /ว่า(?![ยง])/.test(q[1])) return th;
      const rest = /ยัง$/.test(q[2]) && !/แล้ว$/.test(q[1]) ? q[1] + 'แล้ว' : q[1];
      // 부탁 값(ช่วย…ได้ไหม·ขอ…ได้ไหม)과 '나 사랑해' = รักฉันไหม 처럼 나 가 목적어인 값은 평서로 못 바꾼다.
      const req = /ช่วย(?!ได้)|ขอ(?!ง|บ|โทษ)|หน่อย/.test(rest);
      // '나 때문이야' = เพราะฉัน 은 목적어가 아니다.
      if (!q[1] || TH_QUESTION.test(rest) || req || (/^(나|난)\s/.test(ko) && /ฉัน(ได้)?$/.test(rest) && !/^เพราะ/.test(rest))) return '';
      return addPoliteParticle(s, rest);
    };
    const whole = plainStatement(core, one(core));
    if (whole) return whole;
    // '네 알겠어요'·'응 고마워'·'아니 괜찮아' — 앞의 대답말과 나머지를 따로 찾아 잇는다.
    const lead = core.match(/^([^\s,.!~]+)[\s,.!~]+(.+)$/);
    // 뒤가 '정말·진짜' 뿐이면 꾸밈말이라(감사합니다 정말 = 정말 감사합니다) 나누지 않는다.
    // '네 생일 언제야'·'네 차례야' 의 네 는 '너의' — 대답 네·예 는 뒤가 존댓말(네 알겠어요)이거나
    // 문장부호가 붙었을 때(네, 고마워)만 뗀다.
    // '진짜 잘됐다'·'정말 미안하대' 의 진짜·정말 은 꾸밈말(จริงๆ)이라 문장부호가 붙었을 때(진짜, 대박)만 뗀다.
    const yesOk = (l) =>
      /^(진짜|정말)$/.test(l[1])
        ? /^[^\s]+[,.!~]/.test(core)
        : !/^(네|예)$/.test(l[1]) || /^[^\s]+[,.!~]/.test(core) || /(요|니다|니까|세요)[\s.!?~？！]*$/.test(l[2]);
    if (lead && CHAT_LEADS.has(lead[1]) && yesOk(lead) && !/^(정말|진짜)(로)?[\s.!?~？！]*$/.test(lead[2])) {
      const a = one(lead[1]);
      const b = a && (plainStatement(lead[2], one(lead[2])) || chatFromGlossary(lead[2], idx)); // '미안 늦었어. 길이 막혀'
      if (b) return `${a} ${b}`;
    }
    const words = core.split(/\s+/);
    if (words.length >= 2) {
      const call = (w) => CHAT_CALLS[w.replace(/[\s.!?~,？！]+$/, '')];
      const head = CHAT_CALLS_HEAD.test(words[0]) && call(words[0]);
      const rest = head && chatFromGlossary(words.slice(1).join(' '), idx);
      if (rest) return `${head} ${rest}`;
      const end = call(words[words.length - 1]);
      const q = /[?？]\s*$/.test(core) ? '?' : '';
      const front = end && chatFromGlossary(words.slice(0, -1).join(' ') + q, idx);
      if (front) return `${front} ${end}`;
    }
    const parts = core.split(/(?<=[.!?~,？！])\s*/).map((s) => s.trim()).filter((s) => HANGUL.test(s));
    if (parts.length < 2) return '';
    const out = parts.map((p) => plainStatement(p, one(p)) || chatFromGlossary(p, idx)); // 조각 안의 대답말(미안 늦었어.)도 나눈다
    // '어디로 갈까? 카오야이 어때?' — 고르는 물음(~할까?) 뒤의 'N 어때?' 는 권하는 말(เขาใหญ่ดีไหม)이다.
    for (let i = 1; i < out.length; i++)
      if (/까요?\s*[?？]$/.test(parts[i - 1]) && /어때요?\s*[?？]$/.test(parts[i]) && /เป็นยังไง$/.test(out[i]))
        out[i] = out[i].replace(/เป็นยังไง$/, 'ดีไหม');
    return out.every(Boolean) ? out.join(' ') : '';
  }

  async function chatKoreanToThai(text) {
    // 내 언어가 한국어가 아니면 용어집·한국어 말투 다듬기는 맞지 않는다 — 내 말 → 태국어 구글 번역.
    if (!MY_KO) {
      const crossed = await crossLookup(text, MY2, 'th');
      if (crossed) return { thai: crossed, via: '사전' };
      return { thai: (await freeTranslateOne(text, 'auto', 'th')).trim(), via: freeLabel('번역') };
    }
    await ensureGlossary();
    const idx = buildIndex();
    const out = [];
    const vias = new Set();
    for (const raw of text.split('\n')) {
      const line = normKey(raw);
      if (!HANGUL.test(line)) {
        out.push(line);
        continue;
      }
      const { thai, via } = await chatLine(line, idx);
      if (!thai) return { thai: '', via };
      out.push(thai);
      vias.add(via);
    }
    return { thai: out.join('\n'), via: [...vias].join(' + ') };
  }

  // 태국어가 아닌 언어로 보내기: 그 언어의 용어집(한국어 사용자) → 구글 번역(language bar 와 같은 koreanToLang).
  // 줄마다 옮겨 줄을 살린다. 말투 다듬기(끝말 ครับ/ค่ะ 등)는 태국어에만 있다.
  async function chatKoreanToLang(text, lang) {
    if (lang.id === 'th') return chatKoreanToThai(text);
    const out = [];
    const vias = new Set();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || !isMine(line, lang.id)) {
        out.push(line);
        continue;
      }
      const { thai, via } = await koreanToLang(line, lang);
      if (!thai) return { thai: '', via };
      out.push(String(thai).trim());
      vias.add(via);
    }
    return { thai: out.join('\n'), via: [...vias].join(' + ') };
  }

  // 입력칸 글자를 통째로 바꾼다. innerHTML 을 직접 바꾸면 화면만 바뀌고 보내는 건 옛 글자다
  // (Lexical 은 자기 상태를 따로 들고 있다). execCommand('insertText') 는 띄어쓰기가 든 글자를
  // Lexical 이 버린다(시험함). 붙여넣기 이벤트는 띄어쓰기·줄바꿈까지 그대로 받는다. 다만 Lexical 은
  // selectionchange 를 받은 뒤에야 '전체 선택'을 알아서, 고르고 잠깐 기다렸다가 붙여 넣는다.
  async function setComposerText(ed, text, wait = 40) {
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    await sleep(wait);
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(30); // 편집기 상태가 화면에 반영될 틈
  }

  // 보내기 버튼. 이름이 화면 언어마다 달라도('Enter 키를 눌러 전송하세요', 'Press enter to send')
  // Enter 라는 글자는 들어 있다. 메시지 목록 쪽 버튼은 보지 않는다.
  function chatSendButton(ed) {
    let box = ed;
    while (box.parentElement && !box.parentElement.querySelector('[role="log"]')) box = box.parentElement;
    return [...box.querySelectorAll('[role="button"][aria-label], button[aria-label]')].find((b) =>
      /enter/i.test(b.getAttribute('aria-label'))
    );
  }

  async function chatSend(ed) {
    chatSending = true;
    try {
      for (const type of ['keydown', 'keypress', 'keyup']) {
        const ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
        for (const k of ['keyCode', 'which']) Object.defineProperty(ev, k, { get: () => 13 });
        ed.dispatchEvent(ev);
      }
    } finally {
      chatSending = false;
    }
    await sleep(300);
    if (composerText(ed)) chatSendButton(ed)?.click(); // Enter 흉내가 안 먹었으면 버튼으로
  }

  async function chatConvertAndSend(ed) {
    const value = composerText(ed);
    if (chatBusy || !value) return;
    chatBusy = true;
    let lang = null;
    try {
      // 상대 말풍선의 언어를 아직 구글에 묻는 중이면 기다린다(첫 Enter 가 엉뚱한 언어로 가지 않게).
      await chatDetectLangs().catch(() => {});
      lang = chatTarget();
      if (!lang || !isMine(value, lang.id)) {
        await chatSend(ed); // 알아보니 바꿀 방이 아니다 — 쓴 그대로 보낸다
        return;
      }
      setBadge(`${langName(lang)}로 바꾸는 중…`);
      const { thai, via } = await chatKoreanToLang(value, lang);
      if (!thai || untranslated(thai, value)) throw new Error('번역 결과가 비어 있습니다');
      if (composerText(ed) !== value) throw new Error('그 사이 입력칸 글자가 바뀌었습니다');
      await setComposerText(ed, thai);
      if (composerText(ed) !== flatText(thai)) await setComposerText(ed, thai, 150); // 한 번 더, 천천히
      if (composerText(ed) !== flatText(thai)) throw new Error('입력칸에 바꾼 말을 넣지 못했습니다');
      // 보내기 전에 적어 둔다 — 보낸 뒤에 적으면 새 말풍선을 먼저 옮겨 '✎ 내가 쓴 말' 이 빠지곤 했다(2026-11-05 시험).
      chatSentLog = [...chatSentLog.filter((e) => sentKey(e.th) !== sentKey(thai)), { ko: value, th: thai }].slice(-300);
      GM_setValue(CHAT_SENT, chatSentLog);
      await chatSend(ed);
      toast(`"${value}" → "${thai}"  (${via})`, 3500);
    } catch (e) {
      toast(`${lang ? langName(lang) : '외국어'}로 바꾸지 못했습니다: ${e.message || e}\n입력칸 글자는 보내지 않았습니다.`, 5000);
    } finally {
      chatBusy = false;
      setBadge(null);
      updateChatChip();
    }
  }

  // 내 말을 치는 동안 입력칸 위에 'Enter → ไทย'(이 대화방은 상대 언어로 바꿔 보냄 — 日本語·EN …) 또는
  // 'Enter → 한국어 그대로'. 누르면 이 대화방만 켜고 끈다. 다른 언어는 '한' 옆 '번역' 막대에서 고른다.
  function updateChatChip() {
    const lang = chatTarget();
    refreshLangBar(); // 메신저에서는 막대도 이 대화방의 언어를 보여 준다
    const ed = chatComposer(document.activeElement);
    if (!ed || !isMine(ed.textContent, lang ? lang.id : '')) {
      if (chatChip) chatChip.style.display = 'none';
      return;
    }
    if (!chatChip) {
      chatChip = document.createElement('button');
      chatChip.id = 'lzk-chatchip';
      chatChip.type = 'button';
      markNoTranslate(chatChip);
      chatChip.addEventListener('mousedown', (e) => e.preventDefault()); // 입력칸 포커스 유지
      chatChip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = chatThreadId();
        if (!id) return;
        // 끄기 = 그대로. 켜기 = 다시 저절로(상대 언어) — 상대 말이 없어 모르면 언어 막대에서 고른 언어, 그것도 없으면 태국어.
        if (chatTarget()) chatThreads[id] = false;
        else {
          delete chatThreads[id];
          chatLangMemo = null;
          if (!chatTarget()) chatThreads[id] = typeLang || 'th';
        }
        GM_setValue(CHAT_THREADS, chatThreads);
        chatLangMemo = null;
        const now = chatTarget();
        toast(
          now ? `이 대화방: ${MY_KO ? '한국어를 ' : ''}${langName(now)}로 바꿔 보냅니다.` : `이 대화방: ${MY_KO ? '한국어 ' : ''}그대로 보냅니다.`,
          2500
        );
        updateChatChip();
      });
      document.body.appendChild(chatChip);
    }
    const on = lang;
    chatChip.textContent = on ? `Enter ${on.chip || `→ ${langLabel(on)}`}` : `Enter → ${MY_KO ? '한국어 그대로' : '쓴 그대로 보내기'}`; // '그대로' 만 두면 영어로 'like that' 이 됐다
    chatChip.title = on
      ? `이 대화방은 ${MY_KO ? '한국어를' : '쓴 말을'} ${langName(on)}로 바꿔 보냅니다. 누르면 이 대화방은 그대로 보냅니다. 다른 언어는 '한' 옆 '번역' 에서 고릅니다.`
      : `누르면 이 대화방에서 ${MY_KO ? '한국어를' : '쓴 말을'} 바꿔 보냅니다.`;
    chatChip.toggleAttribute('data-off', !on);
    chatChip.style.display = '';
    const r = ed.getBoundingClientRect();
    chatChip.style.left = `${Math.max(4, r.right - chatChip.offsetWidth)}px`;
    chatChip.style.top = `${Math.max(2, r.top - 30)}px`;
  }

  // ---- 받기: 태국어 말풍선 → 한국어 ----

  // 대화에서 흔히 틀리게 쓰는 철자. 구글 번역이 엉뚱하게 읽는다(เอาใว้จะทำไห้สำเร็จ →
  // '왜 성공할까요?', ฉันจะไห้ทำงาน → '나도 일할게'). 태국어에 없는 꼴만 고친다.
  const TH_TYPOS = [
    [/(?<!ร้อง)ไห้/g, 'ให้'], // ร้องไห้(울다)는 그대로
    [/ใว้/g, 'ไว้'],
    [/ใด้/g, 'ได้'],
    [/ใม่/g, 'ไม่'],
    [/ใหน/g, 'ไหน'],
    [/ไส่/g, 'ใส่'],
    [/ไคร(?!้)/g, 'ใคร'], // ตะไคร้(레몬그라스)는 그대로
    [/ไกล้/g, 'ใกล้'],
    [/เข้าไจ/g, 'เข้าใจ'],
    [/ความผิดชอบ/g, 'ความรับผิดชอบ'],
    [/อึก(?!อัก|ๆ)/g, 'อีก'], // ขึ้นอึก → ขึ้นอีก ('다시')
    [/(แบบ|อย่าง|เหมือน|ตอน|เรื่อง|อัน)นั่น/g, '$1นั้น'],
    [/ถุก(?=ต้อง)/g, 'ถูก'],
    // 말하듯 줄여 쓴 철자. โรงบาล 은 '유치원', ก้ได้ 는 '나는 할 수 있다', ด้ายค่ะ 는 '방사' 로 나왔다.
    [/โรงบาล/g, 'โรงพยาบาล'],
    [/เปน/g, 'เป็น'],
    [/แระ/g, 'แล้ว'],
    [/ก้(?=ได้|ดี|ไม่|เลย|ไป|มา|จะ|เป็น|คือ|ยัง|แค่|ต้อง|[\s!.~]|$)/g, 'ก็'],
    [/(^|ไม่|ก็)ด้าย(?=ค่ะ|คะ|ครับ|นะ|จ้า|เลย|[\s!.~]|$)/g, '$1ได้'], // ด้าย(실)은 그대로
    [/(^|\s)เดียว(?=โทร|ไป|มา|กลับ|ก่อน|นะ|จะ|ค่อย|ส่ง|บอก|ตอบ|คุย|ทัก)/g, '$1เดี๋ยว'], // คนเดียว 는 그대로
    [/เกรด\s?(\d\.\d+)/g, 'เกรดเฉลี่ย $1'], // '3.5등급' → 평점 3.5
    [/([ก-ฮะาำเ-ไ])\1{2,}/g, '$1'], // 늘여 쓴 글자(มากกกก, ค่าาา)
    // 문장 가운데 띄어쓰기. 번역은 띄어 쓴 곳을 문장 끝으로 읽는다(จะไม่เกิดเหตุการณ์ แบบนั้นขึ้นอีก →
    // '이벤트는 없습니다. 그렇죠.'). 뒤가 앞말에 붙는 말(แบบ·ขึ้น·อีก·ด้วย·กัน…)이면 붙인다.
    // 앞이 말끝(ค่ะ·ครับ·นะ)이면 진짜 문장 끝이라 둔다.
    [/(?<=[ก-๙])(?<!ค่ะ|คะ|ค่า|ครับ|คับ|นะ|จ้า|จ้ะ|ๆ)\s+(?=(?:แบบ|ขึ้น|อีก|ด้วย|กัน|ไหม|มั้ย|อยู่|ไว้|จัง|หน่อย|บ้าง|ของ|กับ|และ|หรือ|นั้น|นี้|ค่ะ|คะ|ครับ|นะ|จ้า)(?:[ก-๙]|[\s?!.~]|$))/g, ''],
    [/(^|\s)เอาไว้จะ/g, '$1สักวันจะ'], // '두고 봐, (언젠가) 할 거야' — 그대로면 '유지하면…'
  ];

  // 말투·줄임말을 번역이 아는 표준말로. จุงเบย(จังเลย)·ชิมิ(ใช่ไหม)·끝의 ป่ะ/มะ(ไหม) 는 '정배'·'시미'
  // 로, ซีรีส์เกาหลี 는 '한국시리즈'(야구), เกรด 4 는 '4학년', ได้ทุน 은 '자금' 으로 나왔다.
  const TH_SLANG = [
    [/จุงเบย/g, 'จังเลย'],
    [/ชิมิ/g, 'ใช่ไหม'],
    [/เด้อ+|เดอ้/g, 'นะ'],
    [/(?<=[ก-๙])(?:ป่ะ|มะ)(?=[\s?!.~]*$)/g, 'ไหม'],
    [/(?<=[ก-๙])ป่าว(?=[\s?!.~]*$)/g, 'หรือเปล่า'],
    [/(^|ทำ|เป็น|ว่า|กิน|ซื้อ|ดู|เอา)ไร(?=[\s?!.~]|อยู่|อ่ะ|อะ|กัน|ดี|มา|บ้าง|$)/g, '$1อะไร'],
    [/ซีรี(?:ส์|่ส์|่ย์|ย์)(?=\s?(?:เกาหลี|ญี่ปุ่น|จีน|ไทย|ฝรั่ง))/g, 'ละคร'],
    [/ได้ทุน(?!การ)/g, 'ได้ทุนการศึกษา'],
    [/เกรด\s?(?:สี่|4)(?![.\d])/g, 'เกรด A'],
    [/(?<!เ)เฟล(?![็มิ])/g, 'ผิดหวัง'],
    // '바다 갈래?' — ไปทะเลกันไหม 는 '해변에 가자' 로 물음이 사라졌다. กันดีไหม 는 '갈까?'
    [/(ไป[^\s]*?)กัน(?:ไหม|มั้ย|มั๊ย)/g, '$1กันดีไหม'],
    // '나는 먹었어요, 오빠는요?' — 홑 '오빠ล่ะ' 는 번역이 버렸다.
    [/(^|\s)(โอปป้า|ฮยอง|ออนนี่|พี่|เธอ|คุณ|ตัวเอง)ล่ะ/g, '$1แล้ว$2ล่ะ'],
    // '저 좀 가르쳐 줘' — 목적어 หนู(나)는 '교훈'·'쥐' 로 읽혔다.
    [/(?<=สอน|ให้|ช่วย|รอ|กับ|รัก|ชอบ|คิดถึง|โกรธ|บอก|ซื้อ|พา|โทรหา|ถาม|ลืม|ทิ้ง|เชื่อ|ห่วง|ง้อ|แกล้ง|ส่ง)หนู(?!น้อย|ตะเภา|แฮม|ท่อ|นา|วิ่ง|กัด)/g, 'ฉัน'],
    // '내가 살게' — เลี้ยงเอง 은 '직접 키웠다'(기르다)로 나왔다.
    [/(หนู|ฉัน|เค้า|เรา|ผม|พี่)(จะ)?เลี้ยงเอง/g, '$1$2จ่ายให้เอง'],
  ];

  // 이산(동북부) 말. 번역이 거의 모른다(ฮักเด้อ → '나를 안아주세요', คึดฮอดเด้อ → '젠장').
  // 이산 말 표시가 있을 때만 바꾼다 — มื้อนี้(오늘)·หลาย(많이)·ไส(어디)는 표준말에선 다른 뜻이다.
  const TH_ISAN_MARK = /บ่(?![อานง]|วง|ม(?![ีา]))|หยัง|เฮ็ด|คึด|ฮัก(?!กา)|ข่อย|ไส(?=[\s?!.~]|มา|$)|เนาะ/;
  const TH_ISAN = [
    [/แม่นบ่/g, 'ใช่ไหม'],
    [/บ่แม่น/g, 'ไม่ใช่'],
    [/แล้ว\s*บ่(?=[\s?!.~]*$)/g, 'แล้วหรือยัง'],
    [/(?<=[ก-๙])\s*บ่(?=[\s?!.~]*$)/g, 'ไหม'],
    [/บ่(?![อานง]|วง|ม(?![ีา]))/g, 'ไม่'],
    [/หยัง/g, 'อะไร'],
    [/เฮ็ด/g, 'ทำ'],
    [/คึดฮอด/g, 'คิดถึง'],
    [/คึด/g, 'คิด'],
    [/ฮัก(?!กา)/g, 'รัก'],
    [/ข่อย/g, 'ฉัน'],
    [/ไส(?=[\s?!.~]|มา|$)/g, 'ไหน'],
    [/เนาะ/g, 'นะ'],
    [/เบิ่ง/g, 'ดู'],
    [/มื้อนี้/g, 'วันนี้'],
    [/มื้ออื่น/g, 'พรุ่งนี้'],
    [/มื้อวาน/g, 'เมื่อวาน'],
    [/หลาย(?=[\s!~.ๆ]*$|นะ)/g, 'มาก'],
  ];

  // 연인끼리 쓰는 เค้า(나)·ตัวเอง(너). 번역은 '그는'·'자신을' 로 옮긴다(เค้าคิดถึงตัวเองนะ →
  // '그는 자신을 그리워합니다'). ตัวเอง 은 줄 맨 앞이나 마음 쓰는 말 뒤(คิดถึง·รัก·ห่วง…)일 때만
  // '너' — ดูแลตัวเอง(몸 챙겨)·ของตัวเอง(자기 것)은 그대로. เค้า 는 같은 말에 그 '너' 가 있거나,
  // 줄 맨 앞에서 느낌 말(ง่วง·หิว·คิดถึง…)이 이어질 때만 '나'.
  function thaiCouplePronouns(s) {
    const you = /(^|คิดถึง|รัก|ห่วง|ชอบ|เจอ|ง้อ|โกรธ|งอน|แล้ว)ตัวเอง|ตัวเอง(?=ล่ะ|ทำ|อยู่|กิน|นอน|ว่าง|ไป|จะ|มี|ชอบ|รัก|คิดถึง)/;
    const couple = you.test(s);
    if (couple) s = s.replace(new RegExp(you.source, 'g'), (m, p) => (p === undefined ? 'เธอ' : p + 'เธอ'));
    const feel = /^เค้า(?=คิดถึง|รัก|ง่วง|หิว|เหนื่อย|เหงา|งอน|โกรธ|ดีใจ|เสียใจ|กลัว|เบื่อ|ไม่สบาย|ปวด|อยาก|ขอโทษ|ชอบ|หนาว)/;
    if (couple || feel.test(s)) s = s.replace(/เค้า/g, 'ฉัน');
    return s;
  }

  // 말끝으로 본 말하는 사람의 성별. ค่ะ·คะ·ค่า 는 여자, ครับ·คับ 은 남자 말끝이다.
  const TH_FEMALE = /ค่ะ|คะ(?!แนน|เน|น้า)|ค่า(?=[\s!.~?ๆ]|$)|ค้า|คร่ะ|จ้ะ/;
  const TH_MALE = /ครับ|คับ|ครัช|คร้าบ/;
  function thaiSpeakerGender(s) {
    const f = TH_FEMALE.test(s);
    const m = TH_MALE.test(s);
    return f === m ? '' : f ? 'f' : 'm';
  }

  // 상대가 나를 부르는 พี่·พี่ชาย. 구글 번역은 형제·선생님·동생으로 오락가락한다(ค่ะพี่ชาย →
  // '응, 형제', พี่ชายเก่งมากเลยค่ะ → '내 동생은 재능이…'). 한국 호칭을 태국 글자로 적은 말
  // (โอปป้า·ฮยอง·ออนนี่)로 바꿔 넘기면 오빠·형·언니로 나온다. 나(설정한 말끝)와 상대(말끝)의
  // 성별로 고른다. 누나(นูน่า)는 번역이 버려서 그대로 둔다. 남의 형제(พี่ชายของฉัน·พี่สาว·
  // พี่น้อง·ลูกพี่ลูกน้อง)는 건드리지 않는다.
  const CHAT_ADDRESS = { mf: 'โอปป้า', mm: 'ฮยอง', ff: 'ออนนี่' };
  const TH_PHI =
    /(?<!ลูก)พี่(?:ชาย(?!ของ|ฉัน|หนู|เค้า|เขา|คน|ที่|แท้))?(?!สาว|น้อง|เลี้ยง|ใหญ่|รอง|เขย|สะใภ้|ชาย|ๆ)/g;

  // 태국 학년 ม.1~ม.6 은 중1~고3. 번역은 ม.5 를 '마타욤 5'·'5학년'(초등)으로 옮긴다.
  // 풀어 쓰면(มัธยมปลายปีที่ 2) '고등학교 2학년' 이 된다. 주소의 ม.(หมู่ 마을)는 그대로.
  function thaiGrades(s) {
    return s.replace(/ม\.\s?([1-6])(?!\d)(?!\s*(?:ต\.|ตำบล|อ\.|ซ\.))/g, (m, n) =>
      n <= 3 ? `มัธยมต้นปีที่ ${n}` : `มัธยมปลายปีที่ ${n - 3}`
    );
  }

  // 번역에 넘기기 전 태국어 손질. mine = 내가 보낸 말풍선(되옮김 확인용)이면 호칭은 두고,
  // partner = 상대 성별('f'|'m'|'') — 이 말에 말끝이 없을 때 대화방 전체에서 본 것.
  function chatPrepThai(src, mine, partner) {
    let s = TH_TYPOS.reduce((acc, [re, to]) => acc.replace(re, to), src);
    if (TH_ISAN_MARK.test(s)) s = TH_ISAN.reduce((acc, [re, to]) => acc.replace(re, to), s);
    s = TH_SLANG.reduce((acc, [re, to]) => acc.replace(re, to), s);
    s = thaiCouplePronouns(s);
    s = thaiGrades(s);
    // ทุน 은 '자본' 으로 옮겨진다. 공부 얘기 속이면 장학금(ทุนการศึกษา).
    if (/เรียน|มหาลัย|มหาวิทยาลัย|สอบ/.test(s)) {
      s = s.replace(/(?<!ลง|ต้น|ขาด|เงิน|กอง)ทุน(?!การ|ทรัพย์|นิยม|ส่วน|เดิม|สำรอง|จด|ประกัน|หมุน)/g, 'ทุนการศึกษา');
    }
    if (!mine) {
      const me = cfg.chatParticle === 'ครับ' ? 'm' : cfg.chatParticle === 'ค่ะ' ? 'f' : '';
      const word = CHAT_ADDRESS[me + (thaiSpeakerGender(s) || partner)];
      if (word) s = s.replace(TH_PHI, word);
      // 상대가 나에게 묻는 แฟน(애인). 번역은 '오빠 남자친구 있어요?' 로 옮겼다 — 내 성별로 고른다.
      const lover = me === 'm' ? 'แฟนสาว' : me === 'f' ? 'แฟนหนุ่ม' : '';
      if (lover) {
        s = s
          .replace(/(โอปป้า|ฮยอง|ออนนี่|พี่|คุณ|เธอ)(\s*)มีแฟน(?!สาว|หนุ่ม)/g, `$1$2มี${lover}`)
          .replace(/^มีแฟน(?!สาว|หนุ่ม)(?=.*(?:ยัง|ไหม|มั้ย|หรือ|เปล่า))/, `มี${lover}`);
      }
    }
    return s;
  }

  // 자주 오는 짧은 말 → 한국어(사람이 고른 말). 번역이 뜻을 틀리던 것(หายแล้ว '나는 갔다',
  // ดีใจด้วย '나는 행복하다', ตายแล้ว '죽은', แน่ใจนะ '나는 확신한다')부터. 키는 띄어쓰기와 끝의
  // 말끝(ค่ะ·นะ·จ้า…)을 뗀 꼴. 값 '반말|존댓말' — 존댓말을 안 적으면 반말 끝에 요를 붙인다.
  // 상대가 ค่ะ·ครับ 을 썼으면 존댓말로.
  const TH_CHAT_KO = {};
  for (const [keys, ko] of [
    ['หายแล้ว|หายดีแล้ว', '다 나았어'],
    ['งอน|งอนแล้ว', '삐졌어'],
    ['ไม่ง้อหรอ|ไม่ง้อเหรอ|ไม่ง้อหน่อยหรอ', '안 달래 줘?'],
    ['ง้อหน่อย|ง้อด้วย', '좀 달래 줘'],
    ['ดีใจด้วย|ยินดีด้วย|ดีใจด้วยจริงๆ', '축하해'],
    ['เก่งมาก|เก่งมากเลย|เก่งจัง|เก่งจังเลย|เก่งที่สุด', '대단해'],
    ['แน่ใจ|แน่ใจหรอ|แน่ใจเหรอ|แน่ใจนะ', '확실해?'],
    ['รอ', '기다릴게'],
    ['รอก่อน', '잠깐만|잠깐만요'],
    ['รออยู่', '기다리고 있어'],
    ['นอนได้แล้ว|ไปนอนได้แล้ว|นอนเถอะ', '이제 자'],
    ['ที่บ้านสบายดี|ทางบ้านสบายดี', '집은 다 잘 지내'],
    ['สบายดี', '잘 지내'],
    ['สบายดีไหม|สบายดีมั้ย|สบายดีบ่|สบายดีหรือเปล่า', '잘 지내?'],
    ['ตายแล้ว|ตายจริง|ว้าย|ตายแล้วว', '어머나|어머나'],
    ['อ่าว|อ้าว|อ้าวเหรอ', '어?|어?'],
    ['โห|โหย|ว้าว|โอ้โห', '우와|우와'],
    ['แหม', '아이참|아이참'],
    ['เออ|อือ|อืม|อื้อ|อืมม', '응|네'],
    ['จริงดิ|จริงหรอ|จริงเหรอ|จริงอ่ะ|จริงไหม|จริงหรือ|จริงหรือเปล่า', '진짜?|진짜요?'],
    ['จริง|จริงๆ', '진짜야'],
    ['เอาจริง|เอาจริงดิ|เอาจริงหรอ|เอาจริงเหรอ', '진심이야?'],
    ['นอยด์|นอยมาก|นอยด์มาก', '우울해'],
    ['ผิดหวัง|ผิดหวังมาก', '완전 실망이야'],
    ['ฟิน|ฟินมาก', '너무 좋아'],
    ['ปัง|ปังมาก', '대박이야'],
    ['ใช่ไหม|ใช่มั้ย|ใช่ป่ะ|ใช่หรือเปล่า', '그렇지?|그렇죠?'],
    ['คิดถึง|คิดถึงจัง', '보고 싶어'],
    ['คิดถึงมาก|คิดถึงมากๆ|คิดถึงที่สุด', '너무 보고 싶어'],
    ['คิดถึงเหมือนกัน', '나도 보고 싶어'],
    ['รัก|รักมาก', '사랑해'],
    ['รักเหมือนกัน|รักนะเหมือนกัน', '나도 사랑해'],
    ['ไม่เป็นไร|ไม่เป็นอะไร|ไม่เป็นอะไรดอก|ไม่เป็นไรหรอก', '괜찮아'],
    ['ทำอะไรอยู่|ทำอะไร|ทำอะไรอยู่หรอ', '뭐 해?'],
    ['กินข้าวยัง|กินข้าวหรือยัง|กินข้าวแล้วหรือยัง|กินข้าวรึยัง|กินข้าวแล้วยัง', '밥 먹었어?|식사했어요?'],
    ['กินแล้ว|กินข้าวแล้ว', '먹었어'],
    ['ไปไหน', '어디 가?'],
    ['ไปไหนมา', '어디 갔다 왔어?'],
    ['หายไปไหนมา|หายไปไหน', '어디 갔었어?'],
    ['อยู่ไหน|อยู่ที่ไหน', '어디야?'],
    ['แซ่บ|อร่อย', '맛있어'],
    ['แซ่บมาก|อร่อยมาก', '너무 맛있어'],
    ['เป็นห่วง|เป็นห่วงนะ', '걱정돼'],
    ['ดูแลสุขภาพด้วย|ดูแลตัวเองด้วย|รักษาสุขภาพด้วย|ดูแลตัวเองดีๆ', '몸 잘 챙겨'],
    ['เชื่อแล้ว', '이제 믿을게'],
    ['ไม่ได้โกรธ', '화 안 났어'],
    ['โกรธ|โกรธแล้ว', '화났어'],
    ['งง|งงเลย|งงมาก', '헷갈려'],
    ['ไม่สะดวก|ตอนนี้ไม่สะดวก|ยังไม่สะดวก', '지금은 곤란해'],
    ['เปล่า|ป่าว|ปล่าว', '아니|아니요'],
    ['ไม่ใช่', '아니야|아니에요'],
    ['อะไร|อะไรอ่ะ|อะไรเหรอ|อะไรหรอ', '뭐?|네?'],
    ['แล้วเจอกัน|เจอกันนะ', '그때 봐'],
    ['บาย|บายบาย|บ๊ายบาย', '안녕|안녕히 계세요'],
    ['ฝันดี|ราตรีสวัสดิ์|นอนหลับฝันดี', '잘 자'],
    ['อิอิ|อิอิอิ|คิคิ', '히히|히히'],
    ['งื้อ|งือ|งื้ออ', '잉|잉'],
    ['แง|แงๆ', 'ㅠㅠ|ㅠㅠ'],
    ['ฮ่าๆ|ฮ่าฮ่า|ฮ่าๆๆ', 'ㅎㅎ|ㅎㅎ'],
    ['สู้ๆ|สู้|สู้ต่อไป', '화이팅|화이팅'],
    ['พูดไม่เป็น', '말할 줄 몰라'],
    ['อ่านไม่ออก', '못 읽겠어'],
    ['ส่งเสียงมาให้ฟังหน่อย|ขอฟังเสียงหน่อย', '목소리 좀 들려줘'],
    ['เลี้ยงเอง|หนูเลี้ยงเอง|ฉันเลี้ยงเอง|เค้าเลี้ยงเอง|เราเลี้ยงเอง|หนูจ่ายให้เอง|ฉันจ่ายให้เอง', '내가 살게|제가 살게요'],
    ['ใครจ่าย', '누가 내?'],
    ['ถึงแล้ว', '도착했어'],
    ['ถึงบ้านแล้ว', '집에 도착했어'],
    ['ถึงบ้านยัง|ถึงบ้านหรือยัง|ถึงบ้านรึยัง', '집에 도착했어?'],
    ['ตื่นยัง|ตื่นหรือยัง|ตื่นรึยัง', '일어났어?'],
    ['ตื่นแล้ว', '일어났어'],
    ['นอนยัง|นอนหรือยัง|นอนรึยัง', '자?'],
    ['ง่วง|ง่วงแล้ว|ง่วงมาก|ง่วงนอน', '졸려'],
    ['หิว|หิวข้าว|หิวแล้ว|หิวข้าวแล้ว', '배고파'],
    ['เหนื่อย|เหนื่อยมาก|เหนื่อยจัง', '피곤해'],
    ['เหงา|เหงามาก|เหงาจัง', '외로워'],
    ['โอเค|โอเช|ok|okay|โอเคเลย', '알았어|알겠어요'],
    ['ไม่รู้|ไม่รู้สิ|ไม่รู้เหมือนกัน', '몰라'],
    ['เหมือนกัน', '나도|저도'],
    ['น่ารัก|น่ารักจัง|น่ารักมาก', '귀여워'],
    ['ขอโทษ|ขอโทษจริงๆ', '미안해|미안해요'],
    ['ไม่ว่าง', '바빠'],
    ['ว่าง|ว่างแล้ว', '시간 있어'],
    ['ว่างไหม|ว่างมั้ย|ว่างหรือเปล่า|ว่างปะ', '시간 있어?'],
    ['เดี๋ยวโทรหา|เดี๋ยวโทรไป|เดี๋ยวโทรกลับ', '이따 전화할게'],
    ['รอแป๊บ|แป๊บนึง|รอแป๊บนึง|เดี๋ยวนะ|แป๊บ', '잠깐만|잠깐만요'],
    ['ไปก่อน|ไปก่อนนะ', '먼저 갈게'],
    ['อาบน้ำอยู่', '씻는 중이야'],
    ['ไปอาบน้ำก่อน|ไปอาบน้ำแป๊บ', '씻고 올게'],
    ['เรียนอยู่|ติดเรียน', '수업 중이야'],
    ['ทำงานอยู่', '일하는 중이야'],
    ['ก็ได้', '그래|그래요'],
    ['ได้แล้ว', '됐어'],
    ['ไม่ได้', '안 돼|안 돼요'],
    ['นอนแล้ว|นอนก่อน|ไปนอนแล้ว|ไปนอนก่อน', '먼저 잘게'],
    ['เป็นอะไร|เป็นอะไรหรือเปล่า', '무슨 일이야?'],
    ['เป็นอะไรมากไหม|เป็นอะไรมากหรือเปล่า', '많이 안 좋아?'],
    // 한 낱말 느낌 말은 번역이 '수줍은'·'지루한'·'게으른' 같은 사전 꼴로 옮긴다.
    ['เขิน|เขินจัง|เขินมาก', '부끄러워'],
    ['เซ็ง|เซ็งมาก|เซ็งจัง|เบื่อ|เบื่อมาก|เบื่อจัง', '지겨워'],
    ['ติดธุระ|มีธุระ', '볼일이 있어'],
    ['ชัวร์|ชัวร์ๆ|แน่นอน', '확실해'],
    ['ฮือ|ฮือๆ', 'ㅠㅠ|ㅠㅠ'],
    ['อิจฉา|อิจฉาจัง|อิจฉามาก', '부러워'],
    ['งานยุ่ง|งานเยอะ|ยุ่งมาก', '일이 바빠'],
    ['ขี้เกียจ|ขี้เกียจจัง', '귀찮아'],
    ['ตื่นแล้วยัง', '일어났어?'],
    // 상대가 자주 보내는 짧은 말: 인사·안부·하루 보고·몸·날씨·약속·느낌. 번역은 ไม่สบาย 를 '불편한', อิ่ม 을 '가득' 처럼 사전 꼴로 옮긴다.
    ['สวัสดี|หวัดดี', '안녕|안녕하세요'],
    ['อรุณสวัสดิ์|มอร์นิ่ง', '좋은 아침|좋은 아침이에요'],
    ['กินอะไร|กินอะไรอยู่', '뭐 먹어?'],
    ['กินอะไรดี', '뭐 먹을까?|뭐 먹을까요?'],
    ['กินด้วยกันไหม|กินด้วยกันดีไหม|กินข้าวด้วยกันไหม|กินข้าวด้วยกันดีไหม', '같이 먹을래?'],
    ['ไปด้วยกันไหม|ไปด้วยกันดีไหม', '같이 갈래?'],
    ['อยู่บ้าน', '집이야'],
    ['อยู่ที่ทำงาน|อยู่ออฟฟิศ', '회사야'],
    ['กำลังไป', '가는 중이야'],
    ['ใกล้ถึงแล้ว', '거의 다 왔어'],
    ['ถึงไหนแล้ว', '어디쯤이야?'],
    ['ออกจากบ้านแล้ว', '집에서 나왔어'],
    ['เลิกงานแล้ว', '퇴근했어'],
    ['เลิกงานยัง|เลิกงานหรือยัง|เลิกงานรึยัง', '퇴근했어?'],
    ['เลิกงานกี่โมง', '몇 시에 퇴근해?'],
    ['กลับบ้านแล้ว|กลับถึงบ้านแล้ว', '집에 왔어'],
    ['กลับบ้านยัง|กลับบ้านหรือยัง|กลับบ้านรึยัง', '집에 갔어?'],
    ['ทำงานเหนื่อยไหม|ทำงานเหนื่อยมั้ย', '일 힘들었어?'],
    ['เหนื่อยไหม|เหนื่อยมั้ย', '피곤해?'],
    ['วันนี้เป็นไงบ้าง|วันนี้เป็นยังไงบ้าง', '오늘 어땠어?'],
    ['เป็นไงบ้าง|เป็นยังไงบ้าง', '요즘 어때?'],
    ['โอเคไหม|โอเคมั้ย|โอเคป่ะ|โอเคหรือเปล่า', '괜찮아?'],
    ['ไม่สบาย', '몸이 안 좋아'],
    ['ไม่สบายหรอ|ไม่สบายเหรอ', '아파?'],
    ['ปวดหัว', '머리 아파'],
    ['ปวดท้อง', '배 아파'],
    ['เป็นไข้|มีไข้', '열 나'],
    ['หายยัง|หายหรือยัง|หายรึยัง|ดีขึ้นยัง|ดีขึ้นหรือยัง', '좀 나았어?'],
    ['ดีขึ้นแล้ว', '좀 나아졌어'],
    ['กินยาแล้ว', '약 먹었어'],
    ['กินยายัง|กินยาหรือยัง|กินยารึยัง', '약 먹었어?'],
    ['พักผ่อนเยอะๆ|พักผ่อนด้วย|พักผ่อนบ้าง', '푹 쉬어|푹 쉬세요'],
    ['ขอบคุณ|ขอบใจ', '고마워'],
    ['ขอบคุณมาก|ขอบคุณมากๆ|ขอบใจมาก', '정말 고마워'],
    ['รับทราบ', '알겠어|알겠습니다'],
    ['ได้', '좋아'],
    ['ตกลง', '좋아, 그러자|좋아요'],
    ['ไม่เอา', '싫어|괜찮아요'],
    ['ไม่ต้อง', '안 해도 돼|안 그러셔도 돼요'],
    ['ไม่ต้องห่วง|อย่าห่วง|ไม่ต้องเป็นห่วง|อย่าเป็นห่วง', '걱정 마|걱정 마세요'],
    ['ระวัง|ระวังด้วย|ระวังตัวด้วย', '조심해|조심하세요'],
    ['ขับรถดีๆ|ขับรถระวังด้วย', '운전 조심해|운전 조심하세요'],
    ['เดินทางปลอดภัย|เดินทางดีๆ', '조심히 가|조심히 가세요'],
    ['โชคดี|ขอให้โชคดี', '행운을 빌어'],
    ['เที่ยวให้สนุก', '재밌게 놀아|재밌게 노세요'],
    ['สนุกไหม|สนุกมั้ย', '재밌어?'],
    ['สนุก', '재밌어'],
    ['สนุกมาก', '너무 재밌어'],
    ['ร้อน', '더워'],
    ['ร้อนมาก|ร้อนจัง', '너무 더워'],
    ['หนาว', '추워'],
    ['หนาวมาก|หนาวจัง', '너무 추워'],
    ['ฝนตก', '비 와'],
    ['ฝนตกหนัก', '비 많이 와'],
    ['ดูหนังอยู่', '영화 보는 중이야'],
    ['ดูซีรีส์อยู่|ดูละครอยู่', '드라마 보는 중이야'],
    ['เล่นเกมอยู่', '게임하는 중이야'],
    ['ทำกับข้าวอยู่', '요리하는 중이야'],
    ['กินข้าวอยู่', '밥 먹는 중이야'],
    ['ขับรถอยู่', '운전 중이야'],
    ['อยู่ข้างนอก', '밖이야'],
    ['อยู่กับเพื่อน', '친구랑 있어'],
    ['ไปเที่ยวมา', '놀러 갔다 왔어'],
    ['ไปตลาดมา', '시장 갔다 왔어'],
    ['ไปทำงานแล้ว', '출근했어'],
    ['ส่งรูปมาหน่อย|ส่งรูปมา|ขอดูรูปหน่อย|ส่งรูปให้ดูหน่อย', '사진 좀 보내 줘|사진 좀 보내 주세요'],
    ['ได้รับแล้ว', '받았어'],
    ['ได้รับยัง|ได้รับหรือยัง', '받았어?'],
    ['ส่งแล้ว|ส่งไปแล้ว', '보냈어'],
    ['เห็นแล้ว', '봤어'],
    ['เน็ตไม่ดี|เน็ตช้า|เน็ตไม่ค่อยดี', '인터넷이 안 좋아'],
    ['แบตหมด', '배터리 다 됐어'],
    ['แบตจะหมด|แบตใกล้หมด', '배터리 얼마 안 남았어'],
    ['เพิ่งตื่น', '방금 일어났어'],
    ['เพิ่งถึง', '방금 도착했어'],
    ['เพิ่งเลิกงาน', '방금 퇴근했어'],
    ['อิ่ม|อิ่มแล้ว', '배불러|배불러요'],
    ['อิ่มมาก', '너무 배불러|너무 배불러요'],
    ['กินเยอะๆ', '많이 먹어|많이 드세요'],
    ['กินให้อร่อย|ทานให้อร่อย', '맛있게 먹어|맛있게 드세요'],
    ['ยังไม่ได้กิน|ยังไม่กิน', '아직 안 먹었어'],
    ['ยัง', '아직|아직이요'],
    ['ยังไม่นอน', '아직 안 자'],
    ['เสร็จแล้ว', '다 했어'],
    ['เสร็จยัง|เสร็จหรือยัง', '다 했어?'],
    ['รอนานไหม|รอนานมั้ย', '오래 기다렸어?'],
    ['มาแล้ว', '왔어'],
    ['มายัง|มาหรือยัง|มารึยัง', '왔어?'],
    ['กี่โมง', '몇 시야?'],
    ['เจอกันพรุ่งนี้|พรุ่งนี้เจอกัน', '내일 봐|내일 봬요'],
    ['ไว้คุยกันใหม่|ไว้ค่อยคุยกัน|คุยกันใหม่', '다음에 또 얘기해'],
    ['ขอโทษที่ตอบช้า', '답장 늦어서 미안해'],
    ['ขอโทษที่ทำให้รอ', '기다리게 해서 미안해'],
    ['อย่าโกรธ', '화내지 마|화내지 마세요'],
    ['โกรธหรอ|โกรธเหรอ|โกรธไหม|โกรธมั้ย', '화났어?'],
    ['ไม่งอน', '안 삐졌어'],
    ['งอนหรอ|งอนเหรอ', '삐졌어?'],
    ['ล้อเล่น', '농담이야'],
    ['ล้อเล่นหรอ|ล้อเล่นเหรอ', '농담이지?|농담이죠?'],
    ['เข้าใจแล้ว', '이해했어'],
    ['ไม่เข้าใจ', '이해가 안 돼'],
    ['หมายความว่าอะไร|หมายถึงอะไร', '무슨 뜻이야?'],
    ['ทำไม|ทำไมล่ะ|ทำไมหรอ|ทำไมเหรอ', '왜?|왜요?'],
    ['เมื่อไหร่', '언제?|언제요?'],
    ['เท่าไหร่', '얼마야?'],
    ['แพงมาก', '너무 비싸'],
    ['ใช่|ใช่แล้ว', '맞아'],
    ['จำได้ไหม|จำได้มั้ย', '기억나?'],
    ['จำไม่ได้', '기억 안 나'],
    ['ลืม|ลืมไป|ลืมไปแล้ว', '깜빡했어'],
    ['อย่าลืม', '잊지 마|잊지 마세요'],
    ['ไม่มีอะไร', '아무것도 아니야'],
    ['ใจเย็นๆ|ใจเย็น', '진정해|진정하세요'],
    ['ช่างมัน|ช่างเถอะ', '신경 쓰지 마|신경 쓰지 마세요'],
    ['พอแล้ว', '그만해|그만하세요'],
    ['กลัว|น่ากลัว', '무서워'],
    ['ตกใจ|ตกใจหมด', '깜짝 놀랐어'],
    ['เสียใจ', '속상해'],
    ['เสียใจด้วย', '안타까워'],
    ['ดีใจ', '기뻐'],
    ['ดีใจมาก', '너무 기뻐'],
    ['มีความสุข', '행복해'],
    ['มีความสุขมาก', '너무 행복해'],
    ['เศร้า', '슬퍼'],
    ['อย่าร้องไห้', '울지 마|울지 마세요'],
    ['เครียด', '스트레스 받아'],
    ['เครียดมาก', '스트레스 많이 받아'],
    ['ไม่ไหว|ไม่ไหวแล้ว', '더는 못 하겠어'],
    ['ไหวไหม|ไหวมั้ย', '괜찮겠어?'],
    ['ขอบคุณที่เป็นห่วง|ขอบคุณที่ห่วง', '걱정해 줘서 고마워'],
    ['ยินดีที่ได้รู้จัก', '만나서 반가워'],
    ['สุขสันต์วันเกิด|แฮปปี้เบิร์ดเดย์|hbd', '생일 축하해'],
    ['สวัสดีปีใหม่|สุขสันต์วันปีใหม่', '새해 복 많이 받아|새해 복 많이 받으세요'],
    ['หลับฝันดี', '잘 자'],
    ['ฝันถึงด้วย', '꿈에서 만나'],
    ['นอนไม่หลับ', '잠이 안 와'],
    ['อย่านอนดึก', '늦게 자지 마|늦게 주무시지 마세요'],
    ['ตื่นสาย', '늦잠 잤어'],
    ['สวย', '예뻐'],
    ['สวยมาก|สวยจัง', '너무 예뻐'],
    ['หล่อ', '잘생겼어'],
    ['หล่อมาก|หล่อจัง', '너무 잘생겼어'],
    ['ชอบ', '좋아'],
    ['ชอบมาก', '너무 좋아'],
    ['ไม่ชอบ', '싫어'],
    ['ถูกใจ|ถูกใจมาก', '마음에 들어'],
    ['อยากเจอ|อยากเจอแล้ว|อยากเจอจัง', '보고 싶어'],
    ['อยากไปเกาหลี', '한국 가고 싶어'],
    ['จะมาเมื่อไหร่|มาเมื่อไหร่', '언제 와?'],
    ['กลับมาเร็วๆ', '빨리 돌아와'],
    ['ไม่ต้องรีบ', '천천히 해|천천히 하세요'],
    ['ไปไหนดี', '어디 갈까?|어디 갈까요?'],
    ['ทำอะไรดี', '뭐 할까?|뭐 할까요?'],
    ['อยากได้อะไร', '뭐 갖고 싶어?'],
    ['ได้ไหม|ได้มั้ย|ได้หรือเปล่า', '돼?'],
    ['ไม่แน่ใจ', '잘 모르겠어'],
    ['แล้วแต่|ตามใจ', '마음대로 해|편하신 대로 하세요'],
    ['อะไรก็ได้', '아무거나 괜찮아'],
    ['ไม่มีปัญหา', '문제없어|문제없어요'],
    ['เรียบร้อย|เรียบร้อยแล้ว', '다 됐어'],
    ['ยุ่งไหม|ยุ่งมั้ย|ยุ่งอยู่ไหม', '바빠?'],
    ['ช่วยหน่อย|ช่วยด้วย', '좀 도와줘|좀 도와주세요'],
    ['ไม่ต้องเกรงใจ', '부담 갖지 마|부담 갖지 마세요'],
    ['ดี', '좋아'],
    ['ดีมาก', '아주 좋아'],
    ['แย่แล้ว', '큰일 났어'],
    ['เสียดาย|น่าเสียดาย|เสียดายจัง', '아쉬워'],
    ['ช่วยไม่ได้', '어쩔 수 없지|어쩔 수 없죠'],
    ['อย่าคิดมาก|ไม่ต้องคิดมาก', '너무 신경 쓰지 마|너무 신경 쓰지 마세요'],
    ['รอหน่อย|รอนิดนึง', '좀 기다려|좀 기다려 주세요'],
    ['เดี๋ยวมา|เดี๋ยวกลับมา', '금방 올게'],
    ['เดี๋ยวคุยกัน|เดี๋ยวค่อยคุย', '이따 얘기해'],
    ['โทรมา|โทรหาหน่อย', '전화해 줘|전화해 주세요'],
    ['โทรไม่ติด', '전화가 안 돼'],
    ['ทำไมไม่ตอบ', '왜 답장 안 해?'],
    ['ได้ยินไหม|ได้ยินมั้ย', '들려?'],
    ['คอลได้ไหม|โทรได้ไหม|คอลได้มั้ย|โทรได้มั้ย', '통화할 수 있어?'],
    // 약속·안부·말 배우기·고마움(2차).
    ['ทำไมไม่โทรมา', '왜 전화 안 해?'],
    ['โทรมาหน่อย', '전화 좀 해 줘|전화 좀 해 주세요'],
    ['ตอนนี้อยู่ไหน|ตอนนี้อยู่ที่ไหน', '지금 어디야?'],
    ['ตอนนี้ทำอะไรอยู่|ตอนนี้ทำอะไร', '지금 뭐 해?'],
    ['วันนี้ทำอะไร', '오늘 뭐 해?'],
    ['วันนี้ทำอะไรบ้าง', '오늘 뭐 했어?'],
    ['พรุ่งนี้ทำอะไร', '내일 뭐 해?'],
    ['พรุ่งนี้ว่างไหม|พรุ่งนี้ว่างมั้ย', '내일 시간 있어?'],
    ['วันนี้ว่างไหม|วันนี้ว่างมั้ย', '오늘 시간 있어?'],
    ['ไปเที่ยวกัน', '놀러 가자|놀러 가요'],
    ['ไปกินข้าวกัน', '밥 먹으러 가자|밥 먹으러 가요'],
    ['ไปดูหนังกัน', '영화 보러 가자|영화 보러 가요'],
    ['กินอะไรมา', '뭐 먹었어?'],
    ['อร่อยไหม|อร่อยมั้ย', '맛있어?'],
    ['หนาวไหม|หนาวมั้ย', '추워?'],
    ['ร้อนไหม|ร้อนมั้ย', '더워?'],
    ['ที่เกาหลีหนาวไหม|เกาหลีหนาวไหม', '한국 추워?'],
    ['ฝนตกไหม|ฝนตกมั้ย', '비 와?'],
    ['นอนกี่โมง', '몇 시에 자?'],
    ['ตื่นกี่โมง', '몇 시에 일어나?'],
    ['ถึงแล้วบอกด้วย|ถึงแล้วบอก', '도착하면 알려 줘|도착하면 알려 주세요'],
    ['ถึงบ้านแล้วบอกด้วย|ถึงบ้านแล้วบอก', '집에 도착하면 알려 줘|집에 도착하면 알려 주세요'],
    ['อย่าลืมกินข้าว', '밥 꼭 챙겨 먹어|밥 꼭 챙겨 드세요'],
    ['กินข้าวเยอะๆ', '밥 많이 먹어|많이 드세요'],
    ['ห่วง', '걱정돼'],
    ['ดูแลตัวเอง', '몸 잘 챙겨'],
    ['รักษาสุขภาพ', '건강 챙겨'],
    ['ขอให้มีความสุข|ขอให้มีความสุขมากๆ', '행복하길 바라'],
    ['อย่าเศร้า', '슬퍼하지 마|슬퍼하지 마세요'],
    ['อย่าเครียด', '스트레스 받지 마|스트레스 받지 마세요'],
    ['ใจดี|ใจดีจัง|ใจดีมาก', '정말 착해'],
    ['พูดเก่ง', '말 잘하네|말 잘하시네요'],
    ['ภาษาไทยเก่ง|ภาษาไทยเก่งมาก|พูดภาษาไทยเก่ง|พูดภาษาไทยเก่งมาก', '태국어 잘하네|태국어 잘하시네요'],
    ['พูดภาษาไทยได้ไหม|พูดภาษาไทยได้มั้ย', '태국어 할 줄 알아?'],
    ['สอนภาษาเกาหลีหน่อย|สอนภาษาเกาหลีให้หน่อย', '한국어 좀 가르쳐 줘|한국어 좀 가르쳐 주세요'],
    ['อยากเรียนภาษาเกาหลี', '한국어 배우고 싶어'],
    ['อยากไปเที่ยวเกาหลี', '한국 놀러 가고 싶어'],
    ['มาไทยเมื่อไหร่|จะมาไทยเมื่อไหร่|มาเมืองไทยเมื่อไหร่', '태국 언제 와?'],
    ['จะรอ', '기다릴게'],
    ['สัญญา', '약속해'],
    ['พูดจริง', '진짜야'],
    ['ไม่ได้โกหก', '거짓말 아니야|거짓말 아니에요'],
    ['ขอบคุณที่รอ', '기다려 줘서 고마워'],
    ['ขอบคุณที่เข้าใจ', '이해해 줘서 고마워'],
    ['ขอบคุณที่ดูแล', '챙겨 줘서 고마워'],
    ['ยินดี', '천만에|천만에요'],
    // 상대의 흔한 대답(3차): 하는 중·몸 상태·애정 표현.
    ['ไม่หิว', '배 안 고파'],
    ['ยังไม่หิว', '아직 배 안 고파'],
    ['กำลังกิน|กินอยู่', '먹는 중이야'],
    ['กำลังจะกิน', '이제 먹으려고|이제 먹으려고요'],
    ['กำลังจะนอน', '이제 자려고|이제 자려고요'],
    ['กำลังจะไป', '이제 가려고|이제 가려고요'],
    ['กำลังทำงาน', '일하는 중이야'],
    ['ไม่ได้ทำอะไร', '아무것도 안 해'],
    ['อยู่เฉยๆ', '그냥 있어'],
    ['นอนเล่นอยู่', '누워서 쉬고 있어'],
    ['เล่นโทรศัพท์อยู่', '폰 보고 있어'],
    ['คุยกับเพื่อนอยู่', '친구랑 얘기하고 있어'],
    ['ไปไหนมาไหน', '어디 갔다 왔어?'],
    ['ไปทำงานมา', '일하고 왔어'],
    ['ไปเรียนมา', '수업 듣고 왔어'],
    ['เพิ่งกลับมา', '방금 돌아왔어'],
    ['เพิ่งอาบน้ำเสร็จ', '방금 씻었어'],
    ['เดี๋ยวไปอาบน้ำ', '씻고 올게'],
    ['จะนอนแล้ว', '이제 잘게'],
    ['ตื่นนานแล้ว', '일어난 지 오래됐어'],
    ['นอนไม่พอ', '잠이 부족해'],
    ['ปวดหลัง', '허리 아파'],
    ['เป็นหวัด', '감기 걸렸어'],
    ['ไอ', '기침 나'],
    ['เจ็บคอ', '목 아파'],
    ['ไม่เป็นอะไรมาก', '별일 아니야|별일 아니에요'],
    ['ไปหาหมอแล้ว', '병원 갔다 왔어'],
    ['อยากกอด', '안고 싶어'],
    ['จุ๊บ|จุ๊บๆ', '쪽|쪽'],
    ['รักที่สุด', '제일 사랑해'],
    ['ขอบคุณที่น่ารัก', '다정하게 해 줘서 고마워'],
    ['น่ารักที่สุด', '제일 귀여워'],
    ['เข้าใจ', '이해해'],
    ['พูดช้าๆ|พูดช้าๆหน่อย', '천천히 말해 줘|천천히 말씀해 주세요'],
    // 상대의 흔한 대답(4차): 일·학교·가족·취향·집안일·질투.
    ['งานเยอะมาก', '일이 엄청 많아'],
    ['วันนี้งานเยอะ|วันนี้งานเยอะมาก', '오늘 일 많았어'],
    ['งานไม่เยอะ', '일 별로 안 많아'],
    ['วันนี้งานไม่เยอะ', '오늘은 일 별로 없었어'],
    ['ลูกค้าเยอะ|ลูกค้าเยอะมาก', '손님 많아'],
    ['วันนี้ลูกค้าเยอะ|วันนี้ลูกค้าเยอะมาก', '오늘 손님 많았어'],
    ['โดนหัวหน้าด่า|โดนหัวหน้าดุ|โดนเจ้านายด่า|โดนเจ้านายดุ', '상사한테 혼났어'],
    ['เพื่อนร่วมงานใจดี', '동료들 착해'],
    ['ยังไม่เลิกงาน|ยังไม่ได้เลิกงาน', '아직 일 안 끝났어'],
    ['กำลังกลับบ้าน', '집에 가는 중이야'],
    ['กำลังจะกลับบ้าน', '이제 집에 가려고|이제 집에 가려고요'],
    ['พรุ่งนี้ทำงาน', '내일 일해'],
    ['พรุ่งนี้ต้องทำงาน', '내일 일해야 해'],
    ['พรุ่งนี้หยุด|พรุ่งนี้หยุดงาน', '내일 쉬어'],
    ['วันนี้หยุด|วันนี้หยุดงาน', '오늘 쉬어'],
    ['ทำโอที', '야근해'],
    ['เงินเดือนออกแล้ว', '월급 나왔어'],
    ['อยากลาออก', '일 그만두고 싶어'],
    ['ได้งานใหม่แล้ว', '새 일 구했어'],
    ['ได้งานแล้ว', '일 구했어'],
    ['สอบเสร็จแล้ว', '시험 끝났어'],
    ['สอบไม่ผ่าน|สอบตก', '시험 떨어졌어'],
    ['สอบผ่าน|สอบผ่านแล้ว', '시험 붙었어'],
    ['การบ้านเยอะ|การบ้านเยอะมาก', '숙제 많아'],
    ['ปิดเทอมแล้ว', '방학했어'],
    ['คิดถึงบ้าน', '집이 그리워'],
    ['อยากกลับบ้าน', '집에 가고 싶어'],
    ['แม่โทรมา', '엄마한테 전화 왔어'],
    ['แม่ไม่สบาย', '엄마가 아파'],
    ['พ่อแม่สบายดี', '부모님 잘 계셔|부모님 잘 계세요'],
    ['ไปบ้านยาย', '할머니 댁에 가'],
    ['กลับบ้านต่างจังหวัด|กลับต่างจังหวัด', '고향에 내려가'],
    ['อยู่ห้าง', '쇼핑몰이야'],
    ['ยังไม่ได้อาบน้ำ', '아직 안 씻었어'],
    ['ไม่ได้หึง', '질투하는 거 아니야|질투하는 거 아니에요'],
    ['หึง', '질투 나'],
    ['แค่เพื่อน|เพื่อนเฉยๆ|แค่เพื่อนเฉยๆ', '그냥 친구야'],
    ['ไม่เชื่อ', '안 믿어'],
    ['เชื่อ', '믿어'],
    ['ล้างจานแล้ว', '설거지했어'],
    ['ซักผ้าอยู่|กำลังซักผ้า', '빨래하고 있어'],
    ['ทำความสะอาดบ้าน|ทำความสะอาดบ้านอยู่|กำลังทำความสะอาดบ้าน', '집 청소하고 있어'],
    ['ไปตลาด', '시장 가'],
    ['ไปซื้อของ', '장 보러 가'],
    ['ชอบสีชมพู', '분홍색 좋아해'],
    ['ชอบกินส้มตำ', '쏨땀 좋아해'],
    ['ไม่ชอบเผ็ด|ไม่ชอบกินเผ็ด', '매운 거 안 좋아해'],
    ['กินเผ็ดไม่ได้|กินเผ็ดไม่เป็น', '매운 거 못 먹어'],
    ['ชอบหมา', '강아지 좋아해'],
    ['ชอบแมว', '고양이 좋아해'],
    ['ไม่ดื่มเหล้า|ไม่กินเหล้า', '술 안 마셔|술 안 마셔요'],
    ['ดื่มนิดหน่อย', '조금 마셔|조금 마셔요'],
    ['ไม่สูบบุหรี่', '담배 안 피워'],
    ['ชอบดูละครเกาหลี|ชอบดูซีรีย์เกาหลี', '한국 드라마 보는 거 좋아해'],
    ['ชอบฟังเพลง', '음악 듣는 거 좋아해'],
    ['ร้องเพลงไม่เก่ง', '노래 잘 못해'],
    ['เต้นไม่เป็น', '춤 못 춰|춤 못 춰요'],
    // 상대의 흔한 대답(5차): 데리러 와·몸 상태·응원·결혼·친구 모임.
    ['มารับหน่อย|มารับด้วย', '데리러 와 줘'],
    ['มารับได้ไหม|มารับได้มั้ย', '데리러 올 수 있어?'],
    ['ไม่ต้องมารับ', '데리러 안 와도 돼'],
    ['รถติด', '차 막혀'],
    ['รถติดมาก', '차 엄청 막혀'],
    ['เรียกแกร็บแล้ว', '그랩 불렀어'],
    ['เป็นเมน|เป็นประจำเดือน', '생리 중이야'],
    ['เมนมา|ประจำเดือนมา', '생리 시작했어'],
    ['ปวดเมน|ปวดท้องเมน|ปวดประจำเดือน', '생리통 있어'],
    ['ยังไม่หาย', '아직 안 나았어'],
    ['เป็นกำลังใจให้', '응원할게'],
    ['ขอบคุณที่เป็นกำลังใจ|ขอบคุณที่เป็นกำลังใจให้', '응원해 줘서 고마워'],
    ['ตื่นเต้น', '떨려'],
    ['ตื่นเต้นมาก', '엄청 떨려'],
    ['สัมภาษณ์ผ่าน|สัมภาษณ์ผ่านแล้ว', '면접 붙었어'],
    ['พรุ่งนี้สัมภาษณ์งาน|พรุ่งนี้มีสัมภาษณ์งาน|พรุ่งนี้สัมภาษณ์', '내일 면접 있어'],
    ['อยากแต่งงาน', '결혼하고 싶어'],
    ['แต่งงานกันไหม|แต่งงานกันมั้ย', '우리 결혼할까?|우리 결혼할까요?'],
    ['พ่อแม่ไม่ยอม', '부모님이 허락 안 하셔|부모님이 허락 안 하세요'],
    ['พ่อแม่ยอมแล้ว', '부모님이 허락하셨어|부모님이 허락하셨어요'],
    ['พ่อแม่อยากเจอ', '부모님이 만나고 싶어 하셔|부모님이 만나고 싶어 하세요'],
    ['สินสอดเท่าไหร่', '신쏫 얼마야?'],
    ['ไม่ต้องมีสินสอด|ไม่ต้องให้สินสอด', '신쏫 없어도 돼'],
    ['อยากมีลูก', '아이 갖고 싶어'],
    ['อยากอยู่เกาหลี', '한국에서 살고 싶어'],
    ['อยากอยู่ไทย|อยากอยู่เมืองไทย', '태국에서 살고 싶어'],
    ['ยุงเยอะ|ยุงเยอะมาก', '모기 많아'],
    ['เพื่อนชวนไปเที่ยว', '친구가 놀러 가자고 해'],
    ['ไปเที่ยวกับเพื่อน', '친구랑 놀러 가'],
    ['ไปได้ไหม|ไปได้มั้ย', '가도 돼?'],
    ['กลับดึก', '늦게 들어가'],
    ['ถึงบ้านแล้วจะบอก|ถึงบ้านแล้วจะทัก', '집에 가면 연락할게'],
    ['เมาแล้ว', '취했어'],
    ['ไม่ได้เมา', '안 취했어'],
    ['ดื่มนิดเดียว|ดื่มนิดเดียวเอง', '조금밖에 안 마셨어'],
    // 상대의 흔한 대답(6차): 아이·돈·SNS·먹을 것.
    ['ลูกหลับแล้ว', '아이 잠들었어'],
    ['ลูกยังไม่นอน', '아이 아직 안 자'],
    ['ลูกร้องไห้', '아이가 울어'],
    ['ลูกร้องไห้ไม่หยุด', '아이가 계속 울어'],
    ['ลูกไม่สบาย', '아이가 아파'],
    ['ลูกมีไข้', '아이가 열이 나'],
    ['ลูกกินข้าวแล้ว', '아이 밥 먹었어'],
    ['ลูกคิดถึงพ่อ', '아이가 아빠 보고 싶어 해'],
    ['ลูกงอแง', '아이가 칭얼대'],
    ['ลูกดื้อ', '아이가 말을 안 들어'],
    ['พาลูกไปหาหมอ', '아이 데리고 병원 가'],
    ['ไปส่งลูกที่โรงเรียน', '아이 학교 데려다주러 가'],
    ['ไปส่งลูก', '아이 데려다주러 가'],
    ['ไปรับลูก', '아이 데리러 가'],
    ['เปลี่ยนผ้าอ้อมแล้ว', '기저귀 갈았어'],
    ['นมผงหมด', '분유 다 떨어졌어'],
    ['ผ้าอ้อมหมด', '기저귀 다 떨어졌어'],
    ['เงินหมด', '돈 다 떨어졌어'],
    ['ไม่มีเงิน', '돈 없어'],
    ['โอนแล้ว|โอนให้แล้ว|โอนเงินแล้ว|โอนเงินให้แล้ว', '송금했어'],
    ['เงินเข้าแล้ว', '돈 들어왔어'],
    ['เงินยังไม่เข้า', '돈 아직 안 들어왔어'],
    ['ขอยืมเงินหน่อย|ขอยืมเงิน', '돈 좀 빌려줘|돈 좀 빌려주세요'],
    ['เดี๋ยวคืน|เดี๋ยวคืนให้', '금방 갚을게'],
    ['ค่าไฟแพง', '전기세 비싸'],
    ['ค่าเช่าขึ้น', '월세 올랐어'],
    ['จ่ายแล้ว', '냈어'],
    ['ยังไม่ได้จ่าย', '아직 안 냈어'],
    ['ของแพง', '물건이 비싸'],
    ['ลดราคา', '세일해'],
    ['ส่งรูปให้แล้ว|ส่งรูปแล้ว', '사진 보냈어'],
    ['ดูสตอรี่หรือยัง', '스토리 봤어?'],
    ['กดไลก์ให้หน่อย', '좋아요 눌러 줘'],
    ['ลงรูปแล้ว', '사진 올렸어'],
    ['อย่าลงรูป', '사진 올리지 마|사진 올리지 마세요'],
    ['ลบแล้ว', '지웠어'],
    ['ชาร์จแบตอยู่', '충전하는 중이야'],
    ['อยากกินหมูกระทะ', '무까타 먹고 싶어'],
    ['อยากกินชาบู', '샤부샤부 먹고 싶어'],
    ['อยากกินของหวาน', '단 거 먹고 싶어'],
    ['สั่งมากินไหม|สั่งมากินกันไหม', '시켜 먹을까?|시켜 먹을까요?'],
    ['ทำกับข้าวให้', '밥 해 줄게'],
    ['ไม่อร่อย', '맛없어'],
    // 상대의 흔한 대답(7차): 직장·이사·반려동물·드라마·노래.
    ['หัวหน้าบ่น', '상사가 잔소리해'],
    ['ประชุมอยู่|กำลังประชุม', '회의 중이야'],
    ['ประชุมเสร็จแล้ว', '회의 끝났어'],
    ['งานยังไม่เสร็จ', '일 아직 안 끝났어'],
    ['ต้องทำโอที', '야근해야 돼'],
    ['ได้โบนัส|ได้โบนัสแล้ว', '보너스 받았어'],
    ['ได้ขึ้นเงินเดือน|ได้ขึ้นเงินเดือนแล้ว|เงินเดือนขึ้นแล้ว', '월급 올랐어'],
    ['ลาออกแล้ว', '회사 그만뒀어'],
    ['ลาป่วย', '병가 냈어'],
    ['ลางาน', '휴가 냈어'],
    ['ทำงานที่บ้าน', '재택근무해'],
    ['ไปต่างจังหวัด', '지방에 가'],
    ['ไปทำงานต่างจังหวัด', '지방으로 출장 가'],
    ['เพื่อนร่วมงานนิสัยไม่ดี', '동료가 성격이 안 좋아'],
    ['เบื่องาน', '일이 지겨워'],
    ['งานหนัก', '일이 힘들어'],
    ['ย้ายบ้าน', '이사해'],
    ['หาห้องอยู่|กำลังหาห้อง', '방 구하는 중이야'],
    ['ห้องแพง', '방이 비싸'],
    ['ค่าเช่าแพง', '월세가 비싸'],
    ['เจ้าของห้องใจดี', '집주인이 착해'],
    ['ย้ายเสร็จแล้ว', '이사 다 했어'],
    ['หมาไม่สบาย', '강아지가 아파'],
    ['แมวไม่กินข้าว', '고양이가 밥을 안 먹어'],
    ['พาหมาไปหาหมอ', '강아지 데리고 병원 가'],
    ['หมาน่ารัก', '강아지 귀여워'],
    ['อยากเลี้ยงแมว', '고양이 키우고 싶어'],
    ['ดูจบแล้ว', '다 봤어'],
    ['ไม่สนุก', '재미없어'],
    ['ร้องไห้', '울었어'],
    ['ฟังเพลงอยู่', '음악 듣는 중이야'],
    ['เพลงนี้เพราะ', '이 노래 좋다|이 노래 좋아요'],
    ['ไปคาราโอเกะ', '노래방 가'],
    ['นอนดูยูทูบ', '누워서 유튜브 봐'],
    // 상대의 흔한 대답(8차): 애정·말 배우기·가족 소식.
    ['ฉันก็รักเธอ|ก็รักเธอ', '나도 사랑해'],
    ['รักเธอ', '사랑해'],
    ['หวานจัง', '달달해'],
    ['ปากหวาน', '말도 참 달콤하게 하네|말도 참 달콤하게 하시네요'],
    ['โกหก', '거짓말|거짓말이에요'],
    ['ไม่เชื่อหรอก', '안 믿어'],
    ['อยากเจอมาก', '엄청 보고 싶어'],
    ['เมื่อไหร่จะได้เจอ|เมื่อไหร่จะได้เจอกัน', '언제 만날 수 있어?'],
    ['ไม่ไปไหนหรอก|ไม่ไปไหน', '아무 데도 안 가'],
    ['อยู่ตรงนี้', '여기 있어'],
    ['พูดเก่งแล้ว', '이제 말 잘하네|이제 말 잘하시네요'],
    ['ภาษาไทยเก่งขึ้นเยอะ|ภาษาไทยเก่งขึ้น', '태국어 많이 늘었어'],
    ['ออกเสียงถูกแล้ว', '발음 맞았어'],
    ['ไม่ใช่แบบนั้น', '그게 아니야'],
    ['พูดผิด', '잘못 말했어'],
    ['พูดอีกที|พูดใหม่อีกที', '다시 말해 줘'],
    ['พิมพ์ภาษาอังกฤษได้ไหม', '영어로 써 줄 수 있어?'],
    ['แม่ฝากสวัสดี', '엄마가 안부 전해 달래'],
    ['แม่ถามถึง', '엄마가 너 안부 물어봤어'],
    ['พ่อชอบ', '아빠가 좋아하셔|아빠가 좋아하세요'],
    ['แม่ชอบมาก', '엄마가 엄청 좋아하셔|엄마가 엄청 좋아하세요'],
    ['ขอบคุณสำหรับของขวัญ', '선물 고마워'],
    ['ที่บ้านเป็นห่วง', '집에서 걱정해'],
    ['ยายไม่สบาย', '할머니가 편찮으셔|할머니가 편찮으세요'],
    ['พี่สาวแต่งงาน', '언니가 결혼해'],
    ['น้องชายเรียนจบแล้ว', '남동생 졸업했어'],
    ['หลานน่ารัก', '조카 귀여워'],
    // 상대의 흔한 대답(9차): 장보기·통화·오가기.
    ['พรุ่งนี้ต้องตื่นเช้า', '내일 일찍 일어나야 돼'],
    ['วันนี้เหนื่อยมาก', '오늘 너무 피곤해'],
    ['ไม่สบายนิดหน่อย', '몸이 좀 안 좋아'],
    ['ไม่ต้องซื้ออะไร', '아무것도 안 사도 돼'],
    ['ซื้อนมมาด้วย', '우유 사 와|우유 사 오세요'],
    ['ไม่มีทิชชู่', '휴지 없어'],
    ['มีอยู่แล้ว', '이미 있어'],
    ['คุยได้', '통화 돼|통화 돼요'],
    ['เดี๋ยวไปหา', '이따 보러 갈게'],
    ['ไม่ต้องมา', '안 와도 돼'],
    ['มา', '와|오세요'],
    ['แม่ฝากขอบคุณ', '엄마가 고맙대'],
    ['พ่อแม่ชอบเธอมาก', '부모님이 너 엄청 좋아하셔|부모님이 많이 좋아하세요'],
  ]) {
    const [ban, pol] = ko.split('|');
    for (const k of keys.split('|')) TH_CHAT_KO[k] = [ban, pol || chatPoliteKo(ban)];
  }

  // 반말 → 존댓말: '보고 싶어' → '보고 싶어요', '대박이야' → '대박이에요', '어디야?' → '어디예요?'
  function chatPoliteKo(ban) {
    const m = ban.match(/^(.*?)([?!]*)$/);
    const [body, mark] = [m[1], m[2]];
    if (/아니야$/.test(body)) return body.slice(0, -1) + '에요' + mark;
    if (/이야$/.test(body)) return body.slice(0, -2) + '이에요' + mark;
    if (/야$/.test(body)) return body.slice(0, -1) + '예요' + mark;
    if (/[어아해와워줘게래돼봐자파려져써빠라내겨쳐거서가때나뻐퍼싸셔춰]$/.test(body)) return body + '요' + mark;
    return ban;
  }

  // อะ 앞이 เ+자음이면 말끝이 아니라 낱말의 일부다(เยอะ·เถอะ·เลอะ — การบ้านเยอะ 가 การบ้านเย 로 잘렸다).
  const TH_END_PARTICLES = /(?:เลย|ค่ะ|คะ|ค่า|ครับผม|ครับ|คับ|จ้า|จ้ะ|จ๊ะ|นะ|น้า|อ่ะ|(?<!เ[ก-ฮ])อะ|ฮะ|งับ|[!.~?？！]|5{3,})+$/;
  const TH_POLITE = /ค่ะ|คะ|ค่า|ครับ|คับ|ฮะ|งับ/;
  const CHAT_ADDRESS_KO = { โอปป้า: '오빠', ฮยอง: '형', ออนนี่: '언니' };

  // 한 말풍선을 표로 옮긴다. 띄어 쓴 조각이 모두 표에 있을 때만(ได้รับแล้วค่ะ ขอบคุณ 은 번역으로).
  // 앞뒤 호칭(โอปป้า)은 떼어 '오빠' 로 붙인다.
  function chatThaiWhole(s) {
    const polite = TH_POLITE.test(s) ? 1 : 0;
    let core = s.trim();
    let addr = '';
    let lead = false;
    // 끝 호칭 뒤의 말끝(รักโอปป้านะคะ)은 앞말에 붙여 둔다.
    const a =
      core.match(/^(โอปป้า|ฮยอง|ออนนี่)[\s,]*(.+)$/) ||
      core.match(/^(.+?)[\s,]*(โอปป้า|ฮยอง|ออนนี่)((?:นะ|ค่ะ|คะ|ค่า|ครับ|คับ|จ้า|จ้ะ|[!.~?])*)$/);
    if (a) {
      lead = !!CHAT_ADDRESS_KO[a[1]];
      addr = CHAT_ADDRESS_KO[lead ? a[1] : a[2]];
      core = lead ? a[2] : a[1] + (a[3] || '');
    }
    const one = (p) => {
      const k = p.replace(TH_END_PARTICLES, '');
      return k && TH_CHAT_KO[k] ? TH_CHAT_KO[k][polite] : '';
    };
    const parts = core.split(/\s+/).filter(Boolean);
    const kos = parts.map(one);
    if (!kos.length || !kos.every(Boolean)) return '';
    const ko = kos.join(' ');
    return addr ? (lead ? `${addr}, ${ko}` : `${ko} ${addr}`) : ko;
  }

  // 대답 한마디. 번역은 ค่า 를 '요금', ค้า 를 '거래' 로 옮긴다.
  const TH_SHORT_REPLY = /^(ค่ะ|ค่า|ค้า|คร่ะ|ครับ|คับ|ครัช|คร้าบ)[\s!.~ๆ]*$/;

  function chatFixKorean(ko, th) {
    if (/^(ค่ะ|ค่า|ครับ|คับ)/.test(th)) ko = ko.replace(/^응(?=[,.!\s]|$)/, '네'); // 존댓말 대답
    return ko
      .replace(/것이다(?=[.!?…\s]|$)/g, '거예요') // '노력할 것이다' — 대화에 안 맞는 글말
      .replace(/(^|\s)5{3,}\+?(?=[\s!.~]|$)/g, '$1ㅋㅋㅋ') // 555 = 태국식 ㅋㅋㅋ
      // 끝의 ครับ 을 'sir' 로 읽어 붙인 '선생님'(푸켓에서 돈을 너무 많이 잃었어요 선생님.)
      .replace(/,?\s*선생님([.!?]*)$/, (m, p) => (/ครู|อาจารย์|หมอ/.test(th) ? m : p));
  }

  function chatBubbleMine(d, lr) {
    const r = d.getBoundingClientRect();
    return r.left - lr.left > lr.right - r.right;
  }

  // 상대 성별 — 대화방에서 상대가 쓴 말끝을 센다.
  function chatPartnerGender(log, lr) {
    let f = 0;
    let m = 0;
    for (const d of chatBubbles(log)) {
      if (chatBubbleMine(d, lr)) continue;
      const g = thaiSpeakerGender(bubbleText(d));
      if (g === 'f') f++;
      else if (g === 'm') m++;
    }
    return f > m ? 'f' : m > f ? 'm' : '';
  }

  function attachKorean(d, src, ko, orig = '') {
    if (!d.isConnected || bubbleText(d) !== src) return;
    let o = d.querySelector(':scope > .lzk-msgsrc');
    if (orig && !o) {
      o = document.createElement('div');
      o.className = 'lzk-msgsrc';
      markNoTranslate(o);
      d.appendChild(o);
    }
    if (o) o.textContent = orig ? `✎ ${orig}` : '';
    let box = d.querySelector(':scope > .lzk-msgko');
    if (!box) {
      box = document.createElement('div');
      box.className = 'lzk-msgko';
      markNoTranslate(box);
      d.appendChild(box);
    }
    box.dataset.src = src;
    box.textContent = ko;
  }

  // 받은 말풍선의 짧은 줄이 언어 교차 표에 있으면 구글 대신. 출발 언어는 글자 → 구글이 알아본 그 말풍선의 언어 → 이 대화방 상대 언어.
  // 로마자처럼 글자로 언어를 모르는데 상대 언어도 모르면 쓰지 않는다(pan 이 영어인지 스페인어인지 모른다).
  async function chatDictLines(lines) {
    const out = new Map();
    const partner = chatPartnerLang();
    const to = MY_KO ? 'ko' : MY2;
    await Promise.all(
      lines
        .filter((l) => [...l].length <= CROSS_MAX_LEN)
        .map(async (line) => {
          const from = chatScriptLang(line) || chatLangCache.get(line) || partner;
          const v = from ? await crossLookup(line, from, to) : '';
          if (v) out.set(line, v);
        })
    );
    return out;
  }

  async function scanChat() {
    chatScanTimer = null;
    chatLangMemo = null;
    updateChatChip(); // Lexical 은 input 이벤트 없이 글자를 그리기도 해서 화면 변화 때마다 다시 본다
    chatDetectLangs(); // 상대 언어 알아보기 — 새 말풍선이 있을 때만 구글에 묻는다(기다리지 않는다)
    if (!cfg.chatTranslate) return;
    const todo = [];
    for (const d of chatBubbles()) {
      const src = bubbleText(d);
      const box = d.querySelector(':scope > .lzk-msgko');
      if (box && box.dataset.src === src) continue;
      // 태국어만이 아니라 내 말이 아닌 말풍선은 모두(영어·일본어·베트남어 …).
      if (!chatForeign(src) || src.length > 3000 || chatSame.get(d) === src) {
        box?.remove();
        continue;
      }
      const f = chatFailed.get(d);
      if (chatPending.has(d) || (f && f.src === src && Date.now() - f.at < CHAT_RETRY_MS)) continue;
      todo.push([d, src]);
    }
    if (!todo.length) return;
    todo.forEach(([d]) => chatPending.add(d));
    try {
      const log = document.querySelector('[role="main"] [role="log"]');
      const lr = log ? log.getBoundingClientRect() : null;
      const partner = log ? chatPartnerGender(log, lr) : '';
      const mine = todo.map(([d]) => (lr ? chatBubbleMine(d, lr) : false));
      // 손질(พี่→오빠 같은 한국어 호칭)·표·말투 다듬기는 태국어를 한국어로 옮길 때만 — 다른 언어이거나 내 언어가
      // 한국어가 아니면 원문 그대로 구글로(원문 언어는 구글이 알아본다).
      const thai = todo.map(([, src]) => MY_KO && THAI.test(src));
      const prepped = todo.map(([d, src], i) => (thai[i] ? chatPrepThai(src, mine[i], partner) : src));
      const whole = prepped.map((s, i) => (thai[i] ? chatThaiWhole(s) : ''));
      const ask = prepped.filter((s, i) => !whole[i] && !(thai[i] && TH_SHORT_REPLY.test(s)));
      // 여러 줄 말풍선은 줄마다 옮겨 줄을 살린다(묶어 옮기면 한 덩어리로 뭉친다).
      const split = (s) => s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const lines = [...new Set(ask.flatMap(split))];
      const dict = lines.length ? await chatDictLines(lines) : new Map();
      const rest = lines.filter((l) => !dict.has(l));
      const got = rest.length ? await translateToKorean(rest) : [];
      const byLine = new Map([...dict, ...rest.map((l, i) => [l, got[i]])]);
      const kos = new Map(
        ask.map((s) => {
          const ko = split(s).map((l) => byLine.get(l));
          return [s, ko.every(Boolean) ? ko.join('\n') : null];
        })
      );
      todo.forEach(([d, src], i) => {
        const s = prepped[i];
        const got = kos.get(s);
        const ko = whole[i] || (thai[i] && TH_SHORT_REPLY.test(s) ? '네' : got && (thai[i] ? chatFixKorean(got, s) : got));
        // 그대로 왔다 = 이미 내 말(로마자 언어 사용자의 영어, 이름·상품명) — 다시 묻지 않는다.
        if (ko && chatNorm(ko) === chatNorm(src)) {
          chatSame.set(d, src);
          d.querySelector(':scope > .lzk-msgko')?.remove();
          return;
        }
        const orig = mine[i] ? chatSentLog.find((e) => sentKey(e.th) === sentKey(src))?.ko || '' : '';
        // 옮긴 말에 태국어가 남았거나(태국어 말풍선), 한국어 사용자인데 한글이 하나도 없으면 못 옮긴 것 — 잠시 뒤 다시.
        const bad = !ko || (THAI.test(src) && THAI.test(ko)) || (MY_KO && !HANGUL.test(ko));
        if (!bad) attachKorean(d, src, ko, orig);
        else chatFailed.set(d, { src, at: Date.now() });
      });
    } catch (e) {
      console.warn(`[${APP_NAME}] 메시지 한국어 번역 실패:`, e.message);
      todo.forEach(([d, src]) => chatFailed.set(d, { src, at: Date.now() }));
    } finally {
      todo.forEach(([d]) => chatPending.delete(d));
    }
  }

  function scheduleChatScan() {
    if (!chatScanTimer) chatScanTimer = setTimeout(scanChat, 300);
  }

  function messengerInit() {
    GM_addStyle(LZK_CSS);
    mountFab(); // 메신저 설정(끝말 ครับ/ค่ะ 등)도 '한' 에서 연다
    mountLangTools();
    ensureGlossary();
    registerMenus();
    new MutationObserver(scheduleChatScan).observe(document.body, { childList: true, subtree: true, characterData: true });
    scheduleChatScan();

    document.addEventListener('input', updateChatChip, true);
    document.addEventListener('keyup', updateChatChip, true);
    document.addEventListener('focusin', updateChatChip, true);
    document.addEventListener('focusout', () => setTimeout(updateChatChip, 150), true);
    window.addEventListener('resize', updateChatChip);
    // 사이트의 어떤 리스너보다 먼저(window 캡처) 잡는다. 한글 조합 중의 Enter(글자 확정)와
    // 줄바꿈(Shift+Enter)은 그냥 둔다.
    window.addEventListener(
      'keydown',
      (e) => {
        if (chatSending || e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
        const ed = chatComposer(e.target);
        if (!ed) return;
        if (chatBusy) {
          e.preventDefault(); // 바꾸는 중에 한 번 더 누른 Enter 로 한국어가 나가지 않게
          e.stopImmediatePropagation();
          return;
        }
        const lang = chatTarget();
        if (!lang || !isMine(ed.textContent, lang.id)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        chatConvertAndSend(ed);
      },
      true
    );
  }

  if (!GENERIC) registerMenus();
  const siteStart = MESSENGER ? messengerInit : GENERIC ? genericInit : init;
  // 영상 더빙은 모든 사이트에서(라자다 상품 영상·메신저 영상도). 번역 도우미 엔진(node)에는 영상이 없다.
  const start = () => {
    // HTML 문서가 아니거나(SVG·XML·RSS 파일을 바로 연 것) 본문이 없으면 띄울 자리도 옮길 글도 없다 — 시작하지 않는다.
    // 그런 문서에서 '시작 실패: Cannot read properties of null (reading 'appendChild')' 가 확장 오류로 쌓였다
    // (사용자 2026-11-03). 크롬의 XML 보기는 HTML 처럼 보이는 요소를 달아 두지만 문서는 XML 이라 새로 만든 요소가 HTML
    // 요소가 아니다(dataset 이 없어 단추를 달다 멈췄다) — 그래서 만든 요소가 HTML 인지로 본다.
    // 번역 도우미 엔진(node)에는 HTMLElement 가 없다 — 그쪽은 여기까지 오지 않는다.
    if (typeof HTMLElement !== 'undefined' && (!document.body || !(document.createElement('div') instanceof HTMLElement))) return;
    siteStart();
    if (typeof HTMLVideoElement !== 'undefined') videoDubInit();
    watchMyLang();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
