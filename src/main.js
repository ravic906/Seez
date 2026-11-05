// Echoes: the game screen, controls and menus. The rules are in core.js, the drawing in art.js and intro.js.
import {
  TICK, PY, PR, BAR_T, ghostPhase, FIRE_DIST, TELEGRAPH_DIST, SHATTER_TICKS, BUBBLE_TICKS, HEARTS, maxHearts, BLAST_R, BLAST_TICKS, WIDEN_MULT, SHRINK_MULT, GHOST_ARM_SCORE, CREW_MID_SCORE, CREW_FULL_SCORE, JOIN_GRACE, POWERS, speedAt,
  newRun, step, makeTrack, pickGhosts, verifyRun, ghostX, ghostCanHit, openings, crewLevelFor, crewMayHurtAt, encodeXs, decodeXs,
} from './core.js';
import {
  PAL, makeStars, drawSpace, drawGirder, drawIcon, drawBot, drawCrew, drawFriend, drawAlien, drawShot,
  POWER_NAME, POWER_HELP, tierColor,
} from './art.js';
import { drawIntro, INTRO_LENGTH, captionAt } from './intro.js';
import { loadStore, saveStore, dailySeed, boardLabel, runsFor, recordRun } from './store.js';
import { isDaily } from './board.js';
import { connect, createBoard } from './leaderboard.js';
import { randomHandle } from './names.js';
import { GOALS, newlyDone, nextGoal, doneCount } from './goals.js';
import { makeSound } from './sound.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
const dbg = new URLSearchParams(location.search).has('debug');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;

// ---------- state ----------

let store = loadStore();
if (!store.handle) { store.handle = randomHandle(); saveStore(store); }
let seed = store.seed && !isDaily(store.seed) ? store.seed : dailySeed(); // old daily boards roll over to today
let track = makeTrack(seed);
let state = 'boot';              // boot | intro | ready | playing | dying | over
let run = null, ghosts = [];
let target = 0.5, keyDir = 0;
let acc = 0, last = 0, clock = 0, introT = 0, introGuard = 0;
let overAt = 0, shake = 0, bump = 0, flash = { c: '255,77,94', a: 0 };
const particles = [], floaters = [];
// drawing-only state: Wide gaps cross-fade, helpers you missed fading out, ghosts whose run just ended
const WIDEN_FADE = 0.2, MISSED_FADE = 0.5, GHOST_FADE = 0.5;
const ALIEN_FOOT_L = 26 / 400, ALIEN_FOOT_R = 30.5 / 400; // the alien sprite's foot, in world widths (art.js drawAlien)
let widenBlend = 0, lastNf = 0, lastFriends = 0;
const missed = [];
let lastGhost = [];
// The stretch of plate (between normal gaps) that an alien at x was placed on (core.js snail()).
function snailPlate(b, x) {
  let from = 0;
  for (const g of b.gaps) { const a = g.c - g.w / 2; if (x <= a) return [from, a]; from = g.c + g.w / 2; }
  return [from, 1];
}
const stars = makeStars(11, 150);
const sound = makeSound(() => store.sound !== false);
let board = null, boardScope = 'today', runToken = 0, lastMood = null, introAudio = false;

// ---------- layout ----------

let cssW = 0, cssH = 0, dpr = 1, scale = 1, baseY = 0;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = stage.clientWidth; cssH = stage.clientHeight;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  scale = cssW;            // world width 1 spans the field
  baseY = cssH * 0.78;     // your row sits low on the screen, with room for a thumb below it
}
const sx = (x) => x * scale;
const sy = (y) => baseY + (y - PY) * scale;

// ---------- boards, ghosts, flow ----------

// Saved runs are only trusted if they replay to their score (with the upgrades they were flown with), so
// a fake best typed into storage can neither unlock upgrades nor arm the crew. Results are remembered.
const checked = new Map();
function runHolds(r) {
  const key = `${seed}:${r.t}:${r.s}:${r.u ?? 0}:${r.x.length}`;
  if (!checked.has(key)) {
    let ok = false;
    try { const v = verifyRun(seed, decodeXs(r.x), undefined, r.u ?? 0); ok = v.ok && v.score === r.s; } catch { ok = false; }
    checked.set(key, ok);
  }
  return checked.get(key);
}
const trustedRuns = () => runsFor(store, seed).filter(runHolds);
const crewRuns = () => trustedRuns().flatMap((r) => { try { return [{ xs: decodeXs(r.x), score: r.s, u: r.u ?? 0 }]; } catch { return []; } });
const ghostsNow = () => pickGhosts(crewRuns());
const bestScore = () => Math.max(0, ...trustedRuns().map((r) => r.s));
// The leaderboard gets your best run on this board (not just the last one): a best that never reached
// it (offline, a failed post) goes up the next time, so a later, smaller run never stands in for it.
function bestToPost() {
  const b = trustedRuns().reduce((a, r) => (!a || r.s > a.s ? r : a), null);
  if (!b) return null;
  const v = verifyRun(seed, decodeXs(b.x), undefined, b.u ?? 0);
  return { s: b.s, bars: v.bars, grazes: v.grazes, ticks: v.ticks, x: b.x, u: b.u ?? 0 };
}
// What the crew can do on this board at each level (see crewMayHurtAt in core.js).
// Your bot's upgrades on this board, earned at the same steps (see START_BUBBLE_TICKS in core.js).
const UPGRADE_TEXT = ['', 'you start with a Shield', 'you start with a Shield and slide 5% faster', 'you start with a Shield, slide 5% faster and have a 4th suit cell'];
const UPGRADE_NEW = ['', 'a Shield at the start of every run', 'faster sliding (5%)', 'a 4th suit cell'];
const CREW_TEXT = [
  'the crew only watch',
  'the captain can hurt you for the first 4 s of its visits',
  'the captain can hurt you for the first 7 s of its visits, your last flight for the first 4 s',
  'the whole crew can hurt you, all visit long',
];

function setBoard(newSeed) {
  seed = newSeed; track = makeTrack(seed);
  store.seed = seed; saveStore(store);
  showReady();
}

function showReady() {
  setRunButtons(false);
  if (isDaily(seed) && seed !== dailySeed()) { seed = dailySeed(); track = makeTrack(seed); store.seed = seed; saveStore(store); } // the day rolled over
  state = 'ready'; run = null; ghosts = ghostsNow();
  $('over-daily').hidden = isDaily(seed);
  $('start').hidden = false; $('over').hidden = true;
  $('hud').hidden = false; $('legend').hidden = false; $('caption').hidden = true; $('skip').hidden = true;
  const n = ghosts.length;
  const lvl = crewLevelFor({ score: bestScore() }), next = [GHOST_ARM_SCORE, CREW_MID_SCORE, CREW_FULL_SCORE][lvl];
  $('start-hint').textContent = n === 0 ? 'Touch anywhere to start.'
    : `The crew will find you 10 to 15 seconds in. On this board ${CREW_TEXT[lvl]}${next ? ` (until you score ${next})` : ''}.${lvl ? ` Your bot: ${UPGRADE_TEXT[lvl]}.` : ''} Touch anywhere to start.`;
  $('start-goal').textContent = goalLine();
  const best = bestScore();
  $('board').textContent = `${boardLabel(seed)}${best ? ` · best ${best}` : ''}`;
  $('score').textContent = '0'; $('status').textContent = '';
  setHearts(HEARTS + (lvl >= 3 ? 1 : 0), HEARTS + (lvl >= 3 ? 1 : 0)); setChips(null); lastMood = null; sound.mood(null);
  renderLegend();
  $('start-board').hidden = !board; $('over-board').hidden = !board;
}

function renderLegend() {
  $('legend').innerHTML = ghosts.map((g) => `<span><i style="background:${g.kind === 'best' ? PAL.captain : PAL.crew}"></i>${g.kind === 'best' ? 'Captain' : 'Last flight'} ${g.score}</span>`).join('');
}

// ---------- pause and resume ----------
// Paused: the run stands still and a card offers Resume, the field guide or a restart. Resume counts
// 3-2-1 first so you are not dropped straight back into the wreckage. Switching apps, locking the
// phone, the Android back button, P or Esc all pause.
const RESUME_COUNT = 3, RESUME_STEP = 0.45; // seconds per count
let paused = false, resumeAt = 0;
function pauseRun() {
  if (state !== 'playing' || !run?.alive || (paused && !resumeAt)) return;
  paused = true; resumeAt = 0; releaseKeys();
  $('pause-score').textContent = run.score;
  $('pause-time').textContent = `${(run.tick / 60).toFixed(1)} s · ${run.hearts} suit cell${run.hearts === 1 ? '' : 's'} left`;
  $('pause').hidden = false; $('countdown').hidden = true;
}
function resumeRun() {
  if (!paused || resumeAt) return;
  $('pause').hidden = true; resumeAt = clock + RESUME_COUNT * RESUME_STEP;
}
function tickPause() { // during the countdown; returns true while the run should stand still
  if (!paused) return false;
  if (!resumeAt) return true;
  const left = resumeAt - clock;
  if (left <= 0) { paused = false; resumeAt = 0; $('countdown').hidden = true; target = run.x; acc = 0; return false; }
  $('countdown').hidden = false; $('countdown').textContent = String(Math.ceil(left / RESUME_STEP));
  return true;
}
// Two buttons at the top, so a big score never runs into them: during a run, pause takes the place of
// the field guide (which is one tap away on the pause card); otherwise the field guide is back.
let runButtons = null;
function setRunButtons(running) {
  if (running === runButtons) return;
  runButtons = running; $('pause-btn').hidden = !running; $('guide-btn').hidden = running;
}
function clearPause() { paused = false; resumeAt = 0; $('pause').hidden = true; $('countdown').hidden = true; }
$('resume').addEventListener('click', resumeRun);
$('pause-btn').addEventListener('click', () => (paused ? resumeRun() : pauseRun()));
$('pause-guide').addEventListener('click', () => openGuide());
$('pause-restart').addEventListener('click', () => { if (state === 'playing') { clearPause(); startRun(0.5); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });

function startRun(startX) {
  clearPause();
  ghosts = ghostsNow();
  run = newRun(track, ghosts, startX); runGoals = [];
  missed.length = 0; lastGhost = []; widenBlend = 0; lastNf = 0; lastFriends = 0;
  target = run.x; acc = 0; state = 'playing'; runToken++;
  $('start').hidden = true; $('over').hidden = true;
  $('score').textContent = '0';
  renderLegend();
  sound.unlock();
}

const WHY = { ghost: 'The crew caught up with you.', snail: 'The aliens got you.', bar: 'You hit the wreckage.', timeout: 'Four minutes in the wreckage. Remarkable.' };

// ---------- goals (milestones; the run itself never ends) ----------
let runGoals = [];
function checkGoals() {
  const got = newlyDone(run, store.goals);
  if (!got.length) return;
  store = { ...store, goals: { ...(store.goals ?? {}), ...Object.fromEntries(got.map((g) => [g.id, Date.now()])) } };
  saveStore(store);
  for (const g of got) {
    runGoals.push(g);
    const showing = floaters.filter((f) => f.text.startsWith('GOAL ✓')).length; // stack above goal banners still on screen
    say(`GOAL ✓ ${g.text}`, PAL.led, -116 - 22 * showing);
  }
  sound.power();
}
const goalLine = () => { const n = nextGoal(store.goals); return n ? `Next goal: ${n.text} (${doneCount(store.goals)} of ${GOALS.length} done)` : `All ${GOALS.length} goals done. Remarkable.`; };
function renderGoals() {
  const ul = $('guide-goals'); ul.replaceChildren();
  for (const g of GOALS) { const li = document.createElement('li'); li.textContent = g.text; li.classList.toggle('done', !!store.goals?.[g.id]); ul.append(li); }
}

function endRun() {
  setRunButtons(false); clearPause();
  state = 'dying'; overAt = clock + 0.7; shake = 1; flash = { c: '255,200,120', a: 0.5 };
  const prevBest = bestScore();
  const isBest = run.score > prevBest;
  if (run.score > 0) store = recordRun(store, seed, { s: run.score, x: encodeXs(run.xs), t: Date.now(), u: run.up });
  saveStore(store);
  burst(sx(run.x), sy(PY), '#ffd9a0', 30);
  sound.die(); navigator.vibrate?.(60);
  const bars = run.passed, grazes = run.grazes, friends = run.friends, seconds = run.tick / 60, score = run.score, xs = run.xs, cause = run.cause;
  $('over-score').textContent = score; $('over-bars').textContent = bars; $('over-grazes').textContent = grazes;
  $('over-time').textContent = seconds.toFixed(1); $('over-friends').textContent = friends;
  $('over-friends-s').lastChild.nodeValue = friends === 1 ? ' helper' : ' helpers';
  $('over-flag').textContent = isBest && score > 0 ? 'New best' : '';
  $('over-why').textContent = WHY[cause] ?? '';
  // the first time a run on this board reaches GHOST_ARM_SCORE, say that the crew will fight back
  const before = crewLevelFor({ score: prevBest }), after = crewLevelFor({ score });
  if (after > before) $('over-why').textContent += ` From now on, ${CREW_TEXT[after]} on this board, and your bot earns ${UPGRADE_NEW.slice(before + 1, after + 1).join(' and ')}.`;
  $('over-rank').hidden = true;
  $('over-goals').textContent = (runGoals.length ? `Goals ticked: ${runGoals.map((g) => g.text).join(' · ')}\n` : '') + goalLine();
  $('over-goals').hidden = false;
  $('board').textContent = `${boardLabel(seed)} · best ${Math.max(prevBest, score)}`;
  const toPost = board && score > 0 ? bestToPost() : null;
  if (toPost) postAndRank(toPost, runToken);
}

async function postAndRank(res, token) {
  const out = await board.post(seed, res);
  if (token !== runToken || state === 'playing') return;
  let text = '';
  if (out.reason === 'read-only') text = 'You can see the leaderboard but not post. Ask the owner for Contributor access.';
  else if (isDaily(seed)) {
    const rows = await board.rows('today');
    if (token !== runToken || state === 'playing') return;
    if (rows.mine) text = rows.mine.rank ? `You are #${rows.mine.rank} today.` : `Your best today is ${rows.mine.s}.`;
  } else text = 'Practice board: scores are not posted.';
  $('over-rank').textContent = text; $('over-rank').hidden = !text;
}

function showOver() {
  state = 'over'; $('over-daily').hidden = isDaily(seed); ghosts = ghostsNow(); renderLegend();
  $('over').hidden = false; overAt = clock + 0.35; // brief lock so a panicked tap does not skip the result
}

// ---------- the opening scene ----------

function startIntro() {
  state = 'intro'; introT = 0; introGuard = clock + 0.4; introAudio = false;
  $('intro-sound').hidden = true; sound.ambientOff(); // the intro has its own score
  if (store.sound !== false) { if (sound.state().context === 'running') { sound.introStart(0); introAudio = true; } else $('intro-sound').hidden = false; }
  $('start').hidden = true; $('over').hidden = true; $('hud').hidden = true; $('legend').hidden = true; setChips(null);
  $('caption').hidden = false; $('skip').hidden = false;
  sound.unlock();
}
function endIntro() {
  sound.introStop(); introAudio = false; $('intro-sound').hidden = true;
  store.introSeen = true; saveStore(store);
  showReady();
  sound.ambientOn();
}
// A touch during the opening scene turns the music on first (browsers need a touch before any sound); the next one skips.
function introPoke() {
  if (!introAudio && store.sound !== false) { sound.unlock(); sound.introStart(introT); introAudio = true; $('intro-sound').hidden = true; return; }
  if (clock >= introGuard) endIntro();
}

// ---------- input ----------

const pointerX = (e) => { const r = stage.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
const sheetOpen = () => !$('sheet-board').hidden || !$('sheet-guide').hidden;

stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .sheet, .card') || sheetOpen()) return; // a tap on a sheet (even its backdrop) never starts a run
  const x = pointerX(e);
  if (state === 'intro') { introPoke(); return; }
  if (state === 'ready') startRun(x);
  else if (state === 'over' && clock >= overAt) startRun(x);
  else if (state === 'playing' && !paused) target = x;
  try { stage.setPointerCapture(e.pointerId); } catch { /* not all browsers allow it */ }
});
stage.addEventListener('pointermove', (e) => { if (state === 'playing' && !paused && e.buttons !== 0) target = pointerX(e); });

const keys = new Set();
const begin = () => { if (sheetOpen()) return; if (paused) { resumeRun(); return; } if (state === 'ready') startRun(0.5); else if (state === 'over' && clock >= overAt) startRun(0.5); else if (state === 'intro') introPoke(); };
addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.target.closest?.('input, textarea')) return; // typing is never a game key
  if (paused && !(e.key === ' ' || e.key === 'Enter' || e.key === 'Escape' || k === 'p')) return; // only resume keys while paused
  if (k === 'ArrowLeft' || k === 'a') keys.add('l');
  else if (k === 'ArrowRight' || k === 'd') keys.add('r');
  else if (e.key === ' ' || e.key === 'Enter') { if (e.target.closest?.('button')) return; begin(); e.preventDefault(); return; }
  else if (e.key === 'Escape' || k === 'p') { if (sheetOpen()) closeSheets(); else if (state === 'playing') (paused ? resumeRun() : pauseRun()); return; }
  else return;
  begin();
  keyDir = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
});
addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'ArrowLeft' || k === 'a') keys.delete('l');
  if (k === 'ArrowRight' || k === 'd') keys.delete('r');
  keyDir = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
});
const releaseKeys = () => { keys.clear(); keyDir = 0; };
addEventListener('blur', releaseKeys);
document.addEventListener('visibilitychange', releaseKeys);

$('again').addEventListener('click', () => { if (state === 'over' && clock >= overAt) startRun(0.5); });
$('skip').addEventListener('click', () => { if (state === 'intro') endIntro(); });
$('start-intro').addEventListener('click', startIntro);
const newBoard = () => setBoard(1 + Math.floor(Math.random() * 999999));
$('start-new').addEventListener('click', newBoard);
$('over-new').addEventListener('click', newBoard);
$('over-daily').addEventListener('click', () => setBoard(dailySeed()));
$('sound').addEventListener('click', () => {
  store.sound = store.sound === false; saveStore(store);
  $('sound').setAttribute('aria-pressed', String(store.sound !== false));
  if (store.sound !== false) { sound.ambientOn(); sound.pass(); } else sound.ambientOff();
});
// Browsers only allow sound after a touch, so the ambient bed starts on the first one.
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { sound.unlock(); if (state !== 'intro') sound.ambientOn(); }, { capture: true, passive: true });

// ---------- sheets: leaderboard and field guide ----------

function closeSheets() { $('sheet-board').hidden = true; $('sheet-guide').hidden = true; }
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', closeSheets);
for (const id of ['sheet-board', 'sheet-guide']) $(id).addEventListener('pointerdown', (e) => { if (e.target.id === id) closeSheets(); });

function openBoard() { if (!board) return; $('sheet-board').hidden = false; $('my-handle').textContent = store.handle; renderBoard(); }
$('start-board').addEventListener('click', openBoard);
$('over-board').addEventListener('click', openBoard);
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => {
  boardScope = t.dataset.scope;
  document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
  renderBoard();
});
$('reroll').addEventListener('click', async () => {
  store.handle = randomHandle(); saveStore(store);
  $('my-handle').textContent = store.handle;
  await board?.rename(store.handle);
  renderBoard();
});

let boardTicket = 0;
async function renderBoard() {
  const ticket = ++boardTicket;
  const status = board.status;
  const list = $('board-rows');
  $('board-status').textContent = status === 'loading' ? 'Loading…' : status === 'slow' ? 'Can’t reach the leaderboard yet.' : status === 'error' ? 'The leaderboard isn’t available right now.' : '';
  if (status !== 'ready') return;
  const out = await board.rows(boardScope);
  if (ticket !== boardTicket) return;
  list.textContent = '';
  const add = (e, label) => {
    const li = document.createElement('li');
    if (e.uid === board.uid) li.className = 'me';
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = label;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = e.handle;
    const ok = document.createElement('span'); ok.className = 'ok'; ok.textContent = '✓'; ok.title = 'Checked by replay'; nm.append(ok);
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = e.s;
    li.append(rk, nm, sc); list.append(li);
  };
  for (const e of out.rows) add(e, `#${e.rank}`);
  if (out.mine && !out.rows.some((e) => e.uid === out.mine.uid)) add(out.mine, '…');
  const viewOnly = 'View only. Ask the owner for Contributor access to post scores.';
  $('board-status').textContent = !out.rows.length ? (board.canWrite ? 'No scores yet. Be the first.' : `No scores yet. ${viewOnly}`) : !board.canWrite ? viewOnly : '';
}

// A short field guide, drawn with the same art as the game.
function guideIcon(draw) {
  const c = document.createElement('canvas'); c.width = 68; c.height = 68;
  const g = c.getContext('2d'); g.scale(2, 2); draw(g); return c;
}
function guideRow(list, icon, title, text) {
  const li = document.createElement('li');
  const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = title; const s = document.createElement('span'); s.textContent = text;
  d.append(b, s); li.append(icon, d); list.append(li);
}
function buildGuide() {
  const basics = $('guide-basics'), aliens = $('guide-aliens'), powers = $('guide-powers');
  guideRow(basics, guideIcon((g) => drawBot(g, 17, 18, 8, { t: 1 })), 'You', 'The last survivor. Slide your thumb left and right to thread the gaps. Skim a gap edge for a graze bonus. Pause any time with ❚❚ (or P).');
  guideRow(basics, guideIcon((g) => drawCrew(g, 17, 17, 8, { kind: 'best', t: 1 })), 'The crew', 'Your past runs come back as ghosts, flying your old route: your best run (gold, the captain) and your last flight (blue). They visit for a while, then drift away. A touch costs a suit cell; slide off that ghost so it cannot touch you again.');
  guideRow(basics, guideIcon((g) => drawIcon(g, 'heal', 17, 17, 9, '#ff4d5e')), 'Suit cells', 'You have three (a 4th once you are good, see below). Wreckage ends the run at once; ghosts and alien shots cost a cell.');
  guideRow(basics, guideIcon((g) => drawIcon(g, 'shield', 17, 17, 9, '#9fe6ff')), 'The better you do, the tougher it gets', 'Your best score on a board decides what the crew can do, and what your bot gets:\nunder 700: the crew only watch\n700: the captain can bite, briefly · you start with a Shield\n1,500: the captain longer, your last flight briefly · you slide faster\n2,500: the whole crew · a 4th suit cell\nThe start screen shows where you are.');
  guideRow(aliens, guideIcon((g) => { g.translate(17, 27); g.scale(0.55, 0.55); drawAlien(g, 0, 0, { t: 1, kind: 'hammer' }); }), 'Alien snails', 'They sit on the wreckage and shake red before they fire. Shots are slower than you can slide. When the crew are away something else is always after you: a nest of aliens, or a tight patch of red-lit wreckage.');
  const shot = (kind) => guideIcon((g) => drawShot(g, { kind, r: 0.03, id: 1, mode: 'fly', blast: 0, fuse: 30 }, 17, 17, 340, 0.4));
  guideRow(aliens, shot('hammer'), 'Hammer', 'Thrown straight at where you were.');
  guideRow(aliens, shot('jack'), 'Jacks', 'A fan of three slow spinning jacks. Slip between them.');
  guideRow(aliens, shot('bomb'), 'Bomb', 'Lands, ticks for half a second, then blasts wide. Leave the circle.');
  for (const kind of Object.keys(POWERS)) {
    guideRow(powers, guideIcon((g) => { g.fillStyle = 'rgba(8,14,40,0.9)'; g.beginPath(); g.arc(17, 17, 15, 0, TAU); g.fill(); g.strokeStyle = tierColor(kind); g.lineWidth = 1.5; g.stroke(); drawIcon(g, kind, 17, 17, 8, tierColor(kind)); }),
      `${POWER_NAME[kind]}${POWERS[kind].tier === 3 ? ' (rare)' : ''}`, POWER_HELP[kind]);
  }
}
function openGuide() { renderGoals(); $('sheet-guide').hidden = false; }
$('guide-btn').addEventListener('click', openGuide);
$('start-guide').addEventListener('click', openGuide);

// ---------- hearts and chips ----------

const heartEls = [...document.querySelectorAll('#hearts svg')];
let heartsMax = HEARTS, heartsShown = -1;
// n cells left out of max (a 4th cell is an upgrade, so the 4th heart only shows when you have it)
function setHearts(n, max = HEARTS) {
  if (n === heartsShown && max === heartsMax) return;
  heartsShown = n; heartsMax = max;
  heartEls.forEach((el, i) => { el.toggleAttribute('hidden', i >= max); el.classList.toggle('lost', i >= n); }); // svg has no .hidden property
}

let chipKind = null;
function paintChip(canvasId, kind) {
  const c = $(canvasId), g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 48, 48); g.scale(2, 2);
  g.fillStyle = 'rgba(8,14,40,0.9)'; g.beginPath(); g.arc(12, 12, 11, 0, TAU); g.fill(); g.strokeStyle = tierColor(kind); g.lineWidth = 1.2; g.stroke();
  drawIcon(g, kind, 12, 12, 6, tierColor(kind));
}
function setChips(r) {
  const power = r?.power && r.powerLeft > 0 ? r.power : null;
  $('chip-power').hidden = !power;
  if (power) {
    if (chipKind !== power) { chipKind = power; paintChip('chip-power-icon', power); $('chip-power-name').textContent = POWER_NAME[power]; }
    $('chip-power-fill').style.width = `${Math.min(100, (100 * r.powerLeft) / POWERS[power].ticks)}%`;
  } else chipKind = null;
  const sh = r && r.bubble > 0;
  if ($('chip-shield').hidden === sh) { $('chip-shield').hidden = !sh; if (sh) paintChip('chip-shield-icon', 'shield'); }
  if (sh) $('chip-shield-fill').style.width = `${Math.min(100, (100 * r.bubble) / (r.bubbleMax || BUBBLE_TICKS))}%`; // against this bubble's own length
}

// ---------- effects ----------

function burst(x, y, color, n, speed = 220) {
  if (reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 40 + Math.random() * speed;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, color });
  }
}
const say = (text, color = PAL.ink, dy = -34) => floaters.push({ x: sx(run.x), y: sy(PY) + dy, text, color, life: 1 });

function handleEvents(events) {
  for (const e of events) {
    if (e === 'pass') { bump = 1; sound.pass(); }
    else if (e === 'graze') { sound.graze(); navigator.vibrate?.(8); say('graze', PAL.led, -26); burst(sx(run.x), sy(PY), PAL.led, 6); }
    else if (e === 'hurt') { shake = Math.max(shake, 0.7); flash = { c: '255,77,94', a: 0.45 }; navigator.vibrate?.(40); sound.hurt(); say('−1 suit cell', PAL.warn); burst(sx(run.x), sy(PY), '#ff8a96', 14); }
    else if (e === 'absorb') { sound.absorb(); flash = { c: '120,220,255', a: 0.25 }; say('absorbed', '#9fe6ff'); burst(sx(run.x), sy(PY), '#9fe6ff', 16); }
    else if (e === 'bubble') { sound.power(); say('SHIELD', '#9fe6ff'); }
    else if (e === 'heal') { sound.heal(); say('REPAIR', PAL.warn); burst(sx(run.x), sy(PY), '#ff8a96', 10); }
    else if (e.startsWith('power:')) { const k = e.slice(6); sound.power(); say(POWER_NAME[k].toUpperCase(), tierColor(k)); burst(sx(run.x), sy(PY), tierColor(k), 14); }
    else if (e === 'join') { if (crewHere(run, run.pt).length) { sound.join(); const hunters = crewHere(run, run.pt).filter((x) => crewMayHurtAt(run.crewLevel, x.i, 0)); say(!hunters.length ? 'THE CREW IS WATCHING' : hunters.every((x) => x.i === 0) ? 'THE CAPTAIN FINDS YOU' : 'THE CREW FINDS YOU', PAL.crew, -52); } }
    else if (e === 'leave') {
      if (crewHere(run, run.pt - 1).length) say('the crew drifts away', PAL.muted, -52);
      // announce what comes next, so a nest or a tight patch never arrives unannounced
      const ended = run.track.windows.filter((w) => w.end <= run.pt).at(-1);
      if (ended) say(ended.after === 'tough' ? 'TIGHT WRECKAGE AHEAD' : 'ALIEN NEST AHEAD', ended.after === 'tough' ? PAL.danger : PAL.alien, -84);
    }
    else if (e === 'fire') sound.fire();
    else if (e === 'boom') {
      sound.boom(); shake = Math.max(shake, 0.35);
      for (const s of run.shots) if (s.kind === 'bomb' && s.mode === 'blast' && s.blast === BLAST_TICKS) burst(sx(s.x), sy(PY), '#ffb060', 18);
    }
  }
}

// ---------- drawing ----------

function drawGame(dt) {
  const t = clock;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.save();
  if (shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
  const D = run ? run.D : 0;
  const pw = run?.power ?? null;
  drawSpace(ctx, cssW, cssH, stars, D * scale + t * 6, t, seed);

  // wreckage plates, with a gap list that Wide gaps stretches. When Wide gaps starts or ends the plates
  // fade over WIDEN_FADE seconds instead of switching in one frame.
  widenBlend = Math.max(0, Math.min(1, widenBlend + (pw === 'widen' ? 1 : -1) * dt / WIDEN_FADE));
  const k = scale / 400;
  const platesOf = (b, mult) => { // the solid stretches, exactly as the rules see them with this widening
    const out = []; let from = 0;
    for (const [a0, z0] of openings(b, mult)) { const a = Math.max(0, a0), z = Math.min(1, z0); if (a > from) out.push([from, a]); from = Math.max(from, z); }
    if (from < 1) out.push([from, 1]);
    return out;
  };
  const first = run ? Math.max(0, run.next - 2) : 0;
  for (let i = first; run && i < first + 18; i++) { // no wreckage on the start screen
    const b = track.bar(i);
    const yb = D - b.d, y = sy(yb);
    if (y < -60) break;
    if (y > cssH + 60) continue;
    const h = BAR_T * scale;
    const wide = widenBlend > 0 ? platesOf(b, WIDEN_MULT) : null;
    if (widenBlend < 1) { ctx.save(); ctx.globalAlpha = 1 - widenBlend; for (const [a, z] of platesOf(b, 1)) drawGirder(ctx, sx(a), sx(z), y, h, t, b.tough); ctx.restore(); }
    if (wide) for (const [a, z] of wide) drawGirder(ctx, sx(a), sx(z), y, h, t, b.tough);
    const sn = track.snail(i);
    if (sn) {
      // the plate the alien was placed on (normal gaps), and its footprint kept on it
      const [sa, sz] = snailPlate(b, sn.x);
      const fit = Math.min(1, (sz - sa) / (ALIEN_FOOT_L + ALIEN_FOOT_R));
      const ax = Math.max(sa + ALIEN_FOOT_L * fit, Math.min(sz - ALIEN_FOOT_R * fit, sn.x));
      // Wide gaps can open the stretch under it: show that plate faintly (no hazard caps), so it never floats
      if (wide && !wide.some(([a, z]) => a <= sa + 1e-9 && z >= sz - 1e-9)) {
        ctx.save(); ctx.globalAlpha = 0.35 * widenBlend; drawGirder(ctx, sx(sa), sx(sz), y, h, t, b.tough, true); ctx.restore();
      }
      const fireY = PY - FIRE_DIST;
      const tele = yb < fireY ? Math.max(0, Math.min(1, (yb - (fireY - TELEGRAPH_DIST)) / TELEGRAPH_DIST)) : 0;
      const recoil = yb >= fireY && yb < fireY + 0.15 ? 1 - (yb - fireY) / 0.15 : 0;
      ctx.save(); ctx.translate(sx(ax), y - h / 2); ctx.scale(k * fit, k * fit);
      drawAlien(ctx, 0, 0, { t, kind: sn.kind, tele, recoil, look: run ? Math.max(-1, Math.min(1, (run.x - sn.x) * 3)) : 0 });
      ctx.restore();
    }
  }

  // friendly crew spirits carrying helpers (missed ones drift on and fade instead of vanishing)
  for (let i = missed.length - 1; i >= 0; i--) {
    const m = missed[i]; m.life -= dt;
    if (m.life <= 0 || !run) { missed.splice(i, 1); continue; }
    ctx.save(); ctx.globalAlpha = m.life / MISSED_FADE; drawFriend(ctx, sx(m.f.x), sy(D - m.f.d), PR * scale, m.f.kind, t); ctx.restore();
  }
  if (run) for (let j = run.nf; j < run.nf + 3; j++) {
    const f = track.friend(j), y = sy(D - f.d);
    if (y < -70) break;
    if (y > cssH + 70) continue;
    drawFriend(ctx, sx(f.x), y, PR * scale, f.kind, t);
  }

  // alien shots
  if (run) for (const s of run.shots) { // shots that missed fade out instead of vanishing (they are dropped at PY + 0.4)
    ctx.save(); if (s.kind !== 'bomb') ctx.globalAlpha = Math.max(0, Math.min(1, (PY + 0.4 - s.y) / 0.12));
    drawShot(ctx, s, sx(s.x), sy(s.y), scale, t); ctx.restore();
  }

  // Foresight: the safe route through the next bars, and where each shot is going to land
  if (run && pw === 'foresight' && state !== 'over') {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,255,190,0.8)'; ctx.fillStyle = 'rgba(120,255,190,0.25)'; ctx.lineWidth = 2;
    for (let i = run.next; i < run.next + 4; i++) {
      const b = track.bar(i), y = sy(D - b.d);
      if (y < 0) break;
      ctx.beginPath(); ctx.arc(sx(b.c), y, 8 * k + 3, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,110,110,0.85)'; ctx.setLineDash([4, 4]);
    for (const s of run.shots) {
      if (s.kind === 'bomb' && s.mode !== 'fly') continue;
      const dt = (PY - s.y) / s.vy;
      if (dt < 0) continue;
      const lx = s.x + s.vx * dt;
      // the area your body must not touch, like the bomb's fuse ring
      ctx.beginPath(); ctx.arc(sx(lx), sy(PY), (s.kind === 'bomb' ? BLAST_R : s.r) * scale, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // the dead crew: your earlier runs
  const tick = run ? run.tick : 1;
  const list = run ? run.ghosts : ghosts;
  const px = (g, n) => { const a = ghostX(g, n), b = ghostX(g, n - 1); return a === null || b === null ? 0 : (a - b) * scale * 60; };
  list.forEach((g, gi) => {
    if (!run) return;                                  // on the start screen nobody is out here yet
    const gx = ghostX(g, run.pt);
    if (gx === null) { // its run ended: fade out where it was last seen, instead of vanishing
      const lg = lastGhost[gi];
      if (lg && clock - lg.t < GHOST_FADE) drawCrew(ctx, sx(lg.x), sy(PY), PR * scale, { t, kind: g.kind, armed: false, shattered: 0, vx: 0, near: false, fade: lg.fade * (1 - (clock - lg.t) / GHOST_FADE) });
      return;
    }
    const ph = ghostPhase(track, list.length, gi, run.pt);
    const armed = ph.armed && ghostCanHit(run, gi) && run.shield === 0 && run.invuln === 0 && pw !== 'exorcise'; // glows only when it can really hurt you
    if (!ph.visible) { lastGhost[gi] = null; return; } // this one is not visiting right now
    lastGhost[gi] = { x: gx, t: clock, fade: (pw === 'exorcise' ? 0.22 : 1) * ph.fade };
    const shat = run && run.shatteredUntil[gi] > tick ? (run.shatteredUntil[gi] - tick) / SHATTER_TICKS : 0;
    drawCrew(ctx, sx(gx), sy(PY), PR * scale, {
      t, kind: g.kind, armed, shattered: shat, vx: px(g, run.pt),
      near: armed && Math.abs(gx - run.x) < 0.14, fade: (pw === 'exorcise' ? 0.22 : 1) * ph.fade,
    });
    if (pw === 'foresight') { // where this crew member will be as the wreckage arrives
      ctx.save();
      for (let n = 8; n <= 96; n += 8) {
        const fx = ghostX(g, run.pt + n);
        if (fx === null || !ghostPhase(track, list.length, gi, run.pt + n).visible) break; // only while it is visiting
        const y = sy(PY) - n * speedAt(D) * TICK * scale;
        ctx.globalAlpha = 0.55 * (1 - n / 110); ctx.fillStyle = g.kind === 'best' ? PAL.captain : PAL.crew;
        ctx.beginPath(); ctx.arc(sx(fx), y, 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  });

  // you
  if (run && state !== 'over') {
    const n = run.xs.length;
    const vx = n > 1 ? ((run.xs[n - 1] - run.xs[n - 2]) / 65535) * scale * 60 : 0;
    const dead = state === 'dying';
    if (dead) ctx.globalAlpha = Math.max(0, 1 - (clock - (overAt - 0.7)) / 0.45);
    if (pw === 'nitro' && !reduced) { // speed streaks
      ctx.save(); ctx.strokeStyle = 'rgba(255,190,120,0.35)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) { const x = ((i * 53 + t * 700) % cssW), y = (i * 97 + t * 500) % cssH; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 26); ctx.stroke(); }
      ctx.restore();
    }
    if (pw === 'exorcise') { ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(t * 8)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(run.x), sy(PY), PR * scale * (2.4 + 0.4 * Math.sin(t * 6)), 0, TAU); ctx.stroke(); ctx.restore(); }
    if (pw === 'gold' && !reduced) { ctx.save(); ctx.fillStyle = PAL.captain; for (let i = 0; i < 4; i++) { const a = t * 3 + i * 1.6; ctx.globalAlpha = 0.8; ctx.fillRect(sx(run.x) + Math.cos(a) * 22 - 1.5, sy(PY) + Math.sin(a * 1.3) * 16 - 1.5, 3, 3); } ctx.restore(); }
    if (pw === 'shrink') { ctx.save(); ctx.strokeStyle = 'rgba(160,240,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(run.x), sy(PY), PR * scale * 1.9, 0, TAU); ctx.stroke(); ctx.restore(); } // easy to find while small
    drawBot(ctx, sx(run.x), sy(PY), PR * scale, {
      t, vx, power: pw, bubble: run.bubble, blink: run.shield > 0 || run.invuln > 0, scared: run.shield > 0, dead,
      scale: pw === 'shrink' ? SHRINK_MULT : 1,
    });
    ctx.globalAlpha = 1;
  } else if (state === 'ready' || state === 'boot') {
    drawBot(ctx, sx(0.5), sy(PY), PR * scale, { t, vx: 0 });
  }

  // particles and floating words
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = '600 13px "DM Mono", monospace'; ctx.textAlign = 'center';
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt; if (f.life <= 0) { floaters.splice(i, 1); continue; }
    f.y -= 34 * dt; ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = f.color;
    // long text shrinks to fit the screen, and is kept inside it
    let w = ctx.measureText(f.text).width;
    if (w > cssW - 16) { ctx.font = `600 ${Math.max(9, (13 * (cssW - 16)) / w)}px "DM Mono", monospace`; w = ctx.measureText(f.text).width; }
    ctx.fillText(f.text, Math.max(8 + w / 2, Math.min(cssW - 8 - w / 2, f.x)), f.y);
    ctx.font = '600 13px "DM Mono", monospace';
  }
  ctx.globalAlpha = 1;
  if (pw === 'slowmo') { ctx.fillStyle = 'rgba(90,140,255,0.10)'; ctx.fillRect(-20, -20, cssW + 40, cssH + 40); }
  if (flash.a > 0.01) { ctx.fillStyle = `rgba(${flash.c},${flash.a})`; ctx.fillRect(-20, -20, cssW + 40, cssH + 40); flash.a *= Math.pow(0.02, dt); }
  ctx.restore();
}

// What is after you right now, so there is always something to read on screen.
function threatLabel(r) {
  const ph = r.track.phaseAtTick(r.pt);
  if (ph.kind === 'early') return 'aliens ahead';
  if (ph.kind === 'patch') return ph.patch === 'tough' ? 'tight wreckage' : 'alien nest';
  const g = crewHere(r, r.pt);
  if (!g.length) return 'the crew is quiet';
  const may = (x) => crewMayHurtAt(r.crewLevel, x.i, x.into); // the level rule (not a passing shatter)
  const hunting = g.filter((x) => x.armed && may(x));
  if (!hunting.length) return g.some((x) => !x.armed && x.into <= JOIN_GRACE && may(x)) ? 'the crew is waking' : 'the crew is watching';
  if (r.shield > 0 || r.invuln > 0 || r.power === 'exorcise') return "you're safe for now"; // a safe window, Repair's safety, Exorcise
  return hunting.every((x) => x.i === 0) ? 'the captain is after you' : 'the crew is after you';
}

// The crew members actually out here at schedule time pt (visiting, and their run reached this far).
function crewHere(r, pt) {
  return r.ghosts.map((g, i) => ({ g, i, ...ghostPhase(r.track, r.ghosts.length, i, pt) })).filter((x) => x.visible && ghostX(x.g, pt) !== null);
}

// ---------- main loop ----------

function frame(ts) {
  requestAnimationFrame(frame); // first, so one bad frame can never freeze the game
  const dt = Math.min(0.1, (ts - (last || ts)) / 1000);
  last = ts; clock += dt;
  if (state === 'intro') {
    introT += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawIntro(ctx, cssW, cssH, introT, stars);
    $('caption').textContent = captionAt(introT);
    if (introT >= INTRO_LENGTH) endIntro();
  } else {
    if (state === 'playing') {
      if (tickPause() || sheetOpen()) acc = 0; else acc += dt; // paused, or reading the guide: the run stands still
      while (acc >= TICK && run.alive) {
        if (keyDir) target = Math.min(1, Math.max(0, target + keyDir * 1.6 * TICK));
        handleEvents(step(run, target));
        acc -= TICK;
      }
      if (run.nf > lastNf) { // helpers that went past: fade the ones you did not catch
        const caught = run.friends - lastFriends;
        if (caught === 0) for (let j = lastNf; j < run.nf; j++) missed.push({ f: track.friend(j), life: MISSED_FADE });
        lastNf = run.nf; lastFriends = run.friends;
      }
      $('score').textContent = run.score;
      setHearts(run.hearts, maxHearts(run)); setChips(run);
      if (run.power !== lastMood) { lastMood = run.power; sound.mood(run.power); }
      $('status').textContent = threatLabel(run);
      checkGoals();
      setRunButtons(run.alive);
      if (!run.alive) endRun();
    } else if (state === 'dying' && clock >= overAt) { setChips(null); showOver(); }
    shake = Math.max(0, shake - dt * 2.2);
    if (bump > 0) { bump = Math.max(0, bump - dt * 6); $('score').classList.toggle('bump', bump > 0.4); }
    drawGame(dt);
  }
}

// ---------- boot ----------

new ResizeObserver(layout).observe(stage);
layout();
buildGuide();
$('sound').setAttribute('aria-pressed', String(store.sound !== false));
if (!store.introSeen && !reduced) startIntro(); else showReady();
requestAnimationFrame(frame);

// The leaderboard exists only where the page has a shared database.
connect().then((conn) => {
  if (!conn) return;
  board = createBoard(conn, { today: dailySeed, getHandle: () => store.handle });
  board.start();
  board.onChange(() => { if (!$('sheet-board').hidden) renderBoard(); });
  $('start-board').hidden = false; $('over-board').hidden = false;
});

if (dbg) window.__echoes = {
  get state() { return state; }, get run() { return run; }, get track() { return track; }, get board() { return board; },
  sound: () => sound.state(), steer: (x) => { target = x; }, start: (x) => startRun(x), seed: () => seed, skipIntro: () => endIntro(), introAt: (t) => { introT = t; },
};

// ---------- the Android app (Capacitor) ----------
// The back button closes a sheet, pauses or resumes a run, skips the intro, or leaves the app.
// Leaving the app mid-run pauses it. In a browser none of this exists and nothing happens.
const capApp = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.registerPlugin('App') : null;
if (capApp) {
  capApp.addListener('backButton', () => {
    if (sheetOpen()) closeSheets();
    else if (state === 'playing') (paused ? resumeRun() : pauseRun());
    else if (state === 'intro') endIntro();
    else capApp.exitApp();
  });
  capApp.addListener('pause', () => pauseRun());
}
