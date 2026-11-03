// Echoes: rules engine. Pure logic, no DOM, fixed 60 Hz timestep so runs replay exactly.
//
// You slide left and right to pass through gaps in bars that fall toward you.
// Every bar is the same on every run of a board (seeded), so your earlier runs
// took the same safe line you are about to take. They come back as ghosts that
// replay exactly what you did. A ghost touch costs one of three hearts.
// Friendly ghosts drift by with help: Nitro (faster sideways, double points) or a Shield.
// Every position is snapped to a 16-bit grid, so a saved run replays bit for bit.

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
// The crew come and go. They first find you after 10 to 15 s, stay 12 to 18 s, then drift away for
// 12 to 18 s, and so on, at times fixed by the board. While they are away something else is after you:
// an alien nest or a tight patch of wreckage. Early on a few aliens keep you busy.
export const FIRST_VISIT = [600, 900];
export const VISIT_STAY = [720, 1080];
export const VISIT_AWAY = [720, 1080];
export const JOIN_GRACE = 90;      // a visiting ghost needs 1.5 s to wake before it can touch you
export const LEAVE_GRACE = 45;     // and cannot touch you for its last 0.75 s as it fades

export const PTS_BAR = 10;
export const PTS_GRAZE = 5;

export const HEARTS = 3;
export const SHIELD_TICKS = 90;     // safe from ghosts for 1.5 s after a ghost hit
export const SHATTER_TICKS = 150;   // a ghost that hit you cannot hit again for 2.5 s

export const FR = 0.04;             // a friend ghost's pickup radius (generous)
export const NITRO_MULT = 1.7;      // sideways speed while Nitro lasts; points double too
export const SLOWMO_MULT = 0.6;     // how fast bars fall during Slow-mo
export const SHRINK_MULT = 0.6;     // your size during Shrink
export const WIDEN_MULT = 1.35;     // gap width during Wide gaps
export const GOLD_MULT = 3;         // points multiplier during Gold rush

// Friend ghosts leave one of these. Timed powers share a single slot: a new one replaces the old.
// Shield waits (up to BUBBLE_TICKS) for a hit; Heal is instant.
// Better powers unlock the further down the board you are: tier 1 from the start, tier 2 from
// bar TIER_FROM[2], tier 3 from bar TIER_FROM[3], and the higher tiers become more common over time.
export const POWERS = {
  nitro:     { ticks: 240, weight: 3,   tier: 1 },
  shield:    { ticks: 0,   weight: 3,   tier: 1 },
  slowmo:    { ticks: 240, weight: 2,   tier: 1 },
  widen:     { ticks: 300, weight: 2,   tier: 1 },
  foresight: { ticks: 360, weight: 1.5, tier: 1 },
  exorcise:  { ticks: 300, weight: 2,   tier: 2 },
  shrink:    { ticks: 360, weight: 2,   tier: 2 },
  gold:      { ticks: 300, weight: 2,   tier: 2 },
  heal:      { ticks: 0,   weight: 1.5, tier: 3 },
  phase:     { ticks: 120, weight: 1,   tier: 3 },
};
export const TIER_FROM = [0, 0, 18, 36];

// How likely a power is for a friend that waits at bar index `bar`.
export function powerWeight(kind, bar) {
  const p = POWERS[kind];
  if (bar < TIER_FROM[p.tier]) return 0;
  const progress = Math.min(1, bar / 120);
  const mult = p.tier === 1 ? 1 - 0.7 * progress : p.tier === 2 ? 0.5 + progress : 0.3 + 2.2 * progress;
  return p.weight * mult;
}
export const NITRO_TICKS = POWERS.nitro.ticks; // 4 s

// Snails sit on the solid part of a bar and, from bar SNAIL_FROM on, throw something at you.
// They shake and glow for TELEGRAPH_DIST of falling before they fire, and fire when their bar is
// FIRE_DIST above your row. A shot costs a heart, exactly like touching a ghost.
export const SNAIL_FROM = 4;
export const FIRE_DIST = 0.8;
export const TELEGRAPH_DIST = 0.4;
export const WEAPONS = {
  hammer: { r: 0.028, vy: 1.7,  weight: 3, from: 4 },    // fast, straight at where you stood
  jacks:  { r: 0.02,  vy: 0.95, weight: 2, from: 24 },   // a fan of three slow spinning jacks
  bomb:   { r: 0.03,  vy: 1.0,  weight: 2, from: 36 },   // lands, ticks, then a wide blast
};
export const BOMB_FUSE = 30;        // 0.5 s from landing to blast
export const BLAST_TICKS = 8;
export const BLAST_R = 0.13;
export const JACK_SPREAD = 0.32;    // sideways speed difference between the three jacks

export function weaponWeight(kind, bar) {
  const w = WEAPONS[kind];
  if (bar < w.from) return 0;
  const p = Math.min(1, bar / 120);
  return w.weight * (kind === 'hammer' ? 1 - 0.5 * p : kind === 'jacks' ? 0.7 + 0.6 * p : 0.5 + p);
}
export const BUBBLE_TICKS = 480;    // a Shield bubble waits up to 8 s for a hit to absorb
export const INVULN_TICKS = 60;     // 1 s of full invulnerability after a bubble absorbs a hit

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
export const speedAt = (D) => Math.min(1.2, 0.6 + 0.045 * D); // starts at 0.6, tops out at 1.2 (2x) after about 15 s

// The bars of one board. bar(i) is memoised and depends only on (seed, i).
// Each bar has 1 to 3 gaps. gaps[0] is a guaranteed route (it never moves further
// than you can slide between two bars); the extra gaps give you and your ghosts room
// to spread out.
const GAP_MARGIN = 0.05; // solid bar kept between neighbouring gaps

export function makeTrack(seed) {
  const rng = mulberry32(seed);
  const bars = [];
  let c = 0.5;

  // When the crew visit, and what is after you the rest of the time. Its own random stream.
  const trng = mulberry32((seed ^ 0xc0ffee) >>> 0);
  const between = ([lo, hi]) => lo + Math.floor(trng() * (hi - lo + 1));
  const windows = [];
  for (let start = between(FIRST_VISIT), k = 0; start < MAX_TICKS; k++) {
    const end = start + between(VISIT_STAY), away = between(VISIT_AWAY);
    windows.push({ start, end, mode: k === 0 ? 'captain' : k === 1 ? 'last' : 'both', after: trng() < 0.5 ? 'snails' : 'tough' });
    start = end + away;
  }
  const ghostWindow = (tick) => windows.find((w) => tick >= w.start && tick < w.end) ?? null;
  // What is after you at this moment: the early aliens, the visiting crew, or the patch that follows a visit.
  const phaseAtTick = (tick) => {
    if (tick < windows[0].start) return { kind: 'early' };
    const w = ghostWindow(tick);
    if (w) return { kind: 'ghost', mode: w.mode };
    return { kind: 'patch', patch: windows.filter((x) => x.end <= tick).at(-1).after };
  };
  const Dt = [0]; // distance scrolled after n ticks (without Slow-mo), to know when a bar arrives
  const tickAt = (dist) => {
    while (Dt.at(-1) < dist) Dt.push(Dt.at(-1) + speedAt(Dt.at(-1)) * TICK);
    let lo = 0, hi = Dt.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (Dt[m] >= dist) hi = m; else lo = m + 1; }
    return lo;
  };

  const bar = (i) => {
    while (bars.length <= i) {
      const k = bars.length;
      const spacing = 0.46 + rng() * 0.2;
      const d = k ? bars[k - 1].d + spacing : 0.2;
      const phase = phaseAtTick(tickAt(d + PY));
      const tough = phase.kind === 'patch' && phase.patch === 'tough'; // narrower gaps, fewer of them, bigger swings
      const w = lerp(0.30, 0.21, Math.min(1, k / 60)) * (tough ? 0.82 : 1);
      // Never ask for a shift you cannot make in the time between two bars.
      const maxShift = tough ? Math.min(0.34, 0.72 * LAT * spacing / speedAt(d + PY)) : Math.min(0.28, 0.6 * LAT * spacing / speedAt(d + PY));
      c = clamp(c + (rng() * 2 - 1) * maxShift, w / 2 + 0.03, 1 - w / 2 - 0.03);
      const gaps = [{ c, w }];
      const moreGaps = rng() < 0.5;
      const extra = tough ? 1 : moreGaps ? 3 : 2;
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
      bars.push({ i: k, d, c, w, gaps, tough, phase });
    }
    return bars[i];
  };

  const pickPower = (r, bar) => {
    const kinds = Object.keys(POWERS);
    let t = r * kinds.reduce((a, k) => a + powerWeight(k, bar), 0);
    for (const k of kinds) if ((t -= powerWeight(k, bar)) < 0) return k;
    return 'nitro';
  };
  // Friendly ghosts come from their own random stream, so the bars above never change.
  // friend(j) sits between two bars, lined up with a gap of the next one, and is
  // never further from your route than you can slide in the time you have.
  const frng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const friends = [];
  const friend = (j) => {
    while (friends.length <= j) {
      const k = friends.length;
      const at = k ? friends[k - 1].bar + 8 + Math.floor(frng() * 5) : 4 + Math.floor(frng() * 4);
      const b = bar(at), nb = bar(at + 1);
      const d = (b.d + nb.d) / 2;
      const reach = LAT * ((d - b.d) / speedAt(d + PY)) * 0.85;
      let pool = nb.gaps.filter((g) => Math.abs(g.c - b.c) <= reach);
      if (!pool.length) pool = [nb.gaps.reduce((a, g) => (Math.abs(g.c - b.c) < Math.abs(a.c - b.c) ? g : a))];
      const g = pool[Math.floor(frng() * pool.length)];
      const x = g.c + (frng() - 0.5) * g.w * 0.4;
      friends.push({ id: k, bar: at, d, x, kind: pickPower(frng(), at) });
    }
    return friends[j];
  };

  // Snails: their own random stream. At most one per bar, never on neighbouring bars, always on a solid part.
  const srng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const snails = [];
  let lastSnail = -9;
  const pickWeapon = (r, k) => {
    const kinds = Object.keys(WEAPONS);
    let t = r * kinds.reduce((a, w) => a + weaponWeight(w, k), 0);
    for (const w of kinds) if ((t -= weaponWeight(w, k)) < 0) return w;
    return 'hammer';
  };
  const snail = (i) => {
    while (snails.length <= i) {
      const k = snails.length;
      const [r1, r2, r3, r4] = [srng(), srng(), srng(), srng()]; // always four draws, so branches never shift the stream
      let s = null;
      const ph = bar(k).phase;
      const chance = k < SNAIL_FROM ? 0 : ph.kind === 'early' ? 0.3 : ph.kind === 'ghost' ? 0.1 : ph.patch === 'snails' ? 0.7 : 0.12;
      // While the crew are away, and before they first come, never go long without an alien.
      const nest = k >= SNAIL_FROM && (ph.kind === 'early' || (ph.kind === 'patch' && ph.patch === 'snails')) && k - lastSnail >= 4;
      if ((r1 < chance || nest) && k - lastSnail >= 2) {
        const b = bar(k), segs = [];
        let from = 0;
        for (const g of b.gaps) { segs.push([from, g.c - g.w / 2]); from = g.c + g.w / 2; }
        segs.push([from, W]);
        const roomy = segs.filter(([a, z]) => z - a >= 0.1);
        if (roomy.length) {
          const [a, z] = roomy[Math.floor(r2 * roomy.length)];
          s = { bar: k, x: a + 0.05 + r3 * (z - a - 0.1), kind: pickWeapon(r4, k) };
          lastSnail = k;
        }
      }
      snails.push(s);
    }
    return snails[i];
  };
  return { seed, bar, friend, snail, windows, ghostWindow, phaseAtTick };
}

// ---------- ghosts ----------

// A run is { xs: Uint16-ish ints (x * 65535, one per tick), score }.
export const quantise = (x) => Math.round(clamp(x, 0, 1) * 65535);
const snap = (x) => quantise(x) / 65535; // every position lives on the 16-bit grid

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
    track, ghosts, tick: 0, D: 0, x: snap(clamp(startX, PR, W - PR)), alive: true, cause: null, hitGhost: null,
    score: 0, passed: 0, grazes: 0, xs: [], next: 0, margin: Infinity,
    hearts: HEARTS, shield: 0, shatteredUntil: ghosts.map(() => 0),
    power: null, powerLeft: 0, bubble: 0, invuln: 0, phase: -1, nf: 0, friends: 0,
    ns: 0, shots: [], shotId: 0, lenient: false,
  };
}

// Sideways speed limit for this tick (Nitro raises it).
export const maxMove = (run) => LAT * TICK * (run.power === 'nitro' ? NITRO_MULT : 1);

// Advance one tick toward `targetX` (0..1). Returns this tick's events: 'pass', 'graze',
// 'hurt', 'nitro', 'bubble', 'absorb' and 'die'. Does nothing once the run is over.
export function step(run, targetX) {
  if (!run.alive) return [];
  const m = maxMove(run);
  return applyMove(run, snap(clamp(run.x + clamp(targetX - run.x, -m, m), PR, W - PR)));
}

// Everything that happens once you are at position x this tick. Replays use this directly.
export function applyMove(run, x) {
  const events = [];
  run.x = x;
  run.xs.push(quantise(x));
  const pw = run.power;                              // the power in force for this tick
  const pr = pw === 'shrink' ? PR * SHRINK_MULT : PR; // your size right now
  run.D += speedAt(run.D) * TICK * (pw === 'slowmo' ? SLOWMO_MULT : 1);
  run.tick++;

  // A friend ghost drifting through your row.
  const f = run.track.friend(run.nf);
  const yf = run.D - f.d;
  if (yf - (PR + FR) > PY) run.nf++;
  else if (Math.abs(yf - PY) < pr + FR && Math.abs(x - f.x) < pr + FR) {
    run.nf++; run.friends++;
    // Timers start one tick high because they count down at the end of this same tick.
    if (f.kind === 'shield') { run.bubble = BUBBLE_TICKS + 1; events.push('bubble'); }
    else if (f.kind === 'heal') {
      if (run.hearts < HEARTS) run.hearts++; else run.bubble = BUBBLE_TICKS + 1; // full hearts: a Shield instead
      events.push('heal');
    } else { run.power = f.kind; run.powerLeft = POWERS[f.kind].ticks + 1; events.push(`power:${f.kind}`); }
  }

  // The crew arrive and leave on the board's schedule.
  for (const w of run.track.windows ?? []) {
    if (w.start === run.tick) events.push('join');
    else if (w.end === run.tick) events.push('leave');
  }

  // Past runs. A touch costs a heart (or pops a Shield bubble), then you are safe for a moment.
  if (run.shield === 0 && run.invuln === 0 && pw !== 'exorcise') {
    for (let gi = 0; gi < run.ghosts.length; gi++) {
      const g = run.ghosts[gi];
      const q = g.xs[run.tick - 1];
      if (q === undefined || run.shatteredUntil[gi] > run.tick || Math.abs(x - q / 65535) >= pr + GR || !ghostPhase(run.track, run.ghosts.length, gi, run.tick).armed) continue;
      run.shatteredUntil[gi] = run.tick + SHATTER_TICKS;
      run.hitGhost = g;
      if (hurt(run, events, 'ghost')) return events;
      break;
    }
  }

  // Snails: fire when their bar is FIRE_DIST above you, then move every shot along.
  for (let i = run.ns; ; i++) {
    const b = run.track.bar(i);
    const yb = run.D - b.d;
    if (yb < PY - FIRE_DIST) break;
    const sn = run.track.snail(i);
    if (sn) { fire(run, sn, yb); events.push('fire'); }
    run.ns = i + 1;
  }
  if (updateShots(run, events, pr, pw)) return events;

  // The bars. Hitting one ends the run, unless a Shield bubble or invulnerability saves you.
  const b = run.track.bar(run.next);
  const y = run.D - b.d;
  if (y + BAR_T / 2 > PY - PR && y - BAR_T / 2 < PY + PR) {
    if (run.phase !== run.next) {
      const mg = pw === 'phase' ? -1 : gapMargin(b, x, pr, pw === 'widen' ? WIDEN_MULT : 1);
      if (mg >= 0) run.margin = Math.min(run.margin, mg);
      else if (pw === 'phase') { run.phase = run.next; run.margin = Infinity; }
      else if (run.bubble > 0) { run.bubble = 0; run.invuln = INVULN_TICKS + 1; run.phase = run.next; run.margin = Infinity; events.push('absorb'); }
      else { run.alive = false; run.cause = 'bar'; events.push('die'); return events; }
    }
  } else if (y - BAR_T / 2 >= PY + PR) {
    const mult = pw === 'nitro' ? 2 : pw === 'gold' ? GOLD_MULT : 1;
    run.next++; run.passed++; run.score += PTS_BAR * mult; events.push('pass');
    if (run.margin < GRAZE) { run.grazes++; run.score += PTS_GRAZE * mult; events.push('graze'); }
    run.margin = Infinity; run.phase = -1;
  }

  if (run.shield > 0) run.shield--;
  if (run.invuln > 0) run.invuln--;
  if (run.powerLeft > 0 && --run.powerLeft === 0) run.power = null;
  if (run.bubble > 0) run.bubble--;
  if (run.tick >= MAX_TICKS) { run.alive = false; run.cause = 'timeout'; events.push('die'); }
  return events;
}

// A hit from a ghost or a snail's shot: a Shield bubble absorbs it, otherwise it costs a heart and
// starts a safe moment. Returns true if it ended the run. (Replays are lenient: they never end here.)
function hurt(run, events, cause) {
  if (run.shield > 0 || run.invuln > 0) return false;
  if (run.bubble > 0) { run.bubble = 0; run.invuln = INVULN_TICKS + 1; events.push('absorb'); return false; }
  run.hearts--; run.shield = SHIELD_TICKS + 1; events.push('hurt');
  if (run.hearts > 0) return false;
  if (run.lenient) { run.hearts = 1; return false; }
  run.alive = false; run.cause = cause; events.push('die');
  return true;
}

function fire(run, sn, y) {
  const spec = WEAPONS[sn.kind];
  const tFall = Math.max(0.25, (PY - y) / spec.vy);
  const aim = Math.max(-2.2, Math.min(2.2, (run.x - sn.x) / tFall)); // straight at where you are right now
  const add = (kind, vx, extra = {}) => run.shots.push({ id: run.shotId++, kind, x: sn.x, y, vx, vy: spec.vy, r: spec.r, ...extra });
  if (sn.kind === 'hammer') add('hammer', aim);
  else if (sn.kind === 'jacks') for (const off of [-JACK_SPREAD, 0, JACK_SPREAD]) add('jack', aim + off);
  else add('bomb', aim, { mode: 'fly', fuse: BOMB_FUSE, blast: 0, hit: false });
}

function updateShots(run, events, pr, pw) {
  const kept = [];
  for (const s of run.shots) {
    let gone = false;
    if (s.kind === 'bomb' && s.mode !== 'fly') {
      if (s.mode === 'fuse') { if (--s.fuse <= 0) { s.mode = 'blast'; s.blast = BLAST_TICKS; events.push('boom'); } }
      else {
        if (!s.hit && pw !== 'phase' && Math.abs(run.x - s.x) < BLAST_R + pr) { s.hit = true; if (hurt(run, events, 'snail')) return true; }
        if (--s.blast <= 0) gone = true;
      }
    } else {
      s.x += s.vx * TICK; s.y += s.vy * TICK;
      if (s.kind === 'bomb' && s.y >= PY) { s.y = PY; s.vx = 0; s.vy = 0; s.mode = 'fuse'; }
      else if (s.kind !== 'bomb' && pw !== 'phase' && Math.hypot(s.x - run.x, s.y - PY) < s.r + pr) {
        gone = true;
        if (hurt(run, events, 'snail')) return true;
      }
      if (s.y > PY + 0.4 || s.x < -0.3 || s.x > 1.3) gone = true;
    }
    if (!gone) kept.push(s);
  }
  run.shots = kept;
  return false;
}

// Check a saved run by replaying it on the board it claims: every move must be legal
// (within the speed limit, Nitro included) and must reproduce the score exactly.
// Ghosts are left out, so a run that survived with ghosts is judged on the bars alone.
export function verifyRun(seed, xs, claimedScore) {
  if (!Array.isArray(xs) || !xs.length || xs.length > MAX_TICKS) return { ok: false, reason: 'length' };
  if (xs.some((v) => !Number.isInteger(v) || v < 0 || v > 65535)) return { ok: false, reason: 'values' };
  const run = newRun(makeTrack(seed), [], xs[0] / 65535);
  run.lenient = true; // only the bars can end a replay; ghosts and snails are judged by the player's own hearts
  let prev = null;
  for (let t = 0; t < xs.length; t++) {
    const x = xs[t] / 65535;
    if (x < PR - 1e-4 || x > W - PR + 1e-4) return { ok: false, reason: 'bounds', tick: t + 1 };
    if (prev !== null && Math.abs(x - prev) > maxMove(run) + 2e-5) return { ok: false, reason: 'speed', tick: t + 1 };
    applyMove(run, x);
    if (!run.alive && t < xs.length - 1) return { ok: false, reason: 'dead-early', tick: t + 1 };
    prev = x;
  }
  const out = { ok: true, score: run.score, bars: run.passed, grazes: run.grazes, ticks: xs.length, friends: run.friends };
  if (claimedScore !== undefined && claimedScore !== run.score) return { ...out, ok: false, reason: 'score' };
  return out;
}

// How much room you have to the edges of the gap you are in (negative = you hit the bar).
export function gapMargin(bar, x, pr = PR, widen = 1) {
  let best = -Infinity;
  for (const g of bar.gaps) best = Math.max(best, Math.min(x - pr - (g.c - g.w * widen / 2), g.c + g.w * widen / 2 - (x + pr)));
  return best;
}

// Is ghost gi visiting right now? Visits start with the captain, then the last flight, then both.
const NO_GHOST = { visible: false, armed: false, fade: 0 };
export function ghostPhase(track, nGhosts, gi, tick) {
  const w = track.ghostWindow(tick);
  if (!w) return NO_GHOST;
  const ok = w.mode === 'both' || (w.mode === 'captain' && gi === 0) || (w.mode === 'last' && gi === (nGhosts > 1 ? 1 : 0));
  if (!ok) return NO_GHOST;
  const into = tick - w.start, left = w.end - tick;
  return { visible: true, armed: into > JOIN_GRACE && left > LEAVE_GRACE, fade: clamp(Math.min(into / 40, left / 40), 0, 1) };
}

// Where a ghost is on this tick, or null once its run has ended.
export function ghostX(ghost, tick) {
  const q = ghost.xs[tick - 1];
  return q === undefined ? null : q / 65535;
}
