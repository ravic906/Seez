// Leaderboard logic: pure functions, no DOM and no database. See leaderboard.js for the glue.
//
// Data (one document per player, plus one saved run per board):
//   scores/<uid>              { handle, boards: { "<seed>": { s, bars, grazes, ticks, t } } }
//   scores/<uid>/runs/<seed>  { x, s, t }   the recorded run, replayed to check the score

export const KEEP_BOARDS = 7;
export const TOP = 20;
const MAX_CHECKS = 60; // never replay more than this many runs to fill a board

export const isDaily = (seed) => {
  if (!Number.isInteger(seed) || seed < 20000101 || seed > 99991231) return false;
  const d = parse(seed);
  return fmt(d) === seed;
};
const parse = (seed) => new Date(Math.floor(seed / 10000), Math.floor(seed / 100) % 100 - 1, seed % 100);
const fmt = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

// The daily boards of the last `n` days, newest first (today included).
export function recentSeeds(todaySeed, n = KEEP_BOARDS) {
  const d = parse(todaySeed), out = [];
  for (let i = 0; i < n; i++) { out.push(fmt(d)); d.setDate(d.getDate() - 1); }
  return out;
}

// Add a score to a player's board map (keeping only the last week); `dropped` are boards to clean up.
export function mergeBoard(boards, seed, entry, todaySeed) {
  const keep = new Set(recentSeeds(todaySeed).map(String));
  const next = {}, dropped = [];
  for (const [k, v] of Object.entries({ ...boards, [seed]: entry })) (keep.has(k) ? (next[k] = v) : dropped.push(+k));
  return { boards: next, dropped };
}

export const beats = (existing, score) => !existing || score > existing.s;

// One row per player: their best score over the given boards.
export function entriesFor(docs, seeds) {
  const out = [];
  for (const { id, data } of docs) {
    if (!data || typeof data.boards !== 'object' || data.boards === null) continue;
    let best = null;
    for (const seed of seeds) {
      const e = data.boards[seed];
      if (e && Number.isFinite(e.s) && e.s > 0 && (!best || e.s > best.s || (e.s === best.s && e.t < best.t))) best = { ...e, seed };
    }
    if (best) out.push({ uid: id, handle: cleanHandle(data.handle), ...best });
  }
  return out;
}

// Handles come from other people's input: keep them short, plain and harmless.
export const cleanHandle = (h) => (typeof h === 'string' ? h.replace(/[^\w .-]/g, '').trim().slice(0, 24) : '') || 'Survivor';

// Ties share a rank (1, 1, 3).
const withRanks = (list) => {
  let last = 0;
  return list.map((e, i) => { last = i && list[i - 1].s === e.s ? last : i + 1; return { ...e, rank: last }; });
};

// Highest score first; the earlier one wins a tie.
export const rank = (entries) => withRanks([...entries].sort((a, b) => b.s - a.s || (a.t ?? 0) - (b.t ?? 0) || (a.uid < b.uid ? -1 : 1)));

// Walk down the ranking, replaying each saved run, until `limit` verified rows are found.
// `fetchRun(uid, seed)` -> { x, s } or null, `verify(seed, xs, score)` -> { ok }.
// Anything that fails to replay is simply left out. Results are remembered in `cache`.
// `mine` is the player's own verified row even when they are below the top list (rank null then).
export async function verifiedTop(ranked, { limit = TOP, fetchRun, verify, decode, cache = new Map(), wantUid = null }) {
  let checks = 0;
  const check = async (e) => {
    const key = `${e.uid}:${e.seed}:${e.s}:${e.t}`;
    if (cache.has(key)) return cache.get(key);
    checks++;
    let ok = false;
    try {
      const run = await fetchRun(e.uid, e.seed);
      ok = !!run && run.s === e.s && verify(e.seed, decode(run.x), e.s).ok === true;
    } catch { ok = false; }
    cache.set(key, ok);
    return ok;
  };
  const picked = [];
  for (const e of ranked) {
    if (picked.length >= limit || checks >= MAX_CHECKS) break;
    if (await check(e)) picked.push(e);
  }
  const rows = withRanks(picked);
  let mine = rows.find((e) => e.uid === wantUid) ?? null;
  if (wantUid && !mine) {
    const e = ranked.find((x) => x.uid === wantUid);
    if (e && (await check(e))) mine = { ...e, rank: null };
  }
  return { rows, mine, checks };
}
