// 말풍선 글자 읽기(Tesseract). engine.js 는 스크립트를 돌리려고 window·document·location 을 흉내 내는데,
// 그러면 tesseract.js 가 브라우저인 줄 안다. 그래서 흉내가 없는 따로 된 스레드에서 돌린다.
const { parentPort, workerData } = require('worker_threads');
const { createWorker } = require('tesseract.js');

let worker = null;
function get() {
  if (!worker) {
    worker = createWorker(['tha', 'kor', 'eng'], 1, { cachePath: workerData.cachePath, logger: () => {} }).then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      return w;
    });
    worker.catch(() => (worker = null));
  }
  return worker;
}

parentPort.on('message', async ({ id, file }) => {
  try {
    const { data } = await (await get()).recognize(file, {}, { blocks: true });
    // 줄마다 확신도를 같이 넘긴다 — 말풍선 테두리를 글자로 읽은 부스러기 줄은 확신도가 낮다.
    const lines = (data.lines || []).map((l) => ({ text: l.text, conf: l.confidence }));
    parentPort.postMessage({ id, text: data.text || '', conf: data.confidence || 0, lines });
  } catch (e) {
    parentPort.postMessage({ id, err: String((e && e.message) || e) });
  }
});
