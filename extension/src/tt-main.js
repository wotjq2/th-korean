// ---------------------------------------------------------------------------
// 멀티 번역기 — 틱톡 페이지 쪽(world: MAIN)에서 도는 작은 부분.
// 사용자(2026-11-21): 틱톡은 번역이 잘 안 되고(번역률이 낮다), 넘겨도 앞 영상 자막이 몇 초 남는다. 틱톡은 영상마다
// 자기 자동 자막(Whisper 받아쓰기, WebVTT — 말한 시각까지)을 갖고 있다: 영상 정보의 video.claInfo.captionInfos 와
// video.subtitleInfos. 크롬 실시간 자막(소리 → 받아 적기, 한 문장 늦음)보다 훨씬 정확하고 시각이 맞다.
// 영상 정보는 틱톡이 /api/…item_list 같은 답(JSON)과 첫 페이지의 __UNIVERSAL_DATA_FOR_REHYDRATION__ 로 받는데, 그 답은
// 페이지 쪽 fetch·XMLHttpRequest 에서만 보인다 — 여기서 살짝 엿봐(답은 그대로 둔다) 영상 id → 자막 목록만 골라
// 번역 스크립트(확장의 격리된 쪽)에 문서 이벤트로 넘긴다:
//   'lzk-tt-items' detail = JSON { id: { caps: [{ lang, raw, urls, auto, orig, tr }], orig: 원래 언어, desc } }
//   스크립트가 'lzk-tt-ask' 를 보내면 지금까지 모은 것을 모두 다시 보낸다(스크립트가 늦게 뜬 경우).
// 자막 파일은 여기서 받지 않는다 — 주소만 넘기고 스크립트가 받는다.
// ---------------------------------------------------------------------------

(() => {
  const items = new Map(); // 영상 id → { caps, orig, desc }
  const MAX = 600;

  function capsOf(video) {
    const out = [];
    const seen = new Set();
    const cla = video && video.claInfo;
    for (const c of (cla && cla.captionInfos) || []) {
      const urls = [...(c.urlList || []), c.url].filter((u) => typeof u === 'string' && u);
      if (!urls.length || seen.has(urls[0])) continue;
      seen.add(urls[0]);
      out.push({
        lang: String(c.languageCode || ''),
        raw: String(c.language || ''),
        urls: [...new Set(urls)],
        auto: !!c.isAutoGen,
        orig: !!c.isOriginalCaption,
        tr: String(c.translationType || '0'),
      });
    }
    for (const s of (video && video.subtitleInfos) || []) {
      const u = s && s.Url;
      if (typeof u !== 'string' || !u || seen.has(u) || (s.Format && s.Format !== 'webvtt')) continue;
      seen.add(u);
      out.push({ lang: '', raw: String(s.LanguageCodeName || ''), urls: [u], auto: s.Source === 'ASR', orig: s.Source === 'ASR', tr: s.Source === 'MT' ? '1' : '0' });
    }
    return out;
  }

  // JSON 안 어디에 있든 { id, video: { claInfo | subtitleInfos } } 꼴을 찾는다(목록·상세·검색 답의 모양이 다 다르다).
  function walk(node, found, depth) {
    if (!node || typeof node !== 'object' || depth > 9) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, found, depth + 1);
      return;
    }
    const v = node.video;
    if (v && typeof v === 'object' && (v.claInfo || v.subtitleInfos) && /^\d{8,}$/.test(String(node.id || ''))) {
      const caps = capsOf(v);
      const cla = v.claInfo || {};
      const orig = (cla.originalLanguageInfo && (cla.originalLanguageInfo.languageCode || cla.originalLanguageInfo.language)) || '';
      found[String(node.id)] = { caps, orig: String(orig), desc: String(node.desc || '').slice(0, 200), tl: String(node.textLanguage || '') };
    }
    for (const k in node) {
      const x = node[k];
      if (x && typeof x === 'object') walk(x, found, depth + 1);
    }
  }

  function send(obj) {
    try {
      document.dispatchEvent(new CustomEvent('lzk-tt-items', { detail: JSON.stringify(obj) }));
    } catch {
      /* 문서가 아직 없다 — 스크립트가 'lzk-tt-ask' 로 다시 묻는다 */
    }
  }

  function take(json) {
    const found = {};
    walk(json, found, 0);
    const ids = Object.keys(found);
    if (!ids.length) return;
    for (const id of ids) {
      items.delete(id);
      items.set(id, found[id]);
    }
    while (items.size > MAX) items.delete(items.keys().next().value);
    send(found);
  }

  const wanted = (url) => /\/api\/|\/aweme\//.test(url) && !/\.(?:js|css|png|jpe?g|webp|mp4)(?:\?|$)/.test(url);
  const parse = (text) => {
    if (typeof text !== 'string' || text.length < 20 || (text[0] !== '{' && text[0] !== '[')) return;
    if (!text.includes('claInfo') && !text.includes('subtitleInfos')) return;
    try {
      take(JSON.parse(text));
    } catch {
      /* JSON 이 아니다 */
    }
  };

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        const a = args[0];
        const url = String((a && a.url) || a || '');
        if (wanted(url)) {
          p.then((r) => {
            try {
              if (r && r.ok) r.clone().text().then(parse, () => {});
            } catch {
              /* 이미 읽힌 답 */
            }
          }, () => {});
        }
      } catch {
        /* 엿보기만 한다 — 틱톡 동작은 그대로 */
      }
      return p;
    };
  }

  const X = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (X) {
    const open = X.open;
    const sendX = X.send;
    X.open = function (method, url, ...rest) {
      try {
        this.__lzkTt = wanted(String(url || ''));
      } catch {
        this.__lzkTt = false;
      }
      return open.call(this, method, url, ...rest);
    };
    X.send = function (...args) {
      if (this.__lzkTt) {
        this.addEventListener('load', () => {
          try {
            if (this.responseType === '' || this.responseType === 'text') parse(this.responseText);
            else if (this.responseType === 'json' && this.response) take(this.response);
          } catch {
            /* 엿보기만 한다 */
          }
        });
      }
      return sendX.apply(this, args);
    };
  }

  // 첫 페이지(영상 페이지)의 영상 정보.
  function fromPage() {
    for (const id of ['__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE', '__NEXT_DATA__']) {
      const el = document.getElementById(id);
      if (el && el.textContent && !el.dataset.lzkTt) {
        el.dataset.lzkTt = '1';
        parse(el.textContent);
      }
    }
  }
  document.addEventListener('DOMContentLoaded', fromPage);
  document.addEventListener('lzk-tt-ask', () => {
    fromPage();
    if (items.size) send(Object.fromEntries(items));
  });
})();
