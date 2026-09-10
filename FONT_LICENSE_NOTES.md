# Font license notes

## TJ 노래하는즐거움체 M — 저장소에 포함됨

- 파일: `public/fonts/TJJoyofsingingM.otf` (1,705,568 bytes, MD5 `3e10bc48d508c8eaeda8632e03a54b02`)
- 내부 family 이름: `TJ 노래하는즐거움체 M` · 버전 `1.000` · 글리프 12,338자 (한글 가–힣 전체 포함)
- 권리자: TJ미디어㈜
- 공식 안내: https://www.tjmedia.com/introduce/font
- 본 프로젝트는 개인적·비영리 사용을 전제로 합니다.
- **제공받은 OTF 원본을 바이트 단위로 그대로 두었습니다.** 글리프 수정, subset, 포맷 변환(WOFF2 등), 이름 변경을 하지 않았습니다.
  - 참고: 이 OTF를 WOFF2로 변환하면 1.63MB → 0.75MB로 줄어 로딩이 빨라지지만, 위의 "변환 금지" 조건에 해당하므로 하지 않았습니다.
    변환본을 쓰려면 TJ미디어의 현재 이용 조건을 먼저 확인하십시오.
- 같은 글꼴의 TTF 판(`TJJoyofsingingM_TTF.ttf`, 8.02MB, family 이름이 `... M TTF`로 다름)도 존재하지만,
  용량이 5배 크고 family 이름이 달라 저장소에는 OTF만 포함했습니다.
- **공개 배포, 재배포 또는 상업 서비스로 전환하기 전에 TJ미디어의 당시 재배포·이용 조건을 반드시 다시 확인해야 합니다.**
  GitHub Pages로 공개 배포하는 것 자체가 글꼴 파일의 재배포에 해당합니다.

## Google Fonts — CDN에서 불러옴 (저장소에 파일 없음)

Jua, Do Hyeon, Black Han Sans, Gowun Dodum, Noto Sans KR 다섯 종은 **Google Fonts CDN에서 직접 불러옵니다.**
`index.html`의 `fonts.googleapis.com/css2` 링크가 `@font-face`를 등록하고, 실제 글꼴 조각은 `fonts.gstatic.com`에서 옵니다.

- 라이선스: 모두 SIL Open Font License 1.1. Google Fonts가 제공하는 원본을 그대로 링크하므로 재배포에 해당하지 않습니다.
- 구글은 한글 글꼴을 **unicode-range 조각 수십 개**로 나눠 제공합니다. 실제로 화면에 쓰는 글자의 조각만 내려오므로 전체를 받는 것보다 훨씬 가볍습니다.
- 그 대신 **Canvas에 그리기 전에 해당 글자의 조각을 미리 받아 둬야 합니다.** `fillText`는 조각 다운로드를 유발하지 않기 때문에,
  이걸 빼먹으면 미리보기와 내보낸 영상만 조용히 폴백 글꼴로 나갑니다. `src/lib/fonts.ts`의 `ensureGlyphs()`가 이 역할을 하며,
  가사 입력·글꼴 선택·화면 진입·**내보내기 직전**에 호출됩니다.
- 글꼴 스타일시트는 `media="print"` + `onload`로 **비차단 로드**합니다. `<link rel="stylesheet">`는 렌더링 차단 자원이라,
  그냥 두면 CDN이 느린 학교 네트워크에서 글꼴 하나 때문에 앱 화면 전체가 뜨지 않습니다.
- CDN에 닿지 못하면 해당 글꼴 카드가 **`못 불러옴` 배지와 함께 비활성** 처리됩니다.
  이때도 저장소에 포함된 TJ 글꼴과 시스템 기본 글꼴로 영상을 만들 수 있습니다.

완전한 오프라인 사용이 필요하면 각 family의 OFL 원본을 `public/fonts/`에 넣고 `OFL.txt`를 함께 보존한 뒤,
`src/lib/fonts.ts`에서 해당 항목의 `source`를 `'cdn'`에서 `'bundled'`로 바꾸고 `url`을 지정하십시오.

## 사용자가 직접 추가하는 글꼴

"내 글꼴 추가"로 불러오는 OTF/TTF는 서버에 전송되지 않고 브라우저 안에서만 쓰이지만,
이용·출력·배포 권한 확인 책임은 사용자에게 있습니다.
