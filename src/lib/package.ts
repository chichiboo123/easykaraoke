import { migrate, type KaraokeProject } from '../types.js';
import { state } from './store.js';

/**
 * .mkaraoke 프로젝트 파일.
 * 반주·배경·글꼴을 base64로 담은 단일 JSON이라 파일 하나만 옮기면
 * 다른 기기에서도 그대로 이어서 만들 수 있다.
 */
export type Encoded = { type: string; data: string } | null | undefined;

export function decodeBlob(x: Encoded): Blob | undefined {
  if (!x) return undefined;
  const bin = atob(x.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: x.type });
}

async function encodeBlob(b?: Blob): Promise<Encoded> {
  if (!b) return null;
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { type: b.type, data: btoa(s) };
}

export function parsePackage(raw: unknown): KaraokeProject {
  const x = raw as { format?: string; project?: unknown };
  if (x?.format !== 'mkaraoke' || !x.project) throw new Error('형식이 다릅니다');
  return migrate(x.project as KaraokeProject);
}

export async function buildPackage(project: KaraokeProject): Promise<Blob> {
  const payload = {
    format: 'mkaraoke',
    project: structuredClone(project),
    audio: await encodeBlob(state.files.audio),
    background: await encodeBlob(state.files.background),
    font: await encodeBlob(state.files.font),
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // 다운로드가 시작될 여유를 주고 나서 해제한다.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 지금 프로젝트를 .mkaraoke 파일로 내려받는다. */
export async function savePackage(): Promise<void> {
  if (!state.project) return;
  const blob = await buildPackage(state.project);
  saveFile(blob, `${state.project.meta.title || '노래방'}.mkaraoke`);
}
