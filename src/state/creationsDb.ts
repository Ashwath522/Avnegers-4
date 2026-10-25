/** IndexedDB storage for captured screenshots and clips. */
export interface Creation {
  id: string;
  kind: 'screenshot' | 'clip';
  characterId: string;
  createdAt: number;
  durationMs?: number;
  mime: string;
  blob: Blob;
  title: string;
}

const DB = 'alter-ego', STORE = 'creations';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

const listeners = new Set<() => void>();
export const onCreationsChanged = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export async function saveCreation(c: Omit<Creation, 'id' | 'createdAt'>) {
  const item: Creation = { ...c, id: crypto.randomUUID(), createdAt: Date.now() };
  await tx('readwrite', (s) => s.put(item));
  listeners.forEach((l) => l());
  return item;
}

export async function listCreations(): Promise<Creation[]> {
  const all = await tx<Creation[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCreation(id: string) {
  await tx('readwrite', (s) => s.delete(id));
  listeners.forEach((l) => l());
}
