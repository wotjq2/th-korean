// 시험용(2단계)만 — 확장 service worker 의 크롬 내장 번역기(Translator API) 흉내. build.js --test-bg-prelude 로 background.js 앞에
// 붙는다. 시험 크롬은 인터넷이 막혀 진짜 모델을 못 받으므로, 진짜(크롬 157, 2026-11-23 시험)와 같은 규칙만 흉내 낸다:
// service worker 에서는 누름 없이 만들 수 있고, 아직 안 받은 쌍(downloadable)은 1.5초 동안 받는 정도(downloadprogress)를 알린 뒤 된다.
// 답: 한국어로는 '내장:원문', 다른 말로는 '[BI-언어]' + 원문(한글은 'k글자수' 로 — 진짜 번역처럼 한글이 남지 않게).
// 언어 알아보기는 스크립트에는 '없음' 으로 알린다(진짜를 부르면 모델을 받으려다 멈춘다).
// state 를 'hang' 으로 두면 인터넷이 끊겼을 때의 진짜처럼 만들기가 끝없이 기다린다(받는 정도 0) — background 의 멈춤 시계를
// 시험에서는 짧게(1.5초, 다시 해 보기 3초).
self.__mtStallMs = 1500;
self.__mtStallPauseMs = 3000;
(() => {
  const state = { 'th>ko': 'downloadable', 'ko>th': 'downloadable', 'vi>ko': 'downloadable', 'ko>vi': 'downloadable', 'ko>en': 'hang' };
  const calls = [];
  const made = [];
  // breakAll(): 만든 번역기를 모두 고장 낸다 — 크롬이 새 언어 모델을 깔며 번역 서비스를 다시 띄운 것처럼(진짜: 'Other generic failures occurred.')
  self.__fakeTranslator = { state, calls, breakAll: () => made.forEach((tr) => (tr.alive = false)) };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  self.Translator = {
    availability: async ({ sourceLanguage: s, targetLanguage: t }) => {
      const v = state[`${s}>${t}`];
      return v === 'hang' ? 'downloadable' : v || 'unavailable';
    },
    create: async ({ sourceLanguage: s, targetLanguage: t, monitor }) => {
      const k = `${s}>${t}`;
      if (!state[k]) throw new DOMException('Unable to create translator for the given source and target language.', 'NotSupportedError');
      calls.push(`create ${k}`);
      if (state[k] === 'hang') await new Promise(() => {});
      if (state[k] !== 'available') {
        const mon = new EventTarget();
        if (monitor) monitor(mon);
        for (const loaded of [0, 0.3, 0.6, 1]) {
          const e = new Event('downloadprogress');
          e.loaded = loaded;
          mon.dispatchEvent(e);
          await sleep(500);
        }
        state[k] = 'available';
      }
      const tr = {
        alive: true,
        translate: async (x) => {
          if (!tr.alive) throw new DOMException('Other generic failures occurred.', 'UnknownError');
          calls.push(`${k}|${x}`);
          // 진짜(크롬 157): 한→베 '내일 만나요' 는 영어 'See you tomorrow.' 로 샌다
          if (k === 'ko>vi' && x === '내일 만나요') return 'See you tomorrow.';
          return t === 'ko' ? `내장:${x}` : `[BI-${t}]` + String(x).replace(/[ㄱ-ㆎ가-힣]+/g, (m) => `k${m.length}`);
        },
        destroy() {},
      };
      made.push(tr);
      return tr;
    },
  };
  // 언어 알아보기: 스크립트가 쓰지 않게 '없음' 으로 알리지만, background 가 영어로 샌 답을 가릴 때(mtEnglishLeak)는 만들어 쓴다 —
  // 'See you tomorrow.' 만 영어(0.997, 진짜와 같은 값), 나머지는 모름.
  self.LanguageDetector = {
    availability: async () => 'unavailable',
    create: async () => ({
      detect: async (s) => (s === 'See you tomorrow.' ? [{ detectedLanguage: 'en', confidence: 0.997 }] : [{ detectedLanguage: 'und', confidence: 0.1 }]),
      destroy() {},
    }),
  };
})();
