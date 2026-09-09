import { blockAt, segmentProgress } from './frame.js';
export const palettes = { classic: ['#07152f', '#172a52', '#ffd43b'], stage: ['#16122c', '#522278', '#e9b8ff'], dream: ['#172554', '#6d28d9', '#93c5fd'], classroom: ['#0891b2', '#34d399', '#fde047'], retro: ['#3b176f', '#ef476f', '#ffd166'], minimal: ['#111827', '#1f2937', '#fbbf24'] };
function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
function fit(ctx, text, max, start, min = 24) { let size = start; while (size > min && ctx.measureText(text).width > max) {
    size -= 2;
    ctx.font = ctx.font.replace(/^\d+px/, `${size}px`);
} return size; }
function sourceRange(block, segment, cursor) { if (segment.charStart !== undefined && segment.charEnd !== undefined)
    return [segment.charStart, segment.charEnd]; const start = block.text.indexOf(segment.text, cursor); return [start < 0 ? cursor : start, (start < 0 ? cursor : start) + segment.text.length]; }
export function lyricSegmentRects(ctx, block, center = 960) { const left = center - ctx.measureText(block.text).width / 2; let cursor = 0; return block.segments.map(segment => { const [start, end] = sourceRange(block, segment, cursor); cursor = end; return { segment, x: left + ctx.measureText(block.text.slice(0, start)).width, width: ctx.measureText(block.text.slice(start, end)).width }; }); }
function drawLyric(ctx, block, y, time, color, font) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `96px "${font}", "Noto Sans KR", sans-serif`; fit(ctx, block.text, 1650, 96); ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(block.text, 960, y); ctx.fillStyle = '#fff'; ctx.fillText(block.text, 960, y); ctx.textAlign = 'left'; for (const { segment, x, width } of lyricSegmentRects(ctx, block)) {
    const progress = segmentProgress(segment, time);
    if (progress <= 0)
        continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y - 75, width * progress, 150);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillText(block.text, x - ctx.measureText(block.text.slice(0, segment.charStart ?? block.text.indexOf(segment.text))).width, y);
    ctx.restore();
} }
function drawCover(ctx, image) { const source = image; const width = source.naturalWidth || source.width || 1920, height = source.naturalHeight || source.height || 1080, scale = Math.max(1920 / width, 1080 / height), dw = width * scale, dh = height * scale; ctx.drawImage(image, (1920 - dw) / 2, (1080 - dh) / 2, dw, dh); }
function outlined(ctx, text, x, y) { ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(text, x, y); ctx.fillStyle = '#fff'; ctx.fillText(text, x, y); }
export function renderFrame(ctx, p, time, bg) { const [c1, c2, point] = palettes[p.style.preset]; ctx.save(); ctx.clearRect(0, 0, 1920, 1080); const gradient = ctx.createLinearGradient(0, 0, 1920, 1080); gradient.addColorStop(0, c1); gradient.addColorStop(1, c2); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1920, 1080); if (bg) {
    ctx.filter = `brightness(${p.style.brightness}%) blur(${p.style.blur}px)`;
    drawCover(ctx, bg);
    ctx.filter = 'none';
    ctx.fillStyle = `rgba(0,0,0,${p.style.darken / 100})`;
    ctx.fillRect(0, 0, 1920, 1080);
} ctx.font = `32px "${p.style.fontFamily}",sans-serif`; ctx.textAlign = 'left'; outlined(ctx, [p.meta.musical, p.meta.number].filter(Boolean).join(' · '), 100, 80); ctx.textAlign = 'right'; outlined(ctx, p.meta.title, 1820, 80); const marker = p.markers.find(m => time >= m.start && time <= m.end), first = p.lyricBlocks[0]?.segments.find(s => s.end > 0)?.start ?? 0; if ((marker?.type === 'intro' || time < first) && time < Math.min(Math.max(first, 2), 6)) {
    ctx.textAlign = 'center';
    ctx.font = `52px "${p.style.fontFamily}",sans-serif`;
    if (p.meta.musical)
        outlined(ctx, p.meta.musical, 960, 350);
    ctx.font = `86px "${p.style.fontFamily}",sans-serif`;
    outlined(ctx, [p.meta.number, p.meta.title].filter(Boolean).join('  '), 960, 480);
    ctx.font = `34px "${p.style.fontFamily}",sans-serif`;
    outlined(ctx, [p.meta.composer && `작곡 ${p.meta.composer}`, p.meta.lyricist && `작사 ${p.meta.lyricist}`].filter(Boolean).join('   '), 960, 570);
}
else if (marker?.type === 'interlude' || marker?.type === 'ending') {
    ctx.textAlign = 'center';
    ctx.font = `78px "${p.style.fontFamily}",sans-serif`;
    outlined(ctx, marker.label || (marker.type === 'ending' ? '감사합니다' : '간주'), 960, 510);
}
else {
    const { block, next } = blockAt(p, time);
    if (block) {
        const role = p.roles.find(r => r.id === block.roleId), fill = p.musicalMode && p.style.colorMode === 'role' ? (role?.color || point) : point;
        if (p.musicalMode && role) {
            ctx.font = `32px "${p.style.fontFamily}",sans-serif`;
            const width = Math.max(220, ctx.measureText(role.name).width + 80);
            ctx.fillStyle = role.color;
            rounded(ctx, 960 - width / 2, 250, width, 65, 32);
            ctx.fillStyle = '#111827';
            ctx.textAlign = 'center';
            ctx.fillText(role.name, 960, 284);
        }
        drawLyric(ctx, block, 500, time, fill, p.style.fontFamily);
        if (next) {
            ctx.font = `66px "${p.style.fontFamily}",sans-serif`;
            fit(ctx, next.text, 1650, 66, 24);
            ctx.textAlign = 'center';
            outlined(ctx, next.text, 960, 680);
        }
    }
} if (marker?.countdown) {
    const remain = Math.ceil(marker.end - time);
    if (remain > 0 && remain <= marker.countdown) {
        ctx.font = `120px "${p.style.fontFamily}",sans-serif`;
        ctx.textAlign = 'center';
        outlined(ctx, String(remain), 960, 880);
    }
} if (p.style.progress && p.media.duration) {
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(100, 1015, 1720, 8);
    ctx.fillStyle = point;
    ctx.fillRect(100, 1015, 1720 * Math.min(1, time / p.media.duration), 8);
} ctx.restore(); }
