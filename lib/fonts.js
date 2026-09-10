/**
 * 내장 글꼴. V1은 파일이 하나도 없는데 6종 카드를 전부 정상처럼 보여줬다.
 * V2는 로드 결과를 ready로 남겨 UI가 실패한 글꼴을 비활성 처리한다.
 */
export const fonts = [
    { family: 'TJ Joy', label: 'TJ 노래하는즐거움체', url: './fonts/TJJoyofsingingM.otf', ready: false },
    { family: 'Noto Sans KR', label: '노토 산스', url: './fonts/NotoSansKR-Regular.woff2', ready: false },
    { family: 'Jua', label: '주아체', url: './fonts/Jua-Regular.woff2', ready: false },
    { family: 'Do Hyeon', label: '도현체', url: './fonts/DoHyeon-Regular.woff2', ready: false },
    { family: 'Gowun Dodum', label: '고운돋움', url: './fonts/GowunDodum-Regular.woff2', ready: false },
    { family: 'Black Han Sans', label: '검은고딕', url: './fonts/BlackHanSans-Regular.woff2', ready: false },
];
/** 시스템 글꼴은 파일 없이도 항상 쓸 수 있다. 전부 실패해도 고를 것이 남는다. */
const SYSTEM = { family: 'system-ui', label: '기본 글꼴', ready: true };
export async function loadBuiltins() {
    await Promise.all(fonts.map(async (f) => {
        if (!f.url)
            return;
        try {
            const face = new FontFace(f.family, `url(${f.url})`);
            await face.load();
            document.fonts.add(face);
            f.ready = true;
        }
        catch {
            f.ready = false;
        }
    }));
    if (!fonts.some((f) => f.ready))
        fonts.push(SYSTEM);
    else if (!fonts.includes(SYSTEM))
        fonts.push(SYSTEM);
    await document.fonts.ready;
    return fonts;
}
/** 실제로 쓸 수 있는 글꼴을 고른다. 저장된 선택이 없으면 첫 번째 사용 가능 글꼴. */
export function resolveFamily(requested) {
    const found = fonts.find((f) => f.family === requested);
    if (found?.ready)
        return requested;
    return fonts.find((f) => f.ready)?.family || 'system-ui';
}
export async function loadCustomFont(file) {
    const family = `내 글꼴 ${file.name.replace(/\.[^.]+$/, '')}`;
    const face = new FontFace(family, await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    await document.fonts.ready;
    const existing = fonts.find((f) => f.family === family);
    if (existing)
        existing.ready = true;
    else
        fonts.push({ family, label: family, ready: true, custom: true });
    return family;
}
