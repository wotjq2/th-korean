// ---------------------------------------------------------------------------
// 통합 번역 — 유튜브 페이지 쪽(world: MAIN)에서 도는 작은 부분.
// 쇼츠 플레이어는 유튜브 자막(CC)이 켜져 있을 때만 자막 파일을 받는다. 사용자(2026-11-02): 외국어가 나오면
// CC 가 켜지고 한국어 자막도 저절로 켜져야 한다. 플레이어의 자막 켜기(toggleSubtitlesOn 등)와 이 영상의
// 자막 목록(getPlayerResponse)은 페이지 쪽 자바스크립트에만 있어서, 번역 스크립트(확장의 격리된 쪽)가 문서
// 이벤트 'lzk-yt-cc' 로 부탁하면 여기서 부르고 'lzk-yt-cc-done' 으로 답한다(둘 다 JSON 글자).
//   부탁: { cmd: 'peek'(보기만) / 'on' / 'off', player, any: 쇼츠 플레이어 선택자 — 스크립트의 원격 설정에서 }
//   답:   { was: 부르기 전 CC 'on' / 'off' / 'none', id: 영상 id, tracks: ['th:asr', 'en', …] 또는 null(모름),
//           meta: { title, author, keywords, live } }
// 선택자를 스크립트가 넘기므로 유튜브가 바뀌어도 config.json 만 고치면 이 파일은 그대로다.
// ---------------------------------------------------------------------------

const YT_SHORTS = 'ytd-reel-video-renderer[is-active] #shorts-player';
const YT_SHORTS_ANY = '#shorts-player';

function ytFind(sel, fallback) {
  try {
    return document.querySelector(sel || fallback);
  } catch {
    return document.querySelector(fallback);
  }
}

document.addEventListener('lzk-yt-cc', (e) => {
  let req = { cmd: String(e.detail || '') };
  try {
    if (req.cmd.startsWith('{')) req = JSON.parse(req.cmd);
  } catch {
    req = { cmd: '' };
  }
  const cmd = req.cmd;
  const out = { was: 'none', id: '', tracks: null };
  try {
    const p = ytFind(req.player, YT_SHORTS) || ytFind(req.any, YT_SHORTS_ANY);
    if (p && typeof p.toggleSubtitlesOn === 'function') {
      try {
        const r = p.getPlayerResponse();
        const v = (r && r.videoDetails) || {};
        out.id = v.videoId || '';
        // 자막 목록이 없는 영상(라이브 등)의 말 언어를 가늠할 단서 — 제목·채널 이름·태그(태그와 채널 이름은 유튜브가
        // 번역해 보이지 않는다).
        out.meta = { title: v.title || '', author: v.author || '', keywords: (v.keywords || []).slice(0, 30), live: !!v.isLiveContent };
        const list = r && r.captions && r.captions.playerCaptionsTracklistRenderer;
        out.tracks = ((list && list.captionTracks) || []).map((t) => t.languageCode + (t.kind ? `:${t.kind}` : ''));
      } catch {
        out.tracks = null;
      }
      const t = typeof p.getOption === 'function' ? p.getOption('captions', 'track') : null;
      out.was = t && t.languageCode ? 'on' : 'off';
      if (cmd === 'on' && out.was === 'off') p.toggleSubtitlesOn();
      if (cmd === 'off' && out.was === 'on') p.toggleSubtitles();
    }
  } catch (err) {
    out.was = `error ${err && err.message}`;
  }
  document.dispatchEvent(new CustomEvent('lzk-yt-cc-done', { detail: JSON.stringify(out) }));
});
