// 번역 도우미 엔진(line-helper/engine.js)은 GitHub 의 th-korean.user.js 를 받아 안쪽 이름(NAMES)을 그대로 꺼내 쓴다
// (LINE·화면 번역·자막 = 크롬과 같은 번역). 스크립트에서 이름 하나를 바꾸거나 지우면 엔진은 null 을 받아 조용히 멈춘다 —
// 스크립트는 올리는 즉시 모든 도우미에 나가므로 여기서 막는다(2026-11-22 재검토에서 찾은 빈틈).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('./lib/load');

const engine = fs.readFileSync(path.join(ROOT, 'line-helper/engine.js'), 'utf8');

function engineNames() {
  const m = engine.match(/const NAMES = \[([\s\S]*?)\];/);
  assert.ok(m, 'engine.js 에서 NAMES 목록을 못 찾음');
  return [...m[1].matchAll(/'([A-Za-z_$][\w$]*)'/g)].map((x) => x[1]);
}

test('엔진이 꺼내 쓰는 이름이 스크립트에 모두 있다', () => {
  const names = engineNames();
  assert.ok(names.length >= 20, `NAMES 가 너무 적음: ${names.length}`);
  // 엔진처럼 라자다 주소로 띄운다(페이지가 다 뜨기를 기다리기만 한다)
  const s = load({ host: 'www.lazada.co.th', glossary: '가방=กระเป๋า\n' });
  const missing = names.filter((n) => s.peek(`typeof ${n}`) === 'undefined');
  assert.deepEqual(missing, [], `스크립트에 없는 이름: ${missing.join(', ')}`);
});

test('엔진이 T.이름 으로 부르는 것은 모두 NAMES 에 있다', () => {
  const names = new Set(engineNames());
  const used = [...new Set([...engine.matchAll(/\bT\.([A-Za-z_$][\w$]*)/g)].map((x) => x[1]))];
  const notExported = used.filter((n) => !names.has(n));
  assert.deepEqual(notExported, [], `NAMES 에 없는데 엔진이 쓰는 이름: ${notExported.join(', ')}`);
});

test('엔진이 쓰는 함수·값의 꼴', () => {
  const s = load({ host: 'www.lazada.co.th', glossary: '가방=กระเป๋า\n' });
  const fns = ['ensureGlossary', 'chatKoreanToThai', 'freeTranslateOne', 'chatPrepThai', 'chatThaiWhole', 'translateToKorean',
    'chatFixKorean', 'thaiSpeakerGender', 'refreshGlossary', 'koreanToLang', 'rcRefresh', 'freeTranslateMany', 'langGlossaryMap',
    'parseGlossary', 'crossLookup', 'chatScriptLang'];
  for (const n of fns) assert.equal(s.peek(`typeof ${n}`), 'function', n);
  assert.ok(Array.isArray(s.peek('TYPE_LANGS')) && s.peek('TYPE_LANGS').length >= 20, 'TYPE_LANGS');
  assert.equal(typeof s.peek('MY'), 'string');
  assert.ok(s.peek('HANGUL').test('가') && s.peek('THAI').test('ก'), 'HANGUL·THAI 정규식');
});
