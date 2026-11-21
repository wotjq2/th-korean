// config.json 은 웹스토어 심사 없이 모든 사용자에게 바로 간다. 스크립트는 꼴이 틀린 칸을 조용히 버리고
// 기본값을 쓰므로(rcBuild), 잘못 고쳐도 오류 없이 '그 언어만 사라지는' 일이 생긴다. 그런 조용한 누락을 여기서 잡는다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, ROOT, same } = require("./lib/load");

// 일부러 망가뜨린 설정으로 시험할 때는 TEST_CONFIG=<파일>
const raw = fs.readFileSync(process.env.TEST_CONFIG || path.join(ROOT, 'config.json'), 'utf8');
const cfg = JSON.parse(raw);
const s = load({ config: raw });
const RC = s.peek('RC');

test('config.json: JSON 문법이 맞고 언어가 30개', () => {
  assert.equal(cfg.languages.length, 30);
});

test('config.json: 언어 id 가 겹치지 않는다', () => {
  const ids = cfg.languages.map((l) => l.id);
  same(ids.filter((x, i) => ids.indexOf(x) !== i), []);
});

test('config.json: 스크립트가 버린 언어가 없다(칸 꼴이 다 맞다)', () => {
  same(RC.languages.map((l) => l.id), cfg.languages.map((l) => l.id));
  for (const l of cfg.languages) {
    const got = RC.languages.find((x) => x.id === l.id);
    for (const k of ['label', 'name', 'mt', 'chip', 'glossary', 'reverse', 'reverseKo']) {
      if (l[k] !== undefined) assert.equal(got[k], l[k], `${l.id}.${k} 가 버려짐`);
    }
  }
});

test('config.json: video 숫자가 허용 범위 안이라 그대로 쓰인다', () => {
  for (const [k, v] of Object.entries(cfg.video || {})) {
    if (k.startsWith('_')) continue;
    assert.equal(RC.video[k], v, `video.${k}=${v} 가 범위 밖이라 기본값으로 바뀜`);
  }
});

test('config.json: 번역 순서·화면 자막 예비 언어가 그대로 쓰인다', () => {
  if (cfg.translate && cfg.translate.order) same(RC.translate.order, cfg.translate.order);
  if (cfg.hardsub && cfg.hardsub.fallback) same(RC.hardsub.fallback, cfg.hardsub.fallback);
});

test('config.json: 쇼핑몰 나라(markets)가 하나도 안 버려진다', () => {
  for (const [key, shop] of Object.entries(cfg.shops || {})) {
    if (key.startsWith('_') || !shop || !shop.markets) continue;
    const want = Object.keys(shop.markets).filter((h) => !h.startsWith('_'));
    same(Object.keys((RC.shops[key] && RC.shops[key].markets) || {}).sort(), want.sort(), `shops.${key}.markets`);
  }
});

test('config.json: 자막 바꿀 말(subPrep)의 정규식이 다 살아 있다', () => {
  const base = load().peek('RC').subPrep; // config 없이 = 기본 표만
  for (const [lang, list] of Object.entries(cfg.subPrep || {})) {
    if (lang.startsWith('_')) continue;
    const added = (RC.subPrep[lang] || []).length - ((base[lang] || []).length);
    assert.equal(added, list.length, `subPrep.${lang}: ${list.length - added}개가 틀린 정규식이라 버려짐`);
  }
});

test('rcBuild: 깨진 JSON 이면 기본값으로 돈다', () => {
  const d = load({ config: '{ 깨진 json' }).peek('RC');
  assert.ok(d.languages.length > 0);
  assert.ok(d.languages.some((l) => l.id === 'th'));
  same(d.translate.order, load().peek('RC').translate.order);
});

test('rcBuild: 틀린 칸만 버리고 나머지는 쓴다', () => {
  const d = load({
    config: {
      languages: [
        { id: 'en', label: '미', name: '영어' },
        { id: 'xx yy', label: '틀', name: '틀린 id' }, // id 꼴이 틀림 → 버림
        { id: 'fr', label: '너무긴이름', name: '프랑스어' }, // label 3자 넘음 → 버림
      ],
      translate: { order: ['dict', 'nope', 'gtx', 'dict'] },
      video: { hsEveryMs: -5 },
    },
  }).peek('RC');
  same(d.languages.map((l) => l.id), ['th', 'en']); // 태국어는 늘 앞에 둔다
  same(d.translate.order, ['dict', 'gtx']);
  assert.equal(d.video.hsEveryMs, load().peek('RC').video.hsEveryMs);
});
