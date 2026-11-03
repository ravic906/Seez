import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTrack, newRun, step, pickGhosts, encodeXs, decodeXs, ghostX, gapMargin,
  GRACE, GRAZE, PR, GR, PTS_BAR, PTS_GRAZE, MAX_GHOSTS, TICK, LAT,
} from '../src/core.js';

// A track whose every bar has the same gaps, for exact tests.
const fixedTrack = (gaps) => ({ seed: 0, bar: (i) => ({ i, d: 0.2 + i * 0.6, c: gaps[0].c, w: gaps[0].w, gaps }) });
const wide = fixedTrack([{ c: 0.5, w: 1 }]);
const runUntilDone = (run, target, max = 3000) => { for (let i = 0; i < max && run.alive; i++) step(run, target); return run; };

test('a board is the same every time, however you ask for it', () => {
  const a = makeTrack(42), b = makeTrack(42);
  assert.deepEqual(a.bar(30), b.bar(30));
  b.bar(5);
  assert.deepEqual(makeTrack(42).bar(5), b.bar(5), 'order of access does not matter');
  assert.notDeepEqual(makeTrack(42).bar(3), makeTrack(43).bar(3));
});

test('every bar has 3 to 4 gaps that do not touch, and gap 0 is the guaranteed route', () => {
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
    // Steer for the guaranteed gap of the first bar we have not passed yet.
    while (run.alive && run.tick < 60 * 120) step(run, run.track.bar(run.next).c);
    assert.ok(run.alive, `seed ${seed} survived 120 s by following gap 0 (died at ${run.tick}: ${run.cause})`);
    assert.ok(run.passed > 100);
  }
});

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

test('a ghost replays your earlier run exactly, and touching it ends the run', () => {
  const inputs = (t) => 0.5 + 0.3 * Math.sin(t / 40);
  const first = newRun(wide, [], 0.5);
  for (let t = 0; t < 400; t++) step(first, inputs(t));
  const ghost = { xs: first.xs, kind: 'recent', score: 0 };
  const again = newRun(wide, [ghost], 0.5);
  for (let t = 0; t < 400 && again.alive; t++) step(again, inputs(t));
  assert.equal(again.cause, 'ghost');
  assert.equal(again.tick, GRACE + 1, 'identical moves collide the moment the grace period ends');
  assert.equal(again.hitGhost, ghost);
  // Replays are bit-for-bit: the ghost sits where you were.
  assert.equal(ghostX(ghost, 100), first.xs[99] / 65535);
});

test('ghosts cannot hurt you during the opening grace period, and you can slip past them after', () => {
  const stand = newRun(wide, [], 0.5);
  for (let t = 0; t < 300; t++) step(stand, 0.5);
  const ghost = { xs: stand.xs, kind: 'best', score: 1 };
  const run = newRun(wide, [ghost], 0.5);
  for (let t = 0; t < GRACE; t++) step(run, 0.5);
  assert.ok(run.alive, 'overlapping the ghost is harmless while the grace period lasts');
  for (let t = 0; t < 200; t++) step(run, 0.9); // slide away
  assert.ok(run.alive, 'moving clear of the ghost in time keeps you alive');
  assert.ok(Math.abs(run.x - 0.5) > PR + GR);
});

test('a ghost disappears when its run ended, and no longer hurts', () => {
  const short = newRun(wide, [], 0.5);
  for (let t = 0; t < 200; t++) step(short, 0.5);
  const ghost = { xs: short.xs.slice(0, 160), kind: 'recent', score: 0 };
  assert.equal(ghostX(ghost, 161), null);
  const run = newRun(wide, [ghost], 0.9);
  for (let t = 0; t < 175; t++) step(run, 0.9);
  for (let t = 0; t < 40; t++) step(run, 0.5); // walk into where the ghost was standing, after it is gone
  assert.ok(run.alive);
});

test('movement is speed-limited, so a ghost cannot be dodged by teleporting', () => {
  const run = newRun(wide, [], 0.1);
  step(run, 0.9);
  assert.ok(Math.abs(run.x - 0.1) <= LAT * TICK + 1e-9);
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
  const back = decodeXs(encodeXs(run.xs));
  assert.deepEqual(back, run.xs);
  assert.deepEqual(decodeXs(encodeXs([])), []);
  assert.deepEqual(decodeXs(encodeXs([0, 65535, 255, 256])), [0, 65535, 255, 256]);
});
