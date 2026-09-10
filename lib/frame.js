export function segmentProgress(s, time) {
    if (s.end <= s.start)
        return time >= s.start && s.start > 0 ? 1 : 0;
    if (time <= s.start)
        return 0;
    if (time >= s.end)
        return 1;
    return (time - s.start) / (s.end - s.start);
}
/**
 * 지금 보여줄 블록을 고른다.
 * V1은 타이밍이 하나도 없을 때 "마지막 블록"을 돌려줘서 미리보기에 끝 줄이 떴다.
 * V2는 그럴 때 첫 블록을 보여준다.
 */
export function blockAt(p, time) {
    const blocks = p.blocks;
    if (!blocks.length)
        return { index: -1 };
    const timed = blocks.filter((b) => b.end > b.start);
    if (!timed.length)
        return { block: blocks[0], next: blocks[1], index: 0 };
    const index = blocks.findIndex((b) => b.end > b.start && time >= b.start && time < b.end);
    // 어떤 블록에도 속하지 않는 시각이면 아무 가사도 보여주지 않는다.
    // 예전에는 다음에 올 블록을 미리 띄워, 간주 내내 이전 가사가 남아 있는 것처럼 보였다.
    if (index < 0)
        return { index: -1, next: blocks.find((b) => b.end > b.start && b.start > time) };
    return { block: blocks[index], next: nextLyric(blocks, index), index };
}
/** 다음에 보여줄 가사. 간주 블록은 건너뛴다. */
function nextLyric(blocks, from) {
    for (let i = from + 1; i < blocks.length; i++)
        if (blocks[i].kind !== 'interlude')
            return blocks[i];
    return undefined;
}
/** 첫 가사가 시작되는 시각. 인트로 카드와 카운트다운의 기준. */
export function firstCue(p) {
    const timed = p.blocks.filter((b) => b.end > b.start);
    return timed.length ? timed[0].start : 0;
}
/** 아직 타이밍이 없는 첫 블록의 위치. "이어서 찍기"의 기준. */
export function nextUntimed(p, from = 0) {
    for (let i = Math.max(0, from); i < p.blocks.length; i++) {
        const b = p.blocks[i];
        if (b.kind !== 'interlude' && b.end <= b.start)
            return i;
    }
    return -1;
}
