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
const OUT = path.join(__dirname, 'dist');
const VENDOR = path.join(__dirname, 'vendor');
const ICONS = path.join(__dirname, 'icons');

const NAME = '통합 번역';
const DESCRIPTION =
  '외국어 사이트와 메신저를 한국어로 — 태국 쇼핑몰 검색·읽기, 페이스북 메신저, 입력칸 한국어→외국어, 사진 속 글자 번역';
// @connect 에 없지만 스크립트가 확장 권한으로 부르는 주소(사진 글자 읽기 Vision).
const EXTRA_HOSTS = ['vision.googleapis.com'];
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
  if (fs.existsSync(file) && (!want || sha(fs.readFileSync(file)) === want)) return file;
  const r = await fetch(bare);
  if (!r.ok) throw new Error(`${bare} 받기 실패 (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (want && sha(buf) !== want) throw new Error(`${bare} 의 sha256 이 @require 와 다릅니다`);
  fs.mkdirSync(VENDOR, { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}

async function main() {
  const script = fs.readFileSync(path.join(ROOT, 'th-korean.user.js'), 'utf8').replace(/^﻿/, '');
  const h = header(script);
  if (!/^\d+(\.\d+){0,3}$/.test(h.version || '')) throw new Error(`@version 이 크롬 버전 꼴이 아닙니다: ${h.version}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const vendored = [];
  for (const url of h.require) {
    const file = await vendorFile(url);
    fs.copyFileSync(file, path.join(OUT, path.basename(file)));
    vendored.push(path.basename(file));
  }

  const content = [
    `// 만들어진 파일 — 고치지 마세요. 원본: extension/src/gm.js + th-korean.user.js (extension/build.js)`,
    fs.readFileSync(path.join(SRC, 'gm.js'), 'utf8'),
    `const GM_info = { script: { name: ${JSON.stringify(NAME)}, version: ${JSON.stringify(h.version)} }, scriptHandler: ${JSON.stringify(NAME)} };`,
    '',
    'gmReady',
    '  .then(() => {',
    script,
    '  })',
    `  .catch((e) => console.error('[통합 번역] 시작 실패:', e));`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'content.js'), content);

  for (const f of ['background.js', 'popup.html', 'popup.js']) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
  const icons = {};
  for (const s of [16, 32, 48, 128]) {
    fs.copyFileSync(path.join(ICONS, `icon${s}.png`), path.join(OUT, `icon${s}.png`));
    icons[s] = `icon${s}.png`;
  }

  const hosts = [...new Set([...h.connect, ...EXTRA_HOSTS])].map((d) => `https://*.${d}/*`);
  const manifest = {
    manifest_version: 3,
    name: NAME,
    version: h.version,
    description: DESCRIPTION,
    key: DEV_KEY,
    icons,
    action: { default_title: NAME, default_popup: 'popup.html', default_icon: icons },
    background: { service_worker: 'background.js' },
    // nativeMessaging: 번역 도우미(LINE·화면 번역) 켜기·끄기·상태
    permissions: ['storage', 'unlimitedStorage', 'nativeMessaging'],
    host_permissions: hosts,
    content_scripts: [
      {
        // 스크립트의 @match 에 '*://*/*' 가 있다 — 어느 사이트든 태국어가 보이면 켜진다(genericInit).
        matches: ['http://*/*', 'https://*/*'],
        js: [...vendored, 'content.js'],
        run_at: 'document_start',
        all_frames: false, // @noframes
      },
    ],
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`통합 번역 ${h.version} → ${OUT}`);
  console.log(`  content.js ${(Buffer.byteLength(content) / 1024).toFixed(0)} KB, 접속 주소 ${hosts.length}개, 함께 넣은 파일: ${vendored.join(', ') || '없음'}`);
}

main().catch((e) => {
  console.error('만들기 실패:', e.message);
  process.exit(1);
});
