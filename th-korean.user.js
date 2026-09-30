// ==UserScript==
// @name         태국 사이트 한국어
// @namespace    https://github.com/local/th-korean
// @version      1.22.35
// @description  태국 사이트를 한국어로 검색하고 읽습니다. 상품 사진 속 태국어도 한국어로 바꿔 봅니다. 지원: 라자다, 쇼피 (다른 태국 사이트에서도 입력칸의 한국어를 태국어로)
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

  const APP_NAME = '태국 사이트 한국어';

  const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
  const THAI = /[฀-๿]/;
  const LATIN_WORD = /[A-Za-z]{2,}/;

  const FREE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

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

  let glossaryStore = GM_getValue(GLOSSARY_STORE, null);
  let glossaryParsed = null; // 처음 쓸 때 해석한다 (normKey 가 쓰는 상수가 아직 정의 전이라)
  let glossaryLoading = null;

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
      return false;
    })().finally(() => {
      glossaryLoading = null;
    });
    return glossaryLoading;
  }

  // 검색 직전에 부른다. 사본이 없으면(처음 설치) 받을 때까지 기다리고,
  // 오래됐으면 지금 사본으로 바로 답하면서 뒤에서 새로 받는다.
  async function ensureGlossary() {
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
    if (stale) {
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

  const GITHUB_API_FILE = `https://api.github.com/repos/${GLOSSARY_REPO}/contents/${GLOSSARY_FILE}`;
  // 새 토큰 화면. 이름·대상·권한을 미리 채워 달라고 주소에 적는다(GitHub 가 모르는 값은 무시한다).
  const GITHUB_TOKEN_URL =
    'https://github.com/settings/personal-access-tokens/new' +
    `?name=${encodeURIComponent('th-korean 용어집')}` +
    `&description=${encodeURIComponent('태국 사이트 한국어 - 설정 패널에서 용어집 저장')}` +
    `&target_name=${GLOSSARY_REPO.split('/')[0]}&contents=write`;
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

  // GitHub 에서 지금 파일을 받아 합친 뒤 커밋한다. 이 PC 에는 바로 반영된다.
  async function saveGlossaryToGitHub(entries) {
    const token = (cfg.githubToken || '').trim();
    if (!token) throw new Error('GitHub 연결이 필요합니다');
    const headers = githubHeaders(token);
    for (let attempt = 0; ; attempt++) {
      const cur = JSON.parse(await request({ method: 'GET', url: `${GITHUB_API_FILE}?ref=main`, headers }));
      // 1MB 가 넘는 파일은 JSON 에 내용이 빠지고 sha 만 온다. 그때는 원문을 따로 받는다.
      const text =
        cur.encoding === 'base64' && cur.content
          ? b64ToUtf8(cur.content)
          : await request({
              method: 'GET',
              url: `${GITHUB_API_FILE}?ref=main`,
              headers: { ...headers, Accept: 'application/vnd.github.raw' },
            });
      const merged = mergeIntoGlossary(text, entries);
      if (merged.added.length || merged.changed.length) {
        const names = [...merged.added, ...merged.changed];
        const message =
          `용어집: ${names.slice(0, 5).join(', ')}` + (names.length > 5 ? ` 외 ${names.length - 5}개` : '');
        try {
          await request({
            method: 'PUT',
            url: GITHUB_API_FILE,
            headers: { ...headers, 'Content-Type': 'application/json' },
            data: JSON.stringify({ message, content: utf8ToB64(merged.text), sha: cur.sha, branch: 'main' }),
          });
        } catch (e) {
          // 다른 PC가 그 사이에 먼저 저장했다(파일 버전이 바뀜). 새로 받아 한 번 더 합친다.
          if (attempt === 0 && /HTTP 409/.test(e.message)) continue;
          throw e;
        }
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
  // 이 엔드포인트는 q 파라미터를 여러 개 줘도 첫 번째만 번역해 돌려준다(확인함).
  // 대신 줄바꿈으로 이어 붙이면 줄 순서를 그대로 유지해 주므로 그 방식으로 묶는다.
  // 줄 수가 어긋나면 해당 묶음만 하나씩 다시 요청한다.
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

  function noteRateLimit() {
    rateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN;
    const now = Date.now();
    if (now - rateLimitNotified < 30000) return;
    rateLimitNotified = now;
    toast(
      '무료 번역 API가 요청을 일시적으로 거절했습니다.\n' +
        `${RATE_LIMIT_COOLDOWN / 1000}초 뒤 자동으로 다시 시도합니다.\n` +
        '계속 반복되면 설정에서 엔진을 Groq으로 바꾸세요.',
      6000
    );
  }

  async function freeRaw(text, from, to, timeout) {
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

  async function freeTranslateOne(text, from, to) {
    return freeRaw(text, from, to);
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
      try {
        const joined = await freeRaw(lines.join('\n'), from, to);
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
          // 거절당한 상태에서 개별 재시도를 하면 상황만 악화된다. 이 묶음은 포기한다.
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
    `당신은 ${SITE.label} 태국 쇼핑몰의 태국어/영어 텍스트를 한국어로 옮깁니다.`,
    '입력은 {"in": ["...", "..."]} 형태의 JSON입니다.',
    '출력은 {"out": ["...", "..."]} 형태의 JSON이며, 길이와 순서가 입력과 같아야 합니다.',
    '규칙:',
    '- 상품명, 카테고리명, 버튼 문구입니다. 한국 쇼핑몰에서 쓰는 말투로 짧게 옮기세요.',
    '- 브랜드명, 모델명, 숫자, 단위, 규격은 그대로 둡니다.',
    '- 설명이나 주석을 덧붙이지 마세요.',
    '- 이미 한국어이거나 숫자/기호뿐인 문자열은 그대로 돌려주세요.',
  ].join('\n');

  const ONE_SYSTEM = [
    `당신은 ${SITE.label} 태국 쇼핑몰의 태국어/영어 문구를 한국어로 옮깁니다.`,
    '규칙:',
    '- 번역문만 출력합니다. 설명, 따옴표, 원문 재출력 금지.',
    '- 상품명입니다. 한국 쇼핑몰에서 쓰는 말투로 자연스럽게 옮기세요.',
    '- 브랜드명, 모델명, 숫자, 단위, 규격은 그대로 둡니다.',
    '- 판매자가 끼워 넣은 과장 문구나 키워드 나열도 뜻이 통하게 정리해 주세요.',
  ].join('\n');

  // 선택 번역용. 페이지 전체는 크롬에 맡기고 헷갈리는 문구만 정확히 본다.
  async function translateSelection(text) {
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

  async function translateToKorean(texts) {
    const result = new Array(texts.length);
    const pending = [];
    const pinned = { ...SEED_PAGE_GLOSSARY, ...cfg.pageGlossary };

    texts.forEach((t, i) => {
      if (pinned[t] !== undefined) {         // 고정 용어가 최우선 (브랜드명 등)
        result[i] = pinned[t];
        return;
      }
      const hit = cacheGet(t, 'ko');
      if (hit !== undefined) result[i] = hit;
      else pending.push(i);
    });
    if (!pending.length) return result;

    const pendingTexts = pending.map((i) => texts[i]);
    let translated = null;

    if (usesAI(cfg.pageEngine) && aiKey()) {
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
      translated = await freeTranslateMany(pendingTexts, 'auto', 'ko');
    }

    pending.forEach((originalIndex, k) => {
      const value = translated[k];
      if (value && value !== texts[originalIndex]) {
        cacheSet(texts[originalIndex], 'ko', value);
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

    await ensureGlossary();
    const glossary = buildGlossary();
    if (glossary[trimmed]) return { thai: glossary[trimmed], via: '용어집' };

    const { pieces, unknown } = composeFromGlossary(trimmed);
    if (!unknown.length) {
      const thai = assembleThai(pieces);
      const used = pieces.filter((p) => p.kind === 'glossary' || p.kind === 'literal').length;
      if (thai) return { thai, via: used > 1 ? '용어집 조합' : '용어집' };
    }

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
          via: filled.length ? '용어집 + 무료 API' : '용어집',
          note: notes.join('\n'),
        };
      }
    }

    // 용어집에 걸리는 말이 하나도 없다 — 캐시, 없으면 통째로 무료 API.
    const cached = cacheGet(trimmed, 'th');
    if (cached) return { thai: cached, via: '캐시' };
    const out = await freeRaw(trimmed, 'ko', 'th', SEARCH_FREE_TIMEOUT);
    if (out) cacheSet(trimmed, 'th', out);
    return { thai: out, via: '무료 API' };
  }

  // 용어집에 없는 조각만 무료 API 로 옮긴다. 여러 조각은 줄바꿈으로 묶어 한 번에 보낸다.
  // 실패한 조각은 비워 둔다 — 그러면 검색은 용어집에 걸린 말만으로 나간다.
  async function fillUnknown(unknown) {
    const need = [];
    for (const p of unknown) {
      const hit = cacheGet(p.ko, 'th');
      if (hit) p.th = hit;
      else need.push(p);
    }
    if (!need.length) return;
    let lines;
    try {
      const joined = await freeRaw(need.map((p) => p.ko).join('\n'), 'ko', 'th', SEARCH_FREE_TIMEOUT);
      lines = joined.split('\n');
    } catch (e) {
      console.warn(`[${APP_NAME}] 검색어 조각을 무료 API 로 옮기지 못했습니다:`, e.message);
      return;
    }
    if (lines.length !== need.length) {
      // 줄 수가 어긋났다 — 하나씩 다시 묻는다.
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
  const seen = new WeakSet();
  let showingOriginal = false;

  function isTranslatable(node) {
    if (seen.has(node)) return false;
    const raw = node.nodeValue;
    if (!raw) return false;
    const t = raw.trim();
    if (t.length < 2 || t.length > 300) return false;
    if (HANGUL.test(t)) return false;                 // 이미 한국어
    if (!THAI.test(t) && !LATIN_WORD.test(t)) return false; // 숫자·기호·통화만
    if (/^[\d\s.,%\-+/฿$()[\]:]+$/.test(t)) return false;   // 가격·수치

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
    '부탁드려요', '급해요', '제발', '계신가요', '계신분', '계세요', '있으신가요', '알려주실분',
  ]);
  // 띄어 친 한 단어일 때만 빼는 말. '인사 하는 법', '운동 하는 곳' 의 '하는' 은 앞 명사가 뜻을
  // 다 가진다. 합성어 안에서는 빼지 않는다 — '연장하는' 이 연장 + 하는 으로 덮여 버리면
  // 어미를 떼지 않아 '비자 연장 방법'(วิธีต่อวีซ่า) 통째 항목을 놓친다.
  // 한 단어로 띄어 쳤을 때만 쓰는 말. '아이' 를 용어집에 두면 '아이패치·아이크림' 이 아이(เด็ก)로
  // 쪼개지니, '아이 선물·코딩 학원 아이' 처럼 따로 쳤을 때만 아이(เด็ก)로 읽는다.
  // '바·클럽' 도 쇼핑의 풀업바·골프클럽과 겹쳐 용어집에 따로 두지 않고, '통로 바', '방콕 클럽' 처럼
  // 띄어 쳤을 때만 술집으로 읽는다.
  const WORD_ONLY = { 아이: 'เด็ก', 바: 'บาร์', 클럽: 'ผับ', 비: 'ฝน', 강: 'แม่น้ำ', 산: 'ภูเขา', 짐: 'สัมภาระ', 차이: 'ความแตกต่าง' };
  // '데이트 하기 좋은 곳', '주차 할 곳', '메이드 추천 부탁', '나눔 합니다'
  // '이 식당 맛있어요' 의 '이·그·저' 는 가리키는 말이라 뺀다.
  const WORD_NOISE = new Set(['하는', '하기', '할', '부탁', '합니다', '해주세요', '해줘요', '이', '그', '저']);

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
    '하려면', '하는데', '하기', '하는', '하면', '하고', '해서', '했다', '합니다', '할때', '한', '할',
    '되는', '되면', '됐다', '된', '받는', '받기', '받으려면',
    '에서는', '으로는', '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다', '이랑',
    '에는', '에도', '와', '과', '이', '가', '을', '를', '에', '의', '로', '도', '만', '랑', '은',
  ];
  // '는' 은 넣지 않았다. '자라는'(→ ZARA)처럼 동사를 명사로 잘못 뗀다. '은' 은 한 글자 조사라
  // 떼고 남은 말이 용어집 단어 그대로일 때만 뗀다('사람들은' → 사람들, '태국은' → 태국).

  // 형용사 줄기를 꾸미는 꼴로. 조용하 → 조용한, 싸 → 싼, 가볍 → 가벼운, 작 → 작은.
  function toAttributive(stem) {
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
      for (let j = i + 1; j < words.length && j < i + 4; j++) {
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
          if (stem.length < 2) continue;
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
    명: 'คน', 층: 'ชั้น', 박: 'คืน', 회: 'ครั้ง', 장: 'แผ่น',
  };

  // '두 시간'·'세 명'·'한 달' 처럼 한글 수 뒤에 단위가 오는 말. 분·초·회·박은 한자 수('이십 분')로 세니
  // 넣지 않는다('두 분' 은 두 사람이다). '한번' 은 '한번 가 보고 싶다' 의 부사라 1 ครั้ง 으로 두지 않는다.
  const NATIVE_NUMS = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
  const NATIVE_UNITS = {
    시간: 'ชั่วโมง', 명: 'คน', 사람: 'คน', 주: 'สัปดาห์', 달: 'เดือน', 층: 'ชั้น', 장: 'แผ่น',
    개: 'ชิ้น', 번: 'ครั้ง', 살: 'ขวบ', 잔: 'แก้ว', 병: 'ขวด', 그릇: 'ชาม', 곳: 'แห่ง',
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
  function composeFromGlossary(query) {
    const idx = buildIndex();
    const words = stripEndings(koreanNumbers(normKey(query)).split(/\s+/).filter(Boolean), idx);
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
      // 띄어 쓴 '안' + 꾸미는 말·풀이말('안 비싼', '안 무거운', '안 뜨거워요') → ไม่ + 그 말. 용어집의
      // 통째 항목('안새는' กันรั่ว, '안 매운' ไม่เผ็ด)이 비용 1 로 먼저 이긴다. 뒷말이 명사면('안 방') 안 한다.
      if (
        t.text === '안' && firstOfWord(i) && lastOfWord(i) && nx && nx.hangul && nx.word === t.word + 1 &&
        lastOfWord(i + 1) && glossaryMods().has(squash(nx.text)) &&
        (/(요|게|음|함)$/.test(nx.text) || (nx.text.charCodeAt(nx.text.length - 1) - 0xac00) % 28 === 4)
      ) {
        const th = idx.get(squash(nx.text));
        if (th && !/^(ไม่|กัน)/.test(th)) {
          relax(i, i + 2, 1.5, [{ ko: t.text + ' ' + nx.text, th: 'ไม่' + th, kind: 'glossary', word: t.word, mod: true }]);
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
      if (NOISE_WORDS.has(t.text) || (WORD_NOISE.has(t.text) && firstOfWord(i) && lastOfWord(i))) {
        relax(i, i + 1, 0, [{ ko: t.text, th: '', kind: 'noise', word: t.word }]);
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
    const ordered =
      last < 0
        ? groups.slice().reverse() // 상품 이름을 모르면 예전처럼 뒤집는다
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
    if (!value || !HANGUL.test(value)) return false; // 한국어가 아니면 그대로 통과

    searchBusy = true;
    setBadge('검색어 번역 중…');
    try {
      const { thai, via, note } = await translateSearchKeyword(value);
      if (!thai) throw new Error('번역 결과가 비어 있습니다');

      setInputValue(input, thai);

      const msg = `"${value}" → "${thai}"  (${via})` + (note ? `\n${note}` : '');
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
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
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

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Enter') return;
        if (!inSearchWidget(e.target)) return;
        // 대상이 입력창이 아니면(자동완성 목록 등) 실제 검색창을 찾아 쓴다.
        const input = isSearchInput(e.target) ? e.target : getSearchInput();
        if (!input) return;
        if (awaitingConfirm) {
          // 확인 Enter. 라자다에 넘기면 자기 상태에 남은 한국어로 검색해 버리므로
          // 여기서도 막고 우리가 직접 태국어 주소로 이동한다.
          awaitingConfirm = false;
          e.preventDefault();
          e.stopImmediatePropagation();
          submitSearch(input);
          return;
        }
        if (!HANGUL.test(input.value)) return;
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
        if (awaitingConfirm) {
          awaitingConfirm = false;
          e.preventDefault();
          e.stopImmediatePropagation();
          submitSearch(input);
          return;
        }
        if (!HANGUL.test(input.value)) return;
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
        if (awaitingConfirm) {
          awaitingConfirm = false;
          e.preventDefault();
          e.stopImmediatePropagation();
          submitSearch(input);
          return;
        }
        if (!HANGUL.test(input.value)) return;
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
    input.placeholder = '한국어로 검색하세요 (예: 무선 이어폰)';
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
    #lzk-badge {
      position: fixed; right: 74px; bottom: 26px; z-index: 2147483000;
      background: #0f146e; color: #fff; padding: 5px 10px; border-radius: 6px;
      font: 500 12px/1.4 system-ui, sans-serif; white-space: nowrap;
    }
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
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), ms);
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
    if (HANGUL.test(text)) return removeSelTip();            // 이미 한국어
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

  async function makeOcrWorker() {
    const w = await Tesseract.createWorker('tha', 1, {
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
    loadThaiWords();
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

  async function readLines(worker, canvas, dict) {
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
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
    const crumbs = (t) => t.split(/[^ก-๛]+/).filter((r) => r && r.length <= 2).length;
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
          if (!THAI.test(text) || !(pc.box.x1 > pc.box.x0)) continue;
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
        requests: [{ image: { content: data }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: ['th'] } }],
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
    const [workers, dict] = await Promise.all([ocrPool(), loadThaiWords()]);
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
      const out = segs.length ? await translateToKorean(segs.map((s) => s.text)) : [];
      const lines = [];
      segs.forEach((s, i) => {
        const k = out[i];
        if (k && HANGUL.test(k) && k !== s.text) lines.push([s.box.x0 / W, s.box.y0 / H, s.box.x1 / W, s.box.y1 / H, k.trim(), s.lines || 1]);
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
        if (!url && !auto) toast('이 사진에서는 번역할 태국어 글자를 찾지 못했습니다.');
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
          ? '태국어 글자 없음'
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
          if (!cfg.imageTranslate) return hideImageButton();
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
    const existing = document.getElementById('lzk-panel');
    if (existing) {
      existing.remove();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'lzk-panel';
    markNoTranslate(panel);
    panel.innerHTML = `
      <h3>${APP_NAME} 설정 <span style="font-weight:400;opacity:.6">· ${SITE.label}</span></h3>

      <label>검색 용어집 (한국어=태국어, 한 줄에 하나)</label>
      <textarea id="lzk-glossary" placeholder="사무실=สำนักงาน&#10;쇼파=โซฟา"></textarea>
      <div class="lzk-actions" style="margin-top:6px">
        <button id="lzk-gl-save" type="button">저장</button>
      </div>
      <div class="lzk-hint">적고 <b>저장</b>을 누르면 GitHub 용어집에 바로 저장되고 칸은 비워집니다. 모든 PC가 같이 씁니다. 이미 있는 단어를 적으면 그 뜻으로 고칩니다.</div>
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
        <input type="checkbox" id="lzk-auto"><span>페이지 열면 자동으로 한국어 표시</span>
      </div>
      <div class="lzk-check">
        <input type="checkbox" id="lzk-confirm"><span>검색 전 번역된 태국어 확인 (Enter 한 번 더)</span>
      </div>
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
    `;
    document.body.appendChild(panel);

    const $ = (id) => panel.querySelector(id);
    $('#lzk-provider').value = cfg.aiProvider;
    // 저장된 값이 구버전('groq')이어도 'AI' 항목이 선택되도록 맞춰준다.
    $('#lzk-page-engine').value = usesAI(cfg.pageEngine) ? 'ai' : cfg.pageEngine;
    $('#lzk-search-engine').value = usesAI(cfg.searchEngine) ? 'ai' : 'free';
    $('#lzk-auto').checked = cfg.autoTranslatePage;
    $('#lzk-confirm').checked = cfg.confirmSearch;
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

    // --- 검색 용어집 → GitHub ---
    // 예전 방식으로 이 PC에만 넣어 둔 단어 중 GitHub 에 없는 것은 칸에 미리 넣어 둔다.
    // 저장을 누르면 GitHub 로 옮겨지고 이 PC 목록은 비워진다.
    const remoteNow = remoteGlossary();
    const legacyNew = Object.entries(cfg.glossary || {})
      .map(([k, v]) => [normKey(k), v])
      .filter(([k, v]) => k && v && !(k in remoteNow));
    $('#lzk-glossary').value = legacyNew.map(([k, v]) => `${k}=${v}`).join('\n');
    $('#lzk-gl-status').textContent =
      `현재 용어집: ${Object.keys(remoteNow).length}개` +
      (glossaryStore ? ` (${new Date(glossaryStore.at).toLocaleString()} 받음)` : ' (아직 받지 못함)') +
      (legacyNew.length
        ? `\n이 PC에만 있던 예전 단어 ${legacyNew.length}개를 칸에 넣어 두었습니다. 저장하면 GitHub로 옮겨집니다.`
        : '');

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

      const { entries, bad } = parseEntries($('#lzk-glossary').value);
      if (bad.length) {
        toast("'한국어=태국어' 모양이 아닌 줄이 있습니다. 고친 뒤 다시 저장하세요.\n" + bad.slice(0, 5).join('\n'), 8000);
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
        const r = await saveGlossaryToGitHub(entries);
        cfg.glossary = {}; // 예전 단어는 방금 GitHub 로 옮겼다
        saveCfg('glossary');
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
          'GitHub 용어집에 저장했습니다.\n' +
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
    fab.textContent = '한';
    fab.title = `${APP_NAME} 설정 (${SITE.label})`;
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);
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

    if (!HANGUL.test(q)) {
      if (!THAI.test(q)) return;
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
      const { thai, via, note } = await translateSearchKeyword(q);
      if (!thai || HANGUL.test(thai)) return;
      const msg = `주소의 한국어를 태국어로 바꿔 다시 검색합니다.\n"${q}" → "${thai}"  (${via})` +
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
    ensureGlossary();
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
    GM_registerMenuCommand('설정 열기', togglePanel);
    GM_registerMenuCommand('지금 한국어로 번역', translatePage);
    GM_registerMenuCommand('원문 보기', restoreOriginal);
  }

  // ---------------------------------------------------------------------------
  // 다른 태국 사이트 — 입력칸의 한국어를 태국어로
  //
  // 라자다·쇼피처럼 검색창 구조를 아는 곳이 아니면 검색을 대신 해 줄 수 없다. 대신 입력칸의
  // 글자만 태국어로 바꾸고 검색은 그 사이트에 맡긴다: 한국어를 치고 Enter → 태국어로 바뀜 →
  // 확인하고 Enter 한 번 더 → 사이트가 원래대로 검색. 사이트가 검색을 어떻게 처리하든 상관없다.
  // 태국어가 한글보다 많이 보이는 페이지에서만 켠다(태국어가 조금 섞인 한국 여행 블로그 등에서
  // 한국어 검색을 태국어로 바꿔 버리지 않게). 페이지 번역은 크롬 자동번역에 맡긴다.
  // ---------------------------------------------------------------------------

  const GENERIC_MIN_THAI = 30;
  let genericChip = null;
  let genericBusy = false;

  // 태국어 페이지인가. 글자 수만 세고 30자에 닿으면 멈춘다(큰 페이지에서도 가볍게).
  function looksThaiPage() {
    const lang = (document.documentElement.lang || '').toLowerCase();
    if (lang === 'th' || lang.startsWith('th-')) return true;
    const text = (document.body?.textContent || '').slice(0, 300000);
    let thai = 0;
    for (const ch of text) {
      if (ch >= 'ก' && ch <= '๛') thai++;
    }
    if (thai < GENERIC_MIN_THAI) return false;
    let hangul = 0;
    for (const ch of text) {
      if (ch >= '가' && ch <= '힣') hangul++;
    }
    return thai > hangul;
  }

  function genericTarget(el) {
    if (!isTypableText(el) || el.readOnly || el.disabled || el.closest('[id^="lzk-"]')) return null;
    return el;
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
    return /search|ค้นหา|(^|\s)q(\s|$)/.test(hint);
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

  async function convertInputToThai(input) {
    const value = input.value.trim();
    if (genericBusy || !value || !HANGUL.test(value)) return;
    genericBusy = true;
    setBadge('한국어를 태국어로 바꾸는 중…');
    try {
      const { thai, via, note } = await koreanToThai(value);
      if (!thai || HANGUL.test(thai)) throw new Error('번역 결과가 비어 있습니다');
      setInputValue(input, thai);
      input.focus();
      try {
        input.setSelectionRange(thai.length, thai.length);
      } catch {
        /* 선택 범위를 못 쓰는 칸 */
      }
      const msg = `"${value}" → "${thai}"  (${via})` + (note ? `\n${note}` : '');
      // 설정 '검색 전 번역된 태국어 확인 (Enter 한 번 더)' 를 라자다·쇼피와 똑같이 따른다.
      if (cfg.confirmSearch) {
        toast(`${msg}\n확인 후 Enter 를 다시 누르면 이 사이트에서 검색합니다. 직접 고쳐도 됩니다.`, note ? 9000 : 6000);
      } else {
        toast(msg, note ? 8000 : 2500);
        submitGeneric(input);
      }
    } catch (e) {
      toast(`한국어를 태국어로 바꾸지 못했습니다: ${e.message || e}`, 4000);
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
    if (!input || !HANGUL.test(input.value)) {
      if (genericChip) genericChip.style.display = 'none';
      return;
    }
    if (!genericChip) {
      genericChip = document.createElement('button');
      genericChip.id = 'lzk-thchip';
      genericChip.type = 'button';
      genericChip.textContent = '→ ไทย';
      genericChip.title = '입력한 한국어를 태국어로 바꿉니다 (Enter 와 같음)';
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
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        const input = genericTarget(e.target);
        if (!input || !HANGUL.test(input.value)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        convertInputToThai(input);
      },
      true
    );
    window.addEventListener(
      'submit',
      (e) => {
        const input = [...(e.target?.elements || [])].find((el) => genericTarget(el) && HANGUL.test(el.value));
        if (!input) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        convertInputToThai(input);
      },
      true
    );
  }

  let genericOn = false;
  function activateGeneric() {
    if (genericOn) return;
    genericOn = true;
    GM_addStyle(LZK_CSS);
    ensureGlossary();
    mountFab();
    installGenericSearch();
    registerMenus();
  }

  // 태국어가 늦게 그려지는 페이지(SPA)도 있어 15초 동안 몇 번 더 본다.
  function genericInit() {
    if (looksThaiPage()) return activateGeneric();
    let n = 0;
    const t = setInterval(() => {
      if (looksThaiPage()) {
        clearInterval(t);
        activateGeneric();
      } else if (++n >= 6) clearInterval(t);
    }, 2500);
  }

  if (!GENERIC) registerMenus();
  const start = GENERIC ? genericInit : init;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
