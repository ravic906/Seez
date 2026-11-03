import test from 'node:test';
import assert from 'node:assert/strict';
import { recordRun, runsFor, dailySeed, boardLabel } from '../src/store.js';

const run = (s, t) => ({ s, x: 'AAAA', t });

test('the daily board is the same for the whole day and changes at midnight', () => {
  assert.equal(dailySeed(new Date(2026, 10, 3, 0, 5)), 20261103);
  assert.equal(dailySeed(new Date(2026, 10, 3, 23, 59)), 20261103);
  assert.equal(dailySeed(new Date(2026, 10, 4, 0, 0)), 20261104);
  assert.match(boardLabel(20261103), /^Daily · /);
  assert.equal(boardLabel(4242), 'Board 4242');
});

test('runs are kept per board, newest last, and the best survives being old', () => {
  let store = { boards: {} };
  store = recordRun(store, 7, run(100, 1));
  for (let i = 0; i < 12; i++) store = recordRun(store, 7, run(10 + i, 2 + i));
  const kept = runsFor(store, 7);
  assert.equal(kept.length, 9, '8 latest plus the old best');
  assert.equal(kept[0].s, 100, 'best comes first');
  assert.deepEqual(runsFor(store, 8), [], 'other boards start empty');
  assert.equal(store.boards[7].best.s, 100);
});

test('a new best is not listed twice', () => {
  let store = recordRun({ boards: {} }, 1, run(5, 1));
  store = recordRun(store, 1, run(9, 2));
  const kept = runsFor(store, 1);
  assert.equal(kept.length, 2);
  assert.equal(new Set(kept.map((r) => r.t)).size, 2);
});

test('storage stays small: only the most recent boards are kept', () => {
  let store = { boards: {} };
  for (let seed = 1; seed <= 20; seed++) store = recordRun(store, seed, run(seed, seed));
  assert.ok(Object.keys(store.boards).length <= 12);
  assert.ok(store.boards[20], 'the board in play is never dropped');
});
