// Is a long run even possible? Search every reachable x, tick by tick (perfect play).
import { makeTrack, pickGhosts, ghostX, gapMargin, speedAt, TICK, PY, PR, GR, LAT, GRACE, BAR_T } from '../src/core.js';
import { playBot } from './bot.mjs';

const BIN = 0.005, N = Math.round(1 / BIN) + 1, REACH = Math.floor((LAT * TICK) / BIN);

export function perfectSurvival(track, ghosts, maxTicks = 3600) {
  let alive = new Array(N).fill(true), D = 0, next = 0;
  for (let t = 1; t <= maxTicks; t++) {
    const grown = new Array(N).fill(false);
    for (let i = 0; i < N; i++) if (alive[i]) for (let j = Math.max(0, i - REACH); j <= Math.min(N - 1, i + REACH); j++) grown[j] = true;
    D += speedAt(D) * TICK;
    const b = track.bar(next), y = D - b.d;
    const overlap = y + BAR_T / 2 > PY - PR && y - BAR_T / 2 < PY + PR;
    if (!overlap && y - BAR_T / 2 >= PY + PR) next++;
    let any = false;
    for (let i = 0; i < N; i++) {
      if (!grown[i]) continue;
      const x = i * BIN;
      let ok = x >= PR && x <= 1 - PR;
      if (ok && overlap && gapMargin(b, x) < 0) ok = false;
      if (ok && t > GRACE) for (const g of ghosts) { const gx = ghostX(g, t); if (gx !== null && Math.abs(x - gx) < PR + GR) { ok = false; break; } }
      grown[i] = ok; any = any || ok;
    }
    if (!any) return t;
    alive = grown;
  }
  return maxTicks;
}

if (process.argv[1].endsWith('feasible.mjs')) {
  const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const out = [[], [], []];
  for (let b = 1; b <= 10; b++) {
    const track = makeTrack(1000 + b);
    const runs = [];
    for (let n = 0; n < 5; n++) {
      const ghosts = pickGhosts(runs);
      out[Math.min(n, 2)].push(perfectSurvival(track, ghosts) / 60);
      const r = playBot(track, [], { seed: b * 17 + n, maxTicks: 60 * 40 }); // ghosts made by a bot that ignores ghosts
      runs.push({ xs: r.xs, score: r.score });
    }
  }
  out.forEach((r, i) => console.log(`${i} ghosts: perfect play survives median ${median(r).toFixed(1)}s (min ${Math.min(...r).toFixed(1)}, max ${Math.max(...r).toFixed(1)}), cap 60s`));
}
