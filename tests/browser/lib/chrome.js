// 시험용 크롬: 이 PC 에 깔린 크롬을 새 임시 프로필로, 화면 밖에 띄우고 CDP 파이프로 조종한다.
// 사용자가 쓰는 크롬(프로필)과는 따로 돈다. 확장은 Extensions.loadUnpacked 로 넣는다.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function findChrome() {
  const list = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ].filter(Boolean);
  const hit = list.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('크롬을 못 찾음 — CHROME_PATH 로 알려 주세요');
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ profile, hostRules }) {
  const args = [
    '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-component-update',
    '--disable-background-networking', '--disable-default-apps', '--mute-audio', '--lang=ko',
    `--host-resolver-rules=${hostRules}`, '--ignore-certificate-errors',
    '--window-position=-2400,0', '--window-size=1300,900',
    '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    'about:blank',
  ];
  const proc = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  let nextId = 0;
  const pending = new Map();
  const events = [];
  const waiters = new Set();
  let acc = Buffer.alloc(0);
  proc.stdio[4].on('data', (d) => {
    acc = Buffer.concat([acc, d]);
    let i;
    while ((i = acc.indexOf(0)) >= 0) {
      const msg = JSON.parse(acc.subarray(0, i).toString('utf8'));
      acc = acc.subarray(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? p.rej(new Error(`${p.method}: ${JSON.stringify(msg.error)}`)) : p.res(msg.result);
      } else if (msg.method) {
        events.push(msg);
        for (const w of [...waiters]) if (w.test(msg)) { waiters.delete(w); w.res(msg); }
      }
    }
  });
  proc.stdio[4].on('error', () => {});
  proc.stdio[3].on('error', () => {});
  const send = (method, params = {}, sessionId) => {
    const id = ++nextId;
    proc.stdio[3].write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + '\0');
    return new Promise((res, rej) => pending.set(id, { res, rej, method }));
  };
  const waitEvent = (test, ms = 15000) =>
    new Promise((res, rej) => {
      const w = { test, res };
      waiters.add(w);
      setTimeout(() => { if (waiters.delete(w)) rej(new Error('기다린 일이 안 옴')); }, ms).unref();
    });
  await send('Browser.getVersion'); // 크롬이 떴는지

  // 탭 하나를 열고 다루는 도구
  async function tab(url = 'about:blank') {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, s);
    await send('Page.enable', {}, s);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, s);
    // 페이지가 멈추면(끝없는 반복 등) 답이 영영 안 온다 — 10초면 '멈춤' 으로 알린다.
    const ev = async (expr, ms = 10000) => {
      const r = await Promise.race([
        send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s),
        sleep(ms).then(() => { throw new Error(`페이지가 ${ms / 1000}초 동안 응답하지 않음(멈춤): ${expr.slice(0, 80)}`); }),
      ]);
      if (r.exceptionDetails) throw new Error(`페이지 식 오류: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    };
    const go = async (u) => {
      const loaded = waitEvent((m) => m.sessionId === s && m.method === 'Page.loadEventFired', 20000);
      await send('Page.navigate', { url: u }, s);
      await loaded;
    };
    const reload = async () => {
      const loaded = waitEvent((m) => m.sessionId === s && m.method === 'Page.loadEventFired', 20000);
      await send('Page.reload', {}, s);
      await loaded;
    };
    // 식이 참(또는 값)이 될 때까지 기다린다
    const until = async (expr, ms = 10000, label = expr) => {
      const end = Date.now() + ms;
      let v;
      while (Date.now() < end) {
        try {
          v = await ev(expr);
        } catch (e) {
          if (/멈춤/.test(e.message)) throw e; // 페이지가 멈췄으면 더 기다리지 않는다
          v = undefined;
        }
        if (v) return v;
        await sleep(200);
      }
      throw new Error(`기다려도 안 됨(${ms} ms): ${label}`);
    };
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra }, s);
    const center = async (sel) => {
      const c = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
      if (!c) throw new Error(`안 보임: ${sel}`);
      return c;
    };
    const click = async (sel) => {
      const [x, y] = await center(sel);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }, s);
      await mouse('mousePressed', x, y);
      await mouse('mouseReleased', x, y);
    };
    const drag = async (sel, toX, toY, steps = 12) => {
      const [x, y] = await center(sel);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }, s);
      await mouse('mousePressed', x, y);
      for (let i = 1; i <= steps; i++) await mouse('mouseMoved', x + ((toX - x) * i) / steps, y + ((toY - y) * i) / steps);
      await mouse('mouseReleased', toX, toY);
    };
    const typeIn = async (sel, text) => {
      await click(sel);
      await ev(`(() => { const q = document.querySelector(${JSON.stringify(sel)}); q.focus(); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await send('Input.insertText', { text }, s);
    };
    const enter = async () => {
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) }, s);
      }
    };
    // 이 탭에서 난 오류(페이지·확장 모두). 시험 페이지 자체는 오류를 내지 않는다.
    const errors = () =>
      events
        .filter((e) => e.sessionId === s && (e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')))
        .map((e) => (e.method === 'Runtime.exceptionThrown'
          ? e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text
          : e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')).slice(0, 300));
    // 확장의 격리된 실행 문맥(content script 쪽)에서 식을 돌린다 — 지금 페이지에서 마지막으로 생긴 것.
    const evIso = async (expr, ms = 10000) => {
      let ctx = null;
      for (const e of events) {
        if (e.sessionId !== s) continue;
        if (e.method === 'Runtime.executionContextsCleared') ctx = null;
        else if (e.method === 'Runtime.executionContextCreated' && e.params.context.auxData && e.params.context.auxData.type === 'isolated') ctx = e.params.context.id;
      }
      if (!ctx) throw new Error('확장 문맥(isolated)이 없음');
      const r = await Promise.race([
        send('Runtime.evaluate', { expression: expr, contextId: ctx, awaitPromise: true, returnByValue: true }, s),
        sleep(ms).then(() => { throw new Error(`확장 문맥이 ${ms / 1000}초 동안 응답하지 않음(멈춤)`); }),
      ]);
      if (r.exceptionDetails) throw new Error(`확장 문맥 식 오류: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    };
    if (url !== 'about:blank') await go(url);
    return { s, targetId, ev, evIso, go, reload, until, click, drag, typeIn, enter, center, errors };
  }

  async function close() {
    try { await Promise.race([send('Browser.close'), sleep(3000)]); } catch { /* 이미 닫힘 */ }
    await Promise.race([new Promise((r) => proc.once('exit', r)), sleep(5000)]);
    if (proc.exitCode === null) try { proc.kill(); } catch { /* 없음 */ }
  }

  return { send, tab, close, events, proc };
}

module.exports = { launch, sleep };
