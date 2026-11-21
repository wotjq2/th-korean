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
  for (const m of build.matchAll(/js: \['([^']+)'\]/g)) assert.ok(fs.existsSync(p('extension/src', m[1])), m[1]);
});
