// A human-ish simulated player used for tuning and tests: it reacts with a delay, aims with
// some shake, steers for the middle of the next gap and, when ghosts are about, picks the
// spot in the gap that is free of ghosts when the bar arrives.
import {
  TICK, PY, PR, GR, LAT, BLAST_R, ghostPhase, speedAt, newRun, step, mulberry32, ghostX,
} from '../src/core.js';

// How dangerous standing at x is, given the shots in flight (0 = safe, 1 = about to be hit).
export function shotDanger(run, x) {
  let d = 0;
  for (const s of run.shots) {
    if (s.kind === 'bomb' && s.mode !== 'fly') { if (Math.abs(x - s.x) < BLAST_R + PR + 0.05) d = 1; continue; }
    const t = (PY - s.y) / s.vy;
    if (t < -0.1 || t > 1.1) continue;
    const cx = s.x + s.vx * Math.max(0, t);
    const reach = (s.kind === 'bomb' ? BLAST_R : s.r) + PR + 0.05;
    if (Math.abs(x - cx) < reach) d = 1;
  }
  return d;
}

export function playBot(track, ghosts, { seed = 1, shake = 0.012, reaction = 9, lookahead = true, maxTicks = 60 * 150 } = {}) {
  const rng = mulberry32(seed * 7919 + 13);
  const startX = 0.15 + rng() * 0.7; // each run starts where the player happened to touch
  const run = newRun(track, ghosts, startX);
  let target = startX, hold = 0;
  while (run.alive && run.tick < maxTicks) {
    if (hold-- <= 0) {
      hold = reaction;
      const b = run.track.bar(run.next);
      const nb = run.track.bar(run.next + 1);
      const y = run.D - b.d;
      const target0 = y > PY + 0.1 ? nb : b; // heading for the bar after this one if this is nearly past
      let best = target0.c, bestScore = -Infinity;
      const cands = target0.gaps.flatMap((g) => Array.from({ length: 9 }, (_, k) => ({ x: g.c + ((k - 4) / 4) * Math.max(0, g.w / 2 - PR - 0.015), g })));
      // Ticks until the bar reaches us (approximation at current speed).
      const eta = Math.max(1, Math.round((PY - (run.D - target0.d)) / speedAt(run.D) / TICK));
      for (const { x: cand } of cands) {
        let clear = 1;
        if (lookahead) {
          // Walk the whole path to this spot, tick by tick, and keep clear of every ghost.
          let px = run.x;
          for (let dt = 1; dt <= eta + 40; dt++) {
            px += Math.max(-LAT * TICK, Math.min(LAT * TICK, cand - px));
            for (const [gi, g] of ghosts.entries()) {
              if (!ghostPhase(run.track, ghosts.length, gi, run.tick + dt).visible) continue; // not visiting then
              const gx = ghostX(g, run.tick + dt);
              if (gx !== null) clear = Math.min(clear, Math.abs(px - gx) - (PR + GR));
            }
          }
        }
        const travel = Math.abs(cand - run.x) / (LAT * TICK);
        const feasible = travel <= eta ? 0 : -50; // a gap you cannot reach in time is worse than any shot
        const score = Math.min(clear, 0.06) * 10 + feasible - Math.abs(cand - run.x) * 0.15 - shotDanger(run, cand) * 3;
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      target = best + (rng() * 2 - 1) * shake;
    }
    step(run, target);
  }
  return run;
}
