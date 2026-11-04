import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTrack, newRun, step, applyMove, pickGhosts, encodeXs, decodeXs, ghostX, gapMargin, verifyRun, speedAt,
  GRACE, GRAZE, PR, GR, FR, PY, PTS_BAR, PTS_GRAZE, MAX_GHOSTS, TICK, LAT, HEARTS, SHIELD_TICKS, SHATTER_TICKS,
  NITRO_TICKS, NITRO_MULT, BUBBLE_TICKS, INVULN_TICKS, maxMove, POWERS, SLOWMO_MULT, GHOST_REARM_MAX, GHOST_REARM_DIST, alignGhost, BAR_T, GOLD_MULT,
  TIER_FROM, powerWeight, JOIN_GRACE, LEAVE_GRACE, FIRST_VISIT, VISIT_STAY, VISIT_STAY_BOTH, VISIT_AWAY, ghostPhase, MAX_TICKS, SNAIL_FROM, FIRE_DIST, WEAPONS, BOMB_FUSE, BLAST_TICKS, BLAST_R, JACK_SPREAD, weaponWeight,
} from '../src/core.js';
import { playBot } from '../scripts/bot.mjs';

const SNAIL = (kind, x = 0.3) => (i) => (i === 0 ? { bar: 0, x, kind } : null);
const FAR = { id: 99, bar: 999, d: 1e9, x: 0.5, kind: 'nitro' };
// A track whose every bar has the same gaps, for exact tests. `friend` is an optional first friend.
const OPEN_VISIT = { start: GRACE - JOIN_GRACE, end: 1e9, mode: 'both', after: 'snails' };
const fixedTrack = (gaps, friend = null, snail = () => null, visit = OPEN_VISIT) => ({
  seed: 0, snail, windows: [], ghostWindow: (t) => (visit && t >= visit.start && t < visit.end ? visit : null), friend: (j) => (Array.isArray(friend) ? friend[j] : j === 0 ? friend : null) ?? FAR,
  bar: (i) => ({ i, d: 0.2 + i * 0.6, c: gaps[0].c, w: gaps[0].w, gaps }),
});
const wide = fixedTrack([{ c: 0.5, w: 1 }]);
const runUntilDone = (run, target, max = 3000) => { for (let i = 0; i < max && run.alive; i++) step(run, target); return run; };
const dAfter = (n) => { let D = 0; for (let i = 0; i < n; i++) D += speedAt(D) * TICK; return D; };
const ghostFrom = (x, ticks, kind = 'recent') => ({ xs: Array(ticks).fill(Math.round(x * 65535)), kind, score: 1 });
// Friend that crosses your row at tick `at`, wherever you stand.
const friendAt = (at, x, kind) => ({ id: 0, bar: 0, d: dAfter(at) - PY, x, kind });

// ---------- boards ----------

test('a board is the same every time, however you ask for it', () => {
  const a = makeTrack(42), b = makeTrack(42);
  assert.deepEqual(a.bar(30), b.bar(30));
  b.bar(5);
  assert.deepEqual(makeTrack(42).bar(5), b.bar(5), 'order of access does not matter');
  assert.notDeepEqual(makeTrack(42).bar(3), makeTrack(43).bar(3));
});

test('every bar has 2 to 4 gaps that do not touch, and gap 0 is the guaranteed route', () => {
  const t = makeTrack(7);
  for (let i = 0; i < 200; i++) {
    const b = t.bar(i);
    assert.ok(b.gaps.length >= 2 && b.gaps.length <= 4, `bar ${i} has ${b.gaps.length} gaps`);
    for (let k = 1; k < b.gaps.length; k++) assert.ok(b.gaps[k].c - b.gaps[k].w / 2 > b.gaps[k - 1].c + b.gaps[k - 1].w / 2, 'gaps are separate');
    assert.ok(b.gaps.every((g) => g.c - g.w / 2 >= 0 && g.c + g.w / 2 <= 1));
    assert.ok(b.gaps.some((g) => g.c === b.c));
  }
});

test('the guaranteed route can always be followed (no ghosts): the board is never unfair', () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    const run = newRun(makeTrack(seed), [], 0.5);
    run.lenient = true; // this test is about the bars; snail shots are covered below
    while (run.alive && run.tick < 60 * 120) step(run, run.track.bar(run.next).c);
    assert.ok(run.alive, `seed ${seed} survived 120 s by following gap 0 (died at ${run.tick}: ${run.cause})`);
    assert.ok(run.passed > 100);
  }
});

// ---------- friend ghosts ----------

test('friend ghosts are the same on every run of a board and never change the bars', () => {
  const a = makeTrack(5), b = makeTrack(5);
  const bars = JSON.stringify([0, 10, 40].map((i) => b.bar(i)));
  for (let j = 0; j < 20; j++) assert.deepEqual(a.friend(j), makeTrack(5).friend(j));
  const c = makeTrack(5);
  [0, 10, 40].forEach((i) => c.bar(i));
  for (let j = 0; j < 10; j++) c.friend(j);
  assert.equal(JSON.stringify([0, 10, 40].map((i) => c.bar(i))), bars, 'asking for friends leaves the bars untouched');
  assert.notDeepEqual(makeTrack(5).friend(0), makeTrack(6).friend(0));
});

test('friends are spread out, line up with a gap, and are within reach of your route', () => {
  for (const seed of [1, 5, 77]) {
    const t = makeTrack(seed);
    const kinds = new Set();
    let prevBar = -100;
    for (let j = 0; j < 30; j++) {
      const f = t.friend(j);
      kinds.add(f.kind);
      assert.ok(f.bar >= 4 && f.bar - prevBar >= (j ? 8 : 4), `friend ${j} at bar ${f.bar}, previous ${prevBar}`);
      prevBar = f.bar;
      const b = t.bar(f.bar), nb = t.bar(f.bar + 1);
      assert.ok(f.d > b.d && f.d < nb.d, 'sits between two bars');
      assert.ok(nb.gaps.some((g) => Math.abs(f.x - g.c) <= g.w * 0.2 + 1e-9), 'lined up with a gap of the next bar');
    }
  }
});

test('better powers unlock with progress and get more common the further you go', () => {
  const seen = [];
  for (let seed = 1; seed <= 60; seed++) { const t = makeTrack(seed); for (let j = 0; j < 40; j++) seen.push(t.friend(j)); }
  for (const f of seen) assert.ok(TIER_FROM[POWERS[f.kind].tier] <= f.bar, `${f.kind} at bar ${f.bar} is too early`);
  const early = seen.filter((f) => f.bar < TIER_FROM[2]);
  assert.ok(early.length > 50 && early.every((f) => POWERS[f.kind].tier === 1), 'only basic powers at the start');
  const tier3 = (list) => list.filter((f) => POWERS[f.kind].tier === 3).length / list.length;
  const mid = seen.filter((f) => f.bar >= 36 && f.bar < 70), late = seen.filter((f) => f.bar >= 160);
  assert.ok(mid.length > 50 && late.length > 50);
  assert.ok(tier3(late) > tier3(mid) * 1.4, `tier 3 share ${tier3(mid).toFixed(2)} mid vs ${tier3(late).toFixed(2)} late`);
  assert.equal(powerWeight('phase', 10), 0);
  assert.ok(powerWeight('phase', 100) > powerWeight('phase', 40));
  assert.ok(powerWeight('nitro', 100) < powerWeight('nitro', 0), 'basic powers thin out');
});

test('every power turns up on real boards, and the rare ones turn up less', () => {
  const seen = {}, early = {};
  for (let seed = 1; seed <= 30; seed++) {
    const t = makeTrack(seed);
    for (let j = 0; j < 40; j++) { const f = t.friend(j); seen[f.kind] = (seen[f.kind] ?? 0) + 1; if (f.bar < 60) early[f.kind] = (early[f.kind] ?? 0) + 1; }
  }
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(POWERS).sort());
  assert.ok((early.phase ?? 0) < early.nitro && (early.heal ?? 0) < early.shield, `in the first 60 bars: ${JSON.stringify(early)}`);
});

test('flying into a friend gives Nitro: faster sideways for exactly 4 s, and double points', () => {
  const at = 30;
  const run = newRun(fixedTrack([{ c: 0.5, w: 1 }], friendAt(at, 0.3, 'nitro')), [], 0.3);
  let got = [];
  for (let i = 0; i < at + 10 && !got.includes('power:nitro'); i++) got.push(...step(run, 0.3));
  assert.ok(got.includes('power:nitro'), 'collected as it crossed your row');
  assert.equal(run.powerLeft, NITRO_TICKS, 'full timer right after pickup');
  const before = run.x;
  step(run, 0.9);
  assert.ok(Math.abs(run.x - before - LAT * TICK * NITRO_MULT) < 1e-4, 'sideways speed is boosted');
  let boosted = 1;
  while (maxMove(run) > LAT * TICK * 1.5) { step(run, 0.3); boosted++; }
  assert.equal(boosted, NITRO_TICKS, 'boosted for exactly 4 s');
  assert.equal(run.power, null);
  const x0 = run.x;
  step(run, 0.9);
  assert.ok(Math.abs(run.x - x0 - LAT * TICK) < 1e-4, 'back to normal speed afterwards');
  // Points double while it lasts.
  const pts = newRun(wide, [], 0.5); pts.power = 'nitro'; pts.powerLeft = 1000;
  while (pts.passed < 1) step(pts, 0.5);
  assert.equal(pts.score, PTS_BAR * 2);
});

test('missing a friend costs nothing; the next one is still waiting', () => {
  const run = newRun(fixedTrack([{ c: 0.5, w: 1 }], friendAt(30, 0.9, 'shield')), [], 0.1);
  for (let i = 0; i < 80; i++) step(run, 0.1);
  assert.equal(run.bubble, 0);
  assert.equal(run.friends, 0);
  assert.equal(run.nf, 1, 'moved on to the next friend');
});

test('a Shield bubble absorbs a ghost touch without costing a heart, then gives 1 s of safety', () => {
  const g = ghostFrom(0.5, 600);
  const run = newRun(wide, [g], 0.5);
  run.bubble = BUBBLE_TICKS;
  const ev = [];
  for (let t = 0; t < GRACE + 1; t++) ev.push(...step(run, 0.5));
  assert.ok(ev.includes('absorb'));
  assert.equal(run.hearts, HEARTS);
  assert.equal(run.bubble, 0);
  assert.equal(run.invuln, INVULN_TICKS, 'invulnerable right after');
  for (let t = 0; t < INVULN_TICKS - 1; t++) step(run, 0.5);
  assert.equal(run.hearts, HEARTS, 'still untouched during the safe second');
});

test('a Shield bubble absorbs a bar hit: you phase through that bar and carry on', () => {
  const track = fixedTrack([{ c: 0.5, w: 0.2 }]);
  const run = newRun(track, [], 0.1);
  run.bubble = BUBBLE_TICKS;
  const ev = [];
  while (run.passed < 1 && run.alive) ev.push(...step(run, 0.1));
  assert.ok(run.alive, 'survived the first bar');
  assert.equal(ev.filter((e) => e === 'absorb').length, 1);
  assert.equal(run.score, PTS_BAR, 'it still counts as a bar passed, with no graze');
  runUntilDone(run, 0.1);
  assert.equal(run.cause, 'bar', 'without another bubble a later bar ends the run');
});

test('a bubble that nothing hits fades after 8 s', () => {
  const run = newRun(wide, [], 0.5);
  run.bubble = BUBBLE_TICKS;
  for (let t = 0; t < BUBBLE_TICKS; t++) step(run, 0.5);
  assert.equal(run.bubble, 0);
});

// ---------- the other powers ----------

const withPower = (run, kind, left = 100000) => { run.power = kind; run.powerLeft = left; return run; };
const narrow = (w, c = 0.5) => fixedTrack([{ c, w }]);

test('Slow-mo makes the bars fall slower', () => {
  const a = newRun(wide, [], 0.5), b = withPower(newRun(wide, [], 0.5), 'slowmo');
  for (let i = 0; i < 100; i++) { step(a, 0.5); step(b, 0.5); }
  assert.ok(b.D < a.D * (SLOWMO_MULT + 0.1), `slow-mo scrolled ${b.D.toFixed(2)} vs ${a.D.toFixed(2)}`);
});

test('Exorcise: your past ghosts cannot touch you for its whole duration, then they can', () => {
  const g = ghostFrom(0.5, 900);
  const run = withPower(newRun(wide, [g], 0.5), 'exorcise', 300);
  for (let t = 0; t < 300; t++) step(run, 0.5);
  assert.equal(run.hearts, HEARTS, 'untouched while exorcised');
  const ev = [];
  for (let t = 0; t < 100; t++) ev.push(...step(run, 0.5));
  assert.ok(ev.includes('hurt'), 'the ghost is back afterwards');
});

test('Heal restores a heart, and gives a safe window instead when you are already full', () => {
  const run = newRun(fixedTrack([{ c: 0.5, w: 1 }], [friendAt(20, 0.5, 'heal'), friendAt(60, 0.5, 'heal')]), [], 0.5);
  run.hearts = 1;
  for (let t = 0; t < 30; t++) step(run, 0.5);
  assert.equal(run.hearts, 2, 'healed one heart');
  assert.equal(run.bubble, 0);
  run.hearts = HEARTS;
  while (run.nf < 2 && run.tick < 120) step(run, 0.5);
  assert.equal(run.hearts, HEARTS);
  assert.equal(run.bubble, 0, 'no bubble, which would also save you from a bar');
  assert.ok(run.invuln > 0, 'a full-hearts Heal becomes a short safe window');
});

test('Phase lets you pass straight through bars for its duration', () => {
  const run = withPower(newRun(narrow(0.2), [], 0.1), 'phase', 160);
  while (run.passed < 1 && run.alive) step(run, 0.1);
  assert.ok(run.alive, 'went through the bar');
  assert.equal(run.score, PTS_BAR, 'counts as a bar passed, with no graze');
  runUntilDone(run, 0.1);
  assert.equal(run.cause, 'bar', 'once it runs out the next bar stops you');
});

test('Wide gaps make a gap you would clip fit, and Shrink makes a gap you could never fit', () => {
  const clip = narrow(2 * PR + 0.02);                     // you must stay within 0.01 of centre
  const hit = runUntilDone(newRun(clip, [], 0.52), 0.52);
  assert.equal(hit.cause, 'bar');
  const ok = withPower(newRun(clip, [], 0.52), 'widen');
  while (ok.passed < 1 && ok.alive) step(ok, 0.52);
  assert.ok(ok.alive, 'fits when widened');
  const tight = narrow(2 * PR * 0.9);                      // narrower than you are
  assert.equal(runUntilDone(newRun(tight, [], 0.5), 0.5).cause, 'bar');
  const small = withPower(newRun(tight, [], 0.5), 'shrink');
  while (small.passed < 1 && small.alive) step(small, 0.5);
  assert.ok(small.alive, 'fits when shrunk');
});

test('Gold rush triples points; Foresight changes nothing about play', () => {
  const gold = withPower(newRun(wide, [], 0.5), 'gold');
  while (gold.passed < 1) step(gold, 0.5);
  assert.equal(gold.score, PTS_BAR * GOLD_MULT);
  const plain = newRun(makeTrack(9), [], 0.5), fore = withPower(newRun(makeTrack(9), [], 0.5), 'foresight');
  for (let t = 0; t < 900; t++) { const c = plain.track.bar(plain.next).c; step(plain, c); step(fore, c); }
  assert.deepEqual(fore.xs, plain.xs);
  assert.equal(fore.score, plain.score);
});

test('only one timed power at a time: a new pickup replaces the old one, but a Shield bubble is kept', () => {
  const friends = [friendAt(20, 0.5, 'nitro'), friendAt(70, 0.5, 'slowmo'), friendAt(120, 0.5, 'shield')];
  const run = newRun(fixedTrack([{ c: 0.5, w: 1 }], friends), [], 0.5);
  for (let t = 0; t < 40; t++) step(run, 0.5);
  assert.equal(run.power, 'nitro');
  for (let t = 0; t < 50; t++) step(run, 0.5);
  assert.equal(run.power, 'slowmo', 'replaced');
  while (run.nf < 3 && run.tick < 400) step(run, 0.5); // Slow-mo is on, so the last pickup takes longer to arrive
  assert.ok(run.bubble > 0 && run.power === 'slowmo', 'the bubble waits alongside the timed power');
});

// ---------- snails (the aliens) and their weapons ----------

test('snails are fixed by the board, never early, never on neighbouring bars, and always on solid bar', () => {
  const t = makeTrack(11), again = makeTrack(11);
  let count = 0, last = -9;
  for (let i = 0; i < 400; i++) {
    const sn = t.snail(i);
    assert.deepEqual(sn, again.snail(i));
    if (!sn) continue;
    count++;
    assert.ok(i >= SNAIL_FROM, `snail on bar ${i}`);
    assert.ok(i - last >= 2, 'not on neighbouring bars');
    last = i;
    const b = t.bar(i);
    assert.ok(b.gaps.every((g) => Math.abs(sn.x - g.c) > g.w / 2 + 0.03), 'sits on the solid part, clear of any gap');
  }
  assert.ok(count > 40 && count < 140, `${count} snails in 400 bars`);
  const bars = JSON.stringify([0, 20, 90].map((i) => makeTrack(11).bar(i)));
  const c = makeTrack(11); c.snail(300);
  assert.equal(JSON.stringify([0, 20, 90].map((i) => c.bar(i))), bars, 'asking for snails never moves a bar');
});

test('nastier weapons arrive with progress: hammers first, then jacks, then bombs', () => {
  const first = {};
  for (let seed = 1; seed <= 40; seed++) {
    const t = makeTrack(seed);
    for (let i = 0; i < 300; i++) { const sn = t.snail(i); if (sn) first[sn.kind] = Math.min(first[sn.kind] ?? 1e9, i); }
  }
  assert.ok(first.hammer >= WEAPONS.hammer.from && first.jacks >= WEAPONS.jacks.from && first.bomb >= WEAPONS.bomb.from, JSON.stringify(first));
  assert.equal(weaponWeight('bomb', 20), 0);
  assert.ok(weaponWeight('bomb', 100) > weaponWeight('bomb', 40));
  assert.ok(weaponWeight('hammer', 100) < weaponWeight('hammer', 12), 'hammers thin out as the nastier ones arrive');
});

// Stand at x until the snail on bar 0 fires; returns the run and the tick it fired.
function untilFire(kind, x) {
  const run = newRun(fixedTrack([{ c: 0.5, w: 1 }], null, SNAIL(kind)), [], x);
  while (run.alive && run.shots.length === 0 && run.tick < 400) step(run, x);
  return run;
}

test('a snail fires when its bar is 0.8 above you, and a hammer is thrown at where you stand', () => {
  const run = untilFire('hammer', 0.7);
  assert.equal(run.shots.length, 1);
  const s = run.shots[0];
  assert.equal(s.kind, 'hammer');
  const past = s.y - (PY - FIRE_DIST); // how far past the firing line it is: at most one tick of the bar's fall plus one tick of the shot's flight
  assert.ok(past >= 0 && past < s.vy * TICK + 0.03, `fired ${past.toFixed(3)} past the firing line`);
  const tFall = (PY - s.y) / s.vy;
  assert.ok(Math.abs(s.x + s.vx * tFall - 0.7) < 0.02, 'it is aimed at your position');
});

test('a hammer hits if you stand still, and misses if you slide away after it is thrown', () => {
  const still = untilFire('hammer', 0.7);
  const ev = [];
  for (let t = 0; t < 120; t++) ev.push(...step(still, 0.7));
  assert.ok(ev.includes('hurt'));
  assert.equal(still.hearts, HEARTS - 1);
  const dodge = untilFire('hammer', 0.7);
  for (let t = 0; t < 120; t++) step(dodge, 0.35);
  assert.equal(dodge.hearts, HEARTS, 'sliding away in time avoids it');
});

test('jacks come as a fan of three, and you can slip between them', () => {
  const run = untilFire('jacks', 0.5);
  assert.equal(run.shots.length, 3);
  const vx = run.shots.map((s) => s.vx).sort((a, b) => a - b);
  assert.ok(Math.abs(vx[1] - vx[0] - JACK_SPREAD) < 1e-9 && Math.abs(vx[2] - vx[1] - JACK_SPREAD) < 1e-9);
  const away = untilFire('jacks', 0.5);
  for (let t = 0; t < 200; t++) step(away, 0.95);
  assert.equal(away.hearts, HEARTS, 'moving clear costs nothing');
});

test('a bomb lands, ticks for half a second, then blasts: leave in time or lose a heart', () => {
  const stay = untilFire('bomb', 0.5);
  const events = [];
  for (let t = 0; t < 300; t++) events.push(...step(stay, 0.5));
  assert.ok(events.includes('boom'));
  assert.equal(stay.hearts, HEARTS - 1, 'standing in the blast costs a heart');
  const leave = untilFire('bomb', 0.5);
  let landed = null;
  for (let t = 0; t < 300; t++) {
    step(leave, landed === null ? 0.5 : 0.95);
    if (landed === null && leave.shots[0]?.mode === 'fuse') landed = leave.tick;
  }
  assert.equal(leave.hearts, HEARTS, 'leaving during the fuse is safe');
  assert.equal(leave.shots.length, 0, 'the bomb is gone afterwards');
  assert.ok(BOMB_FUSE > 0 && BLAST_TICKS > 0 && BLAST_R > PR);
});

test('shots follow the same rules as ghosts: bubble absorbs, safe window after a hit, Phase ignores, third heart ends it', () => {
  const bubble = untilFire('hammer', 0.7); bubble.bubble = BUBBLE_TICKS;
  for (let t = 0; t < 120; t++) step(bubble, 0.7);
  assert.equal(bubble.hearts, HEARTS);
  assert.equal(bubble.bubble, 0);
  const phase = withPower(untilFire('hammer', 0.7), 'phase', 1000);
  for (let t = 0; t < 120; t++) step(phase, 0.7);
  assert.equal(phase.hearts, HEARTS, 'Phase passes through shots');
  const safe = untilFire('hammer', 0.7); safe.shield = 100;
  for (let t = 0; t < 90; t++) step(safe, 0.7);
  assert.equal(safe.hearts, HEARTS, 'the safe window covers shots too');
  const last = untilFire('hammer', 0.7); last.hearts = 1;
  for (let t = 0; t < 120 && last.alive; t++) step(last, 0.7);
  assert.equal(last.cause, 'snail');
  const replay = untilFire('hammer', 0.7); replay.hearts = 1; replay.lenient = true;
  for (let t = 0; t < 120; t++) step(replay, 0.7);
  assert.ok(replay.alive, 'replays never end on a hit');
});

test('a run full of snails still replays and verifies', () => {
  for (const seed of [2, 13, 34]) {
    const run = playBot(makeTrack(seed), [], { seed: seed * 3, shake: 0.01, reaction: 6, maxTicks: 60 * 60 });
    const v = verifyRun(seed, run.xs, run.score);
    assert.equal(v.ok, true, `seed ${seed}: ${v.reason}`);
  }
});

// ---------- bars ----------

test('hitting a bar ends the run; passing it scores', () => {
  const track = fixedTrack([{ c: 0.5, w: 0.3 }]);
  const hit = runUntilDone(newRun(track, [], 0.1), 0.1);
  assert.equal(hit.alive, false);
  assert.equal(hit.cause, 'bar');
  assert.equal(hit.score, 0);
  const ok = newRun(track, [], 0.5);
  for (let i = 0; i < 400; i++) step(ok, 0.5);
  assert.ok(ok.alive && ok.passed >= 2);
  assert.equal(ok.score, ok.passed * PTS_BAR, 'no grazes when centred');
});

test('skimming the edge of a gap is a graze and pays a bonus', () => {
  const margin = GRAZE / 2;
  const track = fixedTrack([{ c: 0.5, w: 2 * PR + 2 * margin }]);
  const run = newRun(track, [], 0.5);
  let grazes = 0;
  for (let i = 0; i < 200; i++) for (const e of step(run, 0.5)) if (e === 'graze') grazes++;
  assert.ok(run.alive);
  assert.ok(grazes >= 1 && run.grazes === grazes);
  assert.equal(run.score, run.passed * PTS_BAR + grazes * PTS_GRAZE);
  assert.ok(gapMargin(track.bar(0), 0.5) < GRAZE);
});

// ---------- ghosts, hearts and the shield ----------

test('a ghost touch costs a heart and starts a safe moment; standing on it, it cannot hit again for 6 s', () => {
  const g = ghostFrom(0.5, 1200);
  const run = newRun(wide, [g], 0.5);
  const hits = [];
  for (let t = 1; t <= 1200 && run.alive; t++) if (step(run, 0.5).includes('hurt')) hits.push(t);
  assert.equal(hits[0], GRACE + 1, 'first touch the moment the grace period ends');
  assert.equal(hits[1], hits[0] + GHOST_REARM_MAX, 'standing on it, the same ghost can hit again only after GHOST_REARM_MAX');
  assert.ok(hits[1] - hits[0] >= SHATTER_TICKS, 'and never before it has re-formed');
  assert.equal(run.cause, 'ghost');
  assert.equal(run.tick, GRACE + 1 + 2 * GHOST_REARM_MAX, 'the third touch ends the run');
  assert.equal(run.hearts, 0);
  assert.equal(run.hitGhost, g);
});

test('after every ghost hit you get a clear safe window, even with two ghosts on you', () => {
  const run = newRun(wide, [ghostFrom(0.5, 700, 'best'), ghostFrom(0.5, 700, 'recent')], 0.5);
  const hits = [];
  for (let t = 1; t <= 700 && run.alive; t++) if (step(run, 0.5).includes('hurt')) hits.push(t);
  assert.equal(hits.length, HEARTS);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= SHIELD_TICKS, `hits ${i - 1} and ${i} are ${hits[i] - hits[i - 1]} ticks apart`);
});

test('the crew visit on a schedule: first after 10 to 15 s, staying 12 to 18 s, away 12 to 18 s, set by the board', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const t = makeTrack(seed), w = t.windows;
    assert.deepEqual(w, makeTrack(seed).windows, 'the same every time');
    assert.ok(w[0].start >= FIRST_VISIT[0] && w[0].start <= FIRST_VISIT[1], `first visit at ${w[0].start}`);
    for (let i = 0; i < w.length; i++) {
      const stay = w[i].end - w[i].start;
      const [lo, hi] = w[i].mode === 'both' ? VISIT_STAY_BOTH : VISIT_STAY;
      assert.ok(stay >= lo && stay <= hi, `${w[i].mode} stay ${stay}`);
      if (i) { const away = w[i].start - w[i - 1].end; assert.ok(away >= VISIT_AWAY[0] && away <= VISIT_AWAY[1], `away ${away}`); }
    }
    assert.ok(w.at(-1).end > MAX_TICKS - 3000, 'visits continue through a long run');
    assert.deepEqual(w.slice(0, 3).map((x) => x.mode), ['captain', 'last', 'both'], 'one ghost at first, then both');
  }
  const starts = new Set(Array.from({ length: 40 }, (_, i) => makeTrack(i + 1).windows[0].start));
  assert.ok(starts.size > 10, 'it is random from board to board');
});

test('a visit fades in and wakes before it can touch you, and cannot touch you as it leaves', () => {
  const t = { ghostWindow: (k) => (k >= 1000 && k < 1900 ? { start: 1000, end: 1900, mode: 'captain' } : null) };
  assert.equal(ghostPhase(t, 2, 0, 999).visible, false);
  const early = ghostPhase(t, 2, 0, 1010);
  assert.ok(early.visible && !early.armed && early.fade > 0 && early.fade < 1);
  assert.equal(ghostPhase(t, 2, 0, 1000 + JOIN_GRACE).armed, false);
  assert.equal(ghostPhase(t, 2, 0, 1000 + JOIN_GRACE + 1).armed, true);
  assert.equal(ghostPhase(t, 2, 0, 1900 - LEAVE_GRACE).armed, false);
  assert.equal(ghostPhase(t, 2, 0, 1900 - LEAVE_GRACE - 1).armed, true);
  assert.equal(ghostPhase(t, 2, 0, 1899).visible, true);
  assert.equal(ghostPhase(t, 2, 0, 1900).visible, false);
  assert.equal(ghostPhase(t, 2, 1, 1500).visible, false, 'a captain-only visit leaves the last flight out');
});

test('visit modes: captain, then the last flight (or the captain if it is all you have), then both', () => {
  const win = (mode) => ({ ghostWindow: () => ({ start: 0, end: 1e9, mode }) });
  assert.deepEqual([0, 1].map((g) => ghostPhase(win('captain'), 2, g, 500).visible), [true, false]);
  assert.deepEqual([0, 1].map((g) => ghostPhase(win('last'), 2, g, 500).visible), [false, true]);
  assert.deepEqual([0].map((g) => ghostPhase(win('last'), 1, g, 500).visible), [true], 'with one ghost, it takes both turns');
  assert.deepEqual([0, 1].map((g) => ghostPhase(win('both'), 2, g, 500).visible), [true, true]);
});

test('ghosts only touch you during a visit, and not at all between visits', () => {
  const visit = { start: 100, end: 500, mode: 'both', after: 'snails' };
  const run = newRun(fixedTrack([{ c: 0.5, w: 1 }], null, () => null, visit), [ghostFrom(0.5, 2000, 'best')], 0.5);
  const hurtAt = [];
  for (let t = 1; t <= 900 && run.alive; t++) if (step(run, 0.5).includes('hurt')) hurtAt.push(t);
  assert.ok(hurtAt.length >= 1 && hurtAt.every((t) => t > visit.start + JOIN_GRACE && t <= visit.end - LEAVE_GRACE), `hits at ${hurtAt}`);
  const events = [];
  const again = newRun(fixedTrack([{ c: 0.5, w: 1 }], null, () => null, visit), [], 0.5);
  for (let t = 0; t < 600; t++) events.push(...step(again, 0.5));
  assert.equal(events.filter((e) => e === 'join').length, 0, 'join and leave come from the track window list');
});

test('on a real board the crew arrive and leave at the scheduled moments', () => {
  const track = makeTrack(5);
  const run = newRun(track, [], 0.5);
  run.lenient = true;
  const seen = [];
  while (run.alive && run.tick < 60 * 80) for (const e of step(run, track.bar(run.next).c)) if (e === 'join' || e === 'leave') seen.push([e, run.pt]); // the schedule runs on how far the wreckage has fallen, so Slow-mo pickups cannot move it
  const expected = track.windows.filter((w) => w.end < 60 * 80).flatMap((w) => [['join', w.start], ['leave', w.end]]);
  assert.ok(run.alive && expected.length >= 3);
  assert.deepEqual(seen.slice(0, expected.length), expected);
});

test('something is always after you: a ghost visit, an alien nest, or a tight patch', () => {
  for (const seed of [1, 5, 11, 20261103, 99]) {
    const t = makeTrack(seed);
    const kinds = new Set();
    for (let k = SNAIL_FROM + 4; k < 160; k++) {
      const b = t.bar(k), ph = b.phase;
      kinds.add(ph.kind === 'patch' ? ph.patch : ph.kind);
      if (ph.kind === 'ghost') continue;                              // the crew are the threat
      if (ph.kind === 'patch' && ph.patch === 'tough') { assert.equal(b.tough, true, `bar ${k} should be tight`); continue; }
      let near = false;                                                // early aliens or a nest: an alien within 4 bars
      for (let j = k - 4; j <= k; j++) if (t.snail(j)) near = true;
      assert.ok(near, `seed ${seed}: bar ${k} (${ph.kind}${ph.patch ? ' ' + ph.patch : ''}) has no alien within 4 bars`);
    }
    assert.ok(kinds.has('ghost') && (kinds.has('snails') || kinds.has('tough')), `seed ${seed} mixes threats: ${[...kinds]}`);
  }
});

test('tight patches have narrower gaps and fewer of them', () => {
  let tight = [], normal = [];
  for (let seed = 1; seed <= 20; seed++) {
    const t = makeTrack(seed);
    for (let k = 10; k < 120; k++) { const b = t.bar(k); (b.tough ? tight : normal).push(b); }
  }
  assert.ok(tight.length > 100 && normal.length > 100);
  const mean = (list, f) => list.reduce((a, b) => a + f(b), 0) / list.length;
  assert.ok(tight.every((b) => b.gaps.length === 2), 'exactly two gaps in a tight patch');
  assert.ok(mean(tight, (b) => b.gaps.length) < mean(normal, (b) => b.gaps.length));
  assert.ok(mean(tight, (b) => b.w) < mean(normal, (b) => b.w) * 0.9, 'the main gap is narrower');
});

test('a ghost whose run was short never shows up, and the rest of the run carries on', () => {
  const run = newRun(fixedTrack([{ c: 0.5, w: 1 }]), [ghostFrom(0.95, 100, 'best')], 0.5);
  for (let t = 0; t < 200; t++) step(run, 0.5);
  assert.equal(run.hearts, HEARTS);
});

test('you can always escape: slide clear in the safe window and you keep your remaining hearts', () => {
  const run = newRun(wide, [ghostFrom(0.5, 700)], 0.5);
  for (let t = 0; t <= GRACE; t++) step(run, 0.5);
  assert.equal(run.hearts, HEARTS - 1);
  for (let t = 0; t < 400; t++) step(run, 0.95);
  assert.ok(run.alive);
  assert.equal(run.hearts, HEARTS - 1, 'no further hits once you are clear');
});

test('ghosts cannot hurt you during the opening grace period', () => {
  const run = newRun(wide, [ghostFrom(0.5, 700)], 0.5);
  for (let t = 0; t < GRACE; t++) step(run, 0.5);
  assert.equal(run.hearts, HEARTS);
  assert.ok(run.alive);
});

test('a ghost replays your earlier run exactly', () => {
  const inputs = (t) => 0.5 + 0.3 * Math.sin(t / 40);
  const first = newRun(wide, [], 0.5);
  for (let t = 0; t < 400; t++) step(first, inputs(t));
  const ghost = { xs: first.xs, kind: 'recent', score: 0 };
  const again = newRun(wide, [ghost], 0.5);
  const hits = [];
  for (let t = 1; t <= 400; t++) if (step(again, inputs(t - 1)).includes('hurt')) hits.push(t);
  assert.equal(hits[0], GRACE + 1, 'identical moves meet the ghost the moment it wakes');
  assert.equal(ghostX(ghost, 100), first.xs[99] / 65535);
});

test('a ghost disappears when its run ended, and no longer hurts', () => {
  const ghost = ghostFrom(0.5, 160);
  assert.equal(ghostX(ghost, 161), null);
  const run = newRun(wide, [ghost], 0.9);
  for (let t = 0; t < 175; t++) step(run, 0.9);
  for (let t = 0; t < 40; t++) step(run, 0.5);
  assert.equal(run.hearts, HEARTS);
});

test('movement is speed-limited, so a ghost cannot be dodged by teleporting', () => {
  const run = newRun(wide, [], 0.1);
  const before = run.x;
  step(run, 0.9);
  assert.ok(Math.abs(run.x - before) <= LAT * TICK + 1e-9);
});

test('ghost picking: your best run plus your latest, never more than the limit', () => {
  assert.deepEqual(pickGhosts([]), []);
  const r = (score) => ({ xs: [1, 2, 3], score });
  assert.deepEqual(pickGhosts([r(5)]).map((g) => [g.kind, g.score]), [['best', 5]]);
  const g = pickGhosts([r(50), r(10), r(20), r(30)]);
  assert.deepEqual(g.map((x) => [x.kind, x.score]), [['best', 50], ['recent', 30]]);
  assert.ok(pickGhosts(Array.from({ length: 20 }, (_, i) => r(i))).length <= MAX_GHOSTS);
  assert.deepEqual(pickGhosts([r(30), r(30)]).map((x) => x.kind), ['best', 'recent'], 'ties go to the newest as best');
});

test('runs survive being saved and loaded', () => {
  const run = newRun(makeTrack(5), [], 0.37);
  for (let t = 0; t < 500; t++) step(run, 0.5 + 0.4 * Math.sin(t / 50));
  assert.deepEqual(decodeXs(encodeXs(run.xs)), run.xs);
  assert.deepEqual(decodeXs(encodeXs([])), []);
  assert.deepEqual(decodeXs(encodeXs([0, 65535, 255, 256])), [0, 65535, 255, 256]);
});

// ---------- checking a saved run (the leaderboard relies on this) ----------

// Follow the guaranteed gaps; when a friend is up next, detour to collect it.
function playHonest(seed, ticks, { collect = false, ghosts = [] } = {}) {
  const run = newRun(makeTrack(seed), ghosts, 0.5);
  while (run.alive && run.tick < ticks) {
    const f = run.track.friend(run.nf);
    const near = collect && run.next >= f.bar + 1 && run.D - f.d < PY + 0.3;
    step(run, near ? f.x : run.track.bar(run.next).c);
  }
  return run;
}

test('an honest run verifies, and the replay reproduces its score exactly', () => {
  for (const seed of [3, 20261103, 99]) {
    const run = playHonest(seed, 60 * 40);
    const v = verifyRun(seed, run.xs, run.score);
    assert.equal(v.ok, true, `seed ${seed}: ${v.reason}`);
    assert.equal(v.score, run.score);
    assert.equal(v.bars, run.passed);
    assert.equal(v.grazes, run.grazes);
  }
});

test('a run that collected friends (Nitro and Shield) still verifies', () => {
  for (const seed of [5, 8, 12]) {
    const run = playHonest(seed, 60 * 60, { collect: true });
    assert.ok(run.friends >= 1, `seed ${seed}: collected ${run.friends}`);
    const v = verifyRun(seed, run.xs, run.score);
    assert.equal(v.ok, true, `seed ${seed}: ${v.reason}`);
  }
});

test('a run that survived with ghosts (and lost hearts) verifies on the bars alone', () => {
  const first = playHonest(8, 60 * 30);
  const ghosts = pickGhosts([{ xs: first.xs, score: first.score }]);
  const second = playHonest(8, 60 * 30, { ghosts });
  assert.ok(second.hearts < HEARTS, 'it did meet the ghost');
  const v = verifyRun(8, second.xs, second.score);
  assert.equal(v.ok, true, v.reason);
});

test('faked runs are rejected: inflated score, teleporting, wrong board, and unearned Nitro', () => {
  const run = playHonest(3, 60 * 20);
  assert.equal(verifyRun(3, run.xs, run.score + 10).reason, 'score');
  assert.equal(verifyRun(4, run.xs, run.score).ok, false, 'a run for another board does not verify there');
  const jump = run.xs.slice(); jump[200] = jump[199] > 30000 ? 3000 : 62000;
  assert.equal(verifyRun(3, jump, run.score).reason, 'speed');
  // Moving at Nitro speed without ever having collected Nitro.
  const cheat = newRun(makeTrack(3), [], 0.5);
  cheat.power = 'nitro'; cheat.powerLeft = 100000;
  while (cheat.alive && cheat.tick < 400) step(cheat, cheat.tick % 60 < 30 ? 0.05 : 0.95);
  assert.equal(verifyRun(3, cheat.xs).reason, 'speed');
  assert.equal(verifyRun(3, []).reason, 'length');
  assert.equal(verifyRun(3, [1.5, 2]).reason, 'values');
  assert.equal(verifyRun(3, Array(60 * 241).fill(30000)).reason, 'length');
});

test('two ghosts on a stationary player cannot chain hits faster than a ghost re-forms', () => {
  const run = newRun(wide, [ghostFrom(0.5, 900, 'best'), ghostFrom(0.5, 900, 'recent')], 0.5);
  const hits = [];
  for (let t = 1; t <= 900 && run.alive; t++) if (step(run, 0.5).includes('hurt')) hits.push(t);
  assert.ok(hits.length >= 2);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= SHATTER_TICKS, 'every hit is followed by a full safe window');
});

test('a replay judges the aliens: a run that ignores every shot does not verify, and neither does a sparse list', () => {
  for (const seed of [500005, 20261103]) {
    const run = newRun(makeTrack(seed), [], 0.5);
    run.lenient = true; // the forger's own copy never dies to a shot...
    while (run.alive && run.tick < 14400) step(run, run.track.bar(run.next).c);
    assert.ok(run.score > 1000, 'the forged run really did score a lot');
    assert.equal(verifyRun(seed, run.xs, run.score).ok, false, `seed ${seed}: a route that ignores the aliens is rejected`);
  }
  const sparse = new Array(50); sparse[0] = 32768; sparse[49] = 32768;
  assert.equal(verifyRun(500005, sparse).ok, false, 'holes in the list are not accepted');
});

test('Slow-mo cannot pull the crew visits or patches away from the bars they were laid out for', () => {
  for (const seed of [3, 5, 20261103]) {
    const track = makeTrack(seed);
    const run = newRun(track, [], 0.5);
    run.lenient = true;
    let checked = 0, k = 0;
    while (run.alive && run.tick < 14400 && k < 120) {
      run.power = 'slowmo'; run.powerLeft = 999; // slow the whole way
      step(run, track.bar(run.next).c);
      const b = track.bar(k);
      if (run.D >= b.d + PY) { assert.deepEqual(track.phaseAtTick(run.pt), b.phase, `seed ${seed} bar ${k}`); checked++; k++; }
    }
    assert.ok(checked > 60, 'checked a long stretch');
    assert.ok(new Set(Array.from({ length: 120 }, (_, i) => track.bar(i).phase.kind)).size >= 3, 'and it crossed more than one kind of stretch');
  }
});

test('tight patches throw no hammers, and every tight bar that had a weapon in it is still dodgeable', () => {
  let tightSnails = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const t = makeTrack(seed);
    for (let i = 0; i < 200; i++) {
      const sn = t.snail(i);
      if (sn && t.bar(i).tough) { tightSnails++; assert.notEqual(sn.kind, 'hammer', `seed ${seed} bar ${i}`); }
    }
  }
  assert.ok(tightSnails > 0, 'some tight bars do carry aliens');
  assert.equal(weaponWeight('hammer', 50, true), 0);
  assert.ok(weaponWeight('hammer', 50, false) > 0);
});

test('the fall speed ramps up over about 23 seconds', () => {
  assert.equal(speedAt(0), 0.6);
  assert.equal(speedAt(20), 1.2);
  const D = dAfter(60 * 24);
  assert.equal(speedAt(D), 1.2, 'at the top speed after 24 s');
  assert.ok(speedAt(dAfter(60 * 21)) < 1.2, 'not quite there at 21 s');
  assert.ok(speedAt(dAfter(60 * 10)) < 1.0, 'still well short of it after 10 s');
});

test('Exorcise lets alien shots pass through you as well as ghosts', () => {
  const ex = withPower(untilFire('hammer', 0.7), 'exorcise', 1000);
  for (let t = 0; t < 120; t++) step(ex, 0.7);
  assert.equal(ex.hearts, HEARTS, 'a hammer passes through');
  const bomb = withPower(untilFire('bomb', 0.7), 'exorcise', 1000);
  for (let t = 0; t < 200; t++) step(bomb, 0.7);
  assert.equal(bomb.hearts, HEARTS, 'and so does a bomb blast');
  const plain = untilFire('hammer', 0.7);
  for (let t = 0; t < 120; t++) step(plain, 0.7);
  assert.equal(plain.hearts, HEARTS - 1, 'without it the same shot hits');
});

test('Slow-mo slows the aliens\' shots down along with the wreckage', () => {
  const normal = untilFire('hammer', 0.7), slow = withPower(untilFire('hammer', 0.7), 'slowmo', 1000);
  const y0 = normal.shots[0].y;
  for (let t = 0; t < 10; t++) { step(normal, 0.7); step(slow, 0.7); }
  const dN = normal.shots[0].y - y0, dS = slow.shots[0].y - y0;
  assert.ok(Math.abs(dS / dN - SLOWMO_MULT) < 0.02, `shot moved ${(dS / dN).toFixed(2)} of its normal distance`);
});

test('a ghost that hit you can hit again after 2.5 s only if you moved clear of it first', () => {
  const run = newRun(wide, [ghostFrom(0.5, 900)], 0.5);
  const hits = [];
  let t = 0;
  const go = (x, n) => { for (let i = 0; i < n && run.alive; i++) { t++; if (step(run, x).includes('hurt')) hits.push(t); } };
  while (!hits.length && t < 400) go(0.5, 1);
  go(0.5 + GHOST_REARM_DIST + 0.05, 40); // slide clear of it...
  go(0.5, 400);                           // ...and come back
  assert.equal(hits[1], hits[0] + SHIELD_TICKS + 1, 'once you have left it, it hits again as soon as the safe window ends');
});

test('ghosts follow the wreckage clock: through Slow-mo they stay in the gaps they flew', () => {
  for (const seed of [5, 21, 20261103]) {
    const track = makeTrack(seed);
    // the ghost: a route follower recorded on this board
    const rec = newRun(track, [], 0.5); rec.lenient = true;
    while (rec.alive && rec.tick < 3000) step(rec, track.bar(rec.next).c);
    const aligned = alignGhost(track, { xs: rec.xs.slice(), kind: 'best', score: 1 });
    const raw = { xs: rec.xs.slice() }; // the same ghost looked up by tick, as before the fix
    // now fly the board with Slow-mo on the whole way
    const run = newRun(track, [aligned], 0.5); run.lenient = true;
    let k = 3, inGap = 0, rawMiss = 0;
    while (run.alive && run.tick < 4000 && k < 60) {
      run.power = 'slowmo'; run.powerLeft = 999;
      step(run, track.bar(run.next).c);
      const b = track.bar(k);
      if (run.D >= b.d + PY) {
        if (gapMargin(b, ghostX(aligned, run.pt)) >= -1e-6) inGap++;
        const rx = ghostX(raw, run.tick);
        if (rx === null || gapMargin(b, rx) < 0) rawMiss++;
        k++;
      }
    }
    assert.equal(inGap, k - 3, `seed ${seed}: the aligned ghost is in a gap at every bar`);
    assert.ok(rawMiss > 0, `seed ${seed}: looked up by tick it would have drifted into the wreckage`);
  }
});

test('Wide gaps and Shrink wait for the wreckage at your row to pass before they run out', () => {
  for (const kind of ['widen', 'shrink']) {
    const track = narrow(0.06); // too narrow for you without the power
    const run = newRun(track, [], 0.5);
    run.lenient = true;
    const b = track.bar(0);
    // time the power to run out just as the first bar reaches your row
    let ticks = 0, D = 0;
    while (D + speedAt(D) * TICK < b.d + PY - PR - BAR_T / 2) { D += speedAt(D) * TICK; ticks++; }
    withPower(run, kind, ticks + 2);
    while (run.alive && run.passed < 1 && run.tick < 400) step(run, 0.5);
    assert.ok(run.alive, `${kind}: you survive the bar it was carrying you through`);
    assert.equal(run.passed, 1);
    for (let i = 0; i < 3; i++) step(run, 0.5);
    assert.equal(run.power, null, `${kind}: and it ends once the bar has passed`);
  }
});
