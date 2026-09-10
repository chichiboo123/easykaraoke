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
    let index = blocks.findIndex((b) => b.end > b.start && time >= b.start && time < b.end);
    if (index < 0) {
        // 구간 사이(간주)라면 다음에 올 블록을 미리 보여준다.
        const upcoming = blocks.findIndex((b) => b.end > b.start && b.start > time);
        index = upcoming >= 0 ? upcoming : blocks.lastIndexOf(timed[timed.length - 1]);
    }
    return { block: blocks[index], next: blocks[index + 1], index };
}
/** 첫 가사가 시작되는 시각. 인트로 카드와 카운트다운의 기준. */
export function firstCue(p) {
    const timed = p.blocks.filter((b) => b.end > b.start);
    return timed.length ? timed[0].start : 0;
}
/** 아직 타이밍이 없는 첫 블록의 위치. "이어서 찍기"의 기준. */
export function nextUntimed(p, from = 0) {
    for (let i = Math.max(0, from); i < p.blocks.length; i++)
        if (p.blocks[i].end <= p.blocks[i].start)
            return i;
    return -1;
}
