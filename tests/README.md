# 고정 테스트

스크립트(`th-korean.user.js`)·`config.json`·확장 파일을 고친 뒤, 다른 기능이 깨지지 않았는지 확인한다.

```powershell
node --test "tests/*.test.js"
```

- 웹스토어판을 만들 때(`node extension/build.js --store`) 1·2단계가 저절로 먼저 돈다. 하나라도 실패하면 zip 을 만들지 않는다.
- 브라우저·네트워크 없이 1초 안에 끝난다. 필요한 것은 Node.js 22 이상뿐이다(따로 설치할 꾸러미 없음).
- `tests/lib/load.js` 는 시험마다 스크립트를 따로 된 칸(vm)에 새로 불러온다. 구글 번역은 가짜 답(`<원문>?API`)을, 용어집은 시험에 적은 작은 용어집을 돌려준다.

## 무엇을 보나 (1단계)

| 파일 | 보는 것 |
|---|---|
| `config.test.js` | `config.json` 의 칸이 조용히 버려지지 않는지(언어 30개, 쇼핑몰 나라, 자막 정규식, 영상 숫자 범위), 깨진 설정에서도 기본값으로 도는지 |
| `shops.test.js` | 쇼피·라자다 나라 주소 → 그 나라 말, 검색 주소, config 로 나라 더하기 |
| `subtitles.test.js` | 중국어 자막 바꿀 말(속어·욕·메뉴·글자 인식 실수), 유튜브 말 언어 가늠(timing-optimized 자막 빼기) |
| `messenger.test.js` | 옮길 말풍선 고르기(내 언어별), 간체·번체·광둥어 가르기 |
| `glossary.test.js` | 용어집 읽기(@꾸밈말), 검색어 번역(용어집 → 조합 → 못 덮은 조각만 구글) |
| `static.test.js` | JS 문법, 웹스토어 규칙(eval·new Function·CDN 스크립트 없음), @version·@require, 빌드 목록 파일 |

## 시험이 정말 잡는지 보기

일부러 망가뜨린 사본으로 돌려 실패하는지 본다.

```powershell
$env:TEST_SCRIPT = "망가뜨린-사본.js"; node --test "tests/*.test.js"; Remove-Item Env:TEST_SCRIPT
```

`TEST_CONFIG` 은 `config.json` 대신 쓸 파일이다. 2026-11-21 에 7가지(유튜브 timing-optimized 거르기 빼기, 베트남 쇼피 빼기,
늦잠 예외 빼기, 메신저 주소 무시 빼기, @꾸밈말 빼기, eval 넣기, 언어 이름 꼴 틀리기)로 해 보니 모두 잡혔다.

## 2단계: 진짜 크롬 + 확장 + 가짜 사이트

```powershell
node --test "tests/browser/*.test.js"
```

- 30초쯤. 이 PC 의 크롬을 **새 임시 프로필로 화면 밖에** 띄운다(쓰고 있는 크롬과 따로 돈다). 크롬과 Git(openssl)이 있어야 한다.
- 확장은 `node extension/build.js --test-out=<임시 폴더>` 로 새로 만든다 — 개발용 고정 id 를 빼서 이 PC 의 번역 도우미와 이어지지 않는다.
- 크롬이 닿는 주소는 모두 이 PC 의 가짜 서버로 돌린다(`--host-resolver-rules`): 쇼핑몰은 `tests/browser/lib/pages.js`,
  구글 번역은 정해진 답(`lib/fake-net.js`), GitHub 은 이 저장소의 `config.json` 과 시험용 용어집. 그 밖의 주소는 막힌다 — **진짜 인터넷에 안 나간다.**
- 페이지가 10초 넘게 답하지 않으면 '멈춤' 으로 바로 실패한다.

| 파일 | 보는 것 |
|---|---|
| `browser/shops.test.js` | 태국·베트남 쇼피, 라자다 베트남, 싱가포르 쇼피 — 한국어·영어 사용자별로 상품 글 번역, 검색어 바꾸기(확인 Enter → 그 나라 말로 검색), 가격 그대로, '한' 단추 이름, 단추 끌기 자리 기억, 확장 오류 0건 |

망가뜨린 사본으로도 본다: `$env:TEST_SCRIPT = "사본.js"; node --test "tests/browser/*.test.js"` (시험용 빌드가 그 사본으로 만든다).
2026-11-21: 베트남 쇼피 빼기 → 베트남 2개 실패, 단추 자리 저장 빼기 → 단추 시험 실패. 원본은 두 번 다 통과.

## 앞으로

- 2단계 더하기: 메신저(가짜 편집기가 바깥 코드를 받지 않게 만들어야 함), 유튜브·틱톡 흉내 페이지. 재료는 이 PC 의 `.dev-tools/harness-archive/`.
- 3단계: 진짜 사이트는 스토어에 올리기 전에 손으로.
