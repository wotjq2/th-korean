// 영상 자막: 중국어 자막 바꿀 말(1.35.1)과 유튜브 '말 언어' 가늠(1.31.1 — 내 언어 영상에 번역 자막이 뜨면 안 된다).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, same } = require("./lib/load");

test('중국어 자막: 대만 욕·속어를 뜻이 통하는 말로', () => {
  const sub = load().peek('subPrep');
  assert.equal(sub('幹你娘', 'zh-TW'), '他媽的');
  assert.equal(sub('你娘啦', 'zh-TW'), '他媽的啦');
  assert.equal(sub('三小', 'zh-TW'), '什麼鬼');
  assert.equal(sub('母湯', 'zh-TW'), '不行');
});

test('중국어 자막: 뜻이 다른 같은 글자는 그대로', () => {
  const sub = load().peek('subPrep');
  assert.equal(sub('我要睡懶覺', 'zh-TW'), '我要睡懶覺'); // 늦잠
  assert.equal(sub('你娘在家嗎', 'zh-TW'), '你娘在家嗎'); // 너희 엄마 집에 계셔?
  assert.equal(sub('1666', 'zh-CN'), '1666'); // 숫자 속 666
});

test('중국어 자막: 메뉴 이름·글자 인식 실수', () => {
  const sub = load().peek('subPrep');
  assert.equal(sub('大麥克', 'zh-TW'), '巨無霸');
  assert.equal(sub('膺香魚', 'zh-TW'), '麥香魚漢堡'); // 膺→麥 고친 뒤 메뉴 이름
  assert.equal(sub('666', 'zh-CN'), '太厉害了');
});

test('중국어 표는 간체·번체·광둥어가 함께 쓰고, 다른 언어는 안 건드린다', () => {
  const sub = load().peek('subPrep');
  assert.equal(sub('三小', 'yue'), '什麼鬼');
  assert.equal(sub('三小', 'zh'), '什麼鬼');
  assert.equal(sub('yyds', 'en'), 'yyds');
  assert.equal(sub('', 'zh'), '');
});

test('config 의 subPrep 은 뒤에 붙고, 틀린 정규식은 버린다', () => {
  const sub = load({ config: { subPrep: { zh: [['(', 'x'], ['好棒棒', '真厉害']] } } }).peek('subPrep');
  assert.equal(sub('好棒棒', 'zh-CN'), '真厉害');
  assert.equal(sub('幹你娘', 'zh-TW'), '他媽的'); // 기본 표도 그대로
});

// ytSpokenFrom(자막 목록, 영상 정보, 변형 목록) → 말 언어. 내 언어면 YT_MY 를 돌려준다(그러면 번역 자막을 안 띄운다).
const spoken = (myLang) => load({ myLang }).peek('ytSpokenFrom');

test('유튜브: 말과 상관없는 자동 자막(timing-optimized)은 말 언어로 안 친다', () => {
  const f = spoken('ko');
  // 영어 영상에 한국어 timing-optimized 가 붙은 경우 — 한국어 영상으로 보면 자막이 안 나온다
  assert.equal(f(['ko:asr', 'en:asr'], null, ['timing-optimized', '']), 'en');
  // 한국어 쇼츠 AdgTEqVRQ54 = [en:asr(timing-optimized), ko:asr] — 한국어 영상
  assert.equal(f(['en:asr', 'ko:asr'], null, ['timing-optimized', '']), 'ko');
});

test('유튜브: 자동 자막 언어로 말 언어를 가늠', () => {
  const f = spoken('ko');
  assert.equal(f(['en:asr'], null, ['']), 'en');
  assert.equal(f(['th:asr', 'ko'], null, ['', '']), 'th');
  assert.equal(f(['ko'], null, ['']), 'ko'); // 손으로 단 자막이 다 내 언어
});

test('유튜브: 자막이 없으면 제목·채널 글자로(한글이 많으면 한국어 영상)', () => {
  const f = spoken('ko');
  assert.equal(f([], { title: 'MBC 뉴스 LIVE 오늘의 소식', author: 'MBCNEWS', keywords: [] }, []), 'ko');
  assert.equal(f([], { title: 'Daily vlog in Bangkok', author: 'someone', keywords: [] }, []), '');
});

test('유튜브: 내 언어가 다른 언어여도 같은 규칙', () => {
  assert.equal(spoken('th')(['th:asr'], null, ['']), 'th');
  assert.equal(spoken('ms')(['id:asr'], null, ['']), 'ms'); // 말레이어 사용자는 인도네시아어 말도 알아듣는다
  assert.equal(spoken('he')(['iw:asr'], null, ['']), 'iw'); // 유튜브는 히브리어를 iw 로 쓴다
});
