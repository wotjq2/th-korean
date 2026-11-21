// 화면 글 옮기기(내 언어가 한국어가 아닐 때 '한' 단추·창의 한국어를 그 언어로): 우리가 써 넣은 글을 다시 옮기지 않는다.
// 2026-11-21 2단계 시험에서 찾음 — 번역 답에 원래 한국어가 섞여 오면('번역' → '번역 Translate') 속성(title 등)을
// 고치고 → 그 변화를 MutationObserver 가 보고 → 또 고치기를 끝없이 되풀이해 페이지가 멈췄다(글 노드에는 막이가 있었다).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./lib/load');

const withTr = (tr) => load({ myLang: 'en', store: { 'uiTr:en': tr } });

function fakeEl(attrs) {
  return {
    attrs: { ...attrs },
    sets: 0,
    getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; },
    setAttribute(a, v) { this.attrs[a] = String(v); this.sets++; },
  };
}

test('속성: 옮긴 글에 한국어가 남아도 다시 옮기지 않는다(멈춤 막기)', () => {
  const fix = withTr({ 번역: '번역 Translate' }).peek('uiFixAttrs');
  const el = fakeEl({ title: '번역' });
  fix(el);
  assert.equal(el.attrs.title, '번역 Translate');
  for (let i = 0; i < 5; i++) fix(el); // MutationObserver 가 우리 변화를 보고 다시 부른 것
  assert.equal(el.attrs.title, '번역 Translate');
  assert.equal(el.sets, 1);
});

test('속성: 사이트·우리 코드가 새 한국어를 쓰면 그것은 다시 옮긴다', () => {
  const fix = withTr({ 번역: 'Translate', 설정: 'Settings' }).peek('uiFixAttrs');
  const el = fakeEl({ title: '번역', placeholder: '설정' });
  fix(el);
  assert.equal(el.attrs.title, 'Translate');
  assert.equal(el.attrs.placeholder, 'Settings');
  el.attrs.title = '설정'; // 단추 이름이 바뀌었다
  fix(el);
  assert.equal(el.attrs.title, 'Settings');
});

test('글 노드: 옮긴 글에 한국어가 남아도 다시 옮기지 않는다', () => {
  const fixText = withTr({ 번역: '번역 Translate' }).peek('uiFixText');
  const node = { nodeValue: '번역', isConnected: true };
  fixText(node);
  assert.equal(node.nodeValue, '번역 Translate');
  for (let i = 0; i < 5; i++) fixText(node);
  assert.equal(node.nodeValue, '번역 Translate');
});
