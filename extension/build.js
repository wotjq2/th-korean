// ---------------------------------------------------------------------------
// 통합 번역 확장 만들기 — node extension/build.js
//
// 번역 스크립트(th-korean.user.js)는 하나만 둔다. 이 파일이 그것을 확장 꼴로 바꿔 extension/dist/ 에 쓴다.
//   content.js  = src/gm.js(몽키 흉내) + 스크립트 (저장값을 다 읽은 뒤 시작)
//   manifest    = 버전은 스크립트 @version, 접속 주소는 @connect 에서
//   tesseract   = @require 주소에서 한 번 받아 vendor/ 에 두고 sha256 을 맞춰 본다
// 크롬에서는 '압축해제된 확장 프로그램 로드' 로 extension/dist 폴더를 고른다.
// ---------------------------------------------------------------------------

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const VENDOR = path.join(__dirname, 'vendor');
const ICONS = path.join(__dirname, 'icons');

const NAME = '통합 번역';
const DESCRIPTION =
  '외국어 사이트·메신저·영상을 한국어로 — 태국 쇼핑몰 검색·읽기, 페이스북 메신저, 유튜브·웹 영상 더빙(자막+목소리), 입력칸 한국어→외국어, 사진 속 글자';
// @connect 에 없지만 스크립트가 확장 권한으로 부르는 주소(사진 글자 읽기 Vision).
const EXTRA_HOSTS = ['vision.googleapis.com'];
// 사진 글자 읽기(Tesseract) 엔진과 태국어 자료. 몽키판은 CDN 에서 받지만, 크롬 웹스토어는 밖에서 받은 코드를
// 돌리지 못하게 해서(Manifest V3) 확장 안에 넣는다. 받은 파일은 sha256 을 맞춰 본다(빌드할 때만 받는다).
const OCR_FILES = [
  ['https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', 'aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc'],
  ['https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js', '8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa'],
  ['https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js', 'ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf'],
  ['https://cdn.jsdelivr.net/npm/@tesseract.js-data/tha/4.0.0_best_int/tha.traineddata.gz', '4550a5505184d1b79cf10416d5b19e643001d95411d5e717954dd26feef3ae74'],
];
// 웹스토어가 1.30.1 을 거부했다(2026-11-10, Blue Argon — 원격 호스팅 코드). 경로를 늘 확장 안으로 넘겨 실제로는
// CDN 을 쓰지 않았지만, 라이브러리 속 '안 넘기면 CDN 에서 받는' 기본 주소가 코드에 남아 있었다. 패키지에서 지운다.
// 찾는 글이 없으면(라이브러리 판이 바뀌면) 빌드를 멈춘다.
const CDN = 'https://cdn.jsdelivr.net/npm';
const SCRUB = {
  'tesseract.min.js': [[`workerPath:"${CDN}/tesseract.js@v".concat(c,"/dist/worker.min.js")`, 'workerPath:""']],
  'worker.min.js': [
    [`f=o||"${CDN}/tesseract.js-core@v".concat(s.substring(1))`, 'f=o||""'],
    [`v=s||"${CDN}/@tesseract.js-data/".concat(i,m?"/4.0.0_best_int":"/4.0.0")`, 'v=s||""'],
  ],
  // 머리말의 @require·@updateURL 도 코드 주소다. 확장은 머리말을 읽지 않으므로 통째로 뺀다(extension 판 content.js).
  'th-korean.user.js': [
    [`const OCR_LIB = '${CDN}/tesseract.js@5.1.1/dist';`, "const OCR_LIB = '';"],
    [`const OCR_CORE = '${CDN}/tesseract.js-core@5.1.1';`, "const OCR_CORE = '';"],
  ],
};
function scrub(name, text) {
  for (const [from, to] of SCRUB[name] || []) {
    if (!text.includes(from)) throw new Error(`${name} 에서 지울 CDN 주소를 찾지 못했습니다: ${from}`);
    text = text.replace(from, () => to);
  }
  return text;
}
// 만든 패키지를 끝까지 읽어, 바깥의 코드를 가리키는 주소가 하나라도 있으면 빌드를 멈춘다.
// (cdn.jsdelivr.net/gh/… 의 thai-words.tsv 는 코드가 아니라 자료 — 주소가 .tsv 라 걸리지 않는다.)
const REMOTE_CODE = /https?:\/\/[^\s"'`)]*\.(?:m?js|wasm)\b|cdn\.jsdelivr\.net\/npm|unpkg\.com|cdnjs\.cloudflare\.com/;
function checkNoRemoteCode(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) checkNoRemoteCode(p);
    else if (/\.(js|html|json)$/.test(e.name)) {
      const m = REMOTE_CODE.exec(fs.readFileSync(p, 'utf8'));
      if (m) throw new Error(`${path.relative(OUT, p)} 에 바깥 코드 주소가 남았습니다: ${m[0]}`);
    }
  }
}
// 사진 글자 엔진은 고장이 아닌 안내 줄도 console.warn 으로 낸다. 크롬은 이것을 확장 카드의 '오류' 목록에 줄줄이
// 모아 보여 줬다(2026-11-05, 1.29.2 에서 인식기 하나를 켜고 한 장 읽으면 5줄):
//   'Warning: Parameter not found: chop_enable' 등 4줄 — 태국어 자료(tha.traineddata)에 든 옛 인식 방식용 설정을
//       확장에 넣은 LSTM 전용 엔진이 모른다는 것. 인식기를 켤 때마다.
//   'Estimating resolution as 399' — 사진에 dpi 가 없어 짐작했다는 것. 사진을 읽을 때마다.
//   빈 사진·아주 작은 조각을 읽을 때의 'Empty page!!' 같은 줄도 같은 종류다.
// 인식기(worker.min.js) 맨 앞에서 이런 줄만 걸러낸다. 엔진(core)은 나중에 불려 와 console.warn 을 그때 묶으므로
// 걸러내는 쪽을 쓴다. 다른 경고(엔진이 멈춘 Aborted 등)는 그대로 둔다.
const OCR_QUIET =
  '/* 통합 번역: 사진 글자 엔진이 늘 내는 안내 줄(설정 없음·해상도 짐작·빈 사진)만 숨긴다 — extension/build.js */\n' +
  "(()=>{const w=console.warn,q=/^(Warning: Parameter not found:|Estimating resolution as |Detected \\d+ diacritics|Empty page!!|Too few characters|Warning\\. Invalid resolution|Image too small to scale|Line cannot be recognized)/;" +
  "console.warn=function(m,...r){if(typeof m==='string'&&q.test(m))return;return w.call(this,m,...r)}})();\n";
// node extension/build.js --store : 웹스토어에 올릴 판. 개발용 고정 id 열쇠(key)를 빼고(스토어가 거부한다)
// extension/store/통합번역-<판>.zip 을 만든다. 스토어가 준 id 는 config.json 의 helper.extensionIds 에 적으면
// 번역 도우미가 받아 준다(도우미 코드는 고치지 않는다).
const STORE = process.argv.includes('--store');
// 웹스토어판은 따로 만든다 — dist 는 이 PC 크롬이 압축해제로 불러 쓰는 곳이라, key 없이 덮으면 확장 id 가 바뀌어
// 번역 도우미와의 연결이 끊긴다.
// node extension/build.js --test-out=<폴더> : 2단계 시험(tests/browser)용. key 를 빼서(이 PC 번역 도우미와 이어지지 않게)
// 그 폴더에 만든다. zip·시험 없음. 폴더를 통째로 지우고 쓰므로 임시 폴더 안만 받는다.
const TEST_OUT = (process.argv.find((a) => a.startsWith('--test-out=')) || '').slice('--test-out='.length);
const TMP_DIRS = [require('os').tmpdir(), fs.realpathSync.native(require('os').tmpdir())].map((d) => d.toLowerCase() + path.sep);
if (TEST_OUT && !TMP_DIRS.some((d) => path.resolve(TEST_OUT).toLowerCase().startsWith(d))) {
  console.error(`--test-out 은 임시 폴더(${require('os').tmpdir()}) 안이어야 합니다: ${TEST_OUT}`);
  process.exit(1);
}
const OUT = TEST_OUT ? path.resolve(TEST_OUT) : path.join(__dirname, STORE ? 'store/dist' : 'dist');
// --test-script=<파일> : 시험용 빌드에서만 — 일부러 망가뜨린 스크립트 사본으로 만들어 시험이 잡는지 본다.
const TEST_SCRIPT = (process.argv.find((a) => a.startsWith('--test-script=')) || '').slice('--test-script='.length);
if (TEST_SCRIPT && !TEST_OUT) {
  console.error('--test-script 는 --test-out 과 함께만 씁니다');
  process.exit(1);
}
const SCRIPT_FILE = TEST_SCRIPT ? path.resolve(TEST_SCRIPT) : path.join(ROOT, 'th-korean.user.js');
// --test-prelude=<파일> : 시험용 빌드에서만 — content.js 맨 앞(gm.js 뒤)에 붙인다(예: 크롬 내장 번역기 흉내, tests/browser).
const TEST_PRELUDE = (process.argv.find((a) => a.startsWith('--test-prelude=')) || '').slice('--test-prelude='.length);
if (TEST_PRELUDE && !TEST_OUT) {
  console.error('--test-prelude 는 --test-out 과 함께만 씁니다');
  process.exit(1);
}
// --test-bg-prelude=<파일> : 시험용 빌드에서만 — background.js 맨 앞에 붙인다(예: service worker 의 크롬 내장 번역기 흉내).
const TEST_BG_PRELUDE = (process.argv.find((a) => a.startsWith('--test-bg-prelude=')) || '').slice('--test-bg-prelude='.length);
if (TEST_BG_PRELUDE && !TEST_OUT) {
  console.error('--test-bg-prelude 는 --test-out 과 함께만 씁니다');
  process.exit(1);
}
// 압축해제로 불러와도 확장 id 가 폴더 위치와 상관없이 늘 같게(agcbmglciepeobcgkniefahkaiigjkjk).
// 번역 도우미(line-helper/ChromeLink.cs)가 이 id 만 받아 준다. 웹스토어에 올릴 때는 이 줄을 빼고
// 스토어가 준 id 를 ChromeLink.Origins 에 더한다.
const DEV_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqjFTfUC3UQOWEe44RlALTC+l+WdJoUcxzjfgwo3RAQIHt6lFjgfB0NfVG1HdA6VXM32DMK599aSZh8MuC70978Fql2a5VOo84FVv9BUoTTxhwZ9GSiY8CQEPkUPd/SxPiMOVjCXdHfEAT9KdPT3jlOoal1DtGPwpEmFV6/KRDPcPqnHwtXDZKLKh5WNvMEUjzvh7stHlqHxDnzGDfN6JX1evcot9AkImYZbYnYe2WLi3t/NbyOk+nzallTnuBaApP+AbSXmt0itBnk4MNi1luNxlRwL8jfxdYF1EhrU1C3rkg2EgmKYExYwBtggHgtbjwVk9pslao2D76WBdBbIFjwIDAQAB';

function header(src) {
  const m = /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/.exec(src);
  if (!m) throw new Error('스크립트 머리말(==UserScript==)을 찾지 못했습니다');
  const all = (tag) => [...m[1].matchAll(new RegExp(`^//\\s*@${tag}\\s+(.+)$`, 'gm'))].map((x) => x[1].trim());
  return { version: all('version')[0], connect: all('connect'), require: all('require') };
}

async function vendorFile(url) {
  const [bare, hash] = url.split('#');
  const want = hash && hash.startsWith('sha256=') ? hash.slice(7) : null;
  const file = path.join(VENDOR, path.basename(new URL(bare).pathname));
  const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  const valid = () => {
    try {
      return fs.existsSync(file) && (!want || sha(fs.readFileSync(file)) === want);
    } catch {
      return false; // 다른 빌드가 막 바꿔 넣는 중
    }
  };
  if (valid()) return file;
  const r = await fetch(bare);
  if (!r.ok) throw new Error(`${bare} 받기 실패 (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (want && sha(buf) !== want) throw new Error(`${bare} 의 sha256 이 @require 와 다릅니다`);
  fs.mkdirSync(VENDOR, { recursive: true });
  // 2단계 시험은 빌드 여럿을 함께 돌린다 — 처음 받는 파일을 같은 자리에 동시에 쓰면 윈도우가 EBUSY 로 막았다(2026-11-22
  // GitHub Actions 첫 실행, 새로 받은 저장소라 vendor 가 비어 있었다). 제 임시 파일에 쓰고 바꿔 넣는다. 그 사이 다른 빌드가
  // 먼저 넣었으면 그것을 쓴다.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  for (let i = 0; ; i++) {
    if (valid()) {
      fs.rmSync(tmp, { force: true });
      return file;
    }
    try {
      fs.renameSync(tmp, file);
      return file;
    } catch (e) {
      if (i >= 30) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      await new Promise((res) => setTimeout(res, 100));
    }
  }
}

// 웹스토어판은 고정 테스트(tests/)를 먼저 돌려, 하나라도 실패하면 zip 을 만들지 않는다(2026-11-21 사용자: 막아 줘).
// 예전 zip·store/dist 는 건드리지 않는다. 시험을 건너뛰는 옵션은 일부러 두지 않았다 — 고친 뒤 다시 만든다.
function runTestsOrStop() {
  if (!fs.existsSync(path.join(ROOT, 'tests'))) throw new Error('tests 폴더가 없습니다 — 시험 없이 웹스토어판을 만들지 않습니다');
  // 1단계(브라우저 없이) + 2단계(시험용 크롬 + 가짜 쇼핑몰, 30초쯤)
  console.log('고정 테스트를 돌립니다 (node --test "tests/*.test.js" "tests/browser/*.test.js") …');
  const r = require('child_process').spawnSync(process.execPath, ['--test', '--test-reporter=dot', 'tests/*.test.js', 'tests/browser/*.test.js'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.error) throw new Error(`시험을 돌리지 못했습니다: ${r.error.message}`);
  if (r.status !== 0) throw new Error('고정 테스트가 실패해서 웹스토어 zip 을 만들지 않았습니다. 위의 실패한 시험을 고친 뒤 다시 만드세요.');
  console.log('고정 테스트 통과.');
}

async function main() {
  if (STORE) runTestsOrStop();
  const script = fs.readFileSync(SCRIPT_FILE, 'utf8').replace(/^﻿/, '');
  const h = header(script);
  if (!/^\d+(\.\d+){0,3}$/.test(h.version || '')) throw new Error(`@version 이 크롬 버전 꼴이 아닙니다: ${h.version}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 사진 글자 읽기 엔진(tesseract.min.js, 66 KB)은 쇼핑몰에만 넣는다 — 사진 읽기(installImageUI)는 쇼핑몰 init 에서만 켜진다.
  // 예전에는 모든 페이지에 넣어 한국어 뉴스 한 장에도 7.6 ms(컴파일 1.9 + 실행 5.7)를 썼다(2026-11-23 크롬 추적 — 확장이 쓰는
  // 시간의 30%). 쇼핑몰 주소는 스크립트의 SHOP_MARKETS 를 그대로 읽는다(목록은 한 곳). config.json shops 로 원격으로 더한 쇼핑몰은
  // 이 목록에 없어 무료 사진 읽기를 못 한다(Vision 키는 된다) — 그런 쇼핑몰이 생기면 SHOP_MARKETS 에 넣고 새 판으로.
  const shopHosts = (() => {
    const m = script.match(/const SHOP_MARKETS = \{([\s\S]*?)\n {2}\};/);
    if (!m) throw new Error('스크립트에서 SHOP_MARKETS 를 못 찾음 — 사진 읽기 엔진을 넣을 쇼핑몰 주소를 모른다');
    const hs = [...m[1].matchAll(/'([a-z0-9-]+(?:\.[a-z0-9-]+)+)'\s*:/g)].map((x) => x[1]);
    if (hs.length < 10) throw new Error(`SHOP_MARKETS 주소가 너무 적음(${hs.length})`);
    return hs;
  })();

  const vendored = [];
  for (const url of h.require) {
    const file = await vendorFile(url);
    fs.writeFileSync(path.join(OUT, path.basename(file)), scrub(path.basename(file), fs.readFileSync(file, 'utf8')));
    vendored.push(path.basename(file));
  }

  const content = [
    `// 만들어진 파일 — 고치지 마세요. 원본: extension/src/gm.js + th-korean.user.js (extension/build.js)`,
    fs.readFileSync(path.join(SRC, 'gm.js'), 'utf8'),
    ...(TEST_PRELUDE ? [fs.readFileSync(path.resolve(TEST_PRELUDE), 'utf8')] : []),
    `const GM_info = { script: { name: ${JSON.stringify(NAME)}, version: ${JSON.stringify(h.version)} }, scriptHandler: ${JSON.stringify(NAME)} };`,
    '',
    'gmReady',
    '  .then(() => {',
    scrub('th-korean.user.js', script.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n/, '')),
    '  })',
    `  .catch((e) => console.error('[통합 번역] 시작 실패:', e));`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'content.js'), content);

  fs.mkdirSync(path.join(OUT, 'tesseract'), { recursive: true });
  for (const [url, sha] of OCR_FILES) {
    const file = await vendorFile(`${url}#sha256=${sha}`);
    const to = path.join(OUT, 'tesseract', path.basename(file));
    if (path.basename(file) === 'worker.min.js') fs.writeFileSync(to, OCR_QUIET + scrub('worker.min.js', fs.readFileSync(file, 'utf8')));
    else fs.copyFileSync(file, to);
  }

  for (const f of ['background.js', 'popup.html', 'popup.js', 'yt-main.js', 'tt-main.js']) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
  if (TEST_BG_PRELUDE) {
    fs.writeFileSync(path.join(OUT, 'background.js'), fs.readFileSync(path.resolve(TEST_BG_PRELUDE), 'utf8') + '\n' + fs.readFileSync(path.join(SRC, 'background.js'), 'utf8'));
  }
  const icons = {};
  for (const s of [16, 32, 48, 128]) {
    fs.copyFileSync(path.join(ICONS, `icon${s}.png`), path.join(OUT, `icon${s}.png`));
    icons[s] = `icon${s}.png`;
  }

  // 127.0.0.1 = 번역 도우미가 크롬 실시간 자막을 한국어로 놓아 두는 통로(http, 이 PC 안).
  const hosts = [...new Set([...h.connect, ...EXTRA_HOSTS])].map((d) =>
    /^\d+\.\d+\.\d+\.\d+$/.test(d) ? `http://${d}/*` : `https://*.${d}/*`
  );
  const manifest = {
    manifest_version: 3,
    name: NAME,
    version: h.version,
    description: DESCRIPTION,
    ...(STORE || TEST_OUT ? {} : { key: DEV_KEY }),
    icons,
    action: { default_title: NAME, default_popup: 'popup.html', default_icon: icons },
    background: { service_worker: 'background.js' },
    // nativeMessaging: 번역 도우미(LINE·화면 번역) 켜기·끄기·상태, downloads: 도우미가 없을 때 설치 파일 받기
    permissions: ['storage', 'unlimitedStorage', 'nativeMessaging', 'downloads'],
    host_permissions: hosts,
    content_scripts: [
      ...(vendored.length
        ? [
            {
              // 사진 글자 읽기 엔진 — 쇼핑몰에만(위 shopHosts). content.js 는 쓸 때(사진에 마우스를 올릴 때) 찾는다.
              matches: shopHosts.flatMap((d) => [`https://${d}/*`, `https://*.${d}/*`]),
              js: vendored,
              run_at: 'document_start',
              all_frames: false,
            },
          ]
        : []),
      {
        // 스크립트의 @match 에 '*://*/*' 가 있다 — 어느 사이트든 태국어가 보이면 켜진다(genericInit).
        matches: ['http://*/*', 'https://*/*'],
        js: ['content.js'],
        run_at: 'document_start',
        all_frames: false, // @noframes
      },
      {
        // 쇼츠 플레이어의 자막(CC) 켜기 — 플레이어 기능은 페이지 쪽에만 있다(src/yt-main.js).
        matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
        js: ['yt-main.js'],
        run_at: 'document_start',
        world: 'MAIN',
      },
      {
        // 틱톡이 영상마다 가진 자동 자막(WebVTT) 주소 — 영상 정보 답은 페이지 쪽에서만 보인다(src/tt-main.js).
        matches: ['https://www.tiktok.com/*'],
        js: ['tt-main.js'],
        run_at: 'document_start',
        world: 'MAIN',
      },
    ],
    // 사진 글자 읽기 엔진 — 페이지 안의 인식기(worker)가 이 파일들을 불러 쓴다.
    web_accessible_resources: [{ resources: ['tesseract/*'], matches: ['http://*/*', 'https://*/*'] }],
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  checkNoRemoteCode(OUT);

  console.log(`통합 번역 ${h.version} → ${OUT}${STORE ? ' (웹스토어판: 개발용 key 없음)' : ''}`);
  console.log(`  content.js ${(Buffer.byteLength(content) / 1024).toFixed(0)} KB, 접속 주소 ${hosts.length}개, 함께 넣은 파일: ${vendored.join(', ') || '없음'}`);
  if (STORE) {
    // 윈도우 tar(bsdtar)는 -a 로 이름이 .zip 이면 zip 으로 묶는다.
    const dir = path.join(__dirname, 'store');
    fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(dir, `통합번역-${h.version}.zip`);
    fs.rmSync(zip, { force: true });
    // Git Bash 의 tar(GNU)는 'E:' 를 원격 주소로 읽어 실패했다 — 윈도우 tar.exe 를 직접 부른다.
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    // '.' 을 넘기면 항목 이름이 './manifest.json' 이 되어 웹스토어가 '매니페스트를 찾을 수 없습니다' 로 거부했다
    // (2026-11-04) — 맨 위 파일·폴더 이름을 하나씩 넘긴다.
    require('child_process').execFileSync(tar, ['-a', '-c', '-f', zip, '-C', OUT, ...fs.readdirSync(OUT)]);
    console.log(`  웹스토어에 올릴 파일: ${zip} (${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch((e) => {
  console.error('만들기 실패:', e.message);
  process.exit(1);
});
