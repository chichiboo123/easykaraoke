import { newProject, uid } from './types.js';
import { parseLyrics, flatten, makeSegments } from './lib/lyrics.js';
import { loadBuiltins, loadCustomFont, fonts } from './lib/fonts.js';
import { saveProject, loadProjects, loadFile, removeProject } from './lib/storage.js';
import { renderFrame } from './lib/renderer.js';
import { applyStamp } from './lib/frame.js';
import { exportSupport, exportVideo } from './lib/exporter.js';
const $ = (q) => document.querySelector(q);
const esc = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${(n % 60).toFixed(3).padStart(6, '0')}`;
let project = null, audioBlob, bgBlob, fontBlob, audioUrl = '', bgUrl = '', bgImage, selected = '', stampIndex = 0, step = 1, dirtyTimer = 0, history = [], future = [], pendingFiles = {}, unavailableFonts = new Set(), waveCache;
const audio = new Audio();
audio.preload = 'auto';
function resetEditorState() { audio.pause(); audio.ontimeupdate = null; if (audioUrl)
    URL.revokeObjectURL(audioUrl); if (bgUrl)
    URL.revokeObjectURL(bgUrl); audio.removeAttribute('src'); audio.load(); audioBlob = undefined; bgBlob = undefined; fontBlob = undefined; audioUrl = ''; bgUrl = ''; bgImage = undefined; pendingFiles = {}; step = 1; selected = ''; stampIndex = 0; history = []; future = []; }
function shell(body) { $('#app').innerHTML = `<header><button class="brand" id="home">♪ <b>여기 있어 노래방</b></button>${project ? `<span class="saved" id="saved">브라우저에 자동 저장</span>` : ''}</header>${body}<footer><a href="https://litt.ly/chichiboo" target="_blank" rel="noopener noreferrer">Created by. 교육뮤지컬 꿈꾸는 치수쌤</a><span>TJ 노래하는즐거움체의 지적재산권은 TJ미디어㈜에 있습니다. 개인적·비영리 용도입니다.</span></footer>`; $('#home').onclick = () => { resetEditorState(); project = null; home(); }; }
async function home() { const recent = await loadProjects().catch(() => []); shell(`<main class="landing"><section class="hero"><span class="eyebrow">LOCAL-FIRST CREATIVE TOOL</span><h1>반주와 가사만 있으면<br><em>우리만의 노래방 영상 완성</em></h1><p>반주를 넣고, 가사 타이밍을 맞추고, 원하는 무대를 골라보세요.<br>모든 작업은 브라우저에서 이루어집니다.</p><div><button class="primary" id="new">새 노래 만들기</button><label class="button">프로젝트 불러오기<input id="import" type="file" accept=".mkaraoke,application/json"></label></div><small>🔒 음원과 작업 파일은 서버에 업로드되지 않아요.</small></section>${recent.length ? `<section class="recent"><h2>최근 작업</h2>${recent.slice(0, 6).map(p => `<span class="recent-wrap"><button class="recent-card" data-id="${p.id}"><b>${esc(p.meta.title)}</b><span>${new Date(p.updatedAt).toLocaleString('ko-KR')}</span></button><button class="delete-project" data-delete="${p.id}" aria-label="${esc(p.meta.title)} 삭제">삭제</button></span>`).join('')}</section>` : ''}</main>`); $('#new').onclick = createDialog; $('#import').onchange = importPackage; document.querySelectorAll('.recent-card').forEach(x => x.onclick = () => openRecent(x.dataset.id)); document.querySelectorAll('[data-delete]').forEach(x => x.onclick = async () => { if (!confirm('이 프로젝트와 저장된 파일을 삭제할까요?'))
    return; await removeProject(x.dataset.delete); home(); }); }
function createDialog() { shell(`<main class="narrow"><button class="back" id="back">← 돌아가기</button><h1>새 노래 만들기</h1><p>곡 제목만 입력하면 바로 시작할 수 있어요.</p><form id="create"><label>곡 제목 <strong>*</strong><input name="title" required autofocus></label><div class="two"><label>작품명<input name="musical"></label><label>곡 번호<input name="number"></label><label>작곡<input name="composer"></label><label>작사<input name="lyricist"></label></div><button class="primary">편집 시작하기</button></form></main>`); $('#back').onclick = home; $('#create').onsubmit = e => { e.preventDefault(); const f = new FormData(e.currentTarget); resetEditorState(); project = newProject(String(f.get('title'))); for (const k of ['musical', 'number', 'composer', 'lyricist'])
    project.meta[k] = String(f.get(k)); save(); editor(); }; }
function normalizeProject(p) { if (typeof p.musicalMode !== 'boolean')
    p.musicalMode = true; if (!p.timing)
    p.timing = { offsetMs: -180, playbackRate: .75 }; for (const block of p.lyricBlocks)
    if (block.segments.some(segment => segment.charStart === undefined))
        block.segments = mergeSegments(block.segments, makeSegments(block.text)); return p; }
async function openRecent(id) { const saved = (await loadProjects()).find(x => x.id === id); if (!saved)
    return alert('저장된 프로젝트를 찾지 못했어요.'); resetEditorState(); project = normalizeProject(saved); audioBlob = await loadFile(id, 'audio'); bgBlob = await loadFile(id, 'background'); fontBlob = await loadFile(id, 'font'); if (audioBlob)
    setAudio(audioBlob, project.media.name); if (bgBlob)
    setBackground(bgBlob); syncCursor(); if (fontBlob && project.style.fontFamily.startsWith('내 글꼴 ')) {
    const f = new File([fontBlob], 'custom.otf');
    project.style.fontFamily = await loadCustomFont(f);
} editor(); }
function nav() { return `<nav class="steps" aria-label="편집 단계">${['반주', '가사', '타이밍', '디자인', '내보내기'].map((x, i) => `<button data-step="${i + 1}" class="${step === i + 1 ? 'active' : ''}" ${step === i + 1 ? 'aria-current="step"' : ''}><i>${i + 1}</i>${x}</button>`).join('')}</nav>`; }
function editor() { if (!project)
    return; if (step !== 1)
    audio.ontimeupdate = null; const bodies = [audioStep, lyricsStep, timingStep, designStep, exportStep]; shell(`<main class="workspace">${nav()}<section class="editor" tabindex="-1">${bodies[step - 1]()}</section></main>`); document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { step = Number(b.dataset.step); editor(); }); bindCommon(); if (step === 1)
    bindAudio(); if (step === 2)
    bindLyrics(); if (step === 3)
    bindTiming(); if (step === 4)
    bindDesign(); if (step === 5)
    bindExport(); const heading = document.querySelector('.editor h1'); if (heading) {
    heading.tabIndex = -1;
    heading.focus();
} }
function bindCommon() { document.querySelectorAll('[data-meta]').forEach(i => i.onchange = () => change(() => project.meta[i.dataset.meta] = i.value)); }
function audioStep() { return `<h1>1. 반주</h1><p>원본 속도와 음정을 그대로 사용합니다.</p><div class="drop" id="audio-drop"><input id="audio-file" type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac"><b>${project.media.name ? `🎵 ${esc(project.media.name)}` : 'MP3, WAV, M4A 또는 AAC 파일을 놓아주세요'}</b><span>파일은 이 브라우저 안에서만 처리됩니다.</span></div>${project.media.name ? `<div class="player"><canvas id="wave" width="1000" height="150"></canvas><input id="seek" type="range" min="0" max="${project.media.duration}" step=".01" value="0"><div><button id="play">▶ 재생</button><output id="clock">00:00.000 / ${fmt(project.media.duration)}</output><label>볼륨 <input id="volume" type="range" min="0" max="1" step=".05" value="1"></label></div></div>` : ''}<div class="next"><button data-step="2" class="primary">가사 입력하기 →</button></div>`; }
function bindAudio() { const accept = (f) => { if (!f)
    return; if (!/audio\/(mpeg|wav|x-wav|mp4|aac)/.test(f.type) && !/\.(mp3|wav|m4a|aac)$/i.test(f.name))
    return alert('MP3, WAV, M4A, AAC 파일을 선택해 주세요.'); setAudio(f, f.name); }; $('#audio-file').onchange = e => accept(e.target.files?.[0]); const drop = $('#audio-drop'); drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragging'); }; drop.ondragleave = () => drop.classList.remove('dragging'); drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragging'); accept(e.dataTransfer?.files[0]); }; if (!project.media.name)
    return; const seek = $('#seek'), clock = $('#clock'); $('#play').onclick = () => audio.paused ? audio.play() : audio.pause(); seek.oninput = () => audio.currentTime = Number(seek.value); $('#volume').oninput = e => audio.volume = Number(e.target.value); audio.ontimeupdate = () => { seek.value = String(audio.currentTime); clock.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || 0)}`; }; drawWave(); }
function setAudio(blob, name) { audioBlob = blob; if (audioUrl)
    URL.revokeObjectURL(audioUrl); audioUrl = URL.createObjectURL(blob); audio.src = audioUrl; audio.onloadedmetadata = () => { project.media = { name, type: blob.type, duration: audio.duration }; save({ audio: blob }); editor(); }; audio.onerror = () => alert('음원을 읽지 못했어요. 손상되지 않은 지원 파일인지 확인해 주세요.'); }
async function drawWave() { if (!audioBlob)
    return; try {
    if (!waveCache || waveCache.blob !== audioBlob) {
        const ac = new AudioContext(), buf = await ac.decodeAudioData(await audioBlob.arrayBuffer()), data = buf.getChannelData(0), peaks = [];
        for (let px = 0; px < 1000; px++) {
            let peak = 0;
            for (let j = Math.floor(px * data.length / 1000); j < Math.floor((px + 1) * data.length / 1000); j++)
                peak = Math.max(peak, Math.abs(data[j]));
            peaks.push(peak);
        }
        waveCache = { blob: audioBlob, peaks };
        await ac.close();
    }
    const canvas = $('#wave'), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f1eff8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#6046a8';
    ctx.beginPath();
    waveCache.peaks.forEach((peak, x) => { ctx.moveTo(x, 75 - peak * 68); ctx.lineTo(x, 75 + peak * 68); });
    ctx.stroke();
    canvas.onclick = e => audio.currentTime = e.offsetX / canvas.clientWidth * audio.duration;
}
catch {
    alert('파형을 만들지 못했지만 재생은 계속 사용할 수 있어요.');
} }
function mergeSegments(previous, next) { const used = new Set(); return next.map(segment => { const index = previous.findIndex((old, i) => !used.has(i) && old.text === segment.text); if (index < 0)
    return segment; used.add(index); return { ...segment, id: previous[index].id, start: previous[index].start, end: previous[index].end }; }); }
function mergeBlocks(next) { return next.map((block, index) => { const old = project.lyricBlocks[index]; if (!old)
    return block; if (old.text === block.text && old.roleId === block.roleId)
    return old; return { ...block, segments: mergeSegments(old.segments, block.segments) }; }); }
function lyricsStep() { const mode = project.musicalMode; return `<h1>2. 가사${mode ? '와 배역' : ''}</h1><label class="mode-toggle"><span><b>뮤지컬 모드</b><small>배역을 나누고 영상에 역할 이름을 표시해요.</small></span><input id="musical-mode" type="checkbox" role="switch" ${mode ? 'checked' : ''}></label><p>${mode ? '<code>[배역] 가사</code> 형식으로 입력하면 배역도 한 번에 만들어져요. 배역 표시는 선택 사항입니다.' : '한 줄에 한 소절씩 가사만 입력해 주세요. 배역 없이 일반 노래방으로 만들어요.'}</p><textarea id="lyrics" rows="7" placeholder="${mode ? '[왜] 왜 저럴까 정말 그럴까\n[전체] 우리 함께 문을 열어!' : '왜 저럴까 정말 그럴까\n우리 함께 문을 열어!'}">${esc(project.lyricBlocks.map(b => mode ? `[${project.roles.find(r => r.id === b.roleId)?.name || '전체'}] ${b.text}` : b.text).join('\n'))}</textarea><button id="apply" class="primary">가사 카드 만들기</button>${mode ? `<div class="role-list"><h2>배역 색상</h2>${project.roles.map(r => `<label class="role"><input type="color" data-rolecolor="${r.id}" value="${r.color}"><input data-rolename="${r.id}" value="${esc(r.name)}" aria-label="배역 이름"></label>`).join('')}</div>` : ''}<div class="cards">${project.lyricBlocks.map((b, i) => `<article><span>${i + 1}</span>${mode ? `<select data-blockrole="${b.id}" aria-label="${i + 1}번 가사 배역">${project.roles.map(r => `<option value="${r.id}" ${r.id === b.roleId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : ''}<input data-blocktext="${b.id}" value="${esc(b.text)}" aria-label="${i + 1}번 가사"><button data-up="${b.id}" aria-label="위로">↑</button><button data-down="${b.id}" aria-label="아래로">↓</button></article>`).join('')}</div>`; }
function bindLyrics() { $('#musical-mode').onchange = e => change(() => project.musicalMode = e.target.checked); $('#apply').onclick = () => change(() => { const r = parseLyrics($('#lyrics').value, project.roles, project.musicalMode); project.roles = r.roles; project.lyricBlocks = mergeBlocks(r.blocks); stampIndex = flatten(project.lyricBlocks).findIndex(x => x.segment.end <= x.segment.start); if (stampIndex < 0)
    stampIndex = flatten(project.lyricBlocks).length; }); document.querySelectorAll('[data-rolecolor]').forEach(x => x.onchange = () => change(() => project.roles.find(r => r.id === x.dataset.rolecolor).color = x.value)); document.querySelectorAll('[data-rolename]').forEach(x => x.onchange = () => change(() => project.roles.find(r => r.id === x.dataset.rolename).name = x.value)); document.querySelectorAll('[data-blockrole]').forEach(x => x.onchange = () => change(() => project.lyricBlocks.find(b => b.id === x.dataset.blockrole).roleId = x.value)); document.querySelectorAll('[data-blocktext]').forEach(x => x.onchange = () => change(() => { const b = project.lyricBlocks.find(b => b.id === x.dataset.blocktext); b.text = x.value; b.segments = mergeSegments(b.segments, makeSegments(x.value)); })); for (const dir of ['up', 'down'])
    document.querySelectorAll(`[data-${dir}]`).forEach(x => x.onclick = () => change(() => { const i = project.lyricBlocks.findIndex(b => b.id === x.dataset[dir]); const n = i + (dir === 'up' ? -1 : 1); if (n >= 0 && n < project.lyricBlocks.length)
        [project.lyricBlocks[i], project.lyricBlocks[n]] = [project.lyricBlocks[n], project.lyricBlocks[i]]; })); }
function timingStep() { const all = flatten(project.lyricBlocks), cur = all[stampIndex]; return `<h1>3. 타이밍 찍기</h1><p>음악을 들으며 <kbd>Space</kbd>를 누르세요. <kbd>K</kbd> 재생 · <kbd>Backspace</kbd> 취소 · <kbd>← →</kbd> 10ms · <kbd>Shift</kbd> 50ms · <kbd>Ctrl/⌘ Z</kbd> 실행 취소</p>${!audioBlob ? '<div class="notice">먼저 반주 파일을 넣어 주세요.</div>' : ''}<div class="timing-grid"><section class="stamp"><small>다음 음절</small><strong id="next-syllable">${esc(cur?.segment.text || '완료!')}</strong><div id="upcoming-syllables">${all.slice(stampIndex + 1, stampIndex + 6).map(x => `<span>${esc(x.segment.text)}</span>`).join('')}</div><button id="stamp" class="primary" ${!audioBlob || !cur ? 'disabled' : ''}>Space · 지금 찍기</button><button id="timing-play">${audio.paused ? '▶' : 'Ⅱ'} K 재생/정지</button><output id="timing-clock">${fmt(audio.currentTime)}</output></section><section><canvas id="preview" width="960" height="540" role="img" aria-label="현재 노래방 영상 미리보기"></canvas></section></div><div class="loop"><label>재생 속도 <select id="playback-rate">${[.5, .75, 1].map(rate => `<option value="${rate}" ${project.timing.playbackRate === rate ? 'selected' : ''}>${rate}×</option>`).join('')}</select></label><label>입력 보정 <input id="timing-offset" type="number" min="-1000" max="1000" step="10" value="${project.timing.offsetMs}"> ms</label><button id="apply-offset">기존 타이밍에도 적용</button><label>볼륨 <input id="timing-volume" type="range" min="0" max="1" step=".05" value="${audio.volume}"></label><label>A <input id="loop-a" type="number" min="0" step=".01" value="0"></label><label>B <input id="loop-b" type="number" min="0" step=".01" value="${Math.min(10, project.media.duration)}"></label><label><input id="loop-on" type="checkbox"> A–B 반복</label><label>확대 <input id="zoom" type="range" min="40" max="300" value="100"></label></div><div class="marker-tools"><b>구간 표시</b><button id="add-interlude">A–B를 간주로</button><button id="add-countdown">A–B를 카운트다운으로</button>${project.markers.map(marker => `<span>${esc(marker.label || marker.type)} ${fmt(marker.start)}–${fmt(marker.end)} <button data-marker-delete="${marker.id}" aria-label="${esc(marker.label || marker.type)} 삭제">×</button></span>`).join('')}</div><div class="timeline" id="timeline"><i class="playhead" id="playhead"></i>${all.map(({ segment, block }) => `<button class="segment ${segment.id === selected ? 'selected' : ''}" data-seg="${segment.id}" style="--left:${segment.start * 100}px;--width:${Math.max(34, (segment.end - segment.start) * 100)}px;${project.musicalMode ? `border-color:${project.roles.find(r => r.id === block.roleId)?.color}` : ''}" title="${fmt(segment.start)} – ${fmt(segment.end)}">${esc(segment.text)}</button>`).join('')}</div><div id="inspector">${inspector()}</div>`; }
function inspector() { const s = findSegment(selected); if (!s)
    return '<p class="muted">타임라인에서 음절을 선택하면 숫자로 조정할 수 있어요.</p>'; return `<div class="inspect"><b>${esc(s.text)}</b><label>시작 <input id="seg-start" type="number" min="0" step=".001" value="${s.start.toFixed(3)}"></label><label>끝 <input id="seg-end" type="number" min="0" step=".001" value="${s.end.toFixed(3)}"></label>${[-100, -50, -10, 10, 50, 100].map(n => `<button data-nudge="${n}">${n > 0 ? '+' : ''}${n}ms</button>`).join('')}<button id="split">음절 분리</button><button id="merge">다음과 합치기</button></div>`; }
function findSegment(id) { return flatten(project.lyricBlocks).find(x => x.segment.id === id)?.segment; }
function bindTiming() { const canvas = $('#preview'), ctx = canvas.getContext('2d'); const loop = () => { if (!canvas.isConnected)
    return; ctx.save(); ctx.scale(.5, .5); renderFrame(ctx, project, audio.currentTime, bgImage); ctx.restore(); const clock = document.querySelector('#timing-clock'); if (clock)
    clock.textContent = fmt(audio.currentTime); const head = document.querySelector('#playhead'); if (head)
    head.style.left = `calc(${audio.currentTime * 100}px * var(--zoom, 1))`; const on = $('#loop-on'); if (on?.checked && audio.currentTime >= Number($('#loop-b').value))
    audio.currentTime = Number($('#loop-a').value); requestAnimationFrame(loop); }; loop(); $('#stamp').onclick = stamp; $('#timing-play').onclick = () => audio.paused ? audio.play() : audio.pause(); document.querySelectorAll('[data-seg]').forEach(x => x.onclick = () => { selected = x.dataset.seg; const segment = findSegment(selected); if (segment?.start)
    audio.currentTime = segment.start; editor(); }); const timeline = $('#timeline'); $('#playback-rate').onchange = e => change(() => { project.timing.playbackRate = Number(e.target.value); audio.playbackRate = project.timing.playbackRate; }, false); $('#timing-offset').onchange = e => change(() => project.timing.offsetMs = Number(e.target.value), false); $('#apply-offset').onclick = () => change(() => { const delta = project.timing.offsetMs / 1000; for (const { segment } of flatten(project.lyricBlocks))
    if (segment.end > segment.start) {
        segment.start = Math.max(0, segment.start + delta);
        segment.end = Math.max(segment.start + .01, segment.end + delta);
    } project.timing.offsetMs = 0; }); $('#timing-volume').oninput = e => audio.volume = Number(e.target.value); audio.playbackRate = project.timing.playbackRate; const addMarker = (type, countdown, label) => change(() => { const start = Number($('#loop-a').value), end = Number($('#loop-b').value); if (end > start)
    project.markers.push({ id: uid(), type, label, start, end, countdown }); }); $('#add-interlude').onclick = () => addMarker('interlude', 0, '간주'); $('#add-countdown').onclick = () => addMarker('custom', 4, '곧 시작합니다'); document.querySelectorAll('[data-marker-delete]').forEach(button => button.onclick = () => change(() => project.markers = project.markers.filter(marker => marker.id !== button.dataset.markerDelete))); $('#zoom').oninput = e => timeline.style.setProperty('--zoom', String(Number(e.target.value) / 100)); bindInspector(); }
function refreshTimingAfterStamp() { const all = flatten(project.lyricBlocks), current = all[stampIndex], next = $('#next-syllable'), upcoming = $('#upcoming-syllables'), button = $('#stamp'); next.textContent = current?.segment.text || '완료!'; upcoming.innerHTML = all.slice(stampIndex + 1, stampIndex + 6).map(x => `<span>${esc(x.segment.text)}</span>`).join(''); button.disabled = !audioBlob || !current; document.querySelectorAll('[data-seg]').forEach(element => { const segment = findSegment(element.dataset.seg); element.classList.toggle('selected', element.dataset.seg === selected); if (segment) {
    element.style.setProperty('--left', `${segment.start * 100}px`);
    element.style.setProperty('--width', `${Math.max(34, (segment.end - segment.start) * 100)}px`);
    element.title = `${fmt(segment.start)} – ${fmt(segment.end)}`;
} }); $('#inspector').innerHTML = inspector(); bindInspector(); }
function stamp() { const all = flatten(project.lyricBlocks); if (!all[stampIndex])
    return; change(() => { const now = Math.max(0, audio.currentTime + project.timing.offsetMs / 1000), segment = all[stampIndex].segment; applyStamp(all.map(entry => entry.segment), stampIndex, now); selected = segment.id; stampIndex++; }, false); refreshTimingAfterStamp(); }
function keys(e) { if (e.target.matches('input,textarea,select'))
    return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
} if (step !== 3)
    return; if (e.code === 'Space') {
    e.preventDefault();
    stamp();
}
else if (e.key.toLowerCase() === 'k')
    audio.paused ? audio.play() : audio.pause();
else if (e.key === 'Backspace') {
    e.preventDefault();
    if (stampIndex) {
        stampIndex--;
        const s = flatten(project.lyricBlocks)[stampIndex].segment;
        change(() => { s.start = 0; s.end = 0; const previous = flatten(project.lyricBlocks)[stampIndex - 1]?.segment; if (previous)
            previous.end = previous.start + .35; });
        editor();
    }
}
else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selected) {
    e.preventDefault();
    const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? .05 : .01);
    const s = findSegment(selected);
    change(() => { s.start = Math.max(0, s.start + d); s.end = Math.max(s.start + .01, s.end + d); });
    editor();
} }
function bindInspector() { const s = findSegment(selected); if (!s)
    return; for (const key of ['start', 'end']) {
    const el = document.querySelector(`#seg-${key}`);
    if (el)
        el.onchange = () => change(() => s[key] = Math.max(key === 'end' ? s.start + .01 : 0, Number(el.value)));
} document.querySelectorAll('[data-nudge]').forEach(x => x.onclick = () => change(() => { const d = Number(x.dataset.nudge) / 1000; s.start = Math.max(0, s.start + d); s.end = Math.max(s.start + .01, s.end + d); })); $('#split').onclick = () => change(() => { const entry = flatten(project.lyricBlocks).find(x => x.segment.id === s.id); const parts = [...s.text]; if (parts.length < 2)
    return; entry.block.segments.splice(entry.si, 1, ...parts.map((text, i) => ({ id: uid(), text, start: s.start + (s.end - s.start) * i / parts.length, end: s.start + (s.end - s.start) * (i + 1) / parts.length }))); }); $('#merge').onclick = () => change(() => { const entry = flatten(project.lyricBlocks).find(x => x.segment.id === s.id); const n = entry.block.segments[entry.si + 1]; if (n) {
    s.text += n.text;
    s.end = n.end;
    entry.block.segments.splice(entry.si + 1, 1);
} }); }
function designStep() { const presets = [['classic', 'Classic Karaoke', '익숙하고 선명한 네이비'], ['stage', 'Stage Light', '보랏빛 무대 조명'], ['dream', 'Dream', '별빛 같은 감성 무대'], ['classroom', 'Classroom Pop', '밝고 산뜻한 교실'], ['retro', 'Retro Pop', '리듬감 있는 컬러'], ['minimal', 'Minimal', '텍스트 중심의 절제된 화면']]; return `<h1>4. 디자인</h1><h2>무대 프리셋</h2><div class="preset-grid">${presets.map(([id, n, d]) => `<button data-preset="${id}" class="preset ${project.style.preset === id ? 'chosen' : ''}"><i class="p-${id}"></i><b>${n}</b><span>${d}</span></button>`).join('')}</div><h2>노래방 글꼴</h2><div class="font-grid">${fonts.map(([f, n], i) => `<button data-font="${f}" class="font ${project.style.fontFamily === f ? 'chosen' : ''}" ${unavailableFonts.has(f) ? 'disabled aria-disabled="true"' : ''} style="font-family:'${f}'"><b>${n}</b><span>우리 함께 노래해요!</span>${unavailableFonts.has(f) ? '<em>글꼴 파일 없음 · 시스템 대체</em>' : i === 0 ? '<em>⭐ 기본</em>' : ''}</button>`).join('')}</div><label class="button">+ 내 글꼴 추가<input id="font-file" type="file" accept=".otf,.ttf,font/otf,font/ttf"></label><p class="muted">추가 글꼴의 이용 조건은 사용자가 직접 확인해야 합니다.</p><div class="settings"><label>진행 색상 <select id="color-mode"><option value="common">공통 노란색</option>${project.musicalMode ? `<option value="role" ${project.style.colorMode === 'role' ? 'selected' : ''}>배역별 색상</option>` : ''}</select></label><label><input id="progress" type="checkbox" ${project.style.progress ? 'checked' : ''}> 진행바 표시</label><label>배경 이미지 <input id="bg-file" type="file" accept="image/png,image/jpeg,image/webp"></label><label>밝기 <input id="brightness" type="range" min="30" max="120" value="${project.style.brightness}"></label><label>어둡게 <input id="darken" type="range" min="0" max="80" value="${project.style.darken}"></label><label>흐림 <input id="blur" type="range" min="0" max="20" value="${project.style.blur}"></label></div><canvas id="design-preview" width="960" height="540" role="img" aria-label="선택한 디자인의 노래방 영상 미리보기"></canvas>`; }
function bindDesign() { document.querySelectorAll('[data-preset]').forEach(x => x.onclick = () => change(() => project.style.preset = x.dataset.preset)); document.querySelectorAll('[data-font]').forEach(x => x.onclick = () => { if (!x.classList.contains('disabled')) {
    fontBlob = undefined;
    change(() => project.style.fontFamily = x.dataset.font);
    save({ font: null });
} }); $('#font-file').onchange = async (e) => { const f = e.target.files?.[0]; if (!f)
    return; try {
    fontBlob = f;
    project.style.fontFamily = await loadCustomFont(f);
    save({ font: f });
    editor();
}
catch {
    alert('글꼴을 불러오지 못했어요. OTF 또는 TTF 파일을 확인해 주세요.');
} }; $('#bg-file').onchange = e => { const f = e.target.files?.[0]; if (f)
    setBackground(f); }; $('#color-mode').onchange = e => change(() => project.style.colorMode = e.target.value); $('#progress').onchange = e => change(() => project.style.progress = e.target.checked); for (const k of ['brightness', 'darken', 'blur'])
    $(`#${k}`).oninput = e => { project.style[k] = Number(e.target.value); drawDesign(); }; drawDesign(); }
function drawDesign() { const c = document.querySelector('#design-preview'); if (!c)
    return; const x = c.getContext('2d'); x.save(); x.scale(.5, .5); renderFrame(x, project, audio.currentTime || project.lyricBlocks[0]?.segments[0]?.start || 0, bgImage); x.restore(); }
function setBackground(blob) { bgBlob = blob; if (bgUrl)
    URL.revokeObjectURL(bgUrl); bgUrl = URL.createObjectURL(blob); bgImage = new Image(); bgImage.onload = () => { save({ background: blob }); editor(); }; bgImage.src = bgUrl; }
function exportStep() { const support = exportSupport(), timed = flatten(project.lyricBlocks).filter(x => x.segment.end > x.segment.start).length, total = flatten(project.lyricBlocks).length, isMp4 = support.type.includes('mp4'), format = isMp4 ? 'MP4' : 'WebM'; return `<h1>5. 내보내기</h1><p>미리보기와 동일한 프레임 계산으로 영상을 만들어요. 내보내는 동안 이 탭을 화면에 유지해 주세요.</p><div class="checklist"><div><span>${audioBlob ? '✓' : '!'}</span><b>반주</b><small>${audioBlob ? esc(project.media.name) : '반주가 필요해요'}</small></div><div><span>${timed ? '✓' : '!'}</span><b>타이밍</b><small>${timed} / ${total} 음절 완료${timed < total ? ' · 미완성 부분은 강조되지 않아요' : ''}</small></div><div><span>${support.type ? '✓' : '!'}</span><b>영상 호환성</b><small>${support.type ? `${format} 녹화를 사용할 수 있어요.` : '이 브라우저는 영상 녹화를 지원하지 않아요.'}</small></div></div><section class="export-card"><h2>${esc(project.meta.title)}</h2><p>1920 × 1080 · 30fps · ${format} · ${fmt(project.media.duration)}</p><button id="export" class="primary" ${!audioBlob || !total || !timed || !support.type ? 'disabled' : ''}>${format} 만들기</button><button id="package">프로젝트 파일 저장</button><div id="progress-box" role="status" aria-live="polite" hidden><b id="stage">준비 중</b><progress id="render-progress" max="100" value="0"></progress><output id="percent">0%</output><span id="eta"></span><button id="cancel">취소</button></div><div id="complete"></div></section>`; }
function bindExport() { $('#package').onclick = downloadPackage; $('#export').onclick = async () => { const ctl = new AbortController(); $('#progress-box').hidden = false; $('#export').disabled = true; $('#cancel').onclick = () => ctl.abort(); try {
    const blob = await exportVideo(project, audio, bgImage, s => { $('#render-progress').value = s.percent; $('#stage').textContent = s.stage; $('#percent').textContent = `${s.percent}%`; $('#eta').textContent = s.eta === undefined ? '' : ` · 약 ${Math.ceil(s.eta)}초 남음`; }, ctl.signal);
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm', label = ext.toUpperCase();
    const u = URL.createObjectURL(blob);
    $('#complete').innerHTML = `<div class="success"><h2>영상 완성!</h2><p>${esc(project.meta.title)} · 1920×1080 · 30fps · ${label}</p><a class="primary button" download="${esc(project.meta.title)}.${ext}" href="${u}">${label} 저장하기</a></div>`;
}
catch (e) {
    if (e.name !== 'AbortError')
        alert(e.message || '영상을 만들지 못했어요. 메모리를 확보한 뒤 다시 시도해 주세요.');
}
finally {
    $('#export').disabled = false;
} }; }
async function blobData(b) { if (!b)
    return null; const bytes = new Uint8Array(await b.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768)); return { type: b.type, data: btoa(binary) }; }
function fromData(x) { if (!x)
    return undefined; const s = atob(x.data), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++)
    a[i] = s.charCodeAt(i); return new Blob([a], { type: x.type }); }
async function downloadPackage() { const payload = { format: 'mkaraoke', project: structuredClone(project), audio: await blobData(audioBlob), background: await blobData(bgBlob), font: await blobData(fontBlob) }; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' })); a.download = `${project.meta.title}.mkaraoke`; a.click(); }
async function importPackage(e) { const f = e.target.files?.[0]; if (!f)
    return; try {
    const x = JSON.parse(await f.text());
    if (x.format !== 'mkaraoke' || x.project?.version !== 1)
        throw 0;
    resetEditorState();
    project = normalizeProject(x.project);
    audioBlob = fromData(x.audio);
    bgBlob = fromData(x.background);
    fontBlob = fromData(x.font);
    if (audioBlob)
        setAudio(audioBlob, project.media.name);
    if (bgBlob)
        setBackground(bgBlob);
    syncCursor();
    if (fontBlob && project.style.fontFamily.startsWith('내 글꼴 '))
        project.style.fontFamily = await loadCustomFont(new File([fontBlob], 'custom.otf'));
    await saveProject(project, { audio: audioBlob, background: bgBlob, font: fontBlob });
    editor();
}
catch {
    alert('프로젝트 파일을 읽지 못했어요. 올바른 .mkaraoke 파일인지 확인해 주세요.');
} }
function snapshot() { return structuredClone(project); }
function change(fn, rerender = true) { history.push(snapshot()); if (history.length > 50)
    history.shift(); future = []; fn(); save(); if (rerender)
    editor(); }
function syncCursor() { const all = flatten(project.lyricBlocks); stampIndex = all.findIndex(x => x.segment.end <= x.segment.start); if (stampIndex < 0)
    stampIndex = all.length; if (selected && !findSegment(selected))
    selected = ''; }
function undo() { if (!history.length)
    return; future.push(snapshot()); project = history.pop(); syncCursor(); save(); editor(); }
function redo() { if (!future.length)
    return; history.push(snapshot()); project = future.pop(); syncCursor(); save(); editor(); }
function save(files) { if (files)
    pendingFiles = { ...pendingFiles, ...files }; clearTimeout(dirtyTimer); const status = document.querySelector('#saved'); if (status)
    status.textContent = '저장 중…'; dirtyTimer = window.setTimeout(() => { const queued = pendingFiles; pendingFiles = {}; saveProject(project, queued).then(() => { const x = document.querySelector('#saved'); if (x)
    x.textContent = '✓ 자동 저장됨'; }).catch(() => { pendingFiles = { ...queued, ...pendingFiles }; const x = document.querySelector('#saved'); if (x)
    x.textContent = '저장 실패 · 이 변경은 유실될 수 있어요'; }); }, 350); }
window.addEventListener('keydown', keys);
for (const event of ['dragover', 'drop'])
    window.addEventListener(event, e => e.preventDefault());
loadBuiltins().then(f => { unavailableFonts = new Set(f); if (f.includes('TJ Joy'))
    console.warn('첨부 TJ 폰트를 찾지 못해 Noto Sans KR로 대체합니다.'); }).finally(home);
