import { migrate } from '../types.js';
import { state } from './store.js';
export function decodeBlob(x) {
    if (!x)
        return undefined;
    const bin = atob(x.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: x.type });
}
async function encodeBlob(b) {
    if (!b)
        return null;
    const bytes = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 32768)
        s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { type: b.type, data: btoa(s) };
}
export function parsePackage(raw) {
    const x = raw;
    if (x?.format !== 'mkaraoke' || !x.project)
        throw new Error('형식이 다릅니다');
    return migrate(x.project);
}
export async function buildPackage(project) {
    const payload = {
        format: 'mkaraoke',
        project: structuredClone(project),
        audio: await encodeBlob(state.files.audio),
        background: await encodeBlob(state.files.background),
        font: await encodeBlob(state.files.font),
    };
    return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}
export function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // 다운로드가 시작될 여유를 주고 나서 해제한다.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
/** 지금 프로젝트를 .mkaraoke 파일로 내려받는다. */
export async function savePackage() {
    if (!state.project)
        return;
    const blob = await buildPackage(state.project);
    saveFile(blob, `${state.project.meta.title || '노래방'}.mkaraoke`);
}
