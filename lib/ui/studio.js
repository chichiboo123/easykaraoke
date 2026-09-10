import { audio, computePeaks, resume, setRate, setVolume } from '../audio.js';
import { ensureGlyphs, textForProject } from '../fonts.js';
import { blockAt, nextUntimed } from '../frame.js';
import { distribute, isLyric, lyricCount, makeInterlude, retext, segmentKorean, timedCount } from '../lyrics.js';
import { renderFrame } from '../renderer.js';
import { canRedo, canUndo, commit, project, redo, state, touch, undo } from '../store.js';
import { uid } from '../../types.js';
import { TIMELINE_H, draw as drawTimeline, hitTest, windowFor } from '../timeline.js';
import { button, clock, confirmDialog, el, icon, previewCanvas, sizeCanvas, toast } from './shell.js';
const MIN_BLOCK = 0.2;
let raf = 0;
let win = { from: 0, to: 10 };
export function stopStudio() {
    cancelAnimationFrame(raf);
    raf = 0;
}
/**
 * ② 만들기 — V2의 핵심 화면.
 * 미리보기 · 트랜스포트 · 파형 · 블록 트랙 · 블록 카드가 전부 여기 있다.
 * V1은 이것들이 1·3·4단계에 흩어져 있었다.
 */
export function studioScreen(rerender, go) {
    const p = project();
    const root = el('div', { class: 'screen screen-studio' });
    const preview = previewCanvas('preview');
    const timeline = el('canvas', { class: 'timeline-canvas' });
    timeline.setAttribute('role', 'img');
    timeline.setAttribute('aria-label', '파형과 가사 블록 타임라인');
    timeline.style.height = `${TIMELINE_H}px`;
    const cueText = el('b', { class: 'cue-text' });
    const cueQueue = el('div', { class: 'cue-queue' });
    const clockOut = el('output', { class: 'transport-clock' });
    const playBtn = button({ kind: 'primary', icon: 'play_arrow', title: '재생 / 정지 (K)', fallback: '▶', onClick: togglePlay });
    const stampBtn = button({ kind: 'primary', icon: 'ads_click', label: 'Space · 여기서 시작', onClick: stamp });
    const undoBtn = button({ kind: 'ghost', icon: 'undo', title: '되돌리기 (Ctrl+Z)', fallback: '↶', onClick: () => (undo() ? refreshAll() : toast('되돌릴 것이 없어요.')) });
    const redoBtn = button({ kind: 'ghost', icon: 'redo', title: '다시 실행 (Ctrl+Shift+Z)', fallback: '↷', onClick: () => (redo() ? refreshAll() : toast('다시 실행할 것이 없어요.')) });
    const cards = el('div', { class: 'block-list' });
    const progressPill = el('span', { class: 'pill' });
    // ── 트랜스포트 ────────────────────────────────────────
    const rates = el('div', { class: 'seg-control', role: 'group' });
    rates.setAttribute('aria-label', '재생 속도');
    for (const r of [0.5, 0.75, 1]) {
        const b = button({
            kind: 'ghost',
            label: `${r}×`,
            onClick: () => {
                touch(() => {
                    project().timing.rate = r;
                });
                setRate(r);
                syncRates();
            },
        });
        b.dataset.rate = String(r);
        rates.append(b);
    }
    const syncRates = () => {
        for (const b of Array.from(rates.children))
            b.classList.toggle('is-on', Number(b.dataset.rate) === project().timing.rate);
    };
    const volume = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(p.timing.volume), class: 'slider slider-volume' });
    volume.setAttribute('aria-label', '볼륨');
    volume.oninput = () => {
        setVolume(Number(volume.value));
        touch(() => {
            project().timing.volume = Number(volume.value);
        });
    };
    const offset = el('input', { type: 'range', min: '-1', max: '1', step: '0.01', value: String(p.timing.offset), class: 'slider' });
    offset.setAttribute('aria-label', '타이밍 밀기');
    const offsetOut = el('output', { class: 'offset-out', textContent: fmtOffset(p.timing.offset) });
    offset.oninput = () => {
        const v = Number(offset.value);
        offsetOut.textContent = fmtOffset(v);
        commit('offset', () => {
            project().timing.offset = v;
        });
    };
    const zoom = el('input', { type: 'range', min: '0.25', max: '4', step: '0.05', value: String(p.view.zoom), class: 'slider' });
    zoom.setAttribute('aria-label', '타임라인 확대');
    zoom.oninput = () => touch(() => {
        project().view.zoom = Number(zoom.value);
    });
    const loopToggle = button({
        kind: 'ghost',
        icon: 'repeat',
        label: 'A–B 반복',
        onClick: () => {
            const cur = project();
            if (!cur.view.loopOn && cur.view.loopB <= cur.view.loopA) {
                cur.view.loopA = Math.max(0, audio.currentTime - 2);
                cur.view.loopB = Math.min(cur.media.duration, audio.currentTime + 8);
            }
            touch(() => {
                cur.view.loopOn = !cur.view.loopOn;
            });
            loopToggle.classList.toggle('is-on', cur.view.loopOn);
            toast(cur.view.loopOn ? `${clock(cur.view.loopA)} – ${clock(cur.view.loopB)} 구간을 반복해요.` : '구간 반복을 껐어요.');
        },
    });
    loopToggle.classList.toggle('is-on', p.view.loopOn);
    const transport = el('div', { class: 'transport' }, [
        playBtn,
        clockOut,
        el('div', { class: 'transport-group' }, [icon('speed'), rates]),
        el('div', { class: 'transport-group' }, [icon('volume_up'), volume]),
        loopToggle,
        el('div', { class: 'transport-group transport-right' }, [undoBtn, redoBtn]),
    ]);
    const tuning = el('div', { class: 'tuning' }, [
        el('label', { class: 'tuning-item' }, [el('span', { textContent: '타이밍 밀기' }), offset, offsetOut]),
        el('label', { class: 'tuning-item' }, [el('span', { textContent: '확대' }), zoom]),
        button({
            kind: 'ghost',
            icon: 'skip_next',
            label: '안 찍은 줄로',
            onClick: () => {
                const i = nextUntimed(project());
                if (i < 0)
                    return toast('모든 줄을 다 찍었어요!', 'success');
                select(i);
                const prev = project().blocks[i - 1];
                seek(prev && prev.end > prev.start ? prev.end - 1 : 0);
            },
        }),
    ]);
    // ── 찍기 패널 ────────────────────────────────────────
    const cuePanel = el('div', { class: 'cue' }, [
        el('div', { class: 'cue-body' }, [el('small', { textContent: '지금 찍을 줄' }), cueText, cueQueue]),
        el('div', { class: 'cue-actions' }, [
            stampBtn,
            button({
                kind: 'ghost',
                icon: 'undo',
                label: '방금 찍은 것 취소',
                onClick: () => {
                    const cur = project();
                    const i = cur.timing.cursor - 1;
                    if (i < 0)
                        return toast('취소할 것이 없어요.');
                    commit('unstamp', () => {
                        const b = cur.blocks[i];
                        b.start = 0;
                        b.end = 0;
                        distribute(b);
                        cur.timing.cursor = i;
                    });
                    seek(Math.max(0, (cur.blocks[i - 1]?.end ?? 0) - 0.5));
                    refreshAll();
                },
            }),
            progressPill,
        ]),
    ]);
    // VREW·캡컷 배치: 왼쪽에 미리보기와 재생 조작, 오른쪽에 가사 블록 목록,
    // 아래 전체 폭에 타임라인. 페이지가 스크롤되지 않으므로 무엇도 다른 것을 가리지 않는다.
    root.className = 'editor-shell editor-shell-studio';
    root.append(el('div', { class: 'editor-stage' }, [el('div', { class: 'stage' }, [preview]), transport, cuePanel]), el('div', { class: 'editor-side' }, [
        el('div', { class: 'side-head' }, [
            el('h2', { textContent: '가사 블록' }),
            el('span', { class: 'hint', textContent: '카드를 누르면 그 자리로 이동해요.' }),
            el('div', { class: 'side-tools' }, [
                button({ kind: 'secondary', icon: 'playlist_add', label: '줄 추가', onClick: () => addBlock() }),
                button({ kind: 'secondary', icon: 'more_horiz', label: '간주 넣기', title: '지금 재생 위치의 빈 구간을 간주중으로 채워요', onClick: () => addInterlude() }),
            ]),
        ]),
        cards,
        el('div', { class: 'side-foot' }, [
            button({ kind: 'ghost', icon: 'arrow_back', label: '가사 고치기', onClick: () => go(1) }),
            button({ kind: 'primary', icon: 'palette', label: '꾸미고 저장하기', onClick: () => go(3) }),
        ]),
    ]), el('div', { class: 'editor-bottom' }, [tuning, el('div', { class: 'timeline-wrap' }, [timeline])]));
    // ── 동작 ──────────────────────────────────────────────
    function togglePlay() {
        resume().then(() => {
            if (audio.paused)
                audio.play().catch(() => toast('재생할 수 없어요. 반주 파일을 다시 넣어 주세요.', 'error'));
            else
                audio.pause();
            syncPlayIcon();
        });
    }
    function syncPlayIcon() {
        const mi = playBtn.querySelector('.mi');
        if (mi)
            mi.textContent = audio.paused ? 'play_arrow' : 'pause';
        playBtn.title = audio.paused ? '재생 (K)' : '정지 (K)';
        const stampLabel = stampBtn.querySelector('span:not(.mi)');
        if (stampLabel)
            stampLabel.textContent = audio.paused ? 'Space · 노래 시작' : 'Space · 여기서 시작';
    }
    function seek(t) {
        audio.currentTime = Math.max(0, Math.min(project().media.duration, t));
    }
    function select(index) {
        state.selected = index;
        renderCards();
    }
    /**
     * 줄 하나를 찍는다. V2 타이밍 입력의 전부.
     *
     * V1 결함 수정: 다음 스탬프가 이전 줄의 끝을 무조건 확정한다.
     * (V1은 `if (prev.end <= prev.start)` 조건이 절대 참이 되지 않아 모든 음절이 0.35초로 고정됐다)
     * 그리고 e.timeStamp로 이벤트 큐 지연을 보정한다.
     */
    function stamp(eventTime) {
        const cur = project();
        // 멈춰 있을 때의 Space는 재생 시작이다.
        // 이게 없으면 아이가 정지 상태에서 연타해 모든 줄이 00:00에 찍힌다.
        if (audio.paused) {
            togglePlay();
            toast('노래가 시작됐어요. 줄이 나올 때마다 Space를 눌러 주세요.');
            return;
        }
        skipInterludes();
        const i = cur.timing.cursor;
        if (i >= cur.blocks.length) {
            toast('모든 줄을 다 찍었어요!', 'success');
            return;
        }
        const lag = eventTime !== undefined ? Math.max(0, (performance.now() - eventTime) / 1000) : 0;
        const now = Math.max(0, audio.currentTime - lag);
        commit('stamp', () => {
            const block = cur.blocks[i];
            if (i > 0) {
                const prev = cur.blocks[i - 1];
                // 이전 줄의 끝은 언제나 이번 줄의 시작이다.
                if (prev.end > prev.start || prev.start > 0) {
                    prev.end = Math.max(prev.start + MIN_BLOCK, now);
                    distribute(prev);
                }
            }
            block.start = now;
            // 임시 끝. 다음 스탬프가 확정하고, 마지막 줄이면 이 값이 남는다.
            block.end = now + Math.max(1.2, block.segments.length * 0.28);
            distribute(block);
            cur.timing.cursor = i + 1;
        });
        state.selected = i;
        refreshAll();
    }
    function refreshAll() {
        const cur = project();
        zoom.value = String(cur.view.zoom);
        offset.value = String(cur.timing.offset);
        offsetOut.textContent = fmtOffset(cur.timing.offset);
        volume.value = String(cur.timing.volume);
        loopToggle.classList.toggle('is-on', cur.view.loopOn);
        syncRates();
        renderCue();
        renderCards();
    }
    /** 커서가 간주 블록에 걸리면 다음 가사 줄로 넘긴다. */
    function skipInterludes() {
        const cur = project();
        while (cur.timing.cursor < cur.blocks.length && !isLyric(cur.blocks[cur.timing.cursor]))
            cur.timing.cursor++;
    }
    function renderCue() {
        const cur = project();
        skipInterludes();
        const i = cur.timing.cursor;
        const block = cur.blocks[i];
        cueText.textContent = block ? block.text : '모두 완료!';
        cueText.classList.toggle('is-done', !block);
        cueQueue.replaceChildren(...cur.blocks.slice(i + 1).filter(isLyric).slice(0, 3).map((b) => el('span', { textContent: b.text })));
        stampBtn.disabled = !block;
        const stampLabel = stampBtn.querySelector('span:not(.mi)');
        if (stampLabel)
            stampLabel.textContent = audio.paused ? 'Space · 노래 시작' : 'Space · 여기서 시작';
        const timed = timedCount(cur.blocks);
        const total = lyricCount(cur.blocks);
        progressPill.replaceChildren(el('b', { textContent: `${timed}` }), el('span', { textContent: ` / ${total}줄` }));
        progressPill.classList.toggle('is-done', timed === total && total > 0);
        undoBtn.disabled = !canUndo();
        redoBtn.disabled = !canRedo();
    }
    /** 새 가사 줄을 고른 카드 뒤에 넣는다. 타이밍은 비어 있는 채로 시작한다. */
    function addBlock(at) {
        const cur = project();
        const index = at ?? (state.selected >= 0 ? state.selected + 1 : cur.blocks.length);
        commit('add-block', () => {
            cur.blocks.splice(index, 0, {
                id: uid(),
                text: '새 가사',
                roleId: cur.blocks[Math.max(0, index - 1)]?.roleId || cur.roles[0].id,
                kind: 'lyric',
                start: 0,
                end: 0,
                segments: segmentKorean('새 가사'),
            });
            if (cur.timing.cursor > index)
                cur.timing.cursor++;
        });
        state.selected = index;
        refreshAll();
        // 바로 고쳐 쓸 수 있게 새 카드의 입력란에 커서를 둔다.
        queueMicrotask(() => {
            const input = cards.children[index]?.querySelector('.block-text');
            input?.focus();
            input?.select();
        });
    }
    /**
     * 지금 재생 위치가 놓인 빈 구간을 간주 블록으로 채운다.
     * 노래방에서 가사가 없는 구간에 "간주중"이 뜨는 그 표시다.
     */
    function addInterlude() {
        const cur = project();
        const t = audio.currentTime + cur.timing.offset;
        const timed = cur.blocks.filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
        if (timed.some((b) => t >= b.start && t < b.end)) {
            toast('여기는 이미 가사가 있는 구간이에요. 빈 구간으로 옮겨서 눌러 주세요.');
            return;
        }
        const before = timed.filter((b) => b.end <= t).pop();
        const after = timed.find((b) => b.start > t);
        const start = before ? before.end : 0;
        const end = after ? after.start : Math.min(cur.media.duration, t + 8);
        if (end - start < 0.4) {
            toast('간주를 넣기에는 구간이 너무 짧아요.');
            return;
        }
        const block = makeInterlude(start, end, cur.roles[0].id);
        // 시간 순서에 맞는 자리에 끼워 넣는다.
        const index = before ? cur.blocks.indexOf(before) + 1 : 0;
        commit('add-interlude', () => {
            cur.blocks.splice(index, 0, block);
            if (cur.timing.cursor > index)
                cur.timing.cursor++;
        });
        state.selected = index;
        refreshAll();
        toast(`${clock(start)} – ${clock(end)}에 간주를 넣었어요.`, 'success');
    }
    function moveBlock(index, delta) {
        const cur = project();
        const to = index + delta;
        if (to < 0 || to >= cur.blocks.length)
            return;
        commit('move-block', () => {
            const [b] = cur.blocks.splice(index, 1);
            cur.blocks.splice(to, 0, b);
        });
        state.selected = to;
        refreshAll();
    }
    function removeBlock(index) {
        const cur = project();
        commit('remove-block', () => {
            cur.blocks.splice(index, 1);
            if (cur.timing.cursor > index)
                cur.timing.cursor--;
            cur.timing.cursor = Math.min(cur.timing.cursor, cur.blocks.length);
        });
        state.selected = Math.min(index, cur.blocks.length - 1);
        refreshAll();
    }
    function renderCards() {
        const cur = project();
        cards.replaceChildren(...cur.blocks.map((b, i) => blockCard(b, i, cur.timing.cursor)));
    }
    function blockCard(b, i, cursor) {
        const timed = b.end > b.start;
        const card = el('article', {
            class: `block-card${i === state.selected ? ' is-selected' : ''}${timed ? '' : ' is-untimed'}${i === cursor ? ' is-next' : ''}`,
        });
        const role = project().roles.find((r) => r.id === b.roleId);
        if (project().musicalMode && role)
            card.style.setProperty('--role', role.color);
        const num = el('span', { class: 'block-num', textContent: String(i + 1) });
        const time = el('button', {
            class: 'block-time',
            type: 'button',
            title: timed ? '이 자리로 이동' : '아직 안 찍은 줄',
        });
        time.append(timed
            ? el('span', {}, [el('b', { textContent: clock(b.start) }), el('small', { textContent: ` → ${clock(b.end)}` })])
            : el('span', { class: 'muted', textContent: '아직 안 찍음' }));
        time.onclick = () => {
            select(i);
            if (timed)
                seek(b.start - 0.3);
        };
        if (b.kind === 'interlude')
            card.classList.add('is-interlude');
        const text = el('input', { class: 'block-text', type: 'text', value: b.text });
        text.setAttribute('aria-label', `${i + 1}번 가사`);
        text.onchange = () => {
            const v = text.value.trim();
            if (!v || v === b.text) {
                text.value = b.text;
                return;
            }
            // 텍스트만 바꾸고 타이밍은 지킨다. V1은 이 조작이 그 줄의 타이밍을 지웠다.
            commit(`retext-${b.id}`, () => retext(b, v));
            ensureGlyphs(project().style.fontFamily, v);
            toast('가사를 고쳤어요. 타이밍은 그대로예요.', 'success');
        };
        const actions = el('div', { class: 'block-actions' }, [
            button({ kind: 'ghost', icon: 'keyboard_arrow_up', title: '위로 옮기기', fallback: '↑', disabled: i === 0, onClick: () => moveBlock(i, -1) }),
            button({ kind: 'ghost', icon: 'keyboard_arrow_down', title: '아래로 옮기기', fallback: '↓', disabled: i === project().blocks.length - 1, onClick: () => moveBlock(i, 1) }),
            button({ kind: 'ghost', icon: 'add', title: '아래에 줄 추가', fallback: '＋', onClick: () => addBlock(i + 1) }),
            button({
                kind: 'ghost',
                icon: 'delete_outline',
                title: '이 줄 지우기',
                fallback: '✕',
                onClick: async () => {
                    const ok = await confirmDialog({ title: '이 줄을 지울까요?', body: `"${b.text}" 줄과 그 타이밍이 사라져요.`, confirm: '지우기', danger: true });
                    if (ok)
                        removeBlock(i);
                },
            }),
            button({
                kind: 'ghost',
                icon: 'restart_alt',
                title: '이 줄부터 다시 찍기',
                fallback: '↻',
                onClick: () => {
                    commit(`recut-${b.id}`, () => {
                        const cur = project();
                        for (let k = i; k < cur.blocks.length; k++) {
                            cur.blocks[k].start = 0;
                            cur.blocks[k].end = 0;
                            distribute(cur.blocks[k]);
                        }
                        cur.timing.cursor = i;
                    });
                    seek(Math.max(0, (project().blocks[i - 1]?.end ?? 0) - 1));
                    refreshAll();
                    toast(`${i + 1}번 줄부터 다시 찍어요.`);
                },
            }),
        ]);
        if (project().musicalMode) {
            const sel = el('select', { class: 'block-role' });
            sel.setAttribute('aria-label', `${i + 1}번 가사 배역`);
            for (const r of project().roles)
                sel.append(el('option', { value: r.id, textContent: r.name, selected: r.id === b.roleId }));
            sel.onchange = () => {
                commit(`role-${b.id}`, () => {
                    b.roleId = sel.value;
                });
                renderCards();
            };
            actions.prepend(sel);
        }
        card.append(num, time, text, actions);
        return card;
    }
    // ── 타임라인 조작: 클릭 시크 · 드래그 길이 조절 ───────────
    let drag = null;
    timeline.addEventListener('pointerdown', (e) => {
        const hit = hitTest(timeline, project(), win, e.clientX, e.clientY);
        if (hit.kind === 'seek') {
            seek(hit.time);
            return;
        }
        select(hit.index);
        timeline.setPointerCapture(e.pointerId);
        drag = { index: hit.index, edge: hit.edge, grab: hit.time - project().blocks[hit.index].start };
        if (hit.edge === 'move')
            timeline.style.cursor = 'grabbing';
    });
    timeline.addEventListener('pointermove', (e) => {
        if (!drag) {
            const hit = hitTest(timeline, project(), win, e.clientX, e.clientY);
            timeline.style.cursor = hit.kind === 'seek' ? 'pointer' : hit.edge === 'move' ? 'grab' : 'ew-resize';
            return;
        }
        const hit = hitTest(timeline, project(), win, e.clientX, e.clientY);
        const cur = project();
        const b = cur.blocks[drag.index];
        const duration = cur.media.duration || 1;
        commit(`drag-${b.id}`, () => {
            if (drag.edge === 'start')
                b.start = Math.max(0, Math.min(b.end - MIN_BLOCK, hit.time));
            else if (drag.edge === 'end')
                b.end = Math.max(b.start + MIN_BLOCK, Math.min(duration, hit.time));
            else {
                const span = b.end - b.start;
                b.start = Math.max(0, Math.min(duration - span, hit.time - drag.grab));
                b.end = b.start + span;
            }
            distribute(b);
        });
        renderCards();
    });
    const endDrag = () => {
        drag = null;
        timeline.style.cursor = '';
    };
    timeline.addEventListener('pointerup', endDrag);
    timeline.addEventListener('pointercancel', endDrag);
    // ── 루프 & 그리기 ─────────────────────────────────────
    audio.onplay = syncPlayIcon;
    audio.onpause = syncPlayIcon;
    const tick = () => {
        if (!preview.isConnected) {
            raf = 0;
            return;
        }
        const cur = project();
        const t = audio.currentTime;
        if (cur.view.loopOn && cur.view.loopB > cur.view.loopA && t >= cur.view.loopB)
            audio.currentTime = cur.view.loopA;
        const ctx = sizeCanvas(preview);
        renderFrame(ctx, cur, t, state.bgPrepared);
        win = windowFor(cur, t, timeline.clientWidth || 800);
        drawTimeline(timeline, cur, t + cur.timing.offset, win, state.selected, state.dark);
        clockOut.textContent = `${clock(t, true)} / ${clock(cur.media.duration)}`;
        raf = requestAnimationFrame(tick);
    };
    // 스탬프 단축키는 app.ts의 전역 핸들러가 이 함수를 부른다.
    studioStamp = stamp;
    studioToggle = togglePlay;
    studioRefresh = refreshAll;
    studioSeek = seek;
    queueMicrotask(() => {
        setVolume(p.timing.volume);
        setRate(p.timing.rate);
        ensureGlyphs(p.style.fontFamily, textForProject(p));
        if (state.files.audio)
            computePeaks(state.files.audio).catch(() => undefined);
        refreshAll();
        syncPlayIcon();
        stopStudio();
        raf = requestAnimationFrame(tick);
    });
    void rerender;
    return root;
}
// app.ts의 전역 단축키가 현재 화면의 동작에 닿기 위한 연결점.
export let studioStamp = null;
export let studioToggle = null;
export let studioRefresh = null;
export let studioSeek = null;
export function clearStudioHooks() {
    studioStamp = null;
    studioToggle = null;
    studioRefresh = null;
    studioSeek = null;
}
/** 선택된 블록을 ±ms 만큼 민다. 화살표 키용. */
export function nudgeSelected(deltaMs) {
    const cur = project();
    const b = cur.blocks[state.selected];
    if (!b || b.end <= b.start)
        return false;
    const d = deltaMs / 1000;
    commit(`nudge-${b.id}`, () => {
        b.start = Math.max(0, b.start + d);
        b.end = Math.max(b.start + MIN_BLOCK, b.end + d);
        distribute(b);
    });
    studioRefresh?.();
    return true;
}
export function currentBlockIndex() {
    return blockAt(project(), audio.currentTime + project().timing.offset).index;
}
function fmtOffset(v) {
    const ms = Math.round(v * 1000);
    return `${ms > 0 ? '+' : ''}${ms}ms`;
}
