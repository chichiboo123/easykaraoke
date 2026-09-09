export function segmentProgress(s, time) { if (time <= s.start || s.end <= s.start)
    return time > s.end && s.end > 0 ? 1 : 0; if (time >= s.end)
    return 1; return (time - s.start) / (s.end - s.start); }
export function applyStamp(segments, index, time) { const current = segments[index]; if (!current)
    return; if (index > 0) {
    const previous = segments[index - 1];
    previous.end = Math.max(previous.start + .05, time);
} current.start = time; current.end = time + .35; }
export function blockAt(p, time) { let index = p.lyricBlocks.findIndex(b => { const valid = b.segments.filter(s => s.end > 0); return valid.length && time >= valid[0].start && time <= valid.at(-1).end; }); if (index < 0)
    index = p.lyricBlocks.findIndex(b => b.segments.some(s => s.start > time)); if (index < 0 && p.lyricBlocks.length)
    index = p.lyricBlocks.some(b => b.segments.some(s => s.end > 0)) ? p.lyricBlocks.length - 1 : 0; return { block: p.lyricBlocks[index], next: p.lyricBlocks[index + 1], index }; }
