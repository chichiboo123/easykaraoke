import { migrate, newProject, type KaraokeProject } from '../types.js';
import { distribute } from './lyrics.js';
import { prepareBackground } from './renderer.js';
import { loadFile, saveProject, type FileKind } from './storage.js';

export type Step = 1 | 2 | 3;

type Files = { audio?: Blob; background?: Blob; font?: Blob };

export const state = {
  project: null as KaraokeProject | null,
  files: {} as Files,
  bgImage: undefined as HTMLImageElement | undefined,
  bgPrepared: undefined as CanvasImageSource | undefined,
  selected: -1,
  step: 1 as Step,
  dark: true,
};

let history: KaraokeProject[] = [];
let future: KaraokeProject[] = [];
let lastLabel = '';
let lastAt = 0;
let dirtyFiles = new Set<FileKind>();
let saveTimer = 0;

export const canUndo = () => history.length > 0;
export const canRedo = () => future.length > 0;

const listeners = new Set<() => void>();
export function onChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notify(): void {
  for (const fn of listeners) fn();
}

export function project(): KaraokeProject {
  if (!state.project) throw new Error('열린 프로젝트가 없습니다.');
  return state.project;
}

/**
 * 되돌릴 수 있는 변경.
 * 같은 label의 연속 변경(슬라이더 드래그, 연속 스탬프)은 하나로 묶어
 * Ctrl+Z 한 번에 의미 있는 단위가 되돌아가게 한다.
 */
export function commit(label: string, fn: () => void): void {
  const p = project();
  const now = performance.now();
  const coalesce = label === lastLabel && now - lastAt < 700;
  if (!coalesce) {
    history.push(structuredClone(p));
    if (history.length > 60) history.shift();
    future = [];
  }
  lastLabel = label;
  lastAt = now;
  fn();
  save();
  notify();
}

/** 되돌리기 대상이 아닌 변경(재생 위치, 확대, 볼륨). */
export function touch(fn: () => void): void {
  fn();
  save();
}

export function undo(): boolean {
  if (!history.length) return false;
  future.push(structuredClone(project()));
  state.project = history.pop()!;
  lastLabel = '';
  save();
  notify();
  return true;
}

export function redo(): boolean {
  if (!future.length) return false;
  history.push(structuredClone(project()));
  state.project = future.pop()!;
  lastLabel = '';
  save();
  notify();
  return true;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export let saveState: SaveState = 'idle';
const saveListeners = new Set<(s: SaveState) => void>();
export function onSaveState(fn: (s: SaveState) => void): void {
  saveListeners.add(fn);
}
function setSaveState(s: SaveState) {
  saveState = s;
  for (const fn of saveListeners) fn(s);
}

export function markFileDirty(kind: FileKind): void {
  dirtyFiles.add(kind);
}

export function save(): void {
  if (!state.project) return;
  clearTimeout(saveTimer);
  setSaveState('saving');
  saveTimer = window.setTimeout(async () => {
    const p = state.project;
    if (!p) return;
    const payload: Partial<Record<FileKind, Blob | undefined>> = {};
    for (const kind of dirtyFiles) payload[kind] = state.files[kind];
    dirtyFiles = new Set();
    try {
      await saveProject(p, payload);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, 400);
}

export function resetSession(): void {
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

export function create(title: string, meta: Partial<KaraokeProject['meta']> = {}): void {
  resetSession();
  const p = newProject(title);
  Object.assign(p.meta, meta);
  state.project = p;
  save();
  notify();
}

export function adopt(raw: unknown, files: Files): void {
  resetSession();
  state.project = migrate(raw as KaraokeProject);
  state.files = files;
  for (const kind of Object.keys(files) as FileKind[]) if (files[kind]) markFileDirty(kind);
  notify();
}

/** 프로젝트에 딸린 파일을 IndexedDB에서 되살린다. */
export async function hydrateFiles(id: string): Promise<Files> {
  const [audio, background, font] = await Promise.all([loadFile(id, 'audio'), loadFile(id, 'background'), loadFile(id, 'font')]);
  return { audio, background, font };
}

export function setBackground(blob: Blob | undefined): Promise<void> {
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
export function refreshBackground(): void {
  state.bgPrepared = state.bgImage ? prepareBackground(state.bgImage, project().style.blur) : undefined;
}

/** 블록 구간이 바뀌면 음절 타이밍을 다시 분배한다. */
export function reflow(index?: number): void {
  const p = project();
  if (index === undefined) p.blocks.forEach(distribute);
  else if (p.blocks[index]) distribute(p.blocks[index]);
}
