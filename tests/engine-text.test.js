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

// 2026-11-22: 크메르·라오·미얀마는 바르게 읽어도 확신도가 0~30 으로 널뛰어 맞는 줄이 버려졌다 — 두 방식(psm 13·7)으로 읽어
// 거의 같으면 확신도가 낮아도 받는다(hsAgree). 미얀마 모델의 'ောံ' 은 'ော်' 로(hsMyFix).
test('두 읽기가 거의 같은가(hsAgree): 글자 75% 넘게 같고 6글자 넘을 때만', () => {
  const c3 = vm.createContext({});
  vm.runInContext(`${cut('editDist')}\n${cut('hsAgree')}\nthis.hsAgree = hsAgree;`, c3);
  assert.equal(c3.hsAgree('ພວກເຮົາຕ້ອງອອກໄປຈາກບ່ອນນີດຽວກີູ', 'ພວກເຮົາຕ້ອງອອກໄປຈາກບ່ອນນີດຽວນີ'), true);
  assert.equal(c3.hsAgree('ຂ່ອຍບໍຮູວ່າລາວໄປໃສ່', 'ຂ໋ອຍບໍ່ຮູ້ວ່າລາວໄປໃສ'), true);
  assert.equal(c3.hsAgree('ខ្ទ្ជបននងបាគាត់ទៅណាទេ', 'នខឌឃបនដ៥ងឃាគាគ1ទៅណាទេ'), false, '뒤범벅끼리는 다르다');
  assert.equal(c3.hsAgree('ລໍ', 'ລໍ'), false, '너무 짧은 줄은 같아도 안 믿는다');
  assert.equal(c3.hsAgree('ab cd, ef!', 'abcdef'), true, '빈칸·문장부호는 보지 않는다');
});

test("미얀마 'ောံ'·'ါံ' → 'ော်'·'ါ်', 맞는 'ံ' 은 그대로(hsMyFix)", () => {
  const c4 = vm.createContext({});
  vm.runInContext(`${cut('hsMyFix')}\nthis.hsMyFix = hsMyFix;`, c4);
  assert.equal(c4.hsMyFix('ကျွန်တောံမသိဘူး'), 'ကျွန်တော်မသိဘူး');
  assert.equal(c4.hsMyFix('ကံကောင်းပါစေ'), 'ကံကောင်းပါစေ');
});

test('크메르·라오·미얀마 글다움(hsPlausible): 짧은 조각·숫자 섞인 뒤범벅은 거른다', () => {
  const c5 = vm.createContext({});
  vm.runInContext(`${cut('hsPlausible')}\nthis.hsPlausible = hsPlausible;`, c5);
  for (const [t, conf] of [['ພວກເຮົາຕ້ອງອອກໄປຈາກບ່ອນນີດຽວນີ', 0], ['ລຖ້າກ່ອນ ຢ່າຫາກໄປ', 30], ['ចាំបន្តិច កុំទាន់ទៅ', 20], ['ແມ່ນ', 80]]) {
    assert.equal(c5.hsPlausible(t, conf), true, t);
  }
  for (const [t, conf] of [['ເພ ຟັ.', 38], ['ပ ၉4 ပါ', 49], ['ແມ່ນ', 40], ['ກກ ຂ ຄ ງ ຈ', 60]]) {
    assert.equal(c5.hsPlausible(t, conf), false, t);
  }
});

// 2026-11-22: 큰 글자 두 줄 자막은 아랫줄 성조 부호가 윗줄 꼬리에 닿아 틈이 없었다 — 확장이 센 줄 수(want)만큼 가운데의 가장
// 가는 줄에서 가른다. 한 줄짜리 큰 글자(가운데가 가늘지 않다)는 가르지 않는다.
test('줄 가르기(hsLineBands): 틈 없이 붙은 두 줄은 센 줄 수만큼 가른다', () => {
  const c6 = vm.createContext({});
  vm.runInContext(`${cut('hsLineBands')}\n${cut('hsLineRuns')}\nthis.hsLineBands = hsLineBands;`, c6);
  // 0~9 빈 줄, 10~49 윗줄(잉크 40), 50~54 가는 목(잉크 6 — 부호와 꼬리가 닿은 곳), 55~94 아랫줄(잉크 40), 95~99 빈 줄
  const rows = Array.from({ length: 100 }, (_, y) => (y < 10 || y >= 95 ? 0 : y >= 50 && y < 55 ? 6 : 40));
  assert.equal(c6.hsLineBands(rows, [0, 100], 1).length, 1, '줄 수를 모르면 예전처럼 한 덩어리');
  const two = c6.hsLineBands(rows, [0, 100], 2);
  assert.equal(two.length, 2);
  assert.ok(two[0][1] >= 48 && two[0][1] <= 56, `가른 자리 ${two[0][1]}`);
  // 한 줄짜리 큰 글자: 가운데가 가늘지 않으면 2 줄이라 해도 가르지 않는다
  const one = Array.from({ length: 100 }, (_, y) => (y < 10 || y >= 90 ? 0 : 30 + (y % 7)));
  assert.equal(c6.hsLineBands(one, [0, 100], 2).length, 1);
});

// 2026-11-23: 큰 글자 두 줄 자막에서 아랫줄을 다시 읽을 때(hsReadAs)는 깐깐하게 — 노란 자막 아랫줄의 뒤범벅 'ngay :aygl! .' 가
// 받아들여져 붙었다. 낱말 앞뒤의 여러 언어 문장부호는 괜찮다.
test('아랫줄 다시 읽기의 깐깐한 글 기준(hsRetryClean): 정상 문장은 받고 뒤범벅은 거른다', () => {
  const c = vm.createContext({});
  vm.runInContext(`${cut('hsRetryClean')}\nthis.f = hsRetryClean;`, c);
  for (const t of ['ngay bây giờ.', '¿Qué haces aquí?', '«Hola», dijo.', "I'm fine, thanks!", 'مرحبا، كيف حالك؟', 'मैं ठीक हूँ।', '5 phút nữa', 'เราต้องไปแล้ว']) {
    assert.equal(c.f(t), true, t);
  }
  for (const t of ['ngay :aygl! .', 'ngay | bây', '', '. .']) assert.equal(c.f(t), false, t);
});

test('미얀마·라오 글자 고침(13번, 2026-11-25): 단어장 글 모형으로 헷갈리는 글자만 바로잡고 멀쩡한 줄은 그대로', () => {
  const set = (src.match(/^const HS_LM_SET = \{[\s\S]*?^\};$/m) || [])[0];
  assert.ok(set, 'HS_LM_SET 이 engine.js 에 없음');
  const c = vm.createContext({});
  vm.runInContext(`${set}\n${cut('hsLmTrain')}\n${cut('hsLmBest')}\nthis.S = HS_LM_SET; this.train = hsLmTrain; this.best = hsLmBest;`, c);
  const my = ['သူဘယ်သွားလဲ', 'ကျွန်တော်မသိဘူး', 'ဘယ်သွားမလဲ', 'မသွားသေးနဲ့', 'သူ ဘယ်မှာလဲ', 'ကျွန်တော် သွားမယ်'];
  const lmMy = c.train([...my, ...my, ...my]);
  assert.equal(c.best(lmMy, c.S.mymr, 'သူဘယံသှားလဲ'), 'သူဘယ်သွားလဲ'); // ် 를 ံ 로, ွ 를 ှ 로 읽은 것
  for (const ok of my) assert.equal(c.best(lmMy, c.S.mymr, ok), ok, ok);
  const lo = ['ບ່ອນນີ້ດຽວນີ້', 'ຂ້ອຍບໍ່ຮູ້', 'ຢູ່ນີ້', 'ມື້ນີ້', 'ນີ້ແມ່ນຫຍັງ'];
  // 시험 글이 작아 증거가 적다 — 벌점만 낮춘 같은 표(진짜 벌점 8 은 단어장 1만 줄에 맞춘 값)
  const lmLo = c.train(Array(10).fill(lo).flat());
  const laoo = { ...c.S.laoo, pen: 3 };
  assert.equal(c.best(lmLo, laoo, 'ບ່ອນນີດຽວນີ້'), 'ບ່ອນນີ້ດຽວນີ້'); // 빠진 성조 ້
  for (const ok of lo) assert.equal(c.best(lmLo, laoo, ok), ok, ok);
});
