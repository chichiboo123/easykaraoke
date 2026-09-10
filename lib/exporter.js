import { audio, ensureGraph, resume, setMonitor, setRate } from './audio.js';
import { renderFrame } from './renderer.js';
const CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
];
export function exportSupport() {
    const hasRecorder = typeof MediaRecorder !== 'undefined';
    if (!hasRecorder)
        return { supported: false, type: '', container: '' };
    const type = CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    return { supported: !!type, type, container: type.includes('mp4') ? 'mp4' : type ? 'webm' : '' };
}
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
export async function exportVideo(opts) {
    const { project, background, onProgress, signal } = opts;
    const support = exportSupport();
    if (!support.supported)
        throw new Error('이 브라우저는 영상 녹화를 지원하지 않아요. 최신 Chrome 또는 Edge에서 열어 주세요.');
    await document.fonts.ready;
    await resume();
    const height = opts.height ?? 1080;
    const width = Math.round((height * 16) / 9);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const scale = height / 1080;
    const from = Math.max(0, opts.range?.from ?? 0);
    const to = Math.min(project.media.duration, opts.range?.to ?? project.media.duration);
    const span = Math.max(0.1, to - from);
    const graph = ensureGraph();
    const stream = canvas.captureStream(30);
    for (const track of graph.tap.stream.getAudioTracks())
        stream.addTrack(track);
    const rec = new MediaRecorder(stream, {
        mimeType: support.type,
        videoBitsPerSecond: height === 1080 ? 8_000_000 : 4_000_000,
        audioBitsPerSecond: 192_000,
    });
    const chunks = [];
    rec.ondataavailable = (e) => {
        if (e.data.size)
            chunks.push(e.data);
    };
    const stopped = new Promise((ok, fail) => {
        rec.onstop = () => ok();
        rec.onerror = () => fail(new Error('영상 인코딩 중 문제가 생겼어요. 저장 공간을 확인해 주세요.'));
    });
    const wasRate = audio.playbackRate;
    const previousMonitor = opts.monitor ?? true;
    let frame = 0;
    try {
        setRate(1);
        setMonitor(previousMonitor);
        audio.currentTime = from;
        // 첫 프레임을 먼저 그린 뒤 녹화를 시작한다.
        ctx.save();
        ctx.scale(scale, scale);
        renderFrame(ctx, project, from, background);
        ctx.restore();
        rec.start(1000);
        await audio.play();
        const startedAt = performance.now();
        await new Promise((ok, fail) => {
            const tick = () => {
                if (signal.aborted) {
                    fail(new DOMException('취소됨', 'AbortError'));
                    return;
                }
                const t = audio.currentTime;
                ctx.save();
                ctx.scale(scale, scale);
                renderFrame(ctx, project, t, background);
                ctx.restore();
                frame++;
                const elapsed = (performance.now() - startedAt) / 1000;
                const ratio = Math.min(1, Math.max(0, (t - from) / span));
                onProgress({
                    percent: Math.min(99, Math.round(ratio * 100)),
                    stage: '영상과 소리를 합치는 중',
                    eta: Math.max(0, span - (t - from)) + (elapsed > 1 ? 1.5 : 0),
                });
                // 끝에 1.2초 여유. V1은 audio.ended에서 즉시 끊어 마지막 음절이 잘렸다.
                if (t >= to || audio.ended) {
                    if (t >= to + 1.2 || audio.ended || to >= project.media.duration - 0.05) {
                        ok();
                        return;
                    }
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
        rec.stop();
        await stopped;
        onProgress({ percent: 100, stage: '영상 완성', eta: 0 });
        if (!chunks.length || frame < 2)
            throw new Error('녹화된 영상이 비어 있어요. 탭을 보이는 상태로 두고 다시 시도해 주세요.');
        return new Blob(chunks, { type: support.container === 'mp4' ? 'video/mp4' : 'video/webm' });
    }
    finally {
        // 어떤 경로로 끝나든 반드시 정리한다. AudioContext는 닫지 않는다(닫으면 앱 전체가 무음).
        try {
            if (rec.state !== 'inactive')
                rec.stop();
        }
        catch {
            /* 이미 멈춤 */
        }
        audio.pause();
        setRate(wasRate);
        setMonitor(true);
        for (const track of stream.getVideoTracks())
            track.stop();
    }
}
