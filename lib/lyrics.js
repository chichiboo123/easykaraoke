import { uid } from '../types.js';
const punctuation = /^[\p{P}\p{S}]+$/u;
export function segmentKorean(text) { const raw = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].map(x => x.segment); const out = []; let prefix = ''; for (const c of raw) {
    if (/^\s+$/u.test(c))
        continue;
    if (punctuation.test(c)) {
        if (out.length)
            out[out.length - 1] += c;
        else
            prefix += c;
    }
    else {
        out.push(prefix + c);
        prefix = '';
    }
} return out; }
export function makeSegments(text) { const out = []; for (const part of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)) {
    const value = part.segment;
    if (/^\s+$/u.test(value))
        continue;
    if (punctuation.test(value)) {
        const last = out.at(-1);
        if (last) {
            last.text += value;
            last.charEnd = part.index + value.length;
        }
        else
            out.push({ id: uid(), text: value, start: 0, end: 0, charStart: part.index, charEnd: part.index + value.length });
    }
    else
        out.push({ id: uid(), text: value, start: 0, end: 0, charStart: part.index, charEnd: part.index + value.length });
} return out; }
export function parseLyrics(input, roles, musicalMode = false) { const next = [...roles]; const fallback = next.find(x => x.id === 'all') || next[0]; const blocks = input.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(line => { const m = musicalMode ? line.match(/^\[([^\]]+)]\s*(.*)$/) : null; const roleName = m?.[1]?.trim() || '전체'; const text = (m?.[2] ?? line).trim(); let role = musicalMode ? next.find(x => x.name === roleName) : fallback; if (!role) {
    role = { id: uid(), name: roleName, color: ['#60a5fa', '#c084fc', '#34d399', '#fb923c'][next.length % 4] };
    next.push(role);
} return { id: uid(), text, roleId: role.id, segments: makeSegments(text) }; }); return { blocks, roles: next }; }
export function flatten(blocks) { return blocks.flatMap((b, bi) => b.segments.map((s, si) => ({ block: b, segment: s, bi, si }))); }
