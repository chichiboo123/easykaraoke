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

## Google Fonts 후보 — 아직 포함되지 않음

Noto Sans KR, Jua, Do Hyeon, Gowun Dodum, Black Han Sans는 아직 저장소에 파일이 없습니다.
앱은 이 글꼴들을 불러오지 못하면 글꼴 카드를 `파일 없음` 배지와 함께 비활성 처리하므로,
사용자가 고를 수 없는 글꼴을 고를 수 있는 것처럼 보여주지 않습니다.

추가하려면 각 family의 OFL-1.1 원본만 self-host하고 `OFL.txt`도 함께 보존하십시오.
Google Fonts의 CSS2 API는 한글 글꼴을 unicode-range로 잘게 나눠 제공하므로,
전체 한글을 담으려면 조각 파일이 아니라 https://fonts.google.com/ 의 family 페이지에서 받은 완본을 사용해야 합니다.

## 사용자가 직접 추가하는 글꼴

"내 글꼴 추가"로 불러오는 OTF/TTF는 서버에 전송되지 않고 브라우저 안에서만 쓰이지만,
이용·출력·배포 권한 확인 책임은 사용자에게 있습니다.
