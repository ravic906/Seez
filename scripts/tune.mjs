// Difficulty check: how long do human-ish bots survive with 0..5 ghosts?
// Usage: node scripts/tune.mjs [boards] [shake]
import { makeTrack, pickGhosts, speedAt } from '../src/core.js';
import { playBot } from './bot.mjs';

const boards = +process.argv[2] || 12;
const shake = +(process.argv[3] ?? 0.012);
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const rows = Array.from({ length: 7 }, () => []);

for (let b = 1; b <= boards; b++) {
  const track = makeTrack(1000 + b);
  const runs = [];
  for (let n = 0; n < 7; n++) {
    const ghosts = pickGhosts(runs);
    const r = playBot(track, ghosts, { seed: b * 31 + n, shake });
    rows[n].push(r.tick / 60);
    runs.push({ xs: r.xs, score: r.score });
  }
}
console.log(`bots (shake ${shake}) on ${boards} boards, seconds survived by attempt number (they dodge shots and ghosts, but ignore helpers):`);
rows.forEach((r, n) => console.log(`  attempt ${n + 1} (${Math.min(n, 2)} ghosts): median ${median(r).toFixed(1)}s  min ${Math.min(...r).toFixed(1)}s  max ${Math.max(...r).toFixed(1)}s`));
console.log(`speed: ${speedAt(0).toFixed(2)} at start, ${speedAt(8).toFixed(2)} after 8 units, ${speedAt(99).toFixed(2)} cap`);
