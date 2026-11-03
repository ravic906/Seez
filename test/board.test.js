import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTrack, encodeXs, decodeXs, verifyRun } from '../src/core.js';
import { recentSeeds, isDaily, mergeBoard, beats, entriesFor, cleanHandle, rank, verifiedTop, KEEP_BOARDS } from '../src/board.js';
import { createBoard } from '../src/leaderboard.js';
import { makeFakeDb } from './fakedb.js';
import { playBot } from '../scripts/bot.mjs';
import { randomHandle } from '../src/names.js';

const TODAY = 20261103;
const honest = (seed, ticks = 60 * 25, botSeed = 5) => {
  const r = playBot(makeTrack(seed), [], { seed: botSeed, shake: 0.01, reaction: 6, maxTicks: ticks });
  // A bot cut off by the tick limit is still alive, which a real run never is: score it as the board will.
  const v = verifyRun(seed, r.xs);
  return { s: v.score, bars: v.bars, grazes: v.grazes, ticks: r.xs.length, x: encodeXs(r.xs), xs: r.xs };
};

test('daily boards: valid dates only, and the last week counts back across months', () => {
  assert.ok(isDaily(20261103) && isDaily(20240229));
  assert.ok(!isDaily(20261340) && !isDaily(4242) && !isDaily(20230229) && !isDaily(1.5));
  assert.deepEqual(recentSeeds(20260302, 4), [20260302, 20260301, 20260228, 20260227]);
  assert.equal(recentSeeds(TODAY).length, KEEP_BOARDS);
});

test('a player document keeps one week of boards and says which saved runs to clean up', () => {
  const old = { 20261020: { s: 1 }, 20261030: { s: 2 }, 20261103: { s: 3 } };
  const { boards, dropped } = mergeBoard(old, 20261102, { s: 9 }, TODAY);
  assert.deepEqual(Object.keys(boards).map(Number).sort(), [20261030, 20261102, 20261103]);
  assert.deepEqual(dropped, [20261020]);
  assert.ok(beats(undefined, 1) && beats({ s: 5 }, 6) && !beats({ s: 5 }, 5) && !beats({ s: 5 }, 4));
});

test('entries: each player counts once at their best, and broken documents are ignored', () => {
  const docs = [
    { id: 'a', data: { handle: 'Ann', boards: { 20261103: { s: 50, t: 2 }, 20261102: { s: 90, t: 1 } } } },
    { id: 'b', data: { handle: 'Bo', boards: { 20261103: { s: 70, t: 3 } } } },
    { id: 'c', data: { handle: 'Cy' } },
    { id: 'd', data: { handle: 'Di', boards: { 20261103: { s: 'lots' } } } },
    { id: 'e', data: { handle: 'Ed', boards: { 20261103: { s: 0 } } } },
    { id: 'f', data: null },
  ];
  assert.deepEqual(entriesFor(docs, [20261103]).map((e) => [e.uid, e.s]), [['a', 50], ['b', 70]]);
  const week = entriesFor(docs, recentSeeds(TODAY));
  assert.deepEqual(week.map((e) => [e.uid, e.s, e.seed]), [['a', 90, 20261102], ['b', 70, 20261103]]);
});

test('handles from other people are cleaned and shortened', () => {
  assert.equal(cleanHandle('<script>alert(1)</script>'), 'scriptalert1script');
  assert.equal(cleanHandle(''), 'Survivor');
  assert.equal(cleanHandle(42), 'Survivor');
  assert.equal(cleanHandle('x'.repeat(100)).length, 24);
  assert.match(randomHandle(() => 0.5), /^[A-Z][a-z]+[A-Z][a-z]+\d\d$/);
});

test('ranking: highest first, earlier score wins a tie, ties share a rank', () => {
  const r = rank([{ uid: 'a', s: 50, t: 5 }, { uid: 'b', s: 80, t: 9 }, { uid: 'c', s: 50, t: 2 }, { uid: 'd', s: 10, t: 1 }]);
  assert.deepEqual(r.map((e) => [e.uid, e.rank]), [['b', 1], ['c', 2], ['a', 2], ['d', 4]]);
});

test('verified rows only: faked, missing and tampered scores never appear', async () => {
  const seed = TODAY;
  const a = honest(seed, 60 * 25, 5), b = honest(seed, 60 * 15, 7);
  assert.ok(a.s > 0 && b.s > 0 && a.s !== b.s);
  const jumped = b.xs.slice(); jumped[100] = jumped[99] > 30000 ? 3000 : 62000;
  const runs = {
    a: { x: a.x, s: a.s }, b: { x: b.x, s: b.s },
    liar: { x: b.x, s: b.s + 500 },            // claims far more than the run is worth
    teleporter: { x: encodeXs(jumped), s: b.s },
    // 'ghost' has a score row but no saved run at all
  };
  const entry = (uid, s) => ({ uid, handle: uid, seed, s, t: uid.length });
  const ranked = rank([entry('a', a.s), entry('b', b.s), entry('liar', b.s + 500), entry('teleporter', b.s), entry('ghost', 9999)]);
  const calls = [];
  const opts = { fetchRun: async (uid) => { calls.push(uid); return runs[uid] ?? null; }, verify: verifyRun, decode: decodeXs };
  const out = await verifiedTop(ranked, { ...opts, wantUid: 'b' });
  assert.deepEqual(out.rows.map((e) => e.uid).sort(), ['a', 'b']);
  assert.deepEqual(out.rows.map((e) => e.rank), [1, 2], 'ranks close up over the removed rows');
  // The cache means a second look replays nothing.
  const cache = new Map();
  await verifiedTop(ranked, { ...opts, cache });
  const before = calls.length;
  await verifiedTop(ranked, { ...opts, cache });
  assert.equal(calls.length, before);
});

test('your own row is pinned even when you are below the top list', async () => {
  const seed = TODAY;
  const mine = honest(seed, 60 * 8, 3), better = honest(seed, 60 * 30, 5);
  const ranked = rank([{ uid: 'top', handle: 'Top', seed, s: better.s, t: 1 }, { uid: 'me', handle: 'Me', seed, s: mine.s, t: 2 }]);
  const runs = { top: { x: better.x, s: better.s }, me: { x: mine.x, s: mine.s } };
  const out = await verifiedTop(ranked, { limit: 1, fetchRun: async (u) => runs[u], verify: verifyRun, decode: decodeXs, wantUid: 'me' });
  assert.deepEqual(out.rows.map((e) => e.uid), ['top']);
  assert.equal(out.mine.uid, 'me');
  assert.equal(out.mine.rank, null);
});

// ---------- posting and reading through the (fake) shared database ----------

const conn = (fake, uid, canWrite = true) => ({ db: fake.db, uid, canWrite });
const board = (c, handle = 'Test') => createBoard(c, { today: () => TODAY, getHandle: () => handle });

test('posting writes the saved run first, then the score, and only when it beats your best', async () => {
  const fake = makeFakeDb();
  const b = board(conn(fake, 'u1'), 'Lone Comet');
  const run = honest(TODAY);
  const r1 = await b.post(TODAY, { s: run.s, bars: run.bars, grazes: run.grazes, ticks: run.ticks, x: run.x });
  assert.equal(r1.posted, true);
  assert.deepEqual(fake.log.map((l) => l.join(' ')), [`set scores/u1/runs/${TODAY}`, 'set scores/u1']);
  const doc = fake.store.get('scores/u1');
  assert.equal(doc.handle, 'Lone Comet');
  assert.equal(doc.boards[TODAY].s, run.s);
  fake.log.length = 0;
  assert.equal((await b.post(TODAY, { s: run.s, bars: 1, grazes: 0, ticks: 5, x: run.x })).reason, 'not-better');
  assert.equal(fake.log.length, 0, 'nothing is written for a worse or equal score');
});

test('practice boards, read-only viewers and old boards are handled', async () => {
  const fake = makeFakeDb();
  const run = honest(TODAY, 60 * 10);
  const post = (b, seed) => b.post(seed, { s: run.s, bars: run.bars, grazes: run.grazes, ticks: run.ticks, x: run.x });
  assert.equal((await post(board(conn(fake, 'u1')), 4242)).reason, 'practice');
  assert.equal((await post(board(conn(fake, 'u1', false)), TODAY)).reason, 'read-only');
  assert.equal(fake.log.length, 0);
  // A week-old board is cleaned up on the next post.
  fake.store.set('scores/u1', { handle: 'x', boards: { 20261020: { s: 5, t: 1 } } });
  fake.store.set('scores/u1/runs/20261020', { x: 'AA', s: 5 });
  assert.equal((await post(board(conn(fake, 'u1')), TODAY)).posted, true);
  assert.equal(fake.store.has('scores/u1/runs/20261020'), false);
  assert.equal(fake.store.get('scores/u1').boards[20261020], undefined);
});

test('two players: the board ranks them, verifies them, and a faked row never shows', async () => {
  const fake = makeFakeDb();
  const a = honest(TODAY, 60 * 25, 5), b = honest(TODAY, 60 * 12, 9);
  const post = (uid, name, r) => board(conn(fake, uid), name).post(TODAY, { s: r.s, bars: r.bars, grazes: r.grazes, ticks: r.ticks, x: r.x });
  await post('alice', 'Alice', a); await post('bob', 'Bob', b);
  // A cheater writes a huge score pointing at a short, honest run.
  fake.store.set('scores/cheat', { handle: 'Cheat', boards: { [TODAY]: { s: 99999, t: 1 } } });
  fake.store.set(`scores/cheat/runs/${TODAY}`, { x: b.x, s: 99999 });
  const viewer = board(conn(fake, 'bob'), 'Bob');
  viewer.start();
  await new Promise((r) => setTimeout(r, 20));
  const today = await viewer.rows('today');
  assert.deepEqual(today.rows.map((e) => e.handle), ['Alice', 'Bob']);
  assert.equal(today.mine.uid, 'bob');
  assert.equal(today.total, 3, 'three rows existed, two survived verification');
  const week = await viewer.rows('week');
  assert.deepEqual(week.rows.map((e) => e.handle), ['Alice', 'Bob']);
  viewer.stop();
});

test('renaming changes the name on your row, and does nothing before you have posted', async () => {
  const fake = makeFakeDb();
  const b = board(conn(fake, 'u1'), 'Old Name');
  assert.equal(await b.rename('New Name'), true);
  assert.equal(fake.store.has('scores/u1'), false, 'no document is created by a rename');
  const run = honest(TODAY, 60 * 10);
  await b.post(TODAY, { s: run.s, bars: run.bars, grazes: run.grazes, ticks: run.ticks, x: run.x });
  await b.rename('New Name');
  assert.equal(fake.store.get('scores/u1').handle, 'New Name');
});
