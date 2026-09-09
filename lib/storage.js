const DB = 'musical-karaoke-v1';
const open = () => new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); r.result.createObjectStore('files'); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
export async function saveProject(p, files) { p.updatedAt = Date.now(); const db = await open(); const tx = db.transaction(['projects', 'files'], 'readwrite'); tx.objectStore('projects').put(structuredClone(p)); if (files)
    for (const [k, v] of Object.entries(files)) {
        const key = `${p.id}:${k}`;
        if (v)
            tx.objectStore('files').put(v, key);
        else if (v === null)
            tx.objectStore('files').delete(key);
    } await new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); }); db.close(); }
export async function loadProjects() { const db = await open(); const r = db.transaction('projects').objectStore('projects').getAll(); const x = await new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); db.close(); return x.sort((a, b) => b.updatedAt - a.updatedAt); }
export async function loadFile(id, key) { const db = await open(); const r = db.transaction('files').objectStore('files').get(`${id}:${key}`); const x = await new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); db.close(); return x; }
export async function removeProject(id) { const db = await open(); const tx = db.transaction(['projects', 'files'], 'readwrite'); tx.objectStore('projects').delete(id); for (const k of ['audio', 'background', 'font'])
    tx.objectStore('files').delete(`${id}:${k}`); await new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); }); db.close(); }
