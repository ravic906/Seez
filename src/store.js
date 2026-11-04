// Saved boards and runs, in localStorage when it is available and in memory otherwise.
const KEY = 'echoes.v1';
const KEEP = 8; // latest runs kept per board, plus the best

let memory = null;

// Whatever is in storage might be damaged or from an older version, so rebuild a clean store from it.
export function sanitizeStore(raw) {
  const out = { boards: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (typeof raw.handle === 'string') out.handle = raw.handle.slice(0, 40);
  if (Number.isInteger(raw.seed)) out.seed = raw.seed;
  if (typeof raw.sound === 'boolean') out.sound = raw.sound;
  if (typeof raw.introSeen === 'boolean') out.introSeen = raw.introSeen;
  const run = (r) => {
    if (!r || typeof r !== 'object' || !Number.isFinite(r.s) || typeof r.x !== 'string' || !r.x || r.x.length > 200000) return null;
    try { if (atob(r.x).length % 2) return null; } catch { return null; }
    return { s: r.s, x: r.x, t: Number.isFinite(r.t) ? r.t : 0, u: Number.isInteger(r.u) && r.u >= 0 && r.u <= 3 ? r.u : 0 };
  };
  const boards = raw.boards && typeof raw.boards === 'object' && !Array.isArray(raw.boards) ? raw.boards : {};
  for (const [k, b] of Object.entries(boards)) {
    if (!b || typeof b !== 'object') continue;
    const recent = (Array.isArray(b.recent) ? b.recent : []).map(run).filter(Boolean);
    const best = run(b.best);
    if (recent.length || best) out.boards[k] = { recent, best, played: Number.isFinite(b.played) ? b.played : 0 };
  }
  return out;
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeStore(JSON.parse(raw));
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
  const runs = [...(Array.isArray(b.recent) ? b.recent : [])];
  if (b.best && !runs.some((r) => r.t === b.best.t)) runs.unshift(b.best);
  return runs;
}

export function recordRun(store, seed, run) {
  const boards = { ...(store.boards ?? {}) };
  const b = boards[seed] ?? { recent: [], best: null };
  const recent = [...(Array.isArray(b.recent) ? b.recent : []), run].slice(-KEEP);
  const best = !b.best || run.s >= b.best.s ? run : b.best;
  boards[seed] = { recent, best, played: run.t ?? Date.now() };
  // Only remember the 12 most recently played boards so storage stays small (oldest play time goes first).
  const keys = Object.keys(boards);
  if (keys.length > 12) {
    // never the board just played, and never today's daily (practice boards must not wipe its runs and ghosts)
    const oldest = keys.filter((k) => +k !== seed && +k !== dailySeed()).sort((a, c) => (boards[a].played ?? 0) - (boards[c].played ?? 0));
    for (const k of oldest.slice(0, keys.length - 12)) delete boards[k];
  }
  return { ...store, boards };
}
