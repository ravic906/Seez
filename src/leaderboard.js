// Leaderboard glue: talks to the page's shared database (the `db` capability) and nothing else.
// Everything is optional: with no database (local play, or a viewer who cannot reach it) connect()
// returns null and the game simply has no leaderboard.
import { decodeXs, verifyRun } from './core.js';
import { entriesFor, rank, verifiedTop, mergeBoard, beats, recentSeeds, isDaily, TOP } from './board.js';

export async function connect(claude = globalThis.claude) {
  if (!claude?.use) return null;
  try {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db) return null;
    const uid = user ? await user.id() : null;
    const can = user ? await user.can('data.write') : null; // null = unknown: let a refused write decide
    return { db, uid, canWrite: !!uid && can !== false };
  } catch {
    return null;
  }
}

export function createBoard(conn, { today, getHandle }) {
  const cache = new Map();
  const listeners = new Set();
  let docs = [], status = 'loading', unsub = null, timer = null;

  const emit = () => listeners.forEach((fn) => fn());
  const fetchRun = async (uid, seed) => {
    const snap = await conn.db.doc(`scores/${uid}/runs/${seed}`).get();
    return snap.exists ? snap.data() : null;
  };

  return {
    get status() { return status; },
    get canWrite() { return conn.canWrite; },
    get uid() { return conn.uid; },

    // Listen once; the result stays live. A silent store flips to 'slow' after 10 s.
    start() {
      if (unsub) return;
      timer = setTimeout(() => { if (status === 'loading') { status = 'slow'; emit(); } }, 10000);
      unsub = conn.db.collection('scores').onSnapshot(
        (snap) => {
          docs = snap.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: d.data() }));
          if (!snap.metadata?.fromCache || docs.length) { status = 'ready'; clearTimeout(timer); }
          emit();
        },
        () => { status = 'error'; clearTimeout(timer); emit(); },
      );
    },
    stop() { unsub?.(); unsub = null; clearTimeout(timer); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // Rows for 'today' (one board) or 'week' (best of the last 7 boards).
    async rows(scope) {
      const seeds = scope === 'week' ? recentSeeds(today()) : [today()];
      const ranked = rank(entriesFor(docs, seeds));
      const out = await verifiedTop(ranked, { limit: TOP, fetchRun, verify: verifyRun, decode: decodeXs, cache, wantUid: conn.uid });
      return { ...out, total: ranked.length };
    },

    // Post a finished run on a daily board. Writes the saved run first so a score never exists
    // without its proof, one write at a time.
    async post(seed, run) {
      if (!conn.canWrite) return { posted: false, reason: 'read-only' };
      if (!isDaily(seed)) return { posted: false, reason: 'practice' };
      try {
        const doc = conn.db.doc(`scores/${conn.uid}`);
        const snap = await doc.get();
        const data = snap.exists ? snap.data() : {};
        if (!beats(data.boards?.[seed], run.s)) return { posted: false, reason: 'not-better' };
        const t = Date.now();
        await conn.db.doc(`scores/${conn.uid}/runs/${seed}`).set({ x: run.x, s: run.s, t, u: run.u ?? 0 });
        const merged = mergeBoard(data.boards ?? {}, seed, { s: run.s, bars: run.bars, grazes: run.grazes, ticks: run.ticks, t }, today());
        await doc.set({ handle: getHandle(), boards: merged.boards });
        for (const old of merged.dropped) await conn.db.doc(`scores/${conn.uid}/runs/${old}`).delete();
        return { posted: true };
      } catch (e) {
        return { posted: false, reason: e?.code ?? 'error' };
      }
    },

    // Change the name shown next to your scores (only matters once you have posted).
    async rename(handle) {
      if (!conn.canWrite) return false;
      try {
        const doc = conn.db.doc(`scores/${conn.uid}`);
        if ((await doc.get()).exists) await doc.update({ handle });
        return true;
      } catch { return false; }
    },
  };
}
