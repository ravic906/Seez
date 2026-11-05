import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTrack, newRun, step, MAX_TICKS } from '../src/core.js';
import { GOALS, newlyDone, nextGoal, doneCount, sanitizeGoals } from '../src/goals.js';
import { sanitizeStore } from '../src/store.js';

test('goals have unique ids and are listed from easy to hard', () => {
  assert.equal(new Set(GOALS.map((g) => g.id)).size, GOALS.length);
  const secs = GOALS.filter((g) => g.id.startsWith('t')).map((g) => +g.id.slice(1));
  assert.deepEqual(secs, [...secs].sort((a, b) => a - b), 'time goals in order');
  assert.equal(GOALS.at(-1).id, 't240');
});

test('a run ticks the goals it reaches, in the order they happen, and only once', () => {
  const track = makeTrack(20261105);
  const run = newRun(track, [], 0.5); run.lenient = true;
  const ticked = {}, order = [];
  while (run.alive && run.tick < 60 * 70) {
    step(run, track.bar(run.next).c);
    for (const g of newlyDone(run, ticked)) { ticked[g.id] = run.tick; order.push(g.id); }
  }
  for (const id of ['t15', 'b25', 'visit', 't30', 'patch', 't60']) assert.ok(ticked[id], `${id} reached on a 70 s route`);
  assert.ok(ticked.t15 <= 60 * 15 && ticked.t15 === 900);
  assert.ok(ticked.visit >= track.windows[0].end, 'the crew visit counts once it is over');
  assert.equal(newlyDone(run, ticked).length, 0, 'nothing is ticked twice');
  assert.equal(nextGoal(ticked).id, GOALS.find((g) => !ticked[g.id]).id);
  assert.equal(doneCount(ticked), order.length);
});

test('a run that ends on a crew visit does not count as outlasting it; 4 minutes is the last goal', () => {
  const track = makeTrack(5);
  const run = newRun(track, [], 0.5);
  run.alive = false; run.pt = track.windows[0].end + 5; run.tick = MAX_TICKS;
  const got = newlyDone(run, {}).map((g) => g.id);
  assert.ok(!got.includes('visit') && !got.includes('patch'), 'you have to be alive at the end of the visit');
  assert.ok(got.includes('t240'), 'reaching the 4-minute stop is a goal');
  assert.equal(nextGoal(Object.fromEntries(GOALS.map((g) => [g.id, 1]))), null);
});

test('ticked goals survive storage; junk in storage is ignored', () => {
  assert.deepEqual(sanitizeGoals({ t15: 5, t30: 'x', nope: 3 }), { t15: 5 });
  assert.deepEqual(sanitizeGoals([1, 2]), {});
  assert.deepEqual(sanitizeStore({ goals: { t15: 1, s700: 2 } }).goals, { t15: 1, s700: 2 });
  assert.equal(sanitizeStore({ goals: 'junk' }).goals, undefined);
});
