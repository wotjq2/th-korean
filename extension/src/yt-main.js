// ---------------------------------------------------------------------------
// 통합 번역 — 유튜브 페이지 쪽(world: MAIN)에서 도는 작은 부분.
// 쇼츠 플레이어는 유튜브 자막(CC)이 켜져 있을 때만 자막 파일을 받는다. 사용자(2026-11-02): 외국어가 나오면
// CC 가 켜지고 한국어 자막도 저절로 켜져야 한다. 플레이어의 자막 켜기(toggleSubtitlesOn 등)와 이 영상의
// 자막 목록(getPlayerResponse)은 페이지 쪽 자바스크립트에만 있어서, 번역 스크립트(확장의 격리된 쪽)가 문서
// 이벤트 'lzk-yt-cc'(peek: 보기만 / on / off)로 부탁하면 여기서 부르고 'lzk-yt-cc-done' 으로 답한다(JSON 글자):
//   { was: 부르기 전 CC 'on' / 'off' / 'none', id: 영상 id, tracks: ['th:asr', 'en', …] 또는 null(모름) }
// ---------------------------------------------------------------------------

document.addEventListener('lzk-yt-cc', (e) => {
  const cmd = String(e.detail || '');
  const out = { was: 'none', id: '', tracks: null };
  try {
    const p =
      document.querySelector('ytd-reel-video-renderer[is-active] #shorts-player') || document.querySelector('#shorts-player');
    if (p && typeof p.toggleSubtitlesOn === 'function') {
      try {
        const r = p.getPlayerResponse();
        out.id = (r && r.videoDetails && r.videoDetails.videoId) || '';
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
