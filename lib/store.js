import { migrate, newProject } from '../types.js';
import { distribute } from './lyrics.js';
import { prepareBackground } from './renderer.js';
import { loadFile, saveProject } from './storage.js';
export const state = {
    project: null,
    files: {},
    bgImage: undefined,
    bgPrepared: undefined,
    selected: -1,
    step: 1,
    dark: true,
};
let history = [];
let future = [];
let lastLabel = '';
let lastAt = 0;
let dirtyFiles = new Set();
let saveTimer = 0;
export const canUndo = () => history.length > 0;
export const canRedo = () => future.length > 0;
const listeners = new Set();
export function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function notify() {
    for (const fn of listeners)
        fn();
}
export function project() {
    if (!state.project)
        throw new Error('열린 프로젝트가 없습니다.');
    return state.project;
}
/**
 * 되돌릴 수 있는 변경.
 * 같은 label의 연속 변경(슬라이더 드래그, 연속 스탬프)은 하나로 묶어
 * Ctrl+Z 한 번에 의미 있는 단위가 되돌아가게 한다.
 */
export function commit(label, fn) {
    const p = project();
    const now = performance.now();
    const coalesce = label === lastLabel && now - lastAt < 700;
    if (!coalesce) {
        history.push(structuredClone(p));
        if (history.length > 60)
            history.shift();
        future = [];
    }
    lastLabel = label;
    lastAt = now;
    fn();
    save();
    notify();
}
/** 되돌리기 대상이 아닌 변경(재생 위치, 확대, 볼륨). */
export function touch(fn) {
    fn();
    save();
}
export function undo() {
    if (!history.length)
        return false;
    future.push(structuredClone(project()));
    state.project = history.pop();
    lastLabel = '';
    save();
    notify();
    return true;
}
export function redo() {
    if (!future.length)
        return false;
    history.push(structuredClone(project()));
    state.project = future.pop();
    lastLabel = '';
    save();
    notify();
    return true;
}
export let saveState = 'idle';
const saveListeners = new Set();
export function onSaveState(fn) {
    saveListeners.add(fn);
}
function setSaveState(s) {
    saveState = s;
    for (const fn of saveListeners)
        fn(s);
}
export function markFileDirty(kind) {
    dirtyFiles.add(kind);
}
export function save() {
    if (!state.project)
        return;
    clearTimeout(saveTimer);
    setSaveState('saving');
    saveTimer = window.setTimeout(async () => {
        const p = state.project;
        if (!p)
            return;
        const payload = {};
        for (const kind of dirtyFiles)
            payload[kind] = state.files[kind];
        dirtyFiles = new Set();
        try {
            await saveProject(p, payload);
            setSaveState('saved');
        }
        catch {
            setSaveState('error');
        }
    }, 400);
}
export function resetSession() {
    history = [];
    future = [];
    lastLabel = '';
    dirtyFiles = new Set();
    state.selected = -1;
    state.step = 1;
    state.bgImage = undefined;
    state.bgPrepared = undefined;
    state.files = {};
    setSaveState('idle');
}
export function create(title, meta = {}) {
    resetSession();
    const p = newProject(title);
    Object.assign(p.meta, meta);
    state.project = p;
    save();
    notify();
}
export function adopt(raw, files) {
    resetSession();
    state.project = migrate(raw);
    state.files = files;
    for (const kind of Object.keys(files))
        if (files[kind])
            markFileDirty(kind);
    notify();
}
/** 프로젝트에 딸린 파일을 IndexedDB에서 되살린다. */
export async function hydrateFiles(id) {
    const [audio, background, font] = await Promise.all([loadFile(id, 'audio'), loadFile(id, 'background'), loadFile(id, 'font')]);
    return { audio, background, font };
}
export function setBackground(blob) {
    state.files.background = blob;
    markFileDirty('background');
    if (!blob) {
        state.bgImage = undefined;
        state.bgPrepared = undefined;
        return Promise.resolve();
    }
    return new Promise((ok) => {
        const img = new Image();
        img.onload = () => {
            state.bgImage = img;
            refreshBackground();
            ok();
        };
        img.onerror = () => ok();
        img.src = URL.createObjectURL(blob);
    });
}
/** blur는 매 프레임이 아니라 설정이 바뀔 때 한 번만 처리한다. */
export function refreshBackground() {
    state.bgPrepared = state.bgImage ? prepareBackground(state.bgImage, project().style.blur) : undefined;
}
/** 블록 구간이 바뀌면 음절 타이밍을 다시 분배한다. */
export function reflow(index) {
    const p = project();
    if (index === undefined)
        p.blocks.forEach(distribute);
    else if (p.blocks[index])
        distribute(p.blocks[index]);
}
