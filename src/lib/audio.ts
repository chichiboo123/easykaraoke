/**
 * 오디오 엔진.
 * V1의 치명적 결함: exportVideo()가 호출될 때마다 createMediaElementSource()를
 * 새로 만들어, 두 번째 내보내기는 실패하고 ac.close() 이후에는 미리보기까지 무음이 됐다.
 * HTMLMediaElement는 평생 하나의 MediaElementAudioSourceNode에만 연결될 수 있다.
 * 그래서 여기서 그래프를 딱 한 번 만들고 절대 닫지 않는다.
 */
export const audio = new Audio();
audio.preload = 'auto';

type Graph = { ctx: AudioContext; source: MediaElementAudioSourceNode; gain: GainNode; tap: MediaStreamAudioDestinationNode };
let graph: Graph | null = null;

export function ensureGraph(): Graph {
  if (graph) return graph;
  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(audio);
  const gain = ctx.createGain();
  const tap = ctx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(ctx.destination);
  gain.connect(tap);
  graph = { ctx, source, gain, tap };
  return graph;
}

/** 브라우저 자동재생 정책 때문에 첫 사용자 제스처에서 깨워야 한다. */
export async function resume(): Promise<void> {
  const g = ensureGraph();
  if (g.ctx.state === 'suspended') await g.ctx.resume();
}

export function setVolume(v: number): void {
  ensureGraph().gain.gain.value = Math.max(0, Math.min(1, v));
}

/** 내보내기 중 스피커로 새어 나가는 소리를 끈다. tap(녹음)에는 그대로 남는다. */
export function setMonitor(on: boolean): void {
  const g = ensureGraph();
  try {
    g.gain.disconnect(g.ctx.destination);
  } catch {
    /* 이미 끊겨 있으면 무시 */
  }
  if (on) g.gain.connect(g.ctx.destination);
}

export function setRate(rate: number): void {
  audio.playbackRate = rate;
  type PitchPreserving = HTMLAudioElement & { preservesPitch?: boolean };
  (audio as PitchPreserving).preservesPitch = true;
}

let objectUrl = '';
export function setSource(blob: Blob): Promise<number> {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  peaksCache = null;
  return new Promise((ok, fail) => {
    audio.onloadedmetadata = () => ok(audio.duration);
    audio.onerror = () => fail(new Error('음원을 읽지 못했어요. 손상되지 않은 지원 파일인지 확인해 주세요.'));
    audio.src = objectUrl;
  });
}

/**
 * 파형 피크. V1은 1단계를 열 때마다 파일 전체를 다시 디코드했다(8MB MP3면 수 초 정지).
 * V2는 한 번만 디코드해 캐시한다.
 */
let peaksCache: Float32Array | null = null;
let peaksJob: Promise<Float32Array> | null = null;

export function cachedPeaks(): Float32Array | null {
  return peaksCache;
}

export async function computePeaks(blob: Blob, buckets = 2400): Promise<Float32Array> {
  if (peaksCache) return peaksCache;
  if (peaksJob) return peaksJob;
  peaksJob = (async () => {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buffer.getChannelData(0);
    const out = new Float32Array(buckets);
    const step = data.length / buckets;
    for (let i = 0; i < buckets; i++) {
      const from = Math.floor(i * step);
      const to = Math.min(data.length, Math.floor((i + 1) * step));
      let peak = 0;
      for (let j = from; j < to; j++) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      out[i] = peak;
    }
    peaksCache = out;
    peaksJob = null;
    return out;
  })();
  return peaksJob;
}
