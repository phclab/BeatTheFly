// SPDX-License-Identifier: GPL-3.0-or-later
const DB_NAME = 'beatthefly-weights', DB_VER = 1, ROOT = 'https://cache.local/';

export const modelPrefix = (model, version, prec) => `${ROOT}${model}/${version}/${prec}/`;
export const fileKey = (model, version, prec, file) => modelPrefix(model, version, prec) + file;

export function openStore() {
  return new Promise(res => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
        if (!d.objectStoreNames.contains('models')) d.createObjectStore('models');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (_) { res(null); }
  });
}

function tx(db, stores, mode, fn) {
  return new Promise((res, rej) => {
    let out;
    try {
      const t = db.transaction(stores, mode);
      out = fn(t);
      t.oncomplete = () => res(out && 'result' in out ? out.result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    } catch (e) { rej(e); }
  });
}
const range = prefix => IDBKeyRange.bound(prefix, prefix + '￿');

export async function getFile(db, key) {
  try {
    const v = await tx(db, 'files', 'readonly', t => t.objectStore('files').get(key));
    return v ? new Uint8Array(v) : null;
  } catch (_) { return null; }
}

export async function putFile(db, key, bytes) {
  try {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await tx(db, 'files', 'readwrite', t => t.objectStore('files').put(buf, key));
    return true;
  } catch (_) { return false; }
}

export async function markComplete(db, prefix, meta) {
  try { await tx(db, 'models', 'readwrite', t => t.objectStore('models').put(meta, prefix)); return true; } catch (_) { return false; }
}

export async function getComplete(db, prefix) {
  try { return (await tx(db, 'models', 'readonly', t => t.objectStore('models').get(prefix))) || null; } catch (_) { return null; }
}

async function deleteWhere(db, prefix, drop) {
  await tx(db, ['files', 'models'], 'readwrite', t => {
    for (const name of ['files', 'models']) {
      const c = t.objectStore(name).openKeyCursor(range(prefix));
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return;
        if (drop(String(cur.key))) t.objectStore(name).delete(cur.key);
        cur.continue();
      };
    }
  });
}

export async function dropModel(db, model, version, prec) {
  try { await deleteWhere(db, modelPrefix(model, version, prec), () => true); } catch (_) {}
}

export async function evictOldVersions(db, model, version) {
  const keep = `${ROOT}${model}/${version}/`;
  try { await deleteWhere(db, `${ROOT}${model}/`, k => !k.startsWith(keep)); } catch (_) {}
}

export async function usage(db) {
  try {
    const metas = await tx(db, 'models', 'readonly', t => t.objectStore('models').getAll());
    return { bytes: (metas || []).reduce((a, m) => a + (m.bytes || 0), 0), models: metas || [] };
  } catch (_) { return { bytes: 0, models: [] }; }
}

export async function clearAll(db) {
  try { await tx(db, ['files', 'models'], 'readwrite', t => { t.objectStore('files').clear(); t.objectStore('models').clear(); }); return true; }
  catch (_) { return false; }
}
