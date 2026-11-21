// 메신저(1.30.0): 어떤 말풍선을 옮길지, 한자만 쓴 글이 어느 중국어인지.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, same } = require("./lib/load");

test('내 언어 한국어: 외국어 말풍선만 옮긴다', () => {
  const f = load({ myLang: 'ko' }).peek('chatForeign');
  assert.equal(f('สวัสดีครับ'), true);
  assert.equal(f('Hello, how are you?'), true);
  assert.equal(f('Привет, как дела?'), true);
  assert.equal(f('안녕하세요 잘 지내요?'), false);
  assert.equal(f('https://shopee.co.th/product/123 이거 봐'), false); // 주소는 말이 아니다
  assert.equal(f('พี่คิดถึง 푸이'), true); // 태국어가 있으면 한글 이름이 섞여도 옮긴다
});

test('내 언어 태국어: 태국어 말풍선은 그대로, 한국어는 옮긴다', () => {
  const f = load({ myLang: 'th' }).peek('chatForeign');
  assert.equal(f('สวัสดีครับ'), false);
  assert.equal(f('안녕하세요 잘 지내요?'), true);
});

test('내 언어 로마자(영어): 글자로 못 가르니 일단 옮겨 본다', () => {
  const f = load({ myLang: 'en' }).peek('chatForeign');
  assert.equal(f('hello there'), true);
  assert.equal(f('สวัสดีครับ'), true);
});

test('한자만 쓴 글: 간체·번체·광둥어', () => {
  const f = load().peek('chatHanLang');
  assert.equal(f('你们在哪里'), 'zh-CN');
  assert.equal(f('你們在哪裡'), 'zh-TW');
  assert.equal(f('佢喺邊度'), 'yue');
});

test('글자로 언어 알아보기', () => {
  const f = load().peek('chatScriptLang');
  assert.equal(f('สวัสดี'), 'th');
  assert.equal(f('こんにちは'), 'ja');
  assert.equal(f('안녕'), 'ko');
  assert.equal(f('សួស្តី'), 'km');
  assert.equal(f('我们去KFC吧'), 'zh-CN');
  assert.equal(f('hello'), null);
});
