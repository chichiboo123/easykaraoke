# 뮤지컬 노래방 V1

반주를 듣고 Space 키로 한국어 음절 타이밍을 입력해, 배역이 구분된 노래방 영상을 브라우저에서 만드는 local-first 정적 웹앱입니다. 음원·가사·배경·글꼴·프로젝트와 렌더 결과는 서버로 전송하지 않습니다.

## 핵심 기능

- MP3/WAV/M4A/AAC 재생, 파형, seek와 볼륨
- `[배역] 가사` 빠른 입력, 배역별 색상, `Intl.Segmenter` 기반 한국어 음절 분리
- Space 타이밍 입력, 취소/미세 이동/숫자 수정/음절 합치기와 분리, A–B 반복
- 동일 Canvas 렌더러를 쓰는 16:9 미리보기와 출력, 연속적인 음절 fill
- 6개 디자인, 내장/사용자 글꼴, 사용자 배경, IndexedDB 자동 저장
- 브라우저 MediaRecorder의 H.264/AAC MP4 기능을 이용한 1080p 30fps 실시간 스트리밍 출력

## 설치와 실행

Node.js 22 이상을 권장합니다. 런타임 의존성이 없어 별도 패키지 다운로드가 필요 없습니다.

```bash
npm install
npm run build
npm run dev
```

`http://localhost:5173`에서 확인합니다. 타입 검사는 `npm run typecheck`, 테스트는 `npm test`, 정적 검사는 `npm run lint`입니다.

## GitHub Pages 배포

이 앱은 백엔드가 없는 정적 웹앱이므로 Cloudflare Pages가 반드시 필요하지 않습니다. 저장소의 `.github/workflows/deploy-pages.yml`이 `work` 또는 `main` 브랜치 push 시 테스트와 빌드를 수행하고 `dist` 폴더를 GitHub Pages에 배포합니다.

최초 한 번 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택하세요. 이후 Actions 탭의 **Deploy to GitHub Pages** workflow를 수동 실행하거나 대상 브랜치에 push하면 됩니다. 프로젝트 사이트가 `https://사용자명.github.io/저장소명/`처럼 하위 경로에 배포되어도 동작하도록 모든 정적 자산과 JavaScript import는 상대 경로를 사용합니다.

배포 전에는 아래 명령으로 HTML, JavaScript 모듈과 CSS가 모두 출력 폴더에 존재하는지 검사할 수 있습니다.

```bash
npm run build
npm run check:deploy
```

화면이 비어 있다면 GitHub의 **Actions → Deploy to GitHub Pages**에서 최신 workflow가 성공했는지 확인하세요. Pages Source를 **Deploy from a branch**로 두고 저장소 루트를 직접 공개하면 컴파일된 `app.js`가 없으므로 실행되지 않습니다.

## 권장 브라우저와 제한

최신 데스크톱 Chrome/Edge처럼 `canvas.captureStream`, `MediaRecorder` 및 `video/mp4`(H.264/AAC)를 함께 제공하는 환경을 권장합니다. 브라우저가 MP4 MediaRecorder를 제공하지 않으면 내보내기 버튼을 활성화하지 않으며 최신 호환 브라우저 사용을 안내합니다. 출력은 메모리에 모든 프레임을 쌓지 않고 실시간으로 녹화하므로 곡 길이만큼 시간이 걸립니다. 정밀 편집은 PC를 권장합니다.

## 폰트

`public/fonts/TJJoyofsingingM.otf`에 **배포 권한을 확인한 첨부 원본**을 그대로 두어야 기본 영상 글꼴이 활성화됩니다. 저장소 생성 환경에는 요청에서 언급된 바이너리 첨부가 전달되지 않아 파일을 임의 다운로드하거나 대체하지 않았습니다. 다른 내장 후보도 각 OFL 원본을 같은 폴더에 배치할 수 있으며, 파일이 없으면 사용자에게 fallback 상태가 적용됩니다. 자세한 내용은 [FONT_LICENSE_NOTES.md](FONT_LICENSE_NOTES.md)를 확인하세요.

## 기술

TypeScript, Canvas 2D, Web Audio API, MediaRecorder, IndexedDB, FontFace, Intl.Segmenter를 사용합니다. 백엔드, 분석 SDK, 광고, AI API가 없습니다. 선택 근거와 조사 대상은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 기록했습니다.

## V1 범위

AI 자동 싱크, 가사 추출, 보컬 분리, 점수, 로그인, 클라우드 저장, 협업은 포함하지 않습니다. 공개 또는 상업 배포 전에 특히 TJ 폰트 재배포 조건과 모든 포함 글꼴 파일의 라이선스를 다시 확인해야 합니다.
