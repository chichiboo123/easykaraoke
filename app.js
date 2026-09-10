import { migrate } from './types.js';
import { audio, computePeaks, setRate, setSource, setVolume } from './lib/audio.js';
import { loadBuiltins, loadCustomFont, resolveFamily } from './lib/fonts.js';
import { timedCount } from './lib/lyrics.js';
import { adopt, create, hydrateFiles, onSaveState, project, resetSession, save, saveState, setBackground, state, undo, redo, notify } from './lib/store.js';
import { loadProjects, removeProject } from './lib/storage.js';
import { acceptAudio, prepareScreen } from './lib/ui/prepare.js';
import { clearStudioHooks, nudgeSelected, studioScreen, studioStamp, studioToggle, stopStudio } from './lib/ui/studio.js';
import { finishScreen, stopFinish } from './lib/ui/finish.js';
import { startHero, stopHero } from './lib/ui/hero.js';
import { button, clock, confirmDialog, dropzone, el, icon, toast } from './lib/ui/shell.js';
const app = document.getElementById('app');
const THEME_KEY = 'yeogi-theme';
// ── 테마 ────────────────────────────────────────────────
function applyTheme(dark) {
    state.dark = dark;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
        localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    }
    catch {
        /* 시크릿 모드 */
    }
}
function initTheme() {
    let stored = null;
    try {
        stored = localStorage.getItem(THEME_KEY);
    }
    catch {
        /* 무시 */
    }
    // 기본은 라이트. 편집 화면은 어두운 무대를 쓰지만, 처음 만나는 화면은 밝게.
    applyTheme(stored ? stored === 'dark' : false);
}
// ── 껍데기 ──────────────────────────────────────────────
function chrome(body, opts = {}) {
    const header = el('header', { class: 'app-bar' });
    const brand = button({
        kind: 'ghost',
        icon: 'graphic_eq',
        label: '여기 있어 노래방',
        onClick: () => (state.project ? confirmHome() : home()),
    });
    brand.classList.add('brand');
    header.append(brand);
    if (opts.steps && state.project)
        header.append(stepNav());
    const right = el('div', { class: 'app-bar-right' });
    if (state.project)
        right.append(saveBadge());
    right.append(button({
        kind: 'ghost',
        icon: state.dark ? 'light_mode' : 'dark_mode',
        title: state.dark ? '밝은 화면으로' : '어두운 화면으로',
        onClick: () => {
            applyTheme(!state.dark);
            render();
        },
    }));
    header.append(right);
    const footer = el('footer', { class: 'chichiboo-footer' }, [
        el('a', { href: 'https://litt.ly/chichiboo', target: '_blank', rel: 'noopener noreferrer' }, [icon('auto_stories'), el('span', { textContent: 'Created by. 교육뮤지컬 꿈꾸는 치수쌤' })]),
    ]);
    app.replaceChildren(header, el('main', { class: 'app-main' }, [body]), footer);
}
function stepNav() {
    const nav = el('nav', { class: 'steps' });
    nav.setAttribute('aria-label', '만들기 단계');
    const labels = [
        [1, '준비', 'library_music'],
        [2, '타이밍', 'ads_click'],
        [3, '꾸미기', 'palette'],
    ];
    for (const [n, label, ic] of labels) {
        const b = button({ kind: 'ghost', icon: ic, label, onClick: () => go(n) });
        b.classList.add('step');
        if (state.step === n) {
            b.classList.add('is-active');
            b.setAttribute('aria-current', 'step');
        }
        nav.append(b);
    }
    return nav;
}
function saveBadge() {
    const badge = el('span', { class: 'save-badge' });
    const paint = (s) => {
        badge.className = `save-badge is-${s}`;
        badge.replaceChildren(icon(s === 'error' ? 'cloud_off' : s === 'saving' ? 'sync' : 'cloud_done'), el('span', { textContent: s === 'error' ? '저장 실패' : s === 'saving' ? '저장 중' : '자동 저장됨' }));
    };
    paint(saveState);
    onSaveState(paint);
    return badge;
}
// ── 라우팅 ──────────────────────────────────────────────
function teardown() {
    stopStudio();
    stopFinish();
    stopHero();
    clearStudioHooks();
}
export function go(step) {
    state.step = step;
    render();
}
function render() {
    teardown();
    if (!state.project)
        return void home();
    const body = state.step === 1 ? prepareScreen(render, go) : state.step === 2 ? studioScreen(render, go) : finishScreen(render, go);
    // 편집 화면(2·3단계)은 페이지 스크롤 없이 화면을 꽉 채우는 편집기 셸을 쓴다.
    // 준비 화면과 홈은 일반 문서처럼 스크롤한다.
    app.classList.toggle('is-editor', state.step !== 1);
    chrome(body, { steps: true });
    // 스크린리더가 새 화면의 시작을 읽도록 제목으로 포커스를 옮긴다.
    const heading = body.querySelector('h1, h2');
    if (heading instanceof HTMLElement) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
    }
}
async function confirmHome() {
    const ok = await confirmDialog({ title: '처음 화면으로 갈까요?', body: '지금까지 만든 것은 자동으로 저장돼 있어요. 언제든 다시 열 수 있습니다.', confirm: '처음 화면으로' });
    if (ok) {
        audio.pause();
        resetSession();
        state.project = null;
        home();
    }
}
// ── 홈 ─────────────────────────────────────────────────
async function home() {
    teardown();
    app.classList.remove('is-editor');
    const recent = await loadProjects().catch(() => []);
    const canRecord = typeof MediaRecorder !== 'undefined';
    // 히어로는 이 앱이 만들어 주는 결과물 그 자체다. 설명보다 재생해 보이는 편이 빠르다.
    const stage = el('canvas', { class: 'hero-canvas' });
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', '여기 있어 노래방이 만드는 노래방 반주 영상 미리보기');
    const hero = el('section', { class: 'hero' }, [
        el('div', { class: 'hero-screen' }, [stage, el('div', { class: 'hero-glow' })]),
        el('div', { class: 'hero-copy' }, [
            el('span', { class: 'hero-tag' }, [icon('graphic_eq'), el('span', { textContent: 'Easy Karaoke' })]),
            el('h1', {}, [el('span', { textContent: '세상의 모든 음악,' }), el('em', { textContent: '노래방 반주 영상 뚝딱' })]),
            el('p', { class: 'lead', textContent: '반주와 가사만 넣고, 노래를 들으며 한 줄마다 스페이스바 한 번. 나머지는 알아서 맞춰집니다.' }),
            el('div', { class: 'hero-actions' }, [
                button({ kind: 'primary', icon: 'play_circle', label: '새 노래 만들기', onClick: createDialog }),
                openFileButton(),
            ]),
            el('p', { class: 'hero-note' }, [icon('lock'), el('span', { textContent: '음원과 작업 파일은 내 브라우저 밖으로 나가지 않아요.' })]),
        ]),
    ]);
    const how = el('section', { class: 'how' }, [
        step('1', 'library_music', '반주와 가사 넣기', 'MP3를 끌어다 놓고 가사를 붙여넣기'),
        step('2', 'ads_click', '줄마다 한 번 찍기', '한 곡에 20~40번이면 끝나요'),
        step('3', 'movie', '영상으로 저장', 'MP4로 내려받아 바로 재생'),
    ]);
    const body = el('div', { class: 'screen screen-home' }, [hero, how]);
    if (!canRecord) {
        body.append(el('p', { class: 'notice' }, [icon('info'), el('span', { textContent: '이 브라우저는 영상 저장을 지원하지 않아요. 만들기는 되지만 저장하려면 컴퓨터의 Chrome이나 Edge가 필요합니다.' })]));
    }
    if (recent.length) {
        const list = el('div', { class: 'recent-grid' });
        for (const p of recent) {
            const card = el('article', { class: 'recent-card' });
            const openBtn = el('button', { class: 'recent-open', type: 'button' }, [
                el('b', { textContent: p.meta.title || '제목 없음' }),
                el('small', { textContent: `${p.blocks.length}줄 · 타이밍 ${timedCount(p.blocks)}줄 · ${new Date(p.updatedAt).toLocaleDateString('ko-KR')}` }),
            ]);
            openBtn.onclick = () => openRecent(p);
            card.append(openBtn, button({
                kind: 'ghost',
                icon: 'delete_outline',
                title: `${p.meta.title} 삭제`,
                onClick: async () => {
                    const ok = await confirmDialog({ title: '이 작업을 지울까요?', body: `"${p.meta.title}"을(를) 지우면 되돌릴 수 없어요.`, confirm: '지우기', danger: true });
                    if (!ok)
                        return;
                    await removeProject(p.id);
                    toast('지웠어요.');
                    home();
                },
            }));
            list.append(card);
        }
        body.append(el('section', { class: 'panel recent-panel' }, [el('div', { class: 'panel-head' }, [el('h2', { textContent: '이어서 만들기' })]), list]));
    }
    chrome(body);
    startHero(stage);
    // 홈에서 음원을 끌어다 놓으면 바로 새 프로젝트로 시작한다.
    dropzone(body, (f) => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac)$/i.test(f.name), async (f) => {
        create(f.name.replace(/\.[^.]+$/, ''));
        await acceptAudio(f, () => undefined);
        go(1);
    });
}
function step(no, ic, title, detail) {
    return el('div', { class: 'how-step' }, [
        el('span', { class: 'how-no', textContent: no }),
        icon(ic),
        el('b', { textContent: title }),
        el('small', { textContent: detail }),
    ]);
}
function createDialog() {
    const dlg = el('dialog', { class: 'dialog' });
    const form = el('form', { class: 'stack' });
    const title = el('input', { class: 'input', name: 'title', required: true, placeholder: '예) 여기 있어' });
    title.setAttribute('aria-label', '곡 제목');
    const musical = el('input', { class: 'input', name: 'musical', placeholder: '예) 우리들의 봄' });
    musical.setAttribute('aria-label', '작품명');
    form.append(el('label', { class: 'field' }, [el('span', { textContent: '곡 제목 *' }), title]), el('label', { class: 'field' }, [el('span', { textContent: '작품명 (선택)' }), musical]), el('div', { class: 'dialog-actions' }, [
        button({ kind: 'ghost', label: '취소', onClick: () => (dlg.close(), dlg.remove()) }),
        el('button', { class: 'btn btn-primary', type: 'submit', textContent: '시작하기' }),
    ]));
    form.onsubmit = (e) => {
        e.preventDefault();
        if (!title.value.trim())
            return;
        dlg.close();
        dlg.remove();
        create(title.value.trim(), { musical: musical.value.trim() });
        go(1);
    };
    dlg.append(el('h2', { textContent: '새 노래 만들기' }), form);
    document.body.append(dlg);
    dlg.showModal();
    title.focus();
}
async function openRecent(meta) {
    const files = await hydrateFiles(meta.id);
    adopt(meta, files);
    await restoreFiles();
    go(state.project.media.name ? 2 : 1);
}
/** 저장된 파일을 오디오 엔진·배경·글꼴에 되살린다. */
async function restoreFiles() {
    const p = project();
    if (state.files.audio) {
        try {
            p.media.duration = await setSource(state.files.audio);
            computePeaks(state.files.audio).catch(() => undefined);
        }
        catch {
            toast('저장된 반주를 불러오지 못했어요. 다시 넣어 주세요.', 'error');
        }
    }
    if (state.files.background)
        await setBackground(state.files.background);
    if (state.files.font) {
        try {
            await loadCustomFont(new File([state.files.font], 'custom.otf'));
        }
        catch {
            /* 사용자 글꼴 복원 실패는 치명적이지 않다 */
        }
    }
    // V1은 저장된 fontBlob이 있으면 사용자의 나중 선택을 무시하고 항상 덮어썼다.
    p.style.fontFamily = resolveFamily(p.style.fontFamily);
    setVolume(p.timing.volume);
    setRate(p.timing.rate);
    save();
}
// ── 프로젝트 파일 (.mkaraoke) ─────────────────────────────
function openFileButton() {
    const input = el('input', { type: 'file', accept: '.mkaraoke,application/json', class: 'visually-hidden' });
    const b = button({ kind: 'secondary', icon: 'folder_open', label: '저장한 작업 열기', onClick: () => input.click() });
    input.onchange = async () => {
        const f = input.files?.[0];
        input.value = '';
        if (f)
            await importPackage(f);
    };
    return el('span', { class: 'file-picker' }, [b, input]);
}
async function importPackage(file) {
    try {
        const raw = JSON.parse(await file.text());
        if (raw.format !== 'mkaraoke' || !raw.project)
            throw new Error('형식이 다릅니다');
        const p = migrate(raw.project);
        const existing = (await loadProjects().catch(() => [])).find((x) => x.id === p.id);
        if (existing) {
            const ok = await confirmDialog({ title: '같은 작업이 이미 있어요', body: `"${existing.meta.title}"을(를) 이 파일의 내용으로 바꿀까요?`, confirm: '덮어쓰기', danger: true });
            if (!ok)
                return;
        }
        adopt(p, { audio: decode(raw.audio), background: decode(raw.background), font: decode(raw.font) });
        await restoreFiles();
        toast('작업을 열었어요.', 'success');
        go(state.project.media.name ? 2 : 1);
    }
    catch {
        toast('이 파일은 열 수 없어요. .mkaraoke 파일인지 확인해 주세요.', 'error');
    }
}
function decode(x) {
    if (!x)
        return undefined;
    const bin = atob(x.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: x.type });
}
async function encode(b) {
    if (!b)
        return null;
    const bytes = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 32768)
        s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { type: b.type, data: btoa(s) };
}
export async function downloadPackage() {
    const p = project();
    toast('작업 파일을 만드는 중이에요…');
    const payload = {
        format: 'mkaraoke',
        project: structuredClone(p),
        audio: await encode(state.files.audio),
        background: await encode(state.files.background),
        font: await encode(state.files.font),
    };
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' })), download: `${p.meta.title || '노래방'}.mkaraoke` });
    a.click();
    URL.revokeObjectURL(a.href);
}
// ── 전역 단축키 ──────────────────────────────────────────
function isTyping(t) {
    return t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable);
}
window.addEventListener('keydown', (e) => {
    if (isTyping(e.target))
        return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const ok = e.shiftKey ? redo() : undo();
        toast(ok ? (e.shiftKey ? '다시 실행했어요.' : '되돌렸어요.') : '더 이상 없어요.');
        if (ok)
            render();
        return;
    }
    if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (state.project)
            downloadPackage();
        return;
    }
    if (!state.project || state.step !== 2)
        return;
    if (e.code === 'Space') {
        e.preventDefault();
        studioStamp?.(e.timeStamp);
    }
    else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        studioToggle?.();
    }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey || e.altKey) {
            if (nudgeSelected(dir * (e.shiftKey ? 50 : 10)))
                e.preventDefault();
        }
        else {
            e.preventDefault();
            audio.currentTime = Math.max(0, audio.currentTime + dir * 2);
        }
    }
});
// 페이지 밖으로 파일을 놓아 작업이 날아가는 것을 막는다.
for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (e) => {
        if (!e.target?.closest?.('.dropzone, .screen-home'))
            e.preventDefault();
    });
}
window.addEventListener('beforeunload', () => audio.pause());
// ── 시작 ───────────────────────────────────────────────
initTheme();
onSaveStateNoop();
function onSaveStateNoop() {
    /* saveBadge가 구독을 건다. 여기서는 초기화만. */
}
// 홈 화면은 글꼴이 필요 없다. 먼저 띄우고 글꼴은 뒤에서 준비한다.
// 이렇게 해야 CDN이 느린 학교 네트워크에서도 앱이 즉시 뜬다.
home();
loadBuiltins()
    .then((list) => {
    const unavailable = list.filter((f) => f.source !== 'system' && !f.ready);
    if (unavailable.length)
        console.warn('불러오지 못한 글꼴:', unavailable.map((f) => f.label).join(', '));
    notify();
})
    .catch(() => undefined);
export { clock };
