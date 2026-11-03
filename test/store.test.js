import test from 'node:test';
import assert from 'node:assert/strict';
import { recordRun, runsFor, dailySeed, boardLabel, sanitizeStore } from '../src/store.js';

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

test('damaged or foreign storage is rebuilt into a clean store instead of breaking the game', () => {
  const clean = { boards: {} };
  for (const bad of [null, 42, 'hello', true, [], [1, 2], { boards: null }, { boards: 'x' }, { boards: [] }]) assert.deepEqual(sanitizeStore(bad), clean, JSON.stringify(bad));
  const good = { s: 50, x: 'AAAAAAAA', t: 5 }; // a real run is two bytes per tick, so an even number of bytes
  const store = sanitizeStore({
    handle: 'Lone', seed: 20261103, sound: false, introSeen: true, extra: 'ignored',
    boards: {
      7: { recent: [good, { s: 'lots', x: 'AAAA' }, { s: 1, x: '!!!' }, { s: 2, x: 'AAAA' }, null, 'oops'], best: good },
      8: { recent: 'oops', best: { s: 3, x: '###' } },
      9: 'junk', 10: null,
    },
  });
  assert.equal(store.handle, 'Lone'); assert.equal(store.seed, 20261103); assert.equal(store.sound, false); assert.equal(store.introSeen, true);
  assert.equal(store.extra, undefined);
  assert.deepEqual(Object.keys(store.boards), ['7'], 'only boards with a usable run survive');
  assert.deepEqual(store.boards[7].recent, [good], 'bad runs are dropped, good ones kept');
  assert.equal(store.boards[7].best.s, 50);
  assert.deepEqual(sanitizeStore({ seed: 1.5, handle: 7, sound: 'yes' }), clean, 'wrong types are ignored');
  assert.equal(runsFor({ boards: { 1: { recent: 'oops', best: good } } }, 1).length, 1, 'a damaged recent list does not throw');
});

test('storage keeps the boards played most recently, whatever their numbers are', () => {
  let store = { boards: {} };
  const order = [900000, 800000, 700000, 600000, 500000, 400000, 300000, 200000, 100000, 90000, 80000, 70000, 5, 600001];
  order.forEach((seed, i) => { store = recordRun(store, seed, { s: 1, x: 'AAAA', t: 1000 + i }); });
  const kept = Object.keys(store.boards).map(Number);
  assert.equal(kept.length, 12);
  assert.ok(kept.includes(5) && kept.includes(600001) && kept.includes(70000), 'the newest boards stay');
  assert.ok(!kept.includes(900000) && !kept.includes(800000), 'the oldest boards go, even though their numbers are large');
});
