// 말풍선·화면 글자 읽기(Tesseract). engine.js 는 스크립트를 돌리려고 window·document·location 을 흉내 내는데,
// 그러면 tesseract.js 가 브라우저인 줄 안다. 그래서 흉내가 없는 따로 된 스레드에서 돌린다.
// 읽을 언어·방식(langs, psm)마다 Tesseract 를 하나씩 띄워 둔다 — LINE 말풍선은 태·한·영 덩어리(6),
// 화면 번역은 영어 한 줄(7)이나 문단(6).
const { parentPort, workerData } = require('worker_threads');
const { createWorker } = require('tesseract.js');

const workers = new Map();
// 화면 자막은 30개 언어 중 영상마다 몇 개를 읽어 본다 — 언어·방식마다 하나씩 띄운 Tesseract(모델마다 수십 MB)가 쌓이지
// 않게, 가장 오래 안 쓴 것부터 닫아 10개까지만 둔다.
const MAX_WORKERS = 10;
// 5분 동안 안 쓴 인식기는 닫는다 — 화면 번역의 훑어보기 인식기는 글자 모델 열 개를 함께 띄워 메모리를 많이 쓴다(2026-11-19).
const IDLE_MS = 5 * 60 * 1000;
const usedAt = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of workers) {
    if (now - (usedAt.get(key) || 0) < IDLE_MS) continue;
    workers.delete(key);
    usedAt.delete(key);
    w.then((x) => x.terminate()).catch(() => {});
  }
}, 60 * 1000).unref();
function get(langs, psm) {
  const key = langs.join('+') + '/' + psm;
  usedAt.set(key, Date.now());
  let worker = workers.get(key);
  if (worker) {
    workers.delete(key); // 맨 뒤로(최근에 씀)
    workers.set(key, worker);
  }
  while (!worker && workers.size >= MAX_WORKERS) {
    const [old, w] = workers.entries().next().value;
    workers.delete(old);
    w.then((x) => x.terminate()).catch(() => {});
  }
  if (!worker) {
    worker = createWorker(langs, 1, { cachePath: workerData.cachePath, logger: () => {} }).then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
      return w;
    });
    worker.catch(() => workers.delete(key));
    workers.set(key, worker);
  }
  return worker;
}

parentPort.on('message', async ({ id, file, langs, psm }) => {
  try {
    const w = await get(langs || ['tha', 'kor', 'eng'], psm || '6');
    const { data } = await w.recognize(file, {}, { blocks: true });
    // 줄마다 확신도를 같이 넘긴다 — 말풍선 테두리를 글자로 읽은 부스러기 줄은 확신도가 낮다.
    const lines = (data.lines || []).map((l) => ({ text: l.text, conf: l.confidence }));
    // 낱말마다 가로 자리 — 화면 자막의 구절 사이 빈칸('扒衣服吧 把他衣服脱了')을 쉼표로 살리는 데 쓴다(engine.js hsJoin).
    const words = [];
    for (const b of data.blocks || [])
      for (const p of b.paragraphs || [])
        for (const l of p.lines || [])
          for (const wd of l.words || []) words.push({ t: wd.text, c: wd.confidence, x0: wd.bbox.x0, x1: wd.bbox.x1, h: wd.bbox.y1 - wd.bbox.y0 });
    parentPort.postMessage({ id, text: data.text || '', conf: data.confidence || 0, lines, words });
  } catch (e) {
    parentPort.postMessage({ id, err: String((e && e.message) || e) });
  }
});
