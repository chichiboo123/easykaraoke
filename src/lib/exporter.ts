import type { KaraokeProject } from '../types.js';
import { audio, ensureGraph, resume, setMonitor, setRate } from './audio.js';
import { ensureGlyphs, textForProject } from './fonts.js';
import { finalizeMp4 } from './mp4.js';
import { renderFrame } from './renderer.js';

export type ExportStatus = { percent: number; stage: string; eta: number };

/**
 * 프레임 타이머.
 *
 * requestAnimationFrame은 탭이 화면에 보이지 않으면 사양상 멈춘다. 그래서 예전에는
 * 내보내는 4분 동안 다른 창을 보기만 해도 캔버스 캡처가 끊겨, 오디오는 멀쩡한데
 * 영상은 첫 화면에서 멈춘 파일이 나왔다(실측: 96초에 231프레임 = 2.4fps).
 *
 * Worker의 타이머는 문서 가시성과 무관하게 돈다. Worker를 못 만드는 환경에서는
 * setInterval로 물러난다. 내보내는 동안은 소리가 재생 중이라 브라우저가 타이머를
 * 강하게 조이지 않는다.
 */
function createTicker(intervalMs: number, onTick: () => void): () => void {
  try {
    const src = `let id=null;onmessage=e=>{if(e.data&&e.data.stop){clearInterval(id);close();}else{id=setInterval(()=>postMessage(0),e.data.ms);}};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    worker.postMessage({ ms: intervalMs });
    return () => {
      worker.postMessage({ stop: true });
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setInterval(onTick, intervalMs);
    return () => window.clearInterval(id);
  }
}
export type ExportRange = { from: number; to: number };

const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function exportSupport(): { supported: boolean; type: string; container: 'mp4' | 'webm' | '' } {
  const hasRecorder = typeof MediaRecorder !== 'undefined';
  if (!hasRecorder) return { supported: false, type: '', container: '' };
  const type = CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  return { supported: !!type, type, container: type.includes('mp4') ? 'mp4' : type ? 'webm' : '' };
}

export type ExportOptions = {
  project: KaraokeProject;
  background?: CanvasImageSource;
  range?: ExportRange;
  height?: 1080 | 720;
  monitor?: boolean;
  onProgress: (s: ExportStatus) => void;
  signal: AbortSignal;
};

/**
 * 실시간 녹화 내보내기.
 *
 * V1의 결함을 모두 막는다:
 *  - AudioContext/MediaElementSource를 매번 새로 만들지 않고 audio.ts의 그래프를 재사용한다.
 *    (V1은 두 번째 내보내기가 실패하고, 그 뒤로는 미리보기까지 무음이 됐다)
 *  - 취소·오류 어느 경로로 끝나든 finally에서 정리한다.
 *  - 첫 프레임을 그린 뒤에 녹화를 시작해 시작부 검은 깜빡임을 없앤다.
 *  - 끝에 여유를 둬서 마지막 음절이 잘리지 않게 한다.
 */
export async function exportVideo(opts: ExportOptions): Promise<Blob> {
  const { project, background, onProgress, signal } = opts;
  const support = exportSupport();
  if (!support.supported) throw new Error('이 브라우저는 영상 녹화를 지원하지 않아요. 최신 Chrome 또는 Edge에서 열어 주세요.');

  // 영상에 나올 모든 글자의 글꼴 조각을 먼저 받는다.
  // document.fonts.ready만으로는 아직 요청되지 않은 unicode-range 조각이 오지 않아,
  // 내보낸 영상만 조용히 폴백 글꼴로 나가는 사고가 난다.
  await ensureGlyphs(project.style.fontFamily, textForProject(project));
  await document.fonts.ready;
  await resume();

  const height = opts.height ?? 1080;
  const width = Math.round((height * 16) / 9);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const scale = height / 1080;

  const from = Math.max(0, opts.range?.from ?? 0);
  const to = Math.min(project.media.duration, opts.range?.to ?? project.media.duration);
  const span = Math.max(0.1, to - from);

  const graph = ensureGraph();
  // captureStream(0)은 프레임을 자동으로 뽑지 않는다. 한 장 그릴 때마다
  // requestFrame()으로 직접 넘겨야 캔버스 갱신과 캡처가 어긋나지 않는다.
  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  for (const track of graph.tap.stream.getAudioTracks()) stream.addTrack(track);

  const rec = new MediaRecorder(stream, {
    mimeType: support.type,
    videoBitsPerSecond: height === 1080 ? 8_000_000 : 4_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((ok, fail) => {
    rec.onstop = () => ok();
    rec.onerror = () => fail(new Error('영상 인코딩 중 문제가 생겼어요. 저장 공간을 확인해 주세요.'));
  });

  const wasRate = audio.playbackRate;
  let frames = 0;
  let stopTicker = () => {};

  const paint = (t: number) => {
    ctx.save();
    ctx.scale(scale, scale);
    renderFrame(ctx, project, t, background);
    ctx.restore();
    videoTrack.requestFrame();
    frames++;
  };

  try {
    setRate(1);
    setMonitor(opts.monitor ?? false);
    audio.currentTime = from;
    // 첫 프레임을 먼저 그린 뒤 녹화를 시작한다. 시작부 검은 깜빡임 방지.
    paint(from);

    rec.start(1000);
    await audio.play();
    const startedAt = performance.now();

    await new Promise<void>((ok, fail) => {
      let finished = false;
      const finish = (err?: Error) => {
        if (finished) return;
        finished = true;
        stopTicker();
        if (err) fail(err);
        else ok();
      };
      stopTicker = createTicker(1000 / 30, () => {
        if (signal.aborted) {
          finish(new DOMException('취소됨', 'AbortError'));
          return;
        }
        const t = audio.currentTime;
        paint(t);

        const elapsed = (performance.now() - startedAt) / 1000;
        const ratio = Math.min(1, Math.max(0, (t - from) / span));
        onProgress({
          percent: Math.min(99, Math.round(ratio * 100)),
          stage: '영상과 소리를 합치는 중',
          eta: Math.max(0, span - (t - from)) + (elapsed > 1 ? 1.5 : 0),
        });

        // 끝에 여유를 둔다. 예전에는 audio.ended에서 즉시 끊어 마지막 음절이 잘렸다.
        if (audio.ended || t >= to + 1.2 || (t >= to && to >= project.media.duration - 0.05)) finish();
      });
    });

    rec.stop();
    await stopped;
    onProgress({ percent: 100, stage: '영상 완성', eta: 0 });
    if (!chunks.length || frames < 2) throw new Error('녹화된 영상이 비어 있어요. 다시 시도해 주세요.');

    // 프레임이 크게 모자라면 소리만 나오는 영상이 된다. 조용히 넘기지 않는다.
    const expected = span * 30;
    if (frames < expected * 0.5) {
      throw new Error(
        `영상 프레임이 충분히 담기지 않았어요 (${frames}장 / 예상 ${Math.round(expected)}장). ` +
          '브라우저가 이 탭의 작업을 늦춘 것 같아요. 다시 시도해 주시고, 되도록 이 탭을 열어 둔 채로 두세요.',
      );
    }
    const raw = new Blob(chunks, { type: support.container === 'mp4' ? 'video/mp4' : 'video/webm' });
    // 녹화된 fMP4에는 총 길이도 조각 색인도 없어 진행바를 끌 수 없다. 여기서 채워 넣는다.
    return support.container === 'mp4' ? await finalizeMp4(raw) : raw;
  } finally {
    // 어떤 경로로 끝나든 반드시 정리한다. AudioContext는 닫지 않는다(닫으면 앱 전체가 무음).
    stopTicker();
    try {
      if (rec.state !== 'inactive') rec.stop();
    } catch {
      /* 이미 멈춤 */
    }
    audio.pause();
    setRate(wasRate);
    setMonitor(true);
    for (const track of stream.getVideoTracks()) track.stop();
  }
}
