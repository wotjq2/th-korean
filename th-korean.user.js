// ==UserScript==
// @name         태국 사이트 한국어
// @namespace    https://github.com/local/th-korean
// @version      1.11.0
// @description  태국 사이트를 한국어로 검색하고 읽습니다. 지원: 라자다, 쇼피 (사이트 추가 예정)
// @author       local
// @match        https://www.lazada.co.th/*
// @match        https://lazada.co.th/*
// @match        https://shopee.co.th/*
// @match        https://*.shopee.co.th/*
// @updateURL    https://raw.githubusercontent.com/wotjq2/th-korean/main/th-korean.user.js
// @downloadURL  https://raw.githubusercontent.com/wotjq2/th-korean/main/th-korean.user.js
// @connect      api.groq.com
// @connect      integrate.api.nvidia.com
// @connect      translate.googleapis.com
// @connect      api.github.com
// @connect      raw.githubusercontent.com
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

/* global GM_xmlhttpRequest, GM_setValue, GM_getValue, GM_addStyle, GM_registerMenuCommand */

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

  if (!SITE.searchUrl) {
    console.warn(
      `[${APP_NAME}] ${location.hostname} 은 SITES 표에 없습니다. ` +
        '한국어 검색은 꺼집니다. 스크립트 상단 SITES 에 항목을 추가하세요.'
    );
  }

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
  function parseGlossary(text) {
    const out = {};
    for (const line of String(text || '').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = normKey(t.slice(0, i));
      const v = t.slice(i + 1).trim();
      if (k && v) out[k] = v;
    }
    return out;
  }

  let glossaryStore = GM_getValue(GLOSSARY_STORE, null);
  let glossaryMap = null; // 처음 쓸 때 해석한다 (normKey 가 쓰는 상수가 아직 정의 전이라)
  let glossaryLoading = null;

  function remoteGlossary() {
    if (!glossaryMap) glossaryMap = parseGlossary(glossaryStore && glossaryStore.text);
    return glossaryMap;
  }

  // GitHub 에서 받아 사본을 갈아 끼운다. 실패하면 있던 사본을 그대로 쓴다.
  function refreshGlossary() {
    if (glossaryLoading) return glossaryLoading;
    glossaryLoading = (async () => {
      for (const src of GLOSSARY_SOURCES) {
        try {
          const text = await request({ method: 'GET', url: src.url, headers: src.headers, timeout: 8000 });
          const map = parseGlossary(text);
          if (!Object.keys(map).length) throw new Error('내용이 비어 있습니다');
          glossaryStore = { text, at: Date.now() };
          GM_setValue(GLOSSARY_STORE, glossaryStore);
          glossaryMap = map;
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
    if (Date.now() - glossaryStore.at > GLOSSARY_TTL) refreshGlossary();
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
      const merged = mergeIntoGlossary(b64ToUtf8(cur.content), entries);
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
      glossaryStore = { text: merged.text, at: Date.now() };
      GM_setValue(GLOSSARY_STORE, glossaryStore);
      glossaryMap = parseGlossary(merged.text);
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
  function buildGlossary() {
    const out = { ...remoteGlossary() };
    for (const [k, v] of Object.entries(cfg.glossary || {})) {
      const key = normKey(k);
      if (key && v && !(key in out)) out[key] = v;
    }
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
  ]);

  // 혼자 쓰일 때와 다른 말과 붙을 때 뜻이 갈리는 말.
  //   before  뒤에 다른 말이 올 때. '차' 는 혼자면 마시는 차(ชา)지만 '차 방향제',
  //           '차 충전기' 처럼 앞에 붙으면 자동차다.
  //   after   앞에 다른 말이 올 때. '거치대' 는 혼자면 휴대폰 거치대로 좁혀 두었는데,
  //           '모니터 거치대' 에 그대로 쓰면 모니터용 휴대폰 받침이 된다. 무엇을 거는지는
  //           앞말이 말해 주므로 받침대(ขาตั้ง)만 남긴다.
  // 이 규칙과 다르게 옮기고 싶은 검색어는 용어집에 통째로 넣는다. 통째가 조합보다 먼저다.
  const CONTEXT_FORMS = {
    '차': { before: 'ในรถ' },
    '거치대': { after: 'ขาตั้ง' },
  };

  // 공백을 빼고 소문자로. '무선이어폰' 과 '무선 이어폰', 'c타입' 과 'C타입' 을 같게 본다.
  function squash(s) {
    return s.replace(/\s+/g, '').toLowerCase();
  }

  function buildIndex() {
    const idx = new Map();
    for (const [k, v] of Object.entries(buildGlossary())) idx.set(squash(k), v);
    return idx;
  }

  // 띄어 쓰지 않은 합성어를 용어집 단어로 나눈다. '여성운동화' → 여성 + 운동화.
  // 끝까지 다 덮이지 않으면 쪼개지 않는다(null). 반만 맞춘 조각은 오역의 씨앗이다.
  // 한 글자 단어(차·옷·컵)는 맨 끝에서만 쓴다. 앞에서도 쓰게 하면 '차량' 이
  // 차(ชา) + 량 으로 쪼개지는 사고가 난다. 끝의 '용' 은 떼어 낸다(강아지용 → 강아지).
  function segmentWord(s, idx) {
    const n = s.length;
    const cost = new Array(n + 1).fill(Infinity);
    const back = new Array(n + 1).fill(null);
    cost[0] = 0;
    for (let i = 0; i < n; i++) {
      if (cost[i] === Infinity) continue;
      for (let j = i + 1; j <= n; j++) {
        const w = s.slice(i, j);
        if (w.length === 1 && !(j === n && i > 0)) continue;
        let piece = null;
        if (NOISE_WORDS.has(w) || w === '용') piece = { ko: w, th: '', kind: 'noise' };
        else if (idx.has(squash(w))) piece = { ko: w, th: idx.get(squash(w)), kind: 'glossary' };
        if (piece && cost[i] + 1 < cost[j]) {
          cost[j] = cost[i] + 1;
          back[j] = { i, piece };
        }
      }
    }
    if (cost[n] === Infinity) return null;
    const out = [];
    for (let k = n; k > 0; k = back[k].i) out.unshift(back[k].piece);
    return out;
  }

  // 검색어를 용어집 단어로 쪼갠다. 조각은 한국어 순서 그대로 돌려준다.
  //   glossary  용어집에 있는 말
  //   literal   영문·숫자(iPhone, 15, 500ml). 그대로 쓴다
  //   noise     뺄 말(추천, 강아지'용', 기호)
  //   unknown   용어집에 없는 말. th 가 비어 있으니 호출부가 채운다
  function composeFromGlossary(query) {
    const idx = buildIndex();
    const words = normKey(query).split(/\s+/).filter(Boolean);
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
        continue;
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
      if (f.before && i < content.length - 1) p.th = f.before;
      else if (f.after && i > 0) p.th = f.after;
    });

    return { pieces: merged, unknown: merged.filter((p) => p.kind === 'unknown') };
  }

  // 조각을 태국어 검색어로 잇는다. 한국어는 꾸미는 말이 앞에, 태국어는 뒤에 온다
  // (여성용 방수 운동화 → รองเท้าผ้าใบ กันน้ำ ผู้หญิง). 그래서 순서를 뒤집는다.
  // 영문·숫자가 이어진 부분(iPhone 15 Pro)은 한 덩어리로 묶어 제 순서를 지킨다.
  // 숫자에 바로 붙은 단위(27인치 → 27 นิ้ว)도 그 덩어리에 넣는다. 뒤집으면 'นิ้ว 27' 이 된다.
  function assembleThai(pieces) {
    const groups = [];
    let run = null;
    let prev = null;
    for (const p of pieces) {
      if (!p.th) continue;
      const latin = !THAI.test(p.th);
      const unit = run && prev && prev.word === p.word && /^[\d.,]+$/.test(prev.th);
      if (run && (latin || unit)) {
        run.push(p.th);
      } else if (latin) {
        groups.push((run = [p.th]));
      } else {
        run = null;
        groups.push([p.th]);
      }
      prev = p;
    }
    const out = [];
    for (const g of groups.reverse()) {
      const s = g.join(' ');
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
    #lzk-panel input[type=text], #lzk-panel input[type=password],
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
  async function rescueKoreanQuery() {
    if (!SITE.searchUrl) return; // 표에 없는 사이트에서는 주소를 건드리지 않는다
    const params = new URLSearchParams(location.search);
    const q = params.get(SITE.queryParam);
    if (!q || !HANGUL.test(q)) return;

    // 같은 검색어로 오가는 무한 이동을 막는다.
    let already = null;
    try {
      already = sessionStorage.getItem('lzk-rescued');
      sessionStorage.setItem('lzk-rescued', q);
    } catch {
      /* 저장소가 막혀 있으면 그냥 진행한다 */
    }
    if (already === q) return;

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
  installSearchInterceptors();

  // 용어집도 지금부터 받아 둔다. 사본이 있으면 바로 끝나고, 오래됐으면 뒤에서 새로 받는다.
  // 처음 설치한 PC라도 사용자가 검색어를 치는 사이에 받아진다.
  ensureGlossary();

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

  GM_registerMenuCommand('검색창 인식 상태 확인', reportSiteInfo);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
