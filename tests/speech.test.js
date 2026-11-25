// 말투(1.37.0): 내 성별(설정 '내 성별' = cfg.chatParticle)과 높임을 태국어 밖의 언어에도.
// 2026-11-25 잰 것: '피곤해' → 스페인어 estoy cansado·러시아어 я устал(여자도 남자 말), 독일어 높임 12줄 중 10줄이 du.
// 고친 길: 여자는 '(여자) ' 를 붙여 묻고 앞 괄호를 뗀다 / 높임·반말은 영어로 옮긴 뒤 'Sir, ' · 'Hey buddy, ' 를 붙여 옮기고 부름말을 뗀다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('./lib/load');

const baseConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const withSpeech = (speech) => JSON.stringify({ ...baseConfig, speech });
// 높임·반말 길을 끈 설정 — 성별·웃음만 보는 시험
const noReg = withSpeech({ polite: { langs: [] }, casual: { langs: [] } });

// 구글 가짜: fn(원문, 원문 언어, 옮길 언어) 의 답을 endpoint 꼴에 맞춰 돌려준다. 물은 것은 asked 에 [sl, tl, q].
function google(fn) {
  const asked = [];
  const http = (url) => {
    if (!/translate\.googleapis\.com/.test(url)) return undefined;
    const sl = (url.match(/[?&]sl=([^&]*)/) || [])[1];
    const tl = (url.match(/[?&]tl=([^&]*)/) || [])[1];
    const qs = [...url.matchAll(/[?&]q=([^&]*)/g)].map((m) => decodeURIComponent(m[1].replace(/\+/g, ' ')));
    qs.forEach((q) => asked.push([sl, tl, q]));
    if (url.includes('translate_a/t')) return JSON.stringify(qs.map((q) => fn(q, sl, tl)));
    return JSON.stringify([[[fn(qs[0], sl, tl), qs[0]]]]);
  };
  return { http, asked };
}
const lang = (s, id) => s.peek('TYPE_LANGS').find((l) => l.id === id);

test('여자: 남녀가 갈리는 언어는 (여자) 를 붙여 묻고 앞 괄호를 뗀다', async () => {
  const g = google((q, sl, tl) => (q.startsWith('(여자) ') ? '(Mujer) Estoy cansada.' : 'Estoy cansado.'));
  const s = load({ config: noReg, store: { chatParticle: 'ค่ะ' }, http: g.http });
  const r = await s.peek('koreanToLang')('피곤해요.', lang(s, 'es'));
  assert.equal(r.thai, 'Estoy cansada.');
  assert.deepEqual(g.asked.map((a) => a[2]), ['(여자) 피곤해요.']);
});

test('여자라도 묻는 말·너/당신이 든 말은 신호를 붙이지 않는다(상대를 여자로 만들 수 있다)', async () => {
  for (const line of ['피곤해?', '너 정말 예뻐']) {
    const g = google(() => 'x');
    const s = load({ config: noReg, store: { chatParticle: 'ค่ะ' }, http: g.http });
    await s.peek('koreanToLang')(line, lang(s, 'es'));
    assert.deepEqual(g.asked.map((a) => a[2]), [line], line);
  }
});

test('남자·정하지 않음, 남녀가 안 갈리는 언어는 예전처럼 바로', async () => {
  for (const [p, id] of [['ครับ', 'es'], ['', 'es'], ['ค่ะ', 'vi']]) {
    const g = google(() => 'x');
    const s = load({ config: noReg, store: { chatParticle: p }, http: g.http });
    await s.peek('koreanToLang')('피곤해요.', lang(s, id));
    assert.deepEqual(g.asked.map((a) => a[2]), ['피곤해요.'], `${p} ${id}`);
  }
});

test('괄호가 안 돌아오면(구글이 신호를 다르게 옮김) 신호 없이 다시 묻는다', async () => {
  const g = google((q) => (q.startsWith('(여자) ') ? 'Como mujer, estoy cansada.' : 'Estoy cansado.'));
  const s = load({ config: noReg, store: { chatParticle: 'ค่ะ' }, http: g.http });
  const r = await s.peek('koreanToLang')('피곤해요.', lang(s, 'es'));
  assert.equal(r.thai, 'Estoy cansado.');
});

test('미얀마어·크메르어는 남녀가 갈리는 낱말을 바꾼다', async () => {
  const g = google(() => 'ကျွန်တော် ပင်ပန်းတယ် ခင်ဗျာ');
  const s = load({ config: noReg, store: { chatParticle: 'ค่ะ' }, http: g.http });
  const r = await s.peek('koreanToLang')('피곤해요.', lang(s, 'my'));
  assert.equal(r.thai, 'ကျွန်မ ပင်ပန်းတယ် ရှင်');
  const s2 = load({ config: noReg, store: { chatParticle: 'ครับ' }, http: g.http });
  assert.equal((await s2.peek('koreanToLang')('피곤해요.', lang(s2, 'my'))).thai, 'ကျွန်တော် ပင်ပန်းတယ် ခင်ဗျာ');
});

test('높임: 영어로 옮긴 뒤 Sir, 를 붙여 옮기고 부름말을 뗀다', async () => {
  const config = withSpeech({ polite: { langs: ['de'], strip: { de: ['Mein Herr', 'Herr', 'Sir'] } }, casual: { langs: [] } });
  const g = google((q, sl, tl) => (tl === 'en' ? 'Are you busy?' : q.startsWith('Sir, ') ? 'Herr, sind Sie beschäftigt?' : 'Bist du beschäftigt?'));
  const s = load({ config, http: g.http });
  const r = await s.peek('koreanToLang')('바쁘세요?', lang(s, 'de'));
  assert.equal(r.thai, 'Sind Sie beschäftigt?');
  assert.deepEqual(g.asked, [['ko', 'en', '바쁘세요?'], ['en', 'de', 'Sir, are you busy?']]);
  // 끝에 붙은 부름말도
  const g2 = google((q, sl, tl) => (tl === 'en' ? 'Are you busy?' : 'Sind Sie beschäftigt, mein Herr?'));
  const s2 = load({ config, http: g2.http });
  assert.equal((await s2.peek('koreanToLang')('바쁘세요?', lang(s2, 'de'))).thai, 'Sind Sie beschäftigt?');
});

test('높임: 반말·너가 든 말·목록 밖 언어는 바로, 부름말을 못 떼면 바로 다시', async () => {
  const config = withSpeech({ polite: { langs: ['de'], strip: { de: ['Herr'] } }, casual: { langs: [] } });
  for (const [line, id] of [['바빠?', 'de'], ['네가 필요해요', 'de'], ['바쁘세요?', 'fr']]) {
    const g = google(() => 'x');
    const s = load({ config, http: g.http });
    await s.peek('koreanToLang')(line, lang(s, id));
    assert.deepEqual(g.asked.map((a) => a[2]), [line], line);
  }
  const g = google((q, sl, tl) => (tl === 'en' ? 'Are you busy?' : q.startsWith('Sir, ') ? 'Monsieur, êtes-vous occupé ?' : 'Bist du beschäftigt?'));
  const s = load({ config, http: g.http });
  assert.equal((await s.peek('koreanToLang')('바쁘세요?', lang(s, 'de'))).thai, 'Bist du beschäftigt?');
});

test('여자 + 높임: (Woman) Sir, 를 함께 붙이고 둘 다 뗀다', async () => {
  const config = withSpeech({ polite: { langs: ['es'], strip: { es: ['Señor'] } }, casual: { langs: [] } });
  const g = google((q, sl, tl) => (tl === 'en' ? 'I am ready.' : q === '(Woman) Sir, I am ready.' ? '(Mujer) Señor, estoy lista.' : 'Estoy listo.'));
  const s = load({ config, store: { chatParticle: 'ค่ะ' }, http: g.http });
  assert.equal((await s.peek('koreanToLang')('저는 준비됐어요.', lang(s, 'es'))).thai, 'Estoy lista.');
});

test('용어집: 여자면 여자 말투 값(glossaryF) 먼저, 쇼핑 검색어는 말투와 상관없이 예전 길', async () => {
  const cfg = JSON.parse(JSON.stringify(baseConfig));
  cfg.languages.find((l) => l.id === 'es').glossaryF = 'glossary-es-f.txt';
  cfg.speech = { polite: { langs: [] }, casual: { langs: [] } };
  const files = {
    'glossary-es.txt': '# === 한국어기초사전 끝 — 아래는 직접 고른 말 ===\n피곤해=estoy cansado\n가방=bolso\n',
    'glossary-es-f.txt': '# === 여자 말투 — 아래는 직접 고른 말 ===\n피곤해=estoy cansada\n',
  };
  const g = google(() => 'x');
  const s = load({ config: JSON.stringify(cfg), store: { chatParticle: 'ค่ะ' }, glossaryFiles: files, http: (u) => g.http(u) });
  const es = lang(s, 'es');
  assert.equal((await s.peek('koreanToLang')('피곤해', es)).thai, 'estoy cansada');
  assert.equal((await s.peek('koreanToLang')('가방', es, { shop: true })).thai, 'bolso');
  const m = load({ config: JSON.stringify(cfg), store: { chatParticle: 'ครับ' }, glossaryFiles: files, http: (u) => g.http(u) });
  assert.equal((await m.peek('koreanToLang')('피곤해', lang(m, 'es'))).thai, 'estoy cansado');
});

test('config speech: 틀린 칸은 그 칸만 기본값, 맞는 칸은 받는다', () => {
  const s = load({ config: withSpeech({ female: { cue: 123, langs: ['es', 'not a code!'], swap: { my: [['a', 'b'], 'bad'] } }, polite: { langs: 'de', strip: { de: ['Herr', 5] } } }) });
  const S = s.peek('RC').speech;
  assert.equal(S.female.cue, '(여자) ');
  assert.deepEqual([...S.female.langs], ['es']);
  assert.deepEqual(JSON.parse(JSON.stringify(S.female.swap)), { my: [['a', 'b']] });
  assert.deepEqual(JSON.parse(JSON.stringify(S.polite.langs)), JSON.parse(JSON.stringify(s.peek('RC_DEFAULT').speech.polite.langs)));
  assert.deepEqual([...S.polite.strip.de], ['Herr']);
});

test('웃음: ㅋㅋ·ㅎㅎ 는 떼고 옮긴 뒤 그 언어 웃음으로 — 뗀 나머지가 용어집에 맞으면 용어집', async () => {
  const files = { 'glossary-es.txt': '# === 한국어기초사전 끝 — 아래는 직접 고른 말 ===\n고마워=Gracias\n' };
  const g = google((q) => `MT(${q})`);
  const s = load({ config: noReg, glossaryFiles: files, http: g.http });
  const es = lang(s, 'es');
  const k2l = s.peek('koreanToLang');
  assert.deepEqual(JSON.parse(JSON.stringify(await k2l('ㅋㅋㅋ 고마워', es))), { thai: 'jajaja Gracias', via: '용어집' });
  assert.equal((await k2l('고마워ㅎㅎ', es)).thai, 'Gracias jajaja');
  assert.equal((await k2l('ㅋㅋㅋㅋ', es)).thai, 'jajaja');
  assert.equal((await k2l('진짜 웃기다 ㅋㅋ', es)).thai, 'MT(진짜 웃기다) jajaja');
  // 쇼핑 검색어·웃음이 없는 언어는 예전처럼
  assert.equal((await k2l('ㅋㅋ 가방', es, { shop: true })).thai, 'MT(하하 가방)');
  const cfg = JSON.parse(JSON.stringify(baseConfig));
  cfg.speech = { laugh: { es: 'jaja' }, polite: { langs: [] }, casual: { langs: [] } };
  const s2 = load({ config: JSON.stringify(cfg), glossaryFiles: files, http: g.http });
  assert.equal((await s2.peek('koreanToLang')('ㅋㅋ', lang(s2, 'es'))).thai, 'jaja');
  assert.equal((await s2.peek('koreanToLang')('ㅋㅋ 웃겨', lang(s2, 'ru'))).thai, 'MT(하하 웃겨)');
});

test('반말: Hey buddy, 를 붙여 옮기고 쉼표 없는 부름말도 뗀다(기본 설정 — 우르두어)', async () => {
  const g = google((q, sl, tl) => (tl === 'en' ? 'Did you eat?' : q === 'Hey buddy, did you eat?' ? 'ارے یار کیا تم نے کھانا کھایا؟' : 'کیا آپ نے کھانا کھایا؟'));
  const s = load({ config: JSON.stringify(baseConfig), http: g.http });
  assert.equal((await s.peek('koreanToLang')('밥 먹었어?', lang(s, 'ur'))).thai, 'کیا تم نے کھانا کھایا؟');
  assert.deepEqual(g.asked, [['ko', 'en', '밥 먹었어?'], ['en', 'ur', 'Hey buddy, did you eat?']]);
});

test('말끝 가르기: ㅂ니다·ㅂ니까 는 높임, 아니라니까 는 반말, 한 글자·너희는 모름', () => {
  const k = load().peek('koSpeechKind');
  const want = { '감사합니다': 'P', '갑니까?': 'P', '바쁘세요?': 'P', '이건 농담이 아니라니까': 'C', '밥 먹었어?': 'C', '같이 가자': 'C', '자': '', '너희 어디야?': '', '네가 필요해요': '', '안녕. 잘 지내요?': 'P' };
  for (const [ko, kind] of Object.entries(want)) assert.equal(k(ko), kind, ko);
});
