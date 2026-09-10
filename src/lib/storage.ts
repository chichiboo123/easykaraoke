import { migrate, type KaraokeProject } from '../types.js';

const DB = 'yeogi-karaoke';
const VERSION = 2;
export type FileKind = 'audio' | 'background' | 'font';

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, fail) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);
  });
}

/**
 * V1은 색상 하나만 바꿔도 10MB 오디오 Blob을 매번 다시 썼다(쓰기 증폭).
 * V2는 바뀐 파일만 files에 기록한다.
 */
export async function saveProject(project: KaraokeProject, files: Partial<Record<FileKind, Blob | undefined>> = {}): Promise<void> {
  const db = await open();
  try {
    const kinds = Object.keys(files) as FileKind[];
    const tx = db.transaction(kinds.length ? ['projects', 'files'] : ['projects'], 'readwrite');
    tx.objectStore('projects').put({ ...project, updatedAt: Date.now() });
    if (kinds.length) {
      const store = tx.objectStore('files');
      for (const kind of kinds) {
        const blob = files[kind];
        if (blob) store.put(blob, `${project.id}:${kind}`);
        else store.delete(`${project.id}:${kind}`);
      }
    }
    await done(tx);
  } finally {
    db.close();
  }
}

export async function loadProjects(): Promise<KaraokeProject[]> {
  const db = await open();
  try {
    const tx = db.transaction('projects', 'readonly');
    const req = tx.objectStore('projects').getAll();
    await done(tx);
    return (req.result as KaraokeProject[]).map(migrate).sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function loadFile(id: string, kind: FileKind): Promise<Blob | undefined> {
  const db = await open();
  try {
    const tx = db.transaction('files', 'readonly');
    const req = tx.objectStore('files').get(`${id}:${kind}`);
    await done(tx);
    return req.result as Blob | undefined;
  } finally {
    db.close();
  }
}

/** V1에도 있었지만 어디서도 호출되지 않아 삭제 기능이 아예 없었다. */
export async function removeProject(id: string): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction(['projects', 'files'], 'readwrite');
    tx.objectStore('projects').delete(id);
    const files = tx.objectStore('files');
    for (const kind of ['audio', 'background', 'font'] as FileKind[]) files.delete(`${id}:${kind}`);
    await done(tx);
  } finally {
    db.close();
  }
}
