// 시험용(2단계)만 — 크롬 내장 번역기(Translator API) 흉내. build.js --test-prelude 로 content.js 앞에 붙는다.
// 시험 크롬은 인터넷이 막혀 진짜 모델을 못 받으므로, 진짜와 같은 규칙만 흉내 낸다: 이 사이트에서 안 켠 쌍(downloadable)은
// 누름(navigator.userActivation) 중에만 만들 수 있고, 한 번 켜면 계속 된다. 답: 한국어로는 '내장:원문',
// 다른 말로는 '[BI-언어]' + 원문(한글은 'k글자수' 로 — 진짜 번역처럼 한글이 남지 않게).
(() => {
  const state = { 'th>ko': 'downloadable', 'ko>th': 'downloadable', 'vi>ko': 'downloadable', 'ko>vi': 'downloadable' };
  const calls = [];
  globalThis.__fakeTranslator = { state, calls };
  globalThis.Translator = {
    availability: async ({ sourceLanguage: s, targetLanguage: t }) => state[`${s}>${t}`] || 'unavailable',
    create: async ({ sourceLanguage: s, targetLanguage: t }) => {
      const k = `${s}>${t}`;
      if (!state[k]) throw new DOMException('Unable to create translator for the given source and target language.', 'NotSupportedError');
      if (state[k] !== 'available' && !navigator.userActivation.isActive) {
        throw new DOMException('Requires a user gesture when availability is "downloading" or "downloadable".', 'NotAllowedError');
      }
      state[k] = 'available';
      return {
        translate: async (x) => {
          calls.push(`${k}|${x}`);
          return t === 'ko' ? `내장:${x}` : `[BI-${t}]` + String(x).replace(/[ㄱ-ㆎ가-힣]+/g, (m) => `k${m.length}`);
        },
      };
    },
  };
})();
