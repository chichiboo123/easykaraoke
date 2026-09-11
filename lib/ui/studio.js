import { audio, computePeaks, resume, setRate, setVolume } from '../audio.js';
import { ensureGlyphs, textForProject } from '../fonts.js';
import { blockAt, nextUntimed } from '../frame.js';
import { distribute, isLyric, lyricCount, makeInterlude, retext, segmentKorean, setSyllableStart, timedCount } from '../lyrics.js';
import { renderFrame } from '../renderer.js';
import { canRedo, canUndo, commit, project, redo, state, touch, undo } from '../store.js';
import { uid } from '../../types.js';
import { TIMELINE_H, clampFrom, draw as drawTimeline, hitTest, spanFor, windowFor } from '../timeline.js';
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
    const stampBtn = button({ kind: 'primary', icon: 'ads_click', label: 'Space · 여기서 시작', onClick: () => studioStamp?.() });
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
    // ── 타임라인 보기 조작 ────────────────────────────
    const zoomOut = button({ kind: 'ghost', icon: 'zoom_out', title: '축소', fallback: '−', onClick: () => nudgeZoom(1 / 1.6) });
    const zoomIn = button({ kind: 'ghost', icon: 'zoom_in', title: '확대', fallback: '＋', onClick: () => nudgeZoom(1.6) });
    const zoomOut2 = el('output', { class: 'zoom-out' });
    const fitBtn = button({ kind: 'ghost', icon: 'fit_screen', label: '전체 보기', onClick: () => fitAll() });
    const followBtn = button({ kind: 'ghost', icon: 'my_location', label: '재생 위치로', onClick: () => followNow() });
    const scroll = el('input', { type: 'range', min: '0', max: '1000', step: '1', value: '0', class: 'slider timeline-scroll' });
    scroll.setAttribute('aria-label', '타임라인 가로 이동');
    scroll.oninput = () => {
        const cur = project();
        const width = timeline.clientWidth || 800;
        const max = Math.max(0, cur.media.duration - spanFor(cur, width));
        touch(() => {
            cur.view.follow = false;
            cur.view.from = (Number(scroll.value) / 1000) * max;
        });
        syncView();
    };
    /** 화면 가운데 시각을 유지한 채 배율만 바꾼다. 보던 자리를 잃지 않게. */
    function nudgeZoom(factor) {
        const cur = project();
        const width = timeline.clientWidth || 800;
        const center = cur.view.follow ? audio.currentTime : cur.view.from + spanFor(cur, width) / 2;
        touch(() => {
            cur.view.zoom = Math.min(8, Math.max(0.05, cur.view.zoom * factor));
            if (!cur.view.follow)
                cur.view.from = clampFrom(cur, center - spanFor(cur, width) / 2, width);
        });
        syncView();
    }
    /** 곡 전체가 한 화면에 들어오도록 맞춘다. */
    function fitAll() {
        const cur = project();
        const width = timeline.clientWidth || 800;
        touch(() => {
            cur.view.zoom = Math.max(0.02, width / (100 * Math.max(1, cur.media.duration)));
            cur.view.follow = false;
            cur.view.from = 0;
        });
        syncView();
        toast('곡 전체를 한 화면에 담았어요.');
    }
    function followNow() {
        touch(() => {
            project().view.follow = true;
        });
        syncView();
    }
    /** 확대 배율·스크롤 위치 표시를 현재 상태에 맞춘다. */
    function syncView() {
        const cur = project();
        const width = timeline.clientWidth || 800;
        const span = spanFor(cur, width);
        zoomOut2.textContent = `${span < 60 ? `${span.toFixed(1)}초` : `${Math.round(span / 60)}분`} 보임`;
        const max = Math.max(0, cur.media.duration - span);
        scroll.disabled = max <= 0;
        scroll.value = String(max > 0 ? Math.round((cur.view.from / max) * 1000) : 0);
        followBtn.classList.toggle('is-on', cur.view.follow);
    }
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
        el('div', { class: 'tuning-item zoom-group' }, [zoomOut, zoomOut2, zoomIn, fitBtn, followBtn]),
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
    // ── 글자 단위 편집 ────────────────────────────────
    // 줄 단위로 찍은 뒤, 그 줄 안에서 색이 차는 속도를 글자마다 손보는 모드.
    const modeToggle = el('input', { type: 'checkbox', id: 'fine-mode', checked: p.timing.mode === 'syllable' });
    modeToggle.setAttribute('role', 'switch');
    modeToggle.onchange = () => {
        const cur = project();
        touch(() => {
            cur.timing.mode = modeToggle.checked ? 'syllable' : 'line';
            if (modeToggle.checked) {
                // 간주나 아직 안 찍은 줄은 다듬을 게 없다. 음절이 있는 줄로 옮겨 준다.
                const usable = (i) => {
                    const b = cur.blocks[i];
                    return !!b && isLyric(b) && b.segments.length > 0 && b.end > b.start;
                };
                if (!usable(state.selected))
                    state.selected = cur.blocks.findIndex((_, i) => usable(i));
                cur.timing.fineBlock = cur.blocks[state.selected]?.id;
            }
            else {
                cur.timing.fineBlock = undefined;
            }
            fineIndex = 1;
        });
        refreshAll();
        toast(modeToggle.checked
            ? '글자 단위 편집을 켰어요. 줄을 고르고 재생하면서 글자마다 Space를 누르세요.'
            : '줄 단위 찍기로 돌아왔어요.');
    };
    const modeRow = el('label', { class: 'fine-toggle' }, [
        el('span', {}, [el('b', { textContent: '글자 단위 편집' }), el('small', { textContent: '줄 안에서 색 차는 속도를 글자마다 맞춰요' })]),
        modeToggle,
    ]);
    const fineStrip = el('div', { class: 'fine-strip' });
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
    root.append(el('div', { class: 'editor-stage' }, [el('div', { class: 'stage' }, [preview]), transport, cuePanel, modeRow, fineStrip]), el('div', { class: 'editor-side' }, [
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
    ]), el('div', { class: 'editor-bottom' }, [tuning, el('div', { class: 'timeline-wrap' }, [timeline]), scroll]));
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
        if (stampLabel) {
            stampLabel.textContent = audio.paused
                ? 'Space · 노래 시작'
                : project().timing.mode === 'syllable'
                    ? 'Space · 이 글자부터'
                    : 'Space · 여기서 시작';
        }
    }
    function seek(t) {
        audio.currentTime = Math.max(0, Math.min(project().media.duration, t));
    }
    function select(index) {
        state.selected = index;
        const cur = project();
        if (cur.timing.mode === 'syllable' && isLyric(cur.blocks[index])) {
            cur.timing.fineBlock = cur.blocks[index].id;
            fineIndex = 1;
            renderFine();
        }
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
    /** 글자 단위 편집에서 다음에 맞출 음절 번호(0번은 줄 시작이라 1부터). */
    let fineIndex = 1;
    function fineBlockIndex() {
        const cur = project();
        const ok = (b) => !!b && isLyric(b) && b.segments.length > 0;
        const byId = cur.blocks.findIndex((b) => b.id === cur.timing.fineBlock);
        if (byId >= 0 && ok(cur.blocks[byId]))
            return byId;
        if (ok(cur.blocks[state.selected]))
            return state.selected;
        return -1;
    }
    /**
     * 글자 하나의 시작 시각을 지금 재생 위치로 맞춘다.
     * 줄 전체 구간은 건드리지 않고 그 안에서 경계만 옮기므로,
     * 줄 단위로 잡아 둔 박자가 흐트러지지 않는다.
     */
    function fineStamp(eventTime) {
        const cur = project();
        const bi = fineBlockIndex();
        const block = cur.blocks[bi];
        if (!block || !block.segments.length) {
            toast('먼저 다듬을 줄을 고르세요.');
            return;
        }
        if (audio.paused) {
            togglePlay();
            toast('재생을 시작했어요. 글자가 넘어가는 순간마다 Space를 누르세요.');
            return;
        }
        if (fineIndex >= block.segments.length) {
            toast('이 줄은 끝까지 맞췄어요. 다음 줄을 고르세요.', 'success');
            return;
        }
        const lag = eventTime !== undefined ? Math.max(0, (performance.now() - eventTime) / 1000) : 0;
        const now = Math.max(0, audio.currentTime - lag) + cur.timing.offset;
        commit('fine-stamp', () => {
            setSyllableStart(block, fineIndex, now);
            fineIndex++;
        });
        renderFine();
    }
    /** 지금 다듬는 줄의 글자들을 띠로 보여 준다. 어디까지 맞췄는지 한눈에. */
    function renderFine() {
        const cur = project();
        if (cur.timing.mode !== 'syllable') {
            fineStrip.hidden = true;
            fineStrip.replaceChildren();
            return;
        }
        fineStrip.hidden = false;
        const bi = fineBlockIndex();
        const block = cur.blocks[bi];
        if (!block) {
            fineStrip.replaceChildren(el('p', { class: 'hint', textContent: '다듬을 줄을 목록에서 골라 주세요.' }));
            return;
        }
        const head = el('div', { class: 'fine-head' }, [
            el('small', { textContent: `${bi + 1}번 줄 · ${clock(block.start)} – ${clock(block.end)}` }),
            button({
                kind: 'ghost',
                icon: 'restart_alt',
                label: '이 줄 균등하게',
                onClick: () => {
                    commit('fine-reset', () => distribute(block));
                    fineIndex = 1;
                    renderFine();
                    toast('글자 간격을 균등하게 되돌렸어요.');
                },
            }),
        ]);
        const chips = el('div', { class: 'fine-chips' });
        block.segments.forEach((seg, i) => {
            const chip = el('button', {
                class: `fine-chip${i === fineIndex ? ' is-next' : ''}${i < fineIndex ? ' is-set' : ''}`,
                type: 'button',
                title: `${clock(seg.start)} – ${clock(seg.end)}`,
            }, [el('b', { textContent: seg.text }), el('small', { textContent: `${(seg.end - seg.start).toFixed(2)}초` })]);
            chip.onclick = () => {
                fineIndex = Math.max(1, i);
                seek(Math.max(0, block.segments[Math.max(0, i - 1)].start - 0.2));
                renderFine();
            };
            chips.append(chip);
        });
        fineStrip.replaceChildren(head, chips);
    }
    function refreshAll() {
        const cur = project();
        offset.value = String(cur.timing.offset);
        offsetOut.textContent = fmtOffset(cur.timing.offset);
        volume.value = String(cur.timing.volume);
        loopToggle.classList.toggle('is-on', cur.view.loopOn);
        syncRates();
        syncView();
        renderCue();
        renderFine();
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
        stampBtn.disabled = cur.timing.mode === 'syllable' ? false : !block;
        syncPlayIcon();
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
        // 안내 문구가 "카드를 누르면 이동"이라고 말하므로 카드 전체가 눌려야 한다.
        // 가사 입력란과 조작 버튼은 각자 할 일이 있으니 건너뛴다.
        card.onclick = (e) => {
            if (e.target.closest('.block-text, .block-actions, .block-time, .block-role'))
                return;
            select(i);
            if (b.end > b.start)
                seek(b.start - 0.3);
        };
        card.append(num, time, text, actions);
        return card;
    }
    // ── 타임라인 조작: 클릭 시크 · 드래그 길이 조절 ───────────
    let drag = null;
    let pan = null;
    timeline.addEventListener('pointerdown', (e) => {
        const hit = hitTest(timeline, project(), win, e.clientX, e.clientY);
        if (hit.kind === 'seek') {
            // Shift를 누른 채 끌면 이동(패닝), 그냥 누르면 그 시각으로 점프.
            if (e.shiftKey) {
                pan = { x: e.clientX, from: win.from };
                timeline.setPointerCapture(e.pointerId);
                timeline.style.cursor = 'grabbing';
                return;
            }
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
        if (pan) {
            const cur = project();
            const width = timeline.clientWidth || 800;
            const moveBy = ((pan.x - e.clientX) / width) * spanFor(cur, width);
            touch(() => {
                cur.view.follow = false;
                cur.view.from = clampFrom(cur, pan.from + moveBy, width);
            });
            syncView();
            return;
        }
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
        pan = null;
        timeline.style.cursor = '';
    };
    // 휠로 좌우 이동, Ctrl(⌘)+휠로 확대. 지도나 편집기에서 익숙한 조작.
    timeline.addEventListener('wheel', (e) => {
        e.preventDefault();
        const cur = project();
        const width = timeline.clientWidth || 800;
        if (e.ctrlKey || e.metaKey) {
            nudgeZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2);
            return;
        }
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const moveBy = (delta / width) * spanFor(cur, width);
        touch(() => {
            // 손으로 움직이는 순간 재생 위치 따라가기를 놓는다.
            if (cur.view.follow) {
                cur.view.from = win.from;
                cur.view.follow = false;
            }
            cur.view.from = clampFrom(cur, cur.view.from + moveBy, width);
        });
        syncView();
    }, { passive: false });
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
    studioStamp = (eventTime) => (project().timing.mode === 'syllable' ? fineStamp(eventTime) : stamp(eventTime));
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
