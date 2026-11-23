# Privacy Policy — All-in-One Translator (통합 번역, Chrome extension)

Last updated: 2026-11-23 · 한국어: [PRIVACY.md](PRIVACY.md)

All-in-One Translator is a Chrome extension that shows foreign websites, messengers and videos in your language (chosen in the extension window; on first install it follows your Chrome language). **The developer runs no server and does not collect, store or sell any user information.** There is no advertising or analytics code.

## 1. Text sent to other services for translation

Your PC sends text **directly** to the services below (it never passes through the developer).

| What is sent | Where | When |
|---|---|---|
| Foreign text on the page, what you type in input boxes, messages received or sent in Messenger, video subtitle text | Google Translate (translate.googleapis.com) | When translating |
| The same kinds of text | Groq (api.groq.com) or NVIDIA (integrate.api.nvidia.com) | Only if you enter your own AI key in the settings and choose AI translation |
| Pictures (e.g. product photos) | Google Cloud Vision (vision.googleapis.com) | Only if you enter your own Vision key in the settings. Without a key, text in pictures is read **inside the browser only** (Tesseract, nothing is sent out) |

Each service handles data under its own company's policy.

**Chrome's built-in translator (since 1.35.4):** When Google Translate is temporarily blocked or there is no internet, the extension uses the translator built into Chrome (Translator API). This translation happens **only on your PC** and the text does not leave it. Chrome downloads the language model by itself the first time (a Chrome feature). Since 1.36.0 the extension runs this translation in its background, so you do not need to click on each site (the Tampermonkey version needs one click per site to turn it on).

## 2. Things that are only downloaded

- **Glossaries and remote settings**: public files are downloaded from GitHub (raw.githubusercontent.com, api.github.com). Only ordinary internet request information is sent.
- **YouTube and TikTok subtitles**: the subtitle file of the video you are watching is downloaded from that site (YouTube, TikTok) and translated into your language. For TikTok, only the subtitle address is read from video information the page has already received.
- **Picture text-reading data**: the text-recognition engine and the Thai character data are inside the extension and are not downloaded. When reading pictures on shops in other countries (Vietnam, Indonesia, Taiwan, Brazil …), the character data for that language (official Tesseract language models — data, not code) is downloaded once from GitHub (raw.githubusercontent.com, tesseract-ocr/tessdata_fast) and kept in that site's browser storage. A Thai word list used to correct recognized text (data, not code) is downloaded once from jsdelivr (CDN).

## 3. Things kept only on your PC

- Settings, a copy of the glossaries, already-translated results (to show them again quickly), and any API keys or GitHub token you enter are stored **only in this browser's extension storage** and are not sent anywhere else (a token is sent only to its own service when signing in to it).
- The extension talks with the **Translation Helper** (a separate Windows program you may install) only inside this PC (Chrome native messaging, 127.0.0.1). The helper takes the text of Chrome's "Live Caption", translates it into your language and passes it to the extension; this text also goes only to Google Translate (section 1) when translated. The extension tells the helper which "my language" you chose.
- **Problem log**: notices that a translation failed (last 20, e.g. "search translation failed: HTTP 429") and recently converted text (last 10 — the original and translation of search words, input boxes, Messenger sends and drag translations, plus the site name) are kept only in this browser so they can be attached to "Report a problem" below. They are never sent automatically.

## 3-1. What the Translation Helper (optional) does

This applies only if you install the Translation Helper.

- It reads, inside this PC, the text of **LINE PC conversations** and of the **screen of a program window** you turn on with Ctrl+Alt+K (including menus) (Windows built-in text recognition, Tesseract). **Screen images are never sent out**; only the recognized text is sent to Google Translate (section 1) when translated. Text you send in LINE is converted the same way.
- Character data (Tesseract language data) is downloaded once from jsdelivr (CDN) and kept on the PC. The helper program and its translation rules update themselves from the public GitHub repository (wotjq2/th-korean).
- The helper's settings, translated results and logs are stored only in the helper folder on this PC and are not sent anywhere else.
- **Borrowing Chrome's built-in translator (since 1.36.0):** when Google Translate is temporarily blocked or there is no internet, the helper translates through the extension with Chrome's built-in translator (section 1). While Chrome and the helper are both running, they are connected by channels inside this PC (Chrome native messaging, and a channel that only the same user of this PC can open); the text is translated **only on this PC** and does not leave it.

## 3-2. Report a problem (optional)

When you open **Report a problem** in the "한" settings window or the extension window, the text to send is built on this PC and shown to you first: what you wrote, the translation you picked (original and translation), the extension version, browser and operating-system type, your language, the name of the current site (search words and post numbers after the address are not included), translation settings (API keys and tokens only as "present/absent"), whether the Translation Helper is on, and the problem log above. You can edit this text or delete lines.

- **Post to GitHub** opens a new GitHub issue page filled with this text. It is published to the public repository (wotjq2/th-korean) only if you post it yourself on that page; if you don't, nothing is kept (a GitHub account is required).
- **Copy** only puts the text on the clipboard. You decide where to send it.

## 4. Adding words to the glossary (optional)

If you enter your own GitHub token and press "Save to glossary", that word is uploaded to the public glossary repository on GitHub (wotjq2/th-korean-glossary). If you don't, nothing is uploaded.

## 5. Contact

https://github.com/wotjq2/th-korean/issues
