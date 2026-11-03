// Echoes: canvas rendering, touch controls, saving and sound. All rules live in core.js.
import {
  TICK, W, PY, PR, GR, BAR_T, GRACE, newRun, step, makeTrack, pickGhosts, ghostX, encodeXs, decodeXs,
  PTS_BAR,
} from './core.js';
import { loadStore, saveStore, dailySeed, boardLabel, runsFor, recordRun } from './store.js';
import { makeSound } from './sound.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
const dbg = new URLSearchParams(location.search).has('debug');

// ---------- state ----------

let store = loadStore();
let seed = store.seed ?? dailySeed();
let track = makeTrack(seed);
let state = 'ready';            // ready | playing | dying | over
let run = null, ghosts = [];
let target = 0.5, keyDir = 0;
let acc = 0, last = 0, clock = 0;
let overAt = 0, shake = 0, bump = 0;
const particles = [], floaters = [], ghostPops = [];
let theme = null;
const sound = makeSound(() => store.sound !== false);

// ---------- layout and theme ----------

let cssW = 0, cssH = 0, dpr = 1, scale = 1, baseY = 0;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = stage.clientWidth; cssH = stage.clientHeight;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  scale = cssW / W;           // world width 1 spans the field
  baseY = cssH * 0.78;        // your row sits low on the screen, thumb below it
}
const sx = (x) => x * scale;
const sy = (y) => baseY + (y - PY) * scale;

function readTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(`--${n}`).trim();
  theme = { field: v('field'), bar: v('bar'), edge: v('bar-edge'), you: v('you'), best: v('best'), recent: v('recent'), ink: v('ink'), muted: v('muted') };
}

// ---------- the board and saved runs ----------

function setBoard(newSeed) {
  seed = newSeed; track = makeTrack(seed);
  store.seed = seed; saveStore(store);
  showReady();
}

function ghostsNow() {
  return pickGhosts(runsFor(store, seed).map((r) => ({ xs: decodeXs(r.x), score: r.s })));
}

function bestScore() {
  const b = store.boards?.[seed]?.best;
  return b ? b.s : 0;
}

// ---------- flow ----------

function showReady() {
  state = 'ready'; run = null; ghosts = ghostsNow();
  $('start').hidden = false; $('over').hidden = true;
  const best = bestScore();
  $('start-hint').textContent = ghosts.length ? `${ghosts.length} ghost${ghosts.length > 1 ? 's' : ''} waiting. Touch anywhere to start.` : 'Touch anywhere to start.';
  $('board').textContent = `${boardLabel(seed)}${best ? ` · best ${best}` : ''}`;
  $('score').textContent = '0'; $('status').textContent = '';
  renderLegend();
}

function renderLegend() {
  const part = (g, label) => `<span><i style="background:var(--${g.kind === 'best' ? 'best' : 'recent'})"></i>${label} ${g.score}</span>`;
  $('legend').innerHTML = ghosts.map((g) => part(g, g.kind === 'best' ? 'Best' : 'Last')).join('');
}

function startRun(startX) {
  ghosts = ghostsNow();
  run = newRun(track, ghosts, startX);
  target = run.x; acc = 0; state = 'playing';
  $('start').hidden = true; $('over').hidden = true;
  $('score').textContent = '0';
  renderLegend();
  sound.unlock();
}

function endRun() {
  state = 'dying'; overAt = clock + 0.6; shake = 1;
  const prevBest = bestScore();
  const isBest = run.score > prevBest;
  if (run.score > 0) store = recordRun(store, seed, { s: run.score, x: encodeXs(run.xs), t: Date.now() });
  saveStore(store);
  burst(sx(run.x), sy(PY), theme.you, 26);
  if (run.cause === 'ghost' && run.hitGhost) burst(sx(ghostX(run.hitGhost, run.tick) ?? run.x), sy(PY), run.hitGhost.kind === 'best' ? theme.best : theme.recent, 16);
  sound.die(); navigator.vibrate?.(60);
  const seconds = run.tick / 60;
  $('over-score').textContent = run.score;
  $('over-bars').textContent = run.passed; $('over-grazes').textContent = run.grazes; $('over-time').textContent = seconds.toFixed(1);
  $('over-flag').textContent = isBest && run.score > 0 ? 'New best' : '';
  $('over-why').textContent = run.cause === 'ghost'
    ? `You ran into your ${run.hitGhost.kind === 'best' ? 'best' : 'last'} run.`
    : run.cause === 'bar' ? 'You hit a bar.' : 'You lasted four minutes. Impressive.';
  const best = Math.max(prevBest, run.score);
  $('board').textContent = `${boardLabel(seed)} · best ${best}`;
}

function showOver() {
  state = 'over';
  ghosts = ghostsNow(); renderLegend();
  $('over').hidden = false; overAt = clock + 0.35; // brief lock so a panicked tap does not skip the result
}

// ---------- input ----------

function pointerX(e) {
  const r = stage.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
}
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  const x = pointerX(e);
  if (state === 'ready') startRun(x);
  else if (state === 'over' && clock >= overAt) startRun(x);
  else if (state === 'playing') target = x;
  try { stage.setPointerCapture(e.pointerId); } catch { /* not all browsers allow it */ }
});
stage.addEventListener('pointermove', (e) => { if (state === 'playing' && e.buttons !== 0) target = pointerX(e); });

const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.add('l');
  else if (e.key === 'ArrowRight' || e.key === 'd') keys.add('r');
  else if (e.key === ' ' || e.key === 'Enter') {
    if (state === 'ready') startRun(0.5);
    else if (state === 'over' && clock >= overAt) startRun(0.5);
    e.preventDefault(); return;
  } else return;
  if (state === 'ready') startRun(0.5);
  else if (state === 'over' && clock >= overAt) startRun(0.5);
  keyDir = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.delete('l');
  if (e.key === 'ArrowRight' || e.key === 'd') keys.delete('r');
  keyDir = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
});

$('again').addEventListener('click', () => { if (clock >= overAt) startRun(0.5); });
const newBoard = () => setBoard(1 + Math.floor(Math.random() * 999999));
$('start-new').addEventListener('click', newBoard);
$('over-new').addEventListener('click', newBoard);
$('over-daily').addEventListener('click', () => setBoard(dailySeed()));
$('sound').addEventListener('click', () => {
  store.sound = store.sound === false; saveStore(store);
  $('sound').setAttribute('aria-pressed', String(store.sound !== false));
  if (store.sound !== false) sound.pass();
});

// ---------- effects ----------

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 220;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, color });
  }
}

function handleEvents(events) {
  for (const e of events) {
    if (e === 'pass') { bump = 1; sound.pass(); }
    if (e === 'graze') {
      sound.graze(); navigator.vibrate?.(8);
      floaters.push({ x: sx(run.x), y: sy(PY) - 26, text: 'graze +5', life: 0.8 });
      burst(sx(run.x), sy(PY), theme.you, 6);
    }
  }
}

// ---------- drawing ----------

function drawBar(b) {
  const y = sy(run ? run.D - b.d : 0 - b.d);
  const h = BAR_T * scale;
  if (y < -h || y > cssH + h) return;
  let from = 0;
  const seg = (a, z) => {
    if (z - a < 0.002) return;
    const x = sx(a), w = sx(z - a);
    ctx.fillStyle = theme.bar;
    ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, h / 2.4); ctx.fill();
    ctx.fillStyle = theme.edge; ctx.globalAlpha = 0.55;
    ctx.fillRect(x + h / 3, y - h / 2 + 2, Math.max(0, w - (2 * h) / 3), 2); ctx.globalAlpha = 1;
  };
  for (const g of b.gaps) { seg(from, g.c - g.w / 2); from = g.c + g.w / 2; }
  seg(from, W);
}

function drawGhost(g, tick, armed) {
  const gx = ghostX(g, tick);
  const col = g.kind === 'best' ? theme.best : theme.recent;
  if (gx === null) return;
  const x = sx(gx), y = sy(PY), r = PR * scale;
  ctx.save();
  ctx.globalAlpha = armed ? 0.8 : 0.4;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = armed ? 0.35 : 0.8; ctx.strokeStyle = col; ctx.lineWidth = 2;
  if (!armed) ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function draw(dt) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);

  // The row you live on, faintly.
  ctx.strokeStyle = theme.muted; ctx.globalAlpha = 0.12; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, sy(PY)); ctx.lineTo(cssW, sy(PY)); ctx.stroke(); ctx.globalAlpha = 1;

  const D = run ? run.D : 0;
  {
    const topWorld = PY - baseY / scale - 0.2, botWorld = PY + (cssH - baseY) / scale + 0.2;
    for (let i = Math.max(0, (run ? run.next : 0) - 2); i < (run ? run.next : 0) + 14; i++) {
      const b = track.bar(i);
      const y = D - b.d;
      if (y > botWorld) continue;
      if (y < topWorld) break;
      drawBar(b);
    }
  }

  const tick = run ? run.tick : 1;
  const armed = run ? run.tick > GRACE : false;
  const list = run ? run.ghosts : ghosts;
  for (const g of list) drawGhost(g, run ? tick : 1, armed);
  // A ghost's run ends in a ring where it fell.
  if (run) for (const g of run.ghosts) {
    if (ghostX(g, tick) === null && g.xs.length && tick - g.xs.length < 40 && tick > g.xs.length) {
      const age = (tick - g.xs.length) / 40, x = sx(g.xs.at(-1) / 65535);
      ctx.save(); ctx.globalAlpha = 0.6 * (1 - age); ctx.strokeStyle = g.kind === 'best' ? theme.best : theme.recent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, sy(PY), PR * scale * (1 + age * 3), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  // You, with a short trail.
  if (run && state !== 'dying' && state !== 'over') {
    const n = Math.min(16, run.xs.length);
    for (let i = n; i >= 1; i--) {
      const x = run.xs[run.xs.length - i] / 65535;
      ctx.globalAlpha = 0.28 * (1 - i / (n + 1));
      ctx.fillStyle = theme.you;
      ctx.beginPath(); ctx.arc(sx(x), sy(PY) + i * 1.5, PR * scale * (1 - i / 30), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.you;
    ctx.beginPath(); ctx.arc(sx(run.x), sy(PY), PR * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = theme.field; ctx.lineWidth = 3; ctx.stroke();
  } else if (state === 'ready') {
    ctx.fillStyle = theme.you; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(sx(0.5), sy(PY), PR * scale, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  // Particles and floating text.
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = '500 12px "DM Mono", monospace'; ctx.textAlign = 'center';
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt; if (f.life <= 0) { floaters.splice(i, 1); continue; }
    f.y -= 36 * dt; ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = theme.ink;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- main loop ----------

function frame(ts) {
  const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
  last = ts; clock += dt;
  if (state === 'playing') {
    acc += dt;
    while (acc >= TICK && run.alive) {
      if (keyDir) target = Math.min(1, Math.max(0, target + keyDir * 1.6 * TICK));
      handleEvents(step(run, target));
      acc -= TICK;
    }
    $('score').textContent = run.score;
    const left = run.ghosts.length && run.tick < GRACE ? ((GRACE - run.tick) / 60).toFixed(1) : null;
    $('status').textContent = left ? `ghosts wake in ${left}s` : (run.ghosts.length ? 'ghosts awake' : '');
    if (!run.alive) endRun();
  } else if (state === 'dying' && clock >= overAt) showOver();
  shake = Math.max(0, shake - dt * 2.2);
  if (bump > 0) { bump = Math.max(0, bump - dt * 6); $('score').classList.toggle('bump', bump > 0.4); }
  draw(dt);
  requestAnimationFrame(frame);
}

// ---------- boot ----------

new ResizeObserver(() => layout()).observe(stage);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
layout(); readTheme();
$('sound').setAttribute('aria-pressed', String(store.sound !== false));
showReady();
requestAnimationFrame(frame);

if (dbg) window.__echoes = { get state() { return state; }, get run() { return run; }, get track() { return track; }, steer: (x) => { target = x; }, start: (x) => startRun(x), seed: () => seed };
