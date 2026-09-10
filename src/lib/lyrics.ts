import { uid, type LyricBlock, type Role, type Segment } from '../types.js';

const PUNCTUATION = /^[\p{P}\p{S}]+$/u;
const ROLE_COLORS = ['#60a5fa', '#c084fc', '#34d399', '#fb923c', '#f472b6', '#facc15'];

/**
 * 한국어 음절 분리. V1과 달리 원문 오프셋을 보존한다.
 * 공백은 타이밍 단위가 되지 않지만, 렌더러가 글자 위치를 맞출 수 있도록
 * 각 음절이 원문 어디에 있었는지 charStart/charEnd로 남긴다.
 */
export function segmentKorean(text: string): Segment[] {
  const out: Segment[] = [];
  let prefixStart = -1;
  let cursor = 0;
  for (const part of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)) {
    const c = part.segment;
    const at = cursor;
    cursor += c.length;
    if (/^\s+$/u.test(c)) continue;
    if (PUNCTUATION.test(c)) {
      // 구두점은 홀로 타이밍 단위가 되지 않고 앞 음절에 붙는다.
      const last = out[out.length - 1];
      if (last) {
        last.text += c;
        last.charEnd = at + c.length;
      } else if (prefixStart < 0) {
        prefixStart = at;
      }
      continue;
    }
    const charStart = prefixStart >= 0 ? prefixStart : at;
    out.push({ id: uid(), text: text.slice(charStart, at + c.length), charStart, charEnd: at + c.length, start: 0, end: 0 });
    prefixStart = -1;
  }
  return out;
}

export function parseLyrics(input: string, roles: Role[], musicalMode = false): { blocks: LyricBlock[]; roles: Role[] } {
  const nextRoles = [...roles];
  const fallback = nextRoles.find((x) => x.id === 'all') || nextRoles[0];
  const blocks = input
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => {
      const m = musicalMode ? line.match(/^\[([^\]]+)]\s*(.*)$/) : null;
      const roleName = m?.[1]?.trim() || '전체';
      const text = (m?.[2] ?? line).trim();
      let role = musicalMode ? nextRoles.find((x) => x.name === roleName) : fallback;
      if (!role) {
        role = { id: uid(), name: roleName, color: ROLE_COLORS[nextRoles.length % ROLE_COLORS.length] };
        nextRoles.push(role);
      }
      return { id: uid(), text, roleId: role.id, start: 0, end: 0, segments: segmentKorean(text) };
    });
  return { blocks, roles: nextRoles };
}

/**
 * 가사를 다시 적용할 때 타이밍을 지키는 diff 병합.
 * 텍스트가 같은 줄은 기존 블록(타이밍 포함)을 그대로 재사용한다.
 * V1은 무조건 전체를 갈아엎어 작업 전체가 사라졌다.
 */
export function mergeBlocks(previous: LyricBlock[], incoming: LyricBlock[]): { blocks: LyricBlock[]; kept: number; lost: number } {
  const pool = new Map<string, LyricBlock[]>();
  for (const b of previous) {
    if (b.end <= b.start) continue;
    const list = pool.get(b.text);
    if (list) list.push(b);
    else pool.set(b.text, [b]);
  }
  let kept = 0;
  const blocks = incoming.map((b) => {
    const match = pool.get(b.text)?.shift();
    if (!match) return b;
    kept++;
    return { ...match, roleId: b.roleId };
  });
  const timedBefore = previous.filter((b) => b.end > b.start).length;
  return { blocks, kept, lost: Math.max(0, timedBefore - kept) };
}

/** 한글 음절에 받침이 있으면 살짝 길게 발음된다. 자동 분배에 쓰는 가중치. */
function weight(text: string): number {
  const code = text.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? 1 : 1.18;
  return 1;
}

/**
 * 블록의 start–end 구간을 음절에 자동 분배한다. V2의 핵심.
 * 사용자는 줄 단위로만 찍고, 음절 타이밍은 여기서 만들어진다.
 */
export function distribute(block: LyricBlock): void {
  const segs = block.segments;
  if (!segs.length) return;
  const span = block.end - block.start;
  if (span <= 0) {
    for (const s of segs) {
      s.start = block.start;
      s.end = block.start;
    }
    return;
  }
  const weights = segs.map((s) => weight(s.text));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = block.start;
  segs.forEach((s, i) => {
    const share = (weights[i] / total) * span;
    s.start = t;
    t = i === segs.length - 1 ? block.end : t + share;
    s.end = t;
  });
}

/** 텍스트만 바꾸고 타이밍은 유지한다. 오타 수정이 작업을 날리지 않도록. */
export function retext(block: LyricBlock, text: string): void {
  block.text = text;
  block.segments = segmentKorean(text);
  distribute(block);
}

export const timedCount = (blocks: LyricBlock[]) => blocks.filter((b) => b.end > b.start).length;

export function flatten(blocks: LyricBlock[]) {
  return blocks.flatMap((block, bi) => block.segments.map((segment, si) => ({ block, segment, bi, si })));
}
