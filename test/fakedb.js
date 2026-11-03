// A tiny in-memory stand-in for the page's shared database, for tests and browser checks.
// Only what Echoes uses: doc get/set/update/delete/onSnapshot and collection get/onSnapshot.
export function makeFakeDb() {
  const store = new Map();
  const listeners = new Set();
  const log = [];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const last = (p) => p.split('/').at(-1);
  const parent = (p) => p.split('/').slice(0, -1).join('/');
  const notify = () => listeners.forEach((f) => f());
  const snap = (path) => ({
    id: last(path), exists: store.has(path), data: () => (store.has(path) ? clone(store.get(path)) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  const qsnap = (path) => {
    const docs = [...store.keys()].filter((k) => parent(k) === path).sort().map(snap);
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] };
  };
  const listen = (read, next) => {
    const f = () => next(read());
    listeners.add(f);
    queueMicrotask(f);
    return () => listeners.delete(f);
  };
  const docRef = (path) => ({
    id: last(path), path,
    get: async () => snap(path),
    set: async (d) => { log.push(['set', path]); store.set(path, clone(d)); notify(); },
    update: async (d) => {
      if (!store.has(path)) throw { code: 'invalid_argument', message: 'no such document' };
      log.push(['update', path]); store.set(path, { ...store.get(path), ...clone(d) }); notify();
    },
    delete: async () => { log.push(['delete', path]); store.delete(path); notify(); },
    onSnapshot: (next) => listen(() => snap(path), next),
    collection: (c) => collRef(`${path}/${c}`),
  });
  const collRef = (path) => ({
    path, doc: (id) => docRef(`${path}/${id ?? Math.random().toString(36).slice(2)}`),
    get: async () => qsnap(path),
    onSnapshot: (next) => listen(() => qsnap(path), next),
  });
  return { db: { doc: docRef, collection: collRef }, store, log };
}
