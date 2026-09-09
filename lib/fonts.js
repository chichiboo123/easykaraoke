export const fonts = [['system-ui', '시스템 기본 글꼴'], ['TJ Joy', 'TJ 노래하는즐거움체'], ['Noto Sans KR', 'Noto Sans KR'], ['Jua', 'Jua'], ['Do Hyeon', 'Do Hyeon'], ['Gowun Dodum', 'Gowun Dodum'], ['Black Han Sans', 'Black Han Sans']];
export async function loadBuiltins() { const entries = [['TJ Joy', './fonts/TJJoyofsingingM.otf'], ['Noto Sans KR', './fonts/NotoSansKR-Regular.woff2'], ['Jua', './fonts/Jua-Regular.woff2'], ['Do Hyeon', './fonts/DoHyeon-Regular.woff2'], ['Gowun Dodum', './fonts/GowunDodum-Regular.woff2'], ['Black Han Sans', './fonts/BlackHanSans-Regular.woff2']]; const failed = []; for (const [f, u] of entries)
    try {
        const face = new FontFace(f, `url(${u})`);
        await face.load();
        document.fonts.add(face);
    }
    catch {
        failed.push(f);
    } await document.fonts.ready; return failed; }
export async function loadCustomFont(file) { const family = `내 글꼴 ${file.name.replace(/\.[^.]+$/, '')}`; const face = new FontFace(family, await file.arrayBuffer()); await face.load(); document.fonts.add(face); await document.fonts.ready; return family; }
