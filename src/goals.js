// Goals: milestones you tick off over your runs. The game itself never ends; these give it something
// to aim for. They only read a run (they change nothing in it), so scores and replays are unaffected.
// Ticked goals are kept in the store (store.goals: { id: time }) across all boards.
import { MAX_TICKS } from './core.js';

const s = (n) => n * 60; // seconds -> ticks

export const GOALS = [
  { id: 't15', text: 'Survive 15 seconds', done: (r) => r.tick >= s(15) },
  { id: 'b25', text: 'Pass 25 bars of wreckage', done: (r) => r.passed >= 25 },
  { id: 'help', text: 'Catch a helper', done: (r) => r.friends >= 1 },
  { id: 'visit', text: 'Outlast your first crew visit', done: (r) => r.alive && r.pt >= (r.track.windows?.[0]?.end ?? Infinity) },
  { id: 't30', text: 'Survive 30 seconds', done: (r) => r.tick >= s(30) },
  { id: 'patch', text: 'Get through your first alien nest or tight patch', done: (r) => r.alive && r.pt >= (r.track.windows?.[1]?.start ?? Infinity) },
  { id: 's700', text: 'Score 700', done: (r) => r.score >= 700 },
  { id: 'graze', text: 'Graze 10 times in one run', done: (r) => r.grazes >= 10 },
  { id: 't60', text: 'Survive 1 minute', done: (r) => r.tick >= s(60) },
  { id: 's1500', text: 'Score 1,500', done: (r) => r.score >= 1500 },
  { id: 't90', text: 'Survive 90 seconds', done: (r) => r.tick >= s(90) },
  { id: 's2500', text: 'Score 2,500', done: (r) => r.score >= 2500 },
  { id: 't120', text: 'Survive 2 minutes', done: (r) => r.tick >= s(120) },
  { id: 't240', text: 'Survive 4 minutes', done: (r) => r.tick >= MAX_TICKS },
];

// Goals this run has just reached that were not ticked before.
export const newlyDone = (run, ticked) => GOALS.filter((g) => !ticked?.[g.id] && g.done(run));
// The first goal in the list you have not ticked yet (null when all are done).
export const nextGoal = (ticked) => GOALS.find((g) => !ticked?.[g.id]) ?? null;
export const doneCount = (ticked) => GOALS.filter((g) => ticked?.[g.id]).length;

// Keep only known goals with a time, from whatever is in storage.
export function sanitizeGoals(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const g of GOALS) if (Number.isFinite(raw[g.id])) out[g.id] = raw[g.id];
  return out;
}
