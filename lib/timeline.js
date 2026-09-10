import { cachedPeaks } from './audio.js';
const WAVE_H = 66;
const BLOCK_H = 52;
export const TIMELINE_H = WAVE_H + BLOCK_H + 22;
const EDGE_PX = 7;
/** 재생헤드가 항상 보이도록 창을 따라 움직인다. */
export function windowFor(p, time, widthPx) {
    const duration = Math.max(1, p.media.duration);
    const span = Math.min(duration, widthPx / (100 * p.view.zoom));
    let from = time - span * 0.4;
    from = Math.max(0, Math.min(duration - span, from));
    return { from, to: from + span };
}
export function draw(canvas, p, time, win, selected, dark) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 800;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(TIMELINE_H * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(TIMELINE_H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, TIMELINE_H);
    const span = win.to - win.from || 1;
    const xOf = (t) => ((t - win.from) / span) * cssW;
    const ink = dark ? '#EDEBF3' : '#16151E';
    const line = dark ? '#332E44' : '#DDD9E6';
    const waveColor = dark ? '#5B5273' : '#BDB4D2';
    const surface = dark ? '#221E2E' : '#F3F1F8';
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, cssW, TIMELINE_H);
    // 시간 눈금 — V1 타임라인에는 숫자가 하나도 없었다.
    const stepChoices = [0.5, 1, 2, 5, 10, 15, 30, 60];
    const step = stepChoices.find((s) => (s / span) * cssW > 62) ?? 60;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (let t = Math.ceil(win.from / step) * step; t < win.to; t += step) {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, TIMELINE_H);
        ctx.stroke();
        ctx.fillStyle = dark ? '#8A82A0' : '#847F92';
        ctx.fillText(clock(t), x + 4, TIMELINE_H - 15);
    }
    // 파형
    const peaks = cachedPeaks();
    if (peaks && p.media.duration) {
        ctx.fillStyle = waveColor;
        const mid = WAVE_H / 2 + 4;
        for (let x = 0; x < cssW; x++) {
            const t = win.from + (x / cssW) * span;
            const i = Math.floor((t / p.media.duration) * peaks.length);
            const v = peaks[Math.max(0, Math.min(peaks.length - 1, i))] || 0;
            const h = Math.max(1, v * (WAVE_H - 10));
            ctx.fillRect(x, mid - h / 2, 1, h);
        }
    }
    // A–B 반복 구간
    if (p.view.loopOn && p.view.loopB > p.view.loopA) {
        ctx.fillStyle = dark ? 'rgba(245,200,66,.14)' : 'rgba(245,200,66,.24)';
        ctx.fillRect(xOf(p.view.loopA), 0, xOf(p.view.loopB) - xOf(p.view.loopA), TIMELINE_H);
    }
    // 블록
    const top = WAVE_H + 6;
    ctx.textBaseline = 'middle';
    p.blocks.forEach((b, i) => {
        if (b.end <= b.start || b.end < win.from || b.start > win.to)
            return;
        const x = xOf(b.start);
        const w = Math.max(6, xOf(b.end) - x);
        const role = p.roles.find((r) => r.id === b.roleId);
        const color = p.musicalMode && role ? role.color : '#6C8CF5';
        ctx.fillStyle = color;
        ctx.globalAlpha = i === selected ? 1 : 0.72;
        ctx.beginPath();
        ctx.roundRect(x, top, w, BLOCK_H - 12, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (i === selected) {
            ctx.strokeStyle = ink;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        if (w > 26) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 5, top, w - 10, BLOCK_H - 12);
            ctx.clip();
            ctx.fillStyle = '#141020';
            ctx.font = '600 12px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(b.text, x + 8, top + (BLOCK_H - 12) / 2);
            ctx.restore();
        }
    });
    // 재생헤드
    const hx = Math.round(xOf(time)) + 0.5;
    ctx.strokeStyle = '#F5443C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, TIMELINE_H - 16);
    ctx.stroke();
    ctx.fillStyle = '#F5443C';
    ctx.beginPath();
    ctx.moveTo(hx - 5, 0);
    ctx.lineTo(hx + 5, 0);
    ctx.lineTo(hx, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
/** 클릭 지점이 무엇인지 판정한다. 블록 양 끝 7px은 길이 조절 손잡이. */
export function hitTest(canvas, p, win, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const span = win.to - win.from || 1;
    const time = win.from + (x / rect.width) * span;
    const xOf = (t) => ((t - win.from) / span) * rect.width;
    if (y >= WAVE_H + 6 && y <= WAVE_H + BLOCK_H) {
        for (let i = 0; i < p.blocks.length; i++) {
            const b = p.blocks[i];
            if (b.end <= b.start)
                continue;
            const bx = xOf(b.start);
            const bw = xOf(b.end) - bx;
            if (x < bx - EDGE_PX || x > bx + bw + EDGE_PX)
                continue;
            if (Math.abs(x - bx) <= EDGE_PX)
                return { kind: 'block', index: i, edge: 'start', time };
            if (Math.abs(x - (bx + bw)) <= EDGE_PX)
                return { kind: 'block', index: i, edge: 'end', time };
            return { kind: 'block', index: i, edge: 'move', time };
        }
    }
    return { kind: 'seek', time: Math.max(0, time) };
}
export function clock(t) {
    const s = Math.max(0, t);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
