export const uid = () => crypto.randomUUID();
export const newProject = (title) => ({
    version: 2,
    id: uid(),
    updatedAt: Date.now(),
    musicalMode: false,
    meta: { title, musical: '', number: '', composer: '', lyricist: '' },
    roles: [{ id: 'all', name: '전체', color: '#ffd43b' }],
    blocks: [],
    style: { preset: 'classic', fontFamily: 'Noto Sans KR', colorMode: 'common', progress: true, brightness: 100, darken: 30, blur: 0 },
    timing: { offset: 0, cursor: 0, rate: 1, volume: 1 },
    intro: { countdown: true, seconds: 4 },
    view: { zoom: 1, loopA: 0, loopB: 0, loopOn: false },
    media: { name: '', type: '', duration: 0 },
});
/**
 * V1 프로젝트를 V2로 올린다. V1에는 블록 start/end와 음절 원문 오프셋이 없으므로
 * 음절 타이밍에서 블록 구간을 복원하고, 오프셋은 원문에서 다시 찾아 채운다.
 */
export function migrate(raw) {
    if (raw.version === 2)
        return normalize(raw);
    const base = newProject(raw.meta?.title || '제목 없음');
    const legacyBlocks = raw.lyricBlocks || [];
    return normalize({
        ...base,
        id: raw.id || base.id,
        musicalMode: typeof raw.musicalMode === 'boolean' ? raw.musicalMode : true,
        meta: { ...base.meta, ...raw.meta },
        roles: raw.roles?.length ? raw.roles : base.roles,
        style: { ...base.style, ...raw.style },
        media: { ...base.media, ...raw.media },
        blocks: legacyBlocks.map((b) => {
            const text = b.text || '';
            const segments = rebuildOffsets(text, b.segments || []);
            const timed = segments.filter((s) => s.end > s.start);
            return {
                id: b.id || uid(),
                text,
                roleId: b.roleId || 'all',
                start: timed.length ? timed[0].start : 0,
                end: timed.length ? timed[timed.length - 1].end : 0,
                segments,
            };
        }),
    });
}
/** V1 음절 배열에 원문 오프셋을 되붙인다. 텍스트가 어긋나면 균등 배치로 폴백한다. */
function rebuildOffsets(text, legacy) {
    const out = [];
    let cursor = 0;
    for (const s of legacy) {
        const body = s.text || '';
        const at = body ? text.indexOf(body, cursor) : -1;
        const charStart = at >= 0 ? at : cursor;
        const charEnd = charStart + (body.length || 1);
        cursor = charEnd;
        out.push({ id: s.id || uid(), text: body, charStart, charEnd, start: s.start || 0, end: s.end || 0 });
    }
    return out;
}
/** 어떤 경로로 들어온 프로젝트든 필드 누락 없이 만든다. */
export function normalize(p) {
    const base = newProject(p.meta?.title || '제목 없음');
    return {
        ...base,
        ...p,
        version: 2,
        meta: { ...base.meta, ...p.meta },
        style: { ...base.style, ...p.style },
        timing: { ...base.timing, ...p.timing },
        intro: { ...base.intro, ...p.intro },
        view: { ...base.view, ...p.view },
        media: { ...base.media, ...p.media },
        roles: p.roles?.length ? p.roles : base.roles,
        blocks: (p.blocks || []).map((b) => ({ ...b, segments: b.segments || [] })),
    };
}
