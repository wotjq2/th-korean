// 문장 교차(1.37.0): 언어별 용어집 '직접 고른 말' 의 값(그 언어 문장) → 한국어 키 → 한국어 / 다른 언어.
// 받은 말(메신저 chatDictLines)과 한국어가 아닌 사용자(koreanToLang·chatKoreanToThai 의 !MY_KO 길)가 crossLookup 으로 쓴다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('./lib/load');

const config = fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8');
const CUR = '# === 한국어기초사전 끝 — 아래는 직접 고른 말 ===\n';
const files = {
  'glossary-de.txt': '사전낱말=Wörterbuch\n' + CUR + '지금 어디야=Wo bist du gerade?\n고마워=Danke!\n감사합니다=Danke\n잘 자=Gute Nacht\n잘 자요=Gute Nacht\n바뀐 말=Alt\n바뀐 말=Neu\n',
  'glossary-vi.txt': CUR + '고마워=Cảm ơn\n감사합니다=Cảm ơn!\n잘 자=Chúc ngủ ngon\n잘 자요=Ngủ ngon nhé\n지금 어디야=Bạn đang ở đâu?\n',
  'glossary.txt': '지금 어디야=ตอนนี้อยู่ไหน\n',
};
const s = load({ config, glossaryFiles: files, glossary: files['glossary.txt'] });
const cross = s.peek('crossLookup');

test('받은 말: 그 언어 문장 → 한국어 키(띄어쓰기 그대로, 물음표 살림)', async () => {
  assert.equal(await cross('Wo bist du gerade?', 'de', 'ko'), '지금 어디야?');
  assert.equal(await cross('wo bist du gerade', 'de', 'ko'), '지금 어디야'); // 대소문자·문장부호는 보지 않는다
  assert.equal(await cross('Danke', 'de', 'ko'), '고마워'); // 여럿이면 파일에서 먼저 나온 키
});

test('다른 언어로는 건너갈 값이 모두 같을 때만', async () => {
  assert.equal(await cross('Danke', 'de', 'vi'), 'Cảm ơn'); // 고마워·감사합니다 → Cảm ơn / Cảm ơn! (문장부호만 다름)
  assert.equal(await cross('Gute Nacht', 'de', 'vi'), ''); // 잘 자 → Chúc ngủ ngon, 잘 자요 → Ngủ ngon nhé — 다르다
  assert.equal(await cross('Wo bist du gerade?', 'de', 'vi'), 'Bạn đang ở đâu?');
});

test('아래에서 바뀐 값(아래 것이 이긴다)·사전 칸 값은 쓰지 않는다', async () => {
  assert.equal(await cross('Alt', 'de', 'ko'), '');
  assert.equal(await cross('Neu', 'de', 'ko'), '바뀐 말');
  assert.equal(await cross('Wörterbuch', 'de', 'ko'), '');
});

test('태국어로는 한국어 키를 태국어 엔진에 넣어 용어집으로 옮겨질 때만', async () => {
  assert.equal(await cross('Wo bist du gerade?', 'de', 'th'), 'ตอนนี้อยู่ไหน');
  assert.equal(await cross('Danke', 'de', 'th'), ''); // 고마워·감사합니다가 이 시험 용어집에 없다 → 구글로
});

test('너무 긴 말·없는 말은 빈칸(구글로)', async () => {
  assert.equal(await cross('x'.repeat(130), 'de', 'ko'), '');
  assert.equal(await cross('Das habe ich nie gesagt', 'de', 'ko'), '');
});
