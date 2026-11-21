// 화면에 박힌 자막의 색(1.35.6, 6번): 흰 자막처럼 노란·호박색 자막도 찾고 읽는다. 노란 물체만 있는 장면은 잡지 않는다.
// 크롬은 그림만 그린다(직접 만든 배경 — 영상 장면은 저장소에 두지 않는다). 찾기는 지금 스크립트의 hsFind(노드 vm),
// 자르기는 hsCrop(크롬 페이지). 번역 도우미 엔진 읽기는 이 PC 에 Tesseract 와 글자 모델이 있을 때만 본다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch } = require('./lib/chrome');
const { load, ROOT, SCRIPT } = require('../lib/load');

const SRC = fs.readFileSync(SCRIPT, 'utf8');
const cut = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const CROP_CODE = cut('  // 찾은 줄을 원본 크기로 잘라', '  // 읽은 글이 자막인가');
const FONT = '"Segoe UI", "Leelawadee UI", "Nirmala UI", "Khmer UI", "Microsoft YaHei", "Malgun Gothic", Arial';
const LINES = { en: "We have to get out of here.", th: 'เราต้องรีบออกไปจากที่นี่', zh: '我们得马上离开这里', vi: 'Chúng ta phải rời khỏi đây ngay' };
const COLORS = { white: '#ffffff', yellow: '#ffee00', amber: '#ffc61a' };
const ENGINE = path.join(ROOT, 'line-helper/engine.js');
const ENGINE_READY = ['node_modules/tesseract.js', 'data/eng.traineddata'].every((f) => fs.existsSync(path.join(ROOT, 'line-helper', f)));

describe('화면 자막 색: 흰·노랑·호박색 (진짜 크롬으로 그리기)', () => {
  let chrome;
  let t;
  let tmp;
  const hsFind = load().peek('hsFind');
  // 장면 하나를 그려 hsFind 로 찾는다. what: { text, color, style } 또는 { objects: true } 또는 {}
  async function scene(what, seed = 1) {
    const band = await t.ev(`(() => {
      const VW = 1280, VH = 720, fs0 = Math.round(VH * 0.056);
      const fr = document.createElement('canvas'); fr.width = VW; fr.height = VH; const g = fr.getContext('2d');
      let s = ${seed * 7919}; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
      const grd = g.createLinearGradient(0, 0, VW, VH); grd.addColorStop(0, '#2a3340'); grd.addColorStop(0.6, '#5a4a3a'); grd.addColorStop(1, '#1d2026');
      g.fillStyle = grd; g.fillRect(0, 0, VW, VH);
      for (let n = 0; n < 900; n++) { const v = Math.floor(rnd() * 120 + 40); g.fillStyle = 'rgb(' + v + ',' + (v - 10) + ',' + (v - 20) + ')'; g.fillRect(rnd() * VW, rnd() * VH, 3 + rnd() * 30, 2 + rnd() * 18); }
      g.fillStyle = 'rgba(235,235,225,0.5)'; g.fillRect(VW * 0.7, VH * 0.6, VW * 0.2, VH * 0.12); // 밝은 벽 한 조각
      const what = ${JSON.stringify(what)};
      if (what.objects) {
        for (let n = 0; n < 6; n++) {
          g.fillStyle = ['#ffee00', '#ffc61a', '#f5d60a'][n % 3];
          const x = VW * (0.1 + rnd() * 0.7), y = VH * (0.62 + rnd() * 0.3), z = fs0 * (0.6 + rnd() * 2.5);
          if (n % 3 === 0) g.fillRect(x, y, z * 2.5, z * 0.8);
          else if (n % 3 === 1) { g.beginPath(); g.arc(x, y, z * 0.6, 0, Math.PI * 2); g.fill(); }
          else { g.strokeStyle = g.fillStyle; g.lineWidth = fs0 * 0.25; g.beginPath(); g.moveTo(x, y); g.lineTo(x + z * 3, y + z * 0.2); g.stroke(); }
        }
      } else if (what.text) {
        g.font = (what.style === 1 ? '' : 'bold ') + fs0 + 'px ' + ${JSON.stringify(FONT)};
        g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
        const y = VH * 0.92;
        if (what.style === 2) { const m = g.measureText(what.text); g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(VW / 2 - m.width / 2 - fs0 * 0.3, y - fs0 * 0.95, m.width + fs0 * 0.6, fs0 * 1.3); }
        else { if (what.style === 1) { g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 4; g.shadowOffsetX = 2; g.shadowOffsetY = 2; }
          g.strokeStyle = '#000'; g.lineWidth = fs0 * (what.style === 1 ? 0.08 : 0.14); g.strokeText(what.text, VW / 2, y); g.shadowColor = 'transparent'; }
        g.fillStyle = what.color; g.fillText(what.text, VW / 2, y);
      }
      window.__fr = fr;
      const top = Math.floor(VH * 0.55), k = 360 / VH, bw = Math.round(VW * k), bh = Math.round((VH - top) * k);
      const cv = document.createElement('canvas'); cv.width = bw; cv.height = bh; const c2 = cv.getContext('2d', { willReadFrequently: true });
      c2.drawImage(fr, 0, top, VW, VH - top, 0, 0, bw, bh);
      const d = c2.getImageData(0, 0, bw, bh).data; let bin = '';
      for (let i = 0; i < d.length; i += 32768) bin += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
      return { bw, bh, top, k, VW, VH, px: btoa(bin) };
    })()`, 30000);
    const f0 = hsFind(new Uint8ClampedArray(Buffer.from(band.px, 'base64')), band.bw, band.bh);
    if (!f0) return null;
    const f = JSON.parse(JSON.stringify({ ...f0, k: band.k, top: band.top, vw: band.VW, vh: band.VH, alts: undefined }));
    return JSON.parse(await t.ev(`JSON.stringify(hsCrop(window.__fr, ${JSON.stringify(f)}))`, 30000));
  }

  before(async () => {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'lzk-hc-'));
    chrome = await launch({ profile: path.join(tmp, 'profile'), hostRules: 'MAP * ~NOTFOUND' });
    t = await chrome.tab();
    await t.ev(`(() => { ${CROP_CODE}; window.hsCrop = hsCrop; return 1; })()`);
  });
  after(async () => {
    if (chrome) await chrome.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('흰·노랑·호박색 자막을 모두 찾는다(4개 언어 × 3 모양)', { timeout: 120000 }, async () => {
    const miss = [];
    for (const [color, css] of Object.entries(COLORS)) {
      for (const [lang, text] of Object.entries(LINES)) {
        for (const style of [0, 1, 2]) if (!(await scene({ text, color: css, style }, style + 1))) miss.push(`${color}/${lang}/모양${style}`);
      }
    }
    assert.deepEqual(miss, []);
  });

  test('자막 없는 장면·노란 물체만 있는 장면은 잡지 않는다', { timeout: 60000 }, async () => {
    const wrong = [];
    for (let k = 1; k <= 6; k++) {
      if (await scene({}, k)) wrong.push(`빈 장면 ${k}`);
      if (await scene({ objects: true }, k)) wrong.push(`노란 물체 ${k}`);
    }
    assert.deepEqual(wrong, []);
  });

  test('번역 도우미 엔진이 노란 자막을 흰 자막만큼 읽는다(이 PC 에 글자 모델이 있을 때)', { timeout: 120000, skip: !ENGINE_READY && 'Tesseract·글자 모델 없음' }, async () => {
    const p = spawn(process.execPath, [ENGINE], { cwd: path.dirname(ENGINE), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const wait = new Map();
    let id = 0;
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try { const j = JSON.parse(line); const w = wait.get(j.id); if (w) (wait.delete(j.id), w(j)); } catch { /* 엔진 기록 줄 */ }
      }
    });
    const read = (crop, lang) => new Promise((res) => {
      const n = ++id;
      wait.set(n, (r) => res(r.ok ? JSON.parse(r.out) : {}));
      p.stdin.write(JSON.stringify({ id: n, op: 'hardsub', lang: '', text: JSON.stringify({ ...crop, langs: [lang, 'en'] }) }) + '\n');
    });
    try {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
      for (const color of ['white', 'yellow', 'amber']) {
        const crop = await scene({ text: LINES.en, color: COLORS[color], style: 0 }, 3);
        assert.ok(crop, `${color} 못 찾음`);
        const o = await read(crop, 'en');
        assert.equal(norm(o.text), norm(LINES.en), `${color}: '${o.text}'`);
      }
    } finally {
      p.stdin.end();
      p.kill();
    }
  });
});
