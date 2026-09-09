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
