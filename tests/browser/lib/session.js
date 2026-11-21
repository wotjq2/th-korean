// 2단계 시험 한 판: 시험용 확장 만들기 → 가짜 인터넷 → 시험용 크롬 → 확장 넣기.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('../../lib/load');
const { launch, sleep } = require('./chrome');
const net = require('./fake-net');

// prelude: content.js 앞에 붙일 시험용 파일(예: lib/fake-translator.js).
async function open({ pages, glossary, prelude }) {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'lzk-t2-'));
  const ext = path.join(tmp, 'ext');
  // 지금 저장소의 스크립트로 새로 만든다. TEST_SCRIPT 가 있으면 그 (일부러 망가뜨린) 사본으로.
  const extra = process.env.TEST_SCRIPT ? [`--test-script=${path.resolve(process.env.TEST_SCRIPT)}`] : [];
  if (prelude) extra.push(`--test-prelude=${path.resolve(prelude)}`);
  let fake = null;
  let chrome = null;
  let id;
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'extension/build.js'), `--test-out=${ext}`, ...extra], { stdio: 'pipe' });
    fake = await net.start({ pages, glossary });
    chrome = await launch({ profile: path.join(tmp, 'profile'), hostRules: fake.hostRules });
    ({ id } = await chrome.send('Extensions.loadUnpacked', { path: ext }));
  } catch (e) {
    // 반쯤 띄운 것을 치우고 알린다(임시 폴더를 남기지 않게)
    if (chrome) await chrome.close();
    if (fake) await fake.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  // 확장 창(popup.html)을 탭으로 열어 두고, 그 안에서 chrome.storage 로 '내 언어' 등을 바꾼다.
  const popup = await chrome.tab(`chrome-extension://${id}/popup.html`);
  const setStore = (obj) => popup.ev(`chrome.storage.local.set(${JSON.stringify(obj)}).then(() => 1)`);
  const getStore = (key) => popup.ev(`chrome.storage.local.get(${JSON.stringify(key)}).then((o) => o[${JSON.stringify(key)}])`);
  const setMyLang = (lang) => setStore({ 'gm:myLang': lang });
  await sleep(500);

  async function close() {
    await chrome.close();
    await fake.close();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); break; } catch { await sleep(500); } // 크롬이 프로필을 늦게 놓는다
    }
  }
  return { chrome, fake, popup, setStore, getStore, setMyLang, extId: id, close };
}

module.exports = { open };
