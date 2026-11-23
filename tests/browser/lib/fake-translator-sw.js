// 시험용(2단계)만 — 확장 service worker 의 크롬 내장 번역기(Translator API) 흉내. build.js --test-bg-prelude 로 background.js 앞에
// 붙는다. 시험 크롬은 인터넷이 막혀 진짜 모델을 못 받으므로, 진짜(크롬 157, 2026-11-23 시험)와 같은 규칙만 흉내 낸다:
// service worker 에서는 누름 없이 만들 수 있고, 아직 안 받은 쌍(downloadable)은 1.5초 동안 받는 정도(downloadprogress)를 알린 뒤 된다.
// 답: 한국어로는 '내장:원문', 다른 말로는 '[BI-언어]' + 원문(한글은 'k글자수' 로 — 진짜 번역처럼 한글이 남지 않게).
// 언어 알아보기는 '없음' 으로 둔다(진짜를 부르면 모델을 받으려다 멈춘다).
(() => {
  const state = { 'th>ko': 'downloadable', 'ko>th': 'downloadable', 'vi>ko': 'downloadable', 'ko>vi': 'downloadable' };
  const calls = [];
  self.__fakeTranslator = { state, calls };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  self.Translator = {
    availability: async ({ sourceLanguage: s, targetLanguage: t }) => state[`${s}>${t}`] || 'unavailable',
    create: async ({ sourceLanguage: s, targetLanguage: t, monitor }) => {
      const k = `${s}>${t}`;
      if (!state[k]) throw new DOMException('Unable to create translator for the given source and target language.', 'NotSupportedError');
      calls.push(`create ${k}`);
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
      return {
        translate: async (x) => {
          calls.push(`${k}|${x}`);
          return t === 'ko' ? `내장:${x}` : `[BI-${t}]` + String(x).replace(/[ㄱ-ㆎ가-힣]+/g, (m) => `k${m.length}`);
        },
        destroy() {},
      };
    },
  };
  self.LanguageDetector = {
    availability: async () => 'unavailable',
    create: async () => {
      throw new DOMException('no detector in tests', 'NotSupportedError');
    },
  };
})();
