// 문제 알리기 · 번역이 이상해요(8번, 1.35.8) — 사용자가 문제를 알릴 길. 보낼 글은 이 PC 에서 만들어 보여 주고, 사용자가
// [GitHub 에 올리기](새 글 화면에 채워 열기)·[복사] 를 눌러야 나간다. 여기서는 기록(problemLog·recentTr)과 보낼 글·주소를 본다.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('./lib/load');
const { same } = lib;
// 용어집을 주지 않으면 시작할 때 '용어집 받기 실패' 가 기록에 끼어든다(그것도 맞는 동작이다).
const load = (o = {}) => lib.load({ glossary: '가방=กระเป๋า\n', ...o });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('실패 안내·경고는 문제 기록에 남는다 — 같은 말은 횟수만, 20개까지, 1초 뒤 한 번에 저장', async () => {
  const s = load({ host: 'shopee.co.th' });
  const note = s.peek('problemNote');
  const list = s.peek('problemList');
  note('검색어 번역 실패: HTTP 429');
  note('검색어 번역 실패: HTTP 429');
  note('사진 번역 실패');
  const now = list();
  assert.equal(now.length, 2);
  assert.equal(now[0].msg, '검색어 번역 실패: HTTP 429');
  assert.equal(now[0].n, 2);
  assert.equal(now[0].host, 'shopee.co.th', '사이트는 이름만(www. 뺌)');
  assert.equal(s.store.problemLog, undefined, '저장은 1초 뒤 한 번에');
  await wait(1100);
  assert.equal(s.store.problemLog.length, 2);
  for (let i = 0; i < 30; i++) note(`다른 실패 ${i}`);
  assert.equal(list().length, 20, '최근 20개만');
  assert.equal(list()[19].msg, '다른 실패 29');
});

test('토스트: 실패를 알리는 것만 기록, 경고(warnNote)는 앞의 [통합 번역] 을 빼고 오류 글로', () => {
  const s = load({ host: 'www.lazada.co.th' });
  const toast = s.peek('toast');
  toast('"가방" → "กระเป๋า"  (용어집)');
  toast('원문을 표시합니다.');
  toast('베트남어로 바꾸지 못했습니다: 번역 결과가 비어 있습니다\n입력칸 글자는 보내지 않았습니다.');
  toast('검색어 번역 실패: HTTP 429');
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    s.peek('warnNote')('[통합 번역] 용어집 받기 실패 (https://x):', new Error('timeout'));
  } finally {
    console.warn = origWarn;
  }
  const msgs = s.peek('problemList')().map((e) => e.msg);
  same(msgs, [
    '베트남어로 바꾸지 못했습니다: 번역 결과가 비어 있습니다 입력칸 글자는 보내지 않았습니다.',
    '검색어 번역 실패: HTTP 429',
    '용어집 받기 실패 (https://x): timeout',
  ]);
});

test('최근 번역: 같은 짝은 맨 뒤로, 10개까지, 빈 것은 안 적음', () => {
  const s = load({ host: 'shopee.vn' });
  const tr = s.peek('trNote');
  tr('검색어', '고양이 사료', 'thức ăn cho mèo', '용어집');
  tr('입력칸', '안녕', 'xin chào', '번역');
  tr('검색어', '고양이 사료', 'thức ăn cho mèo', '용어집');
  tr('검색어', '', 'x', '번역');
  const l = s.peek('recentTrList')();
  same(l.map((e) => e.src), ['안녕', '고양이 사료']);
  assert.equal(l[1].host, 'shopee.vn');
  for (let i = 0; i < 15; i++) tr('입력칸', `말${i}`, `w${i}`, '번역');
  assert.equal(s.peek('recentTrList')().length, 10);
});

test('보낼 글: 판·내 언어·사이트 이름·설정(키는 있음/없음만)·도우미·문제 기록 — 키·토큰·주소 뒤쪽은 없다', () => {
  const s = load({
    host: 'shopee.co.th',
    store: { githubToken: 'ghp_SECRET123', visionKey: 'AIzaSECRET456', groqKey: 'gsk_SECRET789', nvidiaKey: 'nvapi-SECRET0', aiProvider: 'groq' },
  });
  s.sandbox.location.pathname = '/search';
  s.sandbox.location.search = '?keyword=%EB%B9%84%EB%B0%80';
  s.sandbox.location.href = 'https://shopee.co.th/search?keyword=%EB%B9%84%EB%B0%80';
  s.peek('problemNote')('검색어 번역 실패: HTTP 429 @octocat');
  const f = { kind: '검색어', src: '고양이 사료', out: 'อาหารสุนัข', via: '용어집', want: '고양이 밥', what: '개 사료가 나와요 @someone' };
  const body = s.peek('reportBody')(f, s.peek('reportEnv')('켜짐'), s.peek('problemList')());
  for (const secret of ['SECRET', 'keyword', '/search', '%EB']) assert.ok(!body.includes(secret), `보낼 글에 '${secret}' 가 없어야`);
  for (const want of [
    '### 이상했던 번역', '- 어디서: 검색어', '- 원문: 고양이 사료', '- 나온 번역: อาหารสุนัข (용어집)', '- 바라는 뜻: 고양이 밥',
    '통합 번역 test', '- 내 언어: ko', '- 사이트: shopee.co.th', 'GitHub 연결 있음', 'Vision 키 있음', 'Groq 키 있음',
    '- 번역 도우미: 켜짐', '검색어 번역 실패: HTTP 429',
  ]) assert.ok(body.includes(want), `'${want}' 가 있어야\n${body}`);
  assert.ok(body.includes('@​someone') && body.includes('@​octocat'), "GitHub '@이름' 알림이 가지 않게");
  assert.ok(!/@someone|@octocat/.test(body));
  // 키가 없으면 '없음'
  const s2 = load({ host: 'example.com' });
  const body2 = s2.peek('reportBody')({ what: '도우미가 안 켜져요' }, s2.peek('reportEnv')(''), []);
  assert.ok(body2.includes('GitHub 연결 없음') && body2.includes('Vision 키 없음'));
  assert.ok(!body2.includes('### 이상했던 번역') && body2.includes('- 없음'));
  assert.ok(!body2.includes('번역 도우미'), '도우미 답이 없으면 그 줄을 빼기');
});

test('제목: 번역이면 [번역] 원문 → 번역, 아니면 [문제] 첫 줄 — 90자까지', () => {
  const s = load({ host: 'shopee.co.th' });
  const title = s.peek('reportTitle');
  assert.equal(title({ src: '가방', out: 'กระเป๋า' }), '[번역] 가방 → กระเป๋า');
  assert.equal(title({ what: '메신저에서 안 바뀌어요\n자세히는…' }), '[문제] 메신저에서 안 바뀌어요');
  assert.ok(title({ what: '가'.repeat(200) }).length <= 90);
});

test('새 글 주소: GitHub title·body 에 채운다, 너무 길면 본문 대신 붙여 넣기 안내(fits=false)', () => {
  const s = load({ host: 'shopee.co.th' });
  const url = s.peek('reportUrl');
  const short = url('[번역] 가방 → กระเป๋า', '본문 & 줄\n둘째 줄');
  assert.equal(short.fits, true);
  const u = new URL(short.url);
  assert.equal(u.origin + u.pathname, 'https://github.com/wotjq2/th-korean/issues/new');
  assert.equal(u.searchParams.get('title'), '[번역] 가방 → กระเป๋า');
  assert.equal(u.searchParams.get('body'), '본문 & 줄\n둘째 줄');
  const long = url('t', 'ก'.repeat(3000));
  assert.equal(long.fits, false);
  assert.ok(long.url.length < 7000);
  assert.match(new URL(long.url).searchParams.get('body'), /Ctrl\+V/);
});

test('받는 곳은 원격 설정 report 로 바꾼다(구글 설문지처럼) — https 가 아니거나 틀린 칸 이름은 버린다', () => {
  const form = load({
    config: { report: { url: 'https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url', titleParam: '', bodyParam: 'entry.123', maxUrl: 4000 } },
  });
  const r = form.peek('reportUrl')('제목', '본문');
  const u = new URL(r.url);
  assert.equal(u.hostname, 'docs.google.com');
  assert.equal(u.searchParams.get('usp'), 'pp_url');
  assert.equal(u.searchParams.get('entry.123'), '본문');
  assert.equal(u.searchParams.get('title'), null, '제목 칸 없음');
  for (const bad of [{ url: 'http://example.com/new' }, { url: 'javascript:alert(1)' }, { url: 'https://x.com/a b' }, 'x', [1]]) {
    const s = load({ config: { report: bad } });
    assert.equal(s.peek('RC').report.url, 'https://github.com/wotjq2/th-korean/issues/new', JSON.stringify(bad));
  }
  const odd = load({ config: { report: { url: 'https://example.com/new', bodyParam: 'a&b', maxUrl: 99999999 } } });
  same(odd.peek('RC').report, { url: 'https://example.com/new', titleParam: 'title', bodyParam: 'body', maxUrl: 7000 });
});

test('config.json 의 report 는 프로그램 기본값과 같다(지금 받는 곳 = GitHub 이슈)', () => {
  const cfg = require('../config.json');
  const s = load({ config: cfg });
  same(s.peek('RC').report, s.peek('RC_DEFAULT').report);
  same(cfg.report, s.peek('RC_DEFAULT').report);
});

test('도우미 답 → 한 줄', () => {
  const t = load().peek('helperStateText');
  assert.equal(t({ ok: true, running: true }), '켜짐');
  assert.equal(t({ ok: true, running: false }), '꺼짐');
  assert.match(t({ ok: false, error: 'Specified native messaging host not found.' }), /이 PC 에 없음/);
  assert.match(t({ ok: false, error: 'boom' }), /연결 실패: boom/);
  assert.equal(t(null), '');
});
