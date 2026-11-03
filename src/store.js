// Saved boards and runs, in localStorage when it is available and in memory otherwise.
const KEY = 'echoes.v1';
const KEEP = 8; // latest runs kept per board, plus the best

let memory = null;

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked or corrupt: start fresh */ }
  return memory ?? { boards: {} };
}

export function saveStore(store) {
  memory = store;
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* keep it in memory only */ }
}

// Today's board, the same for everyone: YYYYMMDD as a number.
export function dailySeed(d = new Date()) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function boardLabel(seed) {
  if (seed >= 20000101 && seed <= 99991231) {
    const s = String(seed);
    const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    return `Daily · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }
  return `Board ${seed}`;
}

// Runs to turn into ghosts: the latest ones, plus the best even if it is older.
export function runsFor(store, seed) {
  const b = store.boards?.[seed];
  if (!b) return [];
  const runs = [...b.recent];
  if (b.best && !runs.some((r) => r.t === b.best.t)) runs.unshift(b.best);
  return runs;
}

export function recordRun(store, seed, run) {
  const boards = { ...(store.boards ?? {}) };
  const b = boards[seed] ?? { recent: [], best: null };
  const recent = [...b.recent, run].slice(-KEEP);
  const best = !b.best || run.s >= b.best.s ? run : b.best;
  boards[seed] = { recent, best };
  // Only remember the few most recently played boards so storage stays small.
  const keys = Object.keys(boards);
  if (keys.length > 12) for (const k of keys.slice(0, keys.length - 12)) if (+k !== seed) delete boards[k];
  return { ...store, boards };
}
