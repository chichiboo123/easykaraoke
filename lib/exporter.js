import { renderFrame } from './renderer.js';
export function exportSupport() { const available = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'; const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']; return { supported: available, type: available ? (types.find(t => MediaRecorder.isTypeSupported(t)) || '') : '' }; }
const once = (target, event) => new Promise((resolve, reject) => { const done = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error('내보내기용 음원을 읽지 못했어요.')); }, cleanup = () => { target.removeEventListener(event, done); target.removeEventListener('error', fail); }; target.addEventListener(event, done, { once: true }); target.addEventListener('error', fail, { once: true }); });
export async function exportVideo(project, previewAudio, bg, onProgress, signal) { await document.fonts.ready; const support = exportSupport(); if (!support.supported || !support.type)
    throw new Error('이 브라우저에서는 MP4 또는 WebM 인코더를 사용할 수 없어요.'); const audio = new Audio(previewAudio.currentSrc || previewAudio.src); audio.preload = 'auto'; audio.playbackRate = 1; if (audio.readyState < 1)
    await once(audio, 'loadedmetadata'); const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080; const ctx = canvas.getContext('2d', { alpha: false }); renderFrame(ctx, project, 0, bg); const stream = canvas.captureStream(30), ac = new AudioContext(), source = ac.createMediaElementSource(audio), dest = ac.createMediaStreamDestination(); source.connect(dest); dest.stream.getAudioTracks().forEach(track => stream.addTrack(track)); const chunks = []; const recorder = new MediaRecorder(stream, { mimeType: support.type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 }); recorder.ondataavailable = event => { if (event.data.size)
    chunks.push(event.data); }; const stopped = new Promise((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error('영상 인코딩 중 문제가 생겼어요. 저장 공간을 확인해 주세요.')); }); let timer = 0, abort = () => { }; try {
    audio.currentTime = 0;
    recorder.start(1000);
    await audio.play();
    abort = () => { audio.pause(); if (recorder.state !== 'inactive')
        recorder.stop(); };
    signal.addEventListener('abort', abort, { once: true });
    await new Promise((resolve, reject) => { const started = performance.now(); timer = window.setInterval(() => { if (signal.aborted) {
        reject(new DOMException('취소됨', 'AbortError'));
        return;
    } const time = audio.currentTime; renderFrame(ctx, project, time, bg); const elapsed = (performance.now() - started) / 1000, ratio = Math.min(1, time / Math.max(project.media.duration, .001)); onProgress({ percent: Math.min(99, Math.round(ratio * 100)), stage: '영상과 오디오 합치는 중', eta: ratio ? Math.max(0, elapsed / ratio - elapsed) : undefined }); if (audio.ended) {
        window.clearInterval(timer);
        if (recorder.state !== 'inactive')
            recorder.stop();
        resolve();
    } }, 1000 / 30); });
    await stopped;
    if (!chunks.length)
        throw new Error('인코더가 영상 데이터를 만들지 못했어요.');
    onProgress({ percent: 100, stage: '영상 완성', eta: 0 });
    return new Blob(chunks, { type: recorder.mimeType.includes('mp4') ? 'video/mp4' : 'video/webm' });
}
finally {
    window.clearInterval(timer);
    signal.removeEventListener('abort', abort);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (recorder.state !== 'inactive') {
        recorder.stop();
        await stopped.catch(() => { });
    }
    stream.getTracks().forEach(track => track.stop());
    source.disconnect();
    dest.disconnect();
    await ac.close().catch(() => { });
} }
