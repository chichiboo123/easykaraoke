# Third-party notices and prior-art review

이 구현은 아래 프로젝트의 공식 문서·공개 API와 라이선스 방향을 검토했습니다. GPL 프로젝트의 코드는 복사하지 않았습니다. 현재 앱 번들에는 제3자 JavaScript 런타임 라이브러리가 없습니다.

| 이름 | 프로젝트/용도 | 라이선스 | 출처 |
|---|---|---|---|
| wavesurfer.js | 브라우저 파형·regions API 조사 | BSD-3-Clause | https://github.com/katspaugh/wavesurfer.js |
| Mediabunny | WebCodecs 미디어 변환·MP4 muxing 조사 | MPL-2.0 | https://github.com/Vanilagy/mediabunny |
| ffmpeg.wasm | WASM 호환 출력 방식 조사 | MIT (FFmpeg 자체 라이선스 별도) | https://github.com/ffmpegwasm/ffmpeg.wasm |
| mp4-muxer | WebCodecs MP4 muxing 선행 구현 조사 | MIT | https://github.com/Vanilagy/mp4-muxer |
| karlyriceditor | LRC 편집 UX 참고만 함 | GPL-3.0 | https://github.com/karlicoss/karlyriceditor |

브라우저 표준인 Canvas, Web Audio, MediaRecorder, IndexedDB, FontFace, `Intl.Segmenter`를 직접 사용했습니다. npm 네트워크 접근이 실행 환경에서 차단되어 외부 패키지를 vendoring하지 않고 표준 API 기반으로 구현했습니다.

글꼴 고지는 [FONT_LICENSE_NOTES.md](FONT_LICENSE_NOTES.md)에 별도로 기록합니다.


## 무대 씬 (src/lib/scenes.ts)

12종의 무대 배경은 모두 Canvas 2D로 직접 구현한 절차적 그래픽입니다. 외부 이미지나
그래픽 라이브러리를 번들하지 않으므로 오프라인에서도 동작하고, 같은 시각이면 항상 같은
프레임이 나와 미리보기와 내보낸 영상이 일치합니다.

사용한 기법은 컴퓨터 그래픽스에서 널리 쓰이는 공개된 관용구이며, 코드는 이 저장소에서
직접 작성했습니다.

- **value noise** (smoothstep 보간) — 오로라 리본의 흐름. Ken Perlin의 노이즈 계열
  기법으로, 여기서는 해시 기반 1D value noise를 씁니다.
- **'screen' 합성으로 빛 누적** — 오로라, 스포트라이트, 보케의 발광 표현.
- **방사형 그라디언트 원반** — 보케의 초점 나간 불빛, 성운.
- **synthwave 원근 격자** — 네온 시티. 소실점 기준 등비 간격으로 가로선을 배치합니다.
- **하프톤 망점** — 레트로 팝.
- **필름 그레인** — 128px 노이즈 타일을 한 번 만들어 패턴으로 반복합니다. 매 프레임
  1080p 노이즈를 생성하면 30fps 인코딩을 감당할 수 없기 때문입니다.

라이브러리를 번들하지 않은 이유: 이 프로젝트는 번들러와 런타임 의존성이 없는 정적
웹앱이고, 글꼴 외에는 외부 요청을 하지 않는 것을 유지하려 했습니다. three.js 등을
쓰면 이 두 가지가 모두 깨집니다.
