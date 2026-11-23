// 파일을 실행하지 않고 보는 검사: 문법, 웹스토어 규칙(원격 코드 금지), 버전·빌드 목록.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, SCRIPT: SCRIPT_PATH } = require('./lib/load');

const p = (...a) => path.join(ROOT, ...a);
const SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');
const JS_FILES = [
  'th-korean.user.js',
  ...fs.readdirSync(p('extension/src')).filter((f) => f.endsWith('.js')).map((f) => `extension/src/${f}`),
  'extension/build.js',
  'line-helper/engine.js',
  'line-helper/ocr-worker.js',
];

test('JS 파일 문법', () => {
  for (const f of JS_FILES) {
    try {
      execFileSync(process.execPath, ['--check', p(f)], { stdio: 'pipe' });
    } catch (e) {
      assert.fail(`${f}: ${String(e.stderr || e.message).split('\n').slice(0, 5).join('\n')}`);
    }
  }
});

test('웹스토어: 스크립트에 eval·new Function 이 없다(원격 코드로 보임)', () => {
  const code = SCRIPT.replace(/\/\/.*$/gm, ''); // 주석은 뺀다
  assert.doesNotMatch(code, /\beval\s*\(/);
  assert.doesNotMatch(code, /\bnew\s+Function\s*\(/);
  for (const f of fs.readdirSync(p('extension/src')).filter((x) => x.endsWith('.js'))) {
    const c = fs.readFileSync(p('extension/src', f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(c, /\beval\s*\(|\bnew\s+Function\s*\(/, f);
  }
});

test('웹스토어: 확장 쪽 코드가 CDN 에서 스크립트를 불러오지 않는다', () => {
  for (const f of fs.readdirSync(p('extension/src')).filter((x) => x.endsWith('.js'))) {
    const c = fs.readFileSync(p('extension/src', f), 'utf8');
    assert.doesNotMatch(c, /importScripts\s*\(\s*['"`]https?:/, f);
    assert.doesNotMatch(c, /<script[^>]+src=["']https?:/i, f);
  }
});

test('@version 이 크롬 버전 꼴이고 @require 는 sha256 으로 묶여 있다', () => {
  const v = (SCRIPT.match(/^\/\/ @version\s+(\S+)/m) || [])[1];
  assert.match(v || '', /^\d+(\.\d+){0,3}$/);
  for (const m of SCRIPT.matchAll(/^\/\/ @require\s+(\S+)/gm)) assert.match(m[1], /#sha256=[0-9a-f]{64}$/, m[1]);
});

test('빌드가 복사하는 확장 파일이 다 있다', () => {
  const build = fs.readFileSync(p('extension/build.js'), 'utf8');
  const list = (build.match(/for \(const f of \[([^\]]+)\]\) fs\.copyFileSync\(path\.join\(SRC/) || [])[1];
  assert.ok(list, 'build.js 의 복사 목록을 못 찾음');
  for (const f of list.match(/'[^']+'/g).map((x) => x.slice(1, -1))) assert.ok(fs.existsSync(p('extension/src', f)), f);
  // content.js 는 복사하지 않고 빌드가 만든다(gm.js + 스크립트) — 1.36.3 부터 따로 된 content_scripts 칸에 있다
  for (const m of build.matchAll(/js: \['([^']+)'\]/g)) if (m[1] !== 'content.js') assert.ok(fs.existsSync(p('extension/src', m[1])), m[1]);
});

// 1.36.4: 처음 설치 때 '내 언어' 를 고르는 background.js 의 목록과 확장 창(popup.js)의 목록이 같아야 한다
test("'내 언어' 31개 목록: 확장 창과 background 가 같다", () => {
  const pick = (f) => {
    const m = fs.readFileSync(p(f), 'utf8').match(/const MY_LANGS = \[([\s\S]*?)\];/);
    assert.ok(m, `${f} 에 MY_LANGS 없음`);
    return m[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));
  };
  const a = pick('extension/src/popup.js');
  const b = pick('extension/src/background.js');
  assert.deepEqual(b, a);
  assert.equal(a.length, 31);
});

// 1.36.4: 확장 이름·설명의 언어별 글(extension/locales.json) — 웹스토어 한도(이름 75자, 설명 132자)와 기본 ko
test('확장 이름·설명 언어별 글이 웹스토어 한도 안이다', () => {
  const all = JSON.parse(fs.readFileSync(p('extension/locales.json'), 'utf8'));
  const locs = Object.keys(all).filter((k) => k !== '_');
  assert.ok(locs.length >= 20, `언어 ${locs.length}개뿐`);
  assert.equal(all.ko.name, '멀티 번역기');
  for (const l of locs) {
    assert.ok(all[l].name && all[l].name.length <= 75, `${l} 이름 ${all[l].name.length}`);
    assert.ok(all[l].desc && all[l].desc.length <= 132, `${l} 설명 ${all[l].desc.length}`);
    // 설명이 '30' 개 언어를 말한다(언어마다 빠뜨리지 않았는지)
    assert.match(all[l].desc, /30|৩০/, l);
  }
});
