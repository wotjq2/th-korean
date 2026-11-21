// 번역 도우미 엔진(line-helper/engine.js)의 화면 자막 글 손질 — 엔진을 띄우지 않고 함수만 꺼내 본다.
// 2026-11-22: 줄 끝에서 '글자(\p{L})·숫자가 아닌 것' 을 지웠는데, 태국어·라오어·크메르어·미얀마어·데바나가리·타밀·텔루구의
// 성조·모음 부호는 결합 부호(\p{M})라서 'ที่นี่' 가 'ที่น', 'ទៅ' 가 'ទ', 'होगा' 가 'होग' 로 잘렸다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./lib/load');

const src = fs.readFileSync(path.join(ROOT, 'line-helper/engine.js'), 'utf8');
// 함수 하나를 꺼낸다: 'function 이름(' 부터 다음 맨 앞 'function '·'const '·'// ' 줄 앞까지
function cut(name) {
  const a = src.indexOf(`\nfunction ${name}(`);
  assert.ok(a >= 0, `${name} 이 engine.js 에 없음`);
  const rest = src.slice(a + 1);
  const b = rest.search(/\n(?:function |const |let |async function |\/\/ )/);
  return rest.slice(0, b < 0 ? undefined : b);
}
const cjk = (src.match(/^const CJK_CH = .*$/m) || [])[0];
const ctx = vm.createContext({});
vm.runInContext(`${cjk}\n${cut('hsClean')}\n${cut('hsTidy')}\nthis.hsClean = hsClean; this.hsTidy = hsTidy;`, ctx);

const ENDS = [
  'เราต้องรีบออกไปจากที่นี่', // 태국어
  'ພວກເຮົາຕ້ອງອອກໄປຈາກບ່ອນນີ້ດຽວນີ້', // 라오어
  'ចាំបន្តិច កុំទាន់ទៅ', // 크메르어
  'ငါတို့ ဒီကနေ အမြန်ထွက်ရမယ်', // 미얀마어
  'हमें जल्दी यहाँ से निकलना होगा', // 힌디어(끝 마침표 없이)
  'போகலாம்', // 타밀어
  'నేను వెళ్తాను', // 텔루구어
];

test('줄 끝의 성조·모음 부호를 지우지 않는다(hsClean)', () => {
  for (const s of ENDS) assert.equal(ctx.hsClean(s), s, s);
});

test('줄 끝의 성조·모음 부호를 지우지 않는다(hsTidy)', () => {
  for (const s of ENDS) assert.equal(ctx.hsTidy([s]), s, s);
});

test('그래도 줄 끝·앞의 부스러기(기호)는 지운다', () => {
  assert.equal(ctx.hsClean('  ~ เราต้องไป |] '), 'เราต้องไป');
  assert.equal(ctx.hsClean('我们走吧 2 '), '我们走吧 2');
  assert.equal(ctx.hsTidy(['|| Let us go now ]]']), 'Let us go now');
});

test('노란 자막 화소는 흰색으로, 주황·피부색·흰색·배경은 그대로(hsDeyellow)', () => {
  const c2 = vm.createContext({ Buffer });
  vm.runInContext(`${cut('hsDeyellow')}\nthis.hsDeyellow = hsDeyellow;`, c2);
  const px = (rgb) => Buffer.from(rgb.flatMap((c) => [...c, 255]));
  const out = c2.hsDeyellow(px([[255, 238, 0], [255, 198, 26], [255, 140, 0], [240, 200, 170], [255, 255, 255], [40, 40, 40], [200, 150, 80]]));
  const got = [];
  for (let i = 0; i < out.length; i += 4) got.push([out[i], out[i + 1], out[i + 2]]);
  assert.deepEqual(got, [[255, 255, 255], [255, 255, 255], [255, 140, 0], [240, 200, 170], [255, 255, 255], [40, 40, 40], [200, 150, 80]]);
});
