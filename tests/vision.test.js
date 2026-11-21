// Google Cloud Vision(사진 글자, 사용자가 자기 키를 넣은 때만) — 7번. 진짜 키 대신 가짜 Vision(창의 fetch 흉내).
// visionAnnotate: 보내기 전에 한 건 센다 → POST images:annotate?key= → 거절되면 이 페이지에서는 다시 안 부른다. 월 한도.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, same } = require('./lib/load');

const month = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const canvas = (w = 400, h = 300) => ({ width: w, height: h, toDataURL: () => 'data:image/jpeg;base64,QUJD' });
// Vision 낱말: 글자들, 상자(x0,y0,x1,y1), 뒤의 빈칸
const word = (t, [x0, y0, x1, y1], brk) => ({
  boundingBox: { vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] },
  symbols: [...t].map((ch, i, a) => ({ text: ch, ...(i === a.length - 1 && brk ? { property: { detectedBreak: { type: brk } } } : {}) })),
});
const resp = (paras) => ({ responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: paras.map((words) => ({ words })) }] }] } }] });
const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

function shop(fetch, store = {}) {
  return load({ host: 'www.lazada.co.th', fetch, store: { visionKey: 'AIza_test', ...store } });
}

test('키와 사진을 보내고(TEXT_DETECTION, 태국어 힌트) 문단을 글로 받는다 — 숫자·영어만인 문단은 둔다', async () => {
  const s = shop(ok(resp([
    [word('ลด', [10, 10, 40, 30], 'SPACE'), word('ราคา', [45, 10, 90, 30], 'LINE_BREAK'), word('พิเศษ', [10, 40, 70, 60])],
    [word('50%', [200, 10, 240, 30])],
  ])));
  const segs = await s.peek('visionReadText')(canvas());
  same(segs.map((x) => x.text), ['ลด ราคา พิเศษ']);
  assert.equal(segs[0].lines, 2);
  assert.deepEqual({ ...segs[0].box }, { x0: 10, y0: 10, x1: 90, y1: 60 });
  const c = s.calls.find((x) => x.via === 'fetch');
  assert.equal(c.url, 'https://vision.googleapis.com/v1/images:annotate?key=AIza_test');
  assert.equal(c.method, 'POST');
  const body = JSON.parse(c.data);
  assert.equal(body.requests[0].image.content, 'QUJD');
  assert.deepEqual(body.requests[0].features, [{ type: 'TEXT_DETECTION' }]);
  assert.deepEqual(body.requests[0].imageContext.languageHints, ['th']);
});

test('보낼 때마다 이 달 쓴 횟수를 센다(실패해도 센다)', async () => {
  const s = shop(ok(resp([])));
  await s.peek('visionReadText')(canvas());
  await s.peek('visionReadText')(canvas());
  assert.deepEqual({ ...s.store.visionUsage }, { month: month(), count: 2 });
});

test('키가 거절되면 그 까닭으로 멈추고, 이 페이지에서는 다시 부르지 않는다', async () => {
  const s = shop(async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } }) }));
  assert.equal(s.peek('visionUsable')(), true);
  await assert.rejects(s.peek('visionReadText')(canvas()), /API key not valid/);
  assert.equal(s.peek('visionUsable')(), false);
  assert.match(s.peek('visionBlocked'), /API key not valid/);
});

test('이 달 한도(기본 900건)에 닿으면 쓰지 않고, 다음 달이면 다시 쓴다', () => {
  assert.equal(shop(ok({}), { visionUsage: { month: month(), count: 900 } }).peek('visionUsable')(), false);
  assert.equal(shop(ok({}), { visionUsage: { month: month(), count: 899 } }).peek('visionUsable')(), true);
  assert.equal(shop(ok({}), { visionUsage: { month: '2000-01', count: 900 } }).peek('visionUsable')(), true);
  assert.equal(shop(ok({}), { visionKey: '' }).peek('visionUsable')(), false);
});

test('여러 사진을 이어 붙인 한 장(1건)에서 낱말마다 어느 사진 글인지 가른다', () => {
  const s = shop(ok({}));
  const parts = [{ x: 0, y: 0, w: 800, h: 400, s: 1 }, { x: 848, y: 0, w: 800, h: 400, s: 0.5 }];
  // Vision 이 옆 사진의 같은 높이 글줄을 한 문단으로 묶은 경우
  const r = resp([[word('ลด', [10, 10, 60, 40], 'SPACE'), word('ราคา', [70, 10, 140, 40], 'SPACE'), word('ส่งฟรี', [900, 10, 1000, 40])]]).responses[0];
  const out = s.peek('visionSegments')(r, 1, parts);
  same(out.map((p) => p.map((x) => x.text)), [['ลด ราคา'], ['ส่งฟรี']]);
  assert.deepEqual({ ...out[1][0].box }, { x0: 104, y0: 20, x1: 304, y1: 80 }); // 그 사진 좌표(축소 0.5 를 되돌림)
});
