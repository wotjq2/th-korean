// ---------------------------------------------------------------------------
// 통합 번역 — 뒤에서 도는 부분(service worker).
// 번역 스크립트의 인터넷 요청(GM_xmlhttpRequest)을 대신 보낸다. 페이지 안에서는 다른 사이트 주소가
// 막히지만(CORS), 확장은 manifest 의 host_permissions 에 적은 주소에 그대로 닿는다.
// ---------------------------------------------------------------------------

/* global chrome */

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m && m.t === 'gm-xhr') {
    gmXhr(m).then(reply);
    return true; // 답을 나중에 보낸다
  }
  if (m && m.t === 'helper') {
    helperCall(m.cmd, m.manual).then(reply);
    return true;
  }
  return undefined;
});

// ---------------------------------------------------------------------------
// 번역 도우미(LINE·화면 번역, 윈도우 프로그램) 켜기·끄기 — 크롬의 네이티브 메시징.
// 도우미가 켤 때 크롬에 자기를 등록해 둔다(line-helper/ChromeLink.cs). 크롬을 켜면(onStartup) 또는 이 확장을
// 설치·새로 고치면(onInstalled) '크롬과 함께 켜기'(helperAuto, 기본 켬)일 때 도우미를 켠다.
// ---------------------------------------------------------------------------

const HELPER_HOST = 'com.th_korean.helper';

async function helperCall(cmd, manual) {
  try {
    return await chrome.runtime.sendNativeMessage(HELPER_HOST, { cmd, manual: !!manual });
  } catch (e) {
    // 'Specified native messaging host not found.' = 도우미가 없거나 아직 한 번도 켜지지 않았다
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function helperAutoStart() {
  const { helperAuto = true } = await chrome.storage.local.get('helperAuto');
  if (helperAuto) await helperCall('start', false);
}

chrome.runtime.onStartup.addListener(helperAutoStart);
chrome.runtime.onInstalled.addListener(helperAutoStart);

async function gmXhr(m) {
  const ctl = new AbortController();
  const timer = m.timeout ? setTimeout(() => ctl.abort(), m.timeout) : null;
  try {
    const r = await fetch(m.url, {
      method: m.method,
      headers: m.headers,
      body: m.method === 'GET' || m.method === 'HEAD' ? undefined : m.data,
      signal: ctl.signal,
      credentials: 'include', // 몽키도 기본으로 쿠키를 함께 보낸다
    });
    const out = {
      status: r.status,
      statusText: r.statusText,
      finalUrl: r.url,
      headers: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n'),
    };
    if (m.responseType === 'blob' || m.responseType === 'arraybuffer') {
      out.b64 = toB64(await r.arrayBuffer());
      out.type = r.headers.get('content-type') || '';
    } else {
      out.text = await r.text();
    }
    return out;
  } catch (e) {
    return { error: ctl.signal.aborted ? 'timeout' : 'network', message: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// 사진처럼 글자가 아닌 답은 메시지로 그대로 못 넘겨 base64 로 바꾼다.
function toB64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
