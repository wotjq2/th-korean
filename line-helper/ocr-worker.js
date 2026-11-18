// 말풍선·화면 글자 읽기(Tesseract). engine.js 는 스크립트를 돌리려고 window·document·location 을 흉내 내는데,
// 그러면 tesseract.js 가 브라우저인 줄 안다. 그래서 흉내가 없는 따로 된 스레드에서 돌린다.
// 읽을 언어·방식(langs, psm)마다 Tesseract 를 하나씩 띄워 둔다 — LINE 말풍선은 태·한·영 덩어리(6),
// 화면 번역은 영어 한 줄(7)이나 문단(6).
const { parentPort, workerData } = require('worker_threads');
const { createWorker } = require('tesseract.js');

const workers = new Map();
function get(langs, psm) {
  const key = langs.join('+') + '/' + psm;
  let worker = workers.get(key);
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
