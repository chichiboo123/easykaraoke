import { audio } from '../audio.js';
import { exportSupport, exportVideo } from '../exporter.js';
import { fonts, loadCustomFont, resolveFamily } from '../fonts.js';
import { firstCue } from '../frame.js';
import { timedCount } from '../lyrics.js';
import { renderFrame } from '../renderer.js';
import { commit, markFileDirty, project, refreshBackground, setBackground, state } from '../store.js';
import { button, clock, el, filePicker, icon, previewCanvas, sizeCanvas, toast } from './shell.js';
const PRESETS = [
    ['classic', '클래식 노래방'],
    ['stage', '무대 조명'],
    ['dream', '꿈결'],
    ['classroom', '밝은 교실'],
    ['retro', '레트로 팝'],
    ['minimal', '미니멀'],
];
let raf = 0;
export function stopFinish() {
    cancelAnimationFrame(raf);
    raf = 0;
}
export function finishScreen(rerender, go) {
    const p = project();
    const root = el('div', { class: 'screen screen-finish' });
    const preview = previewCanvas('preview');
    // 미리보기 시각: 첫 가사가 잘 보이는 지점
    let previewTime = firstCue(p) + 0.6;
    const redraw = () => {
        const ctx = sizeCanvas(preview);
        renderFrame(ctx, project(), audio.paused ? previewTime : audio.currentTime, state.bgPrepared);
    };
    root.append(el('div', { class: 'stage stage-sticky' }, [preview]));
    // ── 무대 프리셋 ───────────────────────────────────────
    const presetGrid = el('div', { class: 'thumb-grid' });
    for (const [id, label] of PRESETS) {
        const thumb = el('canvas', { class: 'thumb-canvas', width: 320, height: 180 });
        const b = el('button', { class: `thumb${p.style.preset === id ? ' is-chosen' : ''}`, type: 'button' }, [
            thumb,
            el('b', { textContent: label }),
        ]);
        b.onclick = () => {
            commit('preset', () => {
                project().style.preset = id;
            });
            for (const other of Array.from(presetGrid.children))
                other.classList.remove('is-chosen');
            b.classList.add('is-chosen');
            redraw();
        };
        presetGrid.append(b);
        // 썸네일을 실제 렌더러로 그린다. V1은 CSS 색을 따로 하드코딩해 결과와 달랐다.
        queueMicrotask(() => {
            const ctx = thumb.getContext('2d');
            ctx.setTransform(320 / 1920, 0, 0, 180 / 1080, 0, 0);
            renderFrame(ctx, { ...project(), style: { ...project().style, preset: id }, intro: { countdown: false, seconds: 0 } }, previewTime, state.bgPrepared);
        });
    }
    // ── 글꼴 ─────────────────────────────────────────────
    const fontGrid = el('div', { class: 'font-grid' });
    const buildFonts = () => {
        fontGrid.replaceChildren(...fonts.map((f) => {
            const b = el('button', {
                class: `font-card${project().style.fontFamily === f.family ? ' is-chosen' : ''}${f.ready ? '' : ' is-missing'}`,
                type: 'button',
                disabled: !f.ready,
                title: f.ready ? f.label : '이 글꼴 파일이 없어서 쓸 수 없어요',
            });
            if (f.ready)
                b.style.fontFamily = `"${f.family}", system-ui, sans-serif`;
            b.append(el('b', { textContent: f.label }), el('span', { textContent: '우리 함께 노래해요!' }));
            if (!f.ready)
                b.append(el('em', { class: 'badge', textContent: '파일 없음' }));
            b.onclick = () => {
                commit('font', () => {
                    project().style.fontFamily = f.family;
                });
                buildFonts();
                redraw();
            };
            return b;
        }));
    };
    buildFonts();
    const fontPick = filePicker({
        label: '내 글꼴 추가',
        accept: '.otf,.ttf,.woff2,font/otf,font/ttf',
        icon: 'add',
        onPick: async (file) => {
            try {
                const family = await loadCustomFont(file);
                state.files.font = file;
                markFileDirty('font');
                commit('font', () => {
                    project().style.fontFamily = family;
                });
                buildFonts();
                redraw();
                toast('글꼴을 추가했어요.', 'success');
            }
            catch {
                toast('이 글꼴 파일은 읽을 수 없어요.', 'error');
            }
        },
    });
    // ── 배경과 설정 ───────────────────────────────────────
    const bgPick = filePicker({
        label: state.files.background ? '배경 바꾸기' : '배경 이미지 넣기',
        accept: 'image/png,image/jpeg,image/webp',
        icon: 'image',
        onPick: async (file) => {
            await setBackground(file);
            redraw();
            rerender();
        },
    });
    const settings = el('div', { class: 'settings' }, [
        slider('밝기', 'brightness', 30, 130, 1, redraw),
        slider('어둡게', 'darken', 0, 85, 1, redraw),
        slider('흐림', 'blur', 0, 24, 1, () => {
            refreshBackground();
            redraw();
        }),
    ]);
    const toggles = el('div', { class: 'toggle-row' }, [
        checkbox('진행바 보이기', p.style.progress, (v) => {
            commit('progress', () => {
                project().style.progress = v;
            });
            redraw();
        }),
        checkbox('시작 전 카운트다운', p.intro.countdown, (v) => {
            commit('countdown', () => {
                project().intro.countdown = v;
            });
            redraw();
        }),
    ]);
    if (p.musicalMode) {
        const sel = el('select', { class: 'input' });
        sel.setAttribute('aria-label', '가사 색상 방식');
        sel.append(el('option', { value: 'common', textContent: '모두 같은 색', selected: p.style.colorMode === 'common' }), el('option', { value: 'role', textContent: '배역마다 다른 색', selected: p.style.colorMode === 'role' }));
        sel.onchange = () => {
            commit('colorMode', () => {
                project().style.colorMode = sel.value;
            });
            redraw();
        };
        toggles.append(el('label', { class: 'field' }, [el('span', { textContent: '가사 색상' }), sel]));
    }
    root.append(panel('무대', presetGrid), panel('글자', el('div', { class: 'stack' }, [fontGrid, fontPick])), panel('배경', el('div', { class: 'stack' }, [
        el('div', { class: 'row' }, [
            bgPick,
            state.files.background
                ? button({
                    kind: 'ghost',
                    icon: 'delete_outline',
                    label: '배경 지우기',
                    onClick: async () => {
                        await setBackground(undefined);
                        redraw();
                        rerender();
                    },
                })
                : null,
        ]),
        state.files.background ? settings : el('p', { class: 'hint', textContent: '배경 이미지를 넣으면 밝기·어둡게·흐림을 조절할 수 있어요.' }),
        toggles,
    ])), exportPanel(go));
    queueMicrotask(() => {
        // 저장된 글꼴이 실제로 없으면 쓸 수 있는 글꼴로 조용히 대체한다.
        const resolved = resolveFamily(project().style.fontFamily);
        if (resolved !== project().style.fontFamily) {
            project().style.fontFamily = resolved;
            buildFonts();
        }
        redraw();
        stopFinish();
        const loop = () => {
            if (!preview.isConnected)
                return;
            if (!audio.paused)
                redraw();
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
    });
    return root;
    function slider(label, key, min, max, step, after) {
        const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(project().style[key]), class: 'slider' });
        input.setAttribute('aria-label', label);
        const out = el('output', { textContent: String(project().style[key]) });
        input.oninput = () => {
            out.textContent = input.value;
            commit(`style-${key}`, () => {
                project().style[key] = Number(input.value);
            });
            after();
        };
        return el('label', { class: 'field field-slider' }, [el('span', { textContent: label }), input, out]);
    }
}
function checkbox(label, value, onChange) {
    const input = el('input', { type: 'checkbox', checked: value });
    input.onchange = () => onChange(input.checked);
    return el('label', { class: 'check' }, [input, el('span', { textContent: label })]);
}
function panel(title, body) {
    return el('section', { class: 'panel' }, [el('div', { class: 'panel-head' }, [el('h2', { textContent: title })]), body]);
}
/** ③ 저장 — 부분 타이밍도, 구간 시험 렌더도 허용한다. */
function exportPanel(go) {
    const p = project();
    const support = exportSupport();
    const timed = timedCount(p.blocks);
    const total = p.blocks.length;
    const checks = el('div', { class: 'checklist' }, [
        check(!!p.media.name, '반주', p.media.name || '반주가 필요해요'),
        check(timed > 0, '타이밍', total ? `${timed} / ${total}줄 완료` : '가사를 먼저 넣어 주세요'),
        check(support.supported, '이 브라우저', support.container === 'mp4' ? 'MP4로 저장할 수 있어요' : support.container === 'webm' ? 'WebM으로 저장할 수 있어요' : '아이폰·아이패드 사파리는 영상 저장을 지원하지 않아요'),
    ]);
    const stage = el('b', { class: 'export-stage', textContent: '준비 중' });
    const bar = el('progress', { max: 100, value: 0, class: 'export-bar' });
    const pct = el('output', { class: 'export-pct', textContent: '0%' });
    const box = el('div', { class: 'export-progress', hidden: true }, [stage, bar, pct]);
    const result = el('div', { class: 'export-result' });
    const ext = support.container === 'mp4' ? 'mp4' : 'webm';
    const ready = !!p.media.name && timed > 0 && support.supported;
    const run = async (range, height = 1080) => {
        const ctl = new AbortController();
        box.hidden = false;
        result.replaceChildren();
        makeBtn.disabled = true;
        testBtn.disabled = true;
        cancel.onclick = () => ctl.abort();
        const started = performance.now();
        try {
            const blob = await exportVideo({
                project: project(),
                background: state.bgPrepared,
                range,
                height,
                monitor: false,
                signal: ctl.signal,
                onProgress: (s) => {
                    bar.value = s.percent;
                    pct.textContent = `${s.percent}%`;
                    stage.textContent = s.eta > 1 ? `${s.stage} · 약 ${Math.ceil(s.eta)}초 남음` : s.stage;
                },
            });
            const url = URL.createObjectURL(blob);
            const name = `${project().meta.title || '노래방'}${range ? '-미리보기' : ''}.${ext}`;
            const size = (blob.size / 1024 / 1024).toFixed(1);
            result.replaceChildren(el('div', { class: 'success' }, [
                icon('check_circle'),
                el('div', {}, [el('b', { textContent: range ? '시험 렌더 완성!' : '영상이 완성됐어요!' }), el('small', { textContent: `${name} · ${size}MB` })]),
                el('a', { class: 'btn btn-primary', href: url, download: name, textContent: '내려받기' }),
            ]));
            toast(range ? '시험 렌더가 끝났어요.' : '영상이 완성됐어요!', 'success');
        }
        catch (e) {
            const aborted = e instanceof DOMException && e.name === 'AbortError';
            toast(aborted ? '영상 만들기를 멈췄어요.' : e instanceof Error ? e.message : '영상을 만들지 못했어요.', aborted ? 'info' : 'error');
        }
        finally {
            box.hidden = true;
            bar.value = 0;
            makeBtn.disabled = !ready;
            testBtn.disabled = !ready;
            void started;
        }
    };
    const cancel = button({ kind: 'ghost', icon: 'close', label: '멈추기' });
    box.append(cancel);
    // 구간 시험 렌더: 4분을 기다리지 않고 15초로 확인한다.
    const testBtn = button({
        kind: 'secondary',
        icon: 'preview',
        label: '15초만 시험 렌더',
        disabled: !ready,
        onClick: () => {
            const from = Math.max(0, firstCue(project()) - 2);
            run({ from, to: Math.min(project().media.duration, from + 15) }, 720);
        },
    });
    const makeBtn = button({
        kind: 'primary',
        icon: 'movie',
        label: `${ext.toUpperCase()} 영상 만들기`,
        disabled: !ready,
        onClick: () => run(undefined, 1080),
    });
    const notes = el('ul', { class: 'export-notes' }, [
        el('li', { textContent: `노래 길이만큼 시간이 걸려요 (약 ${clock(p.media.duration)}). 만드는 동안 이 탭을 그대로 두세요.` }),
        timed < total ? el('li', { class: 'warn', textContent: `아직 ${total - timed}줄은 타이밍이 없어요. 그 줄은 채워지지 않은 채로 나옵니다.` }) : null,
        !support.supported ? el('li', { class: 'warn', textContent: '아이폰·아이패드 사파리는 영상 저장을 지원하지 않아요. 컴퓨터의 Chrome이나 Edge에서 열어 주세요.' }) : null,
    ]);
    return el('section', { class: 'panel panel-export' }, [
        el('div', { class: 'panel-head' }, [el('h2', { textContent: '저장하기' })]),
        checks,
        el('div', { class: 'row' }, [makeBtn, testBtn, button({ kind: 'ghost', icon: 'tune', label: '타이밍 더 다듬기', onClick: () => go(2) })]),
        notes,
        box,
        result,
    ]);
}
function check(ok, title, detail) {
    return el('div', { class: `check-item${ok ? ' is-ok' : ' is-warn'}` }, [
        icon(ok ? 'check_circle' : 'error_outline'),
        el('div', {}, [el('b', { textContent: title }), el('small', { textContent: detail })]),
    ]);
}
