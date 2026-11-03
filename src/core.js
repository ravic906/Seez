// Echoes: rules engine. Pure logic, no DOM, fixed 60 Hz timestep so runs replay exactly.
//
// You slide left and right to pass through gaps in bars that fall toward you.
// Every bar is the same on every run of a board (seeded), so your earlier runs
// took the same safe line you are about to take. They come back as ghosts that
// replay exactly what you did, and touching one ends the run.

export const TICK = 1 / 60;
export const W = 1;            // world is 1 wide, H tall (portrait)
export const H = 1.6;
export const PY = 1.28;        // the row you and your ghosts live on
export const PR = 0.026;       // your radius
export const GR = 0.012;       // a ghost's hit radius (a little forgiving)
export const BAR_T = 0.05;     // bar thickness
export const LAT = 2.4;        // max sideways speed, world widths per second
export const GRACE = 120;      // ticks at the start when ghosts cannot hurt you (time to spread out)
export const GRAZE = 0.012;    // passing a bar edge closer than this is a graze
export const MAX_TICKS = 60 * 240;
export const MAX_GHOSTS = 2;  // your best run and your last run

export const PTS_BAR = 10;
export const PTS_GRAZE = 5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fall speed (world units per second) as a function of distance scrolled.
export const speedAt = (D) => Math.min(1.4, 0.6 + 0.055 * D);

// The bars of one board. bar(i) is memoised and depends only on (seed, i).
// Each bar has 1 to 3 gaps. gaps[0] is a guaranteed route (it never moves further
// than you can slide between two bars); the extra gaps give you and your ghosts room
// to spread out.
const GAP_MARGIN = 0.05; // solid bar kept between neighbouring gaps

export function makeTrack(seed) {
  const rng = mulberry32(seed);
  const bars = [];
  let c = 0.5;
  const bar = (i) => {
    while (bars.length <= i) {
      const k = bars.length;
      const spacing = 0.46 + rng() * 0.2;
      const d = k ? bars[k - 1].d + spacing : 0.2;
      const w = lerp(0.30, 0.21, Math.min(1, k / 60));
      // Never ask for a shift you cannot make in the time between two bars.
      const maxShift = Math.min(0.28, 0.6 * LAT * spacing / speedAt(d + PY));
      c = clamp(c + (rng() * 2 - 1) * maxShift, w / 2 + 0.03, 1 - w / 2 - 0.03);
      const gaps = [{ c, w }];
      const extra = rng() < 0.5 ? 3 : 2;
      for (let e = 0; e < extra; e++) {
        const ew = w * (0.75 + rng() * 0.35);
        for (let tries = 0; tries < 10; tries++) {
          const ec = ew / 2 + 0.03 + rng() * (1 - ew - 0.06);
          if (gaps.every((g) => Math.abs(ec - g.c) >= (ew + g.w) / 2 + GAP_MARGIN)) { gaps.push({ c: ec, w: ew }); break; }
        }
      }
      if (gaps.length < 2) {
        // Random placement ran out of tries: put a second gap on the roomier side, always.
        const left = c - w / 2 - GAP_MARGIN - 0.03, right = 1 - 0.03 - (c + w / 2 + GAP_MARGIN);
        const ew = Math.min(w, Math.max(left, right));
        gaps.push({ c: left >= right ? 0.03 + ew / 2 : 1 - 0.03 - ew / 2, w: ew });
      }
      gaps.sort((a, b) => a.c - b.c);
      bars.push({ i: k, d, c, w, gaps });
    }
    return bars[i];
  };
  return { seed, bar };
}

// ---------- ghosts ----------

// A run is { xs: Uint16-ish ints (x * 65535, one per tick), score }.
export const quantise = (x) => Math.round(clamp(x, 0, 1) * 65535);

// Best run plus the latest others, oldest first in `runs`. Ghost = { xs, kind, score }.
export function pickGhosts(runs) {
  if (!runs.length) return [];
  let best = 0;
  runs.forEach((r, i) => { if (r.score >= runs[best].score) best = i; });
  const out = [{ ...runs[best], kind: 'best' }];
  for (let i = runs.length - 1; i >= 0 && out.length < MAX_GHOSTS; i--) {
    if (i !== best) out.push({ ...runs[i], kind: 'recent' });
  }
  return out;
}

export function encodeXs(xs) {
  const bytes = new Uint8Array(xs.length * 2);
  xs.forEach((v, i) => { bytes[2 * i] = v & 255; bytes[2 * i + 1] = v >> 8; });
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeXs(text) {
  const s = atob(text);
  const xs = new Array(s.length >> 1);
  for (let i = 0; i < xs.length; i++) xs[i] = s.charCodeAt(2 * i) | (s.charCodeAt(2 * i + 1) << 8);
  return xs;
}

// ---------- a run ----------

export function newRun(track, ghosts = [], startX = 0.5) {
  return {
    track, ghosts, tick: 0, D: 0, x: clamp(startX, PR, W - PR), alive: true, cause: null, hitGhost: null,
    score: 0, passed: 0, grazes: 0, xs: [], next: 0, margin: Infinity,
  };
}

// Advance one tick toward `targetX` (0..1). Returns the events of this tick:
// 'pass', 'graze' and 'die'. Does nothing once the run is over.
export function step(run, targetX) {
  const events = [];
  if (!run.alive) return events;
  run.x = clamp(run.x + clamp(targetX - run.x, -LAT * TICK, LAT * TICK), PR, W - PR);
  run.xs.push(quantise(run.x));
  run.D += speedAt(run.D) * TICK;
  run.tick++;

  if (run.tick > GRACE) {
    for (const g of run.ghosts) {
      const q = g.xs[run.tick - 1];
      if (q !== undefined && Math.abs(run.x - q / 65535) < PR + GR) {
        run.alive = false; run.cause = 'ghost'; run.hitGhost = g; events.push('die');
        return events;
      }
    }
  }

  const b = run.track.bar(run.next);
  const y = run.D - b.d;
  if (y + BAR_T / 2 > PY - PR && y - BAR_T / 2 < PY + PR) {
    const m = gapMargin(b, run.x);
    if (m < 0) { run.alive = false; run.cause = 'bar'; events.push('die'); return events; }
    run.margin = Math.min(run.margin, m);
  } else if (y - BAR_T / 2 >= PY + PR) {
    run.next++; run.passed++; run.score += PTS_BAR; events.push('pass');
    if (run.margin < GRAZE) { run.grazes++; run.score += PTS_GRAZE; events.push('graze'); }
    run.margin = Infinity;
  }
  if (run.tick >= MAX_TICKS) { run.alive = false; run.cause = 'timeout'; events.push('die'); }
  return events;
}

// How much room you have to the edges of the gap you are in (negative = you hit the bar).
export function gapMargin(bar, x) {
  let best = -Infinity;
  for (const g of bar.gaps) best = Math.max(best, Math.min(x - PR - (g.c - g.w / 2), g.c + g.w / 2 - (x + PR)));
  return best;
}

// Where a ghost is on this tick, or null once its run has ended.
export function ghostX(ghost, tick) {
  const q = ghost.xs[tick - 1];
  return q === undefined ? null : q / 65535;
}
