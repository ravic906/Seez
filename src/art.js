// Echoes: all the drawing. Space, wreckage, the rescue bot, the dead crew, friendly crew spirits,
// aliens and their weapons. Everything is vector shapes on a canvas; nothing is loaded.
import { mulberry32, POWERS } from './core.js';

const TAU = Math.PI * 2;

export const PAL = {
  space: '#04060f', deep: '#0a1030', ink: '#e8eeff', muted: '#8f9bc0',
  steel: '#242c4a', steelHi: '#4b5a8f', amber: '#ffb23a', hazard: '#13172b',
  bot: '#eef4ff', botShade: '#9db3e6', visor: '#0b1226', led: '#55e6ff', flame: '#ff9d3a',
  captain: '#ffd25a', crew: '#8fd0ff', friend: '#5ff0c0', violet: '#b58cff',
  alien: '#9be35f', alienDark: '#4b8f2c', shell: '#c04be0', danger: '#ff4d5e',
};

// ---------- space ----------

export function makeStars(seed = 7, n = 140) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => ({ x: rng(), y: rng(), z: 0.15 + rng() * 0.85, tw: rng() * TAU, hue: rng() < 0.15 ? 1 : 0 }));
}

export function drawSpace(ctx, w, h, stars, scroll, t, sceneSeed = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#02030a'); g.addColorStop(0.55, PAL.space); g.addColorStop(1, PAL.deep);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  drawScenery(ctx, w, h, sceneSeed, scroll, t);
  for (const s of stars) {
    const y = (s.y * h + scroll * s.z * 0.6) % h;
    const a = 0.35 + 0.65 * s.z * (0.7 + 0.3 * Math.sin(t * 2 + s.tw));
    ctx.fillStyle = s.hue ? `rgba(255,214,170,${a})` : `rgba(210,225,255,${a})`;
    const sz = 0.6 + s.z * 1.6;
    ctx.fillRect(s.x * w, y, sz, sz * (1 + s.z * 2.2)); // longer streaks for the closer stars
  }
}

// ---------- scenery: things you pass on the way ----------
// Every item is a pure function of (board seed, index), placed along the direction of travel.
// Far things (small z) drift past slowly, near things faster, so the view is never the same twice.

const SCENE_SPACING = 320;
const SCENE_KINDS = ['planet', 'planet', 'planet', 'planet', 'moon', 'comet', 'asteroids', 'nebula', 'galaxy', 'sun', 'station', 'pulsar', 'binary'];
const sceneCache = new Map();

function sceneryItem(seed, i) {
  const key = `${seed}:${i}`;
  let it = sceneCache.get(key);
  if (it) return it;
  const r = mulberry32((seed * 2654435761 + i * 40503 + 12345) >>> 0);
  const kind = SCENE_KINDS[Math.floor(r() * SCENE_KINDS.length)];
  const z = 0.06 + r() * 0.34;
  it = {
    i, kind, z, x: 0.06 + r() * 0.88, s: i * SCENE_SPACING + (r() - 0.5) * 140, k: r(), k2: r(), k3: r(),
    pal: Math.floor(r() * 6), rings: r() < 0.38, tilt: (r() - 0.5) * 0.7, dir: r() < 0.5 ? -1 : 1, hue: Math.floor(r() * 360),
  };
  if (sceneCache.size > 400) sceneCache.clear();
  sceneCache.set(key, it);
  return it;
}

// body colours: [light, mid, dark, glow, features?]
const PLANETS = [
  { name: 'gas', l: '#f2d9a6', m: '#c98d4e', d: '#4a2b16', glow: '255,190,110', bands: ['#b96a34', '#e8c48a', '#8a4f2a'] },
  { name: 'ice', l: '#c9f4ff', m: '#58b8d8', d: '#0f3350', glow: '120,220,255', bands: ['#7fd0ea', '#3a93bd'] },
  { name: 'earth', l: '#9ad0ff', m: '#2c6fb8', d: '#0a1f45', glow: '120,180,255', land: '#4f9a54' },
  { name: 'lava', l: '#ff9a5a', m: '#a02a14', d: '#2a0805', glow: '255,90,40', cracks: '#ffd37a' },
  { name: 'rock', l: '#d8c4a4', m: '#8a7254', d: '#2c2218', glow: '210,190,150', craters: true },
  { name: 'alien', l: '#e2b8ff', m: '#7a3fb0', d: '#220c40', glow: '190,120,255', bands: ['#a66be0', '#5a2a90'] },
];

function drawPlanet(ctx, x, y, R, it, t) {
  const P = PLANETS[it.pal];
  const r = mulberry32((it.i * 7919 + 3) >>> 0);
  ctx.save(); ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.9);
  halo.addColorStop(0, `rgba(${P.glow},0.22)`); halo.addColorStop(1, `rgba(${P.glow},0)`);
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, R * 1.9, 0, TAU); ctx.fill();
  if (it.rings) { ctx.save(); ctx.rotate(it.tilt); ctx.strokeStyle = `rgba(${P.glow},0.45)`; ctx.lineWidth = Math.max(2, R * 0.16); ctx.beginPath(); ctx.ellipse(0, 0, R * 1.75, R * 0.42, 0, Math.PI, TAU); ctx.stroke(); ctx.restore(); } // back of the ring
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
  const g = ctx.createRadialGradient(-R * 0.4, -R * 0.4, R * 0.1, 0, 0, R * 1.15);
  g.addColorStop(0, P.l); g.addColorStop(0.55, P.m); g.addColorStop(1, P.d);
  ctx.fillStyle = g; ctx.fillRect(-R, -R, R * 2, R * 2);
  if (P.bands) { ctx.rotate(it.tilt * 0.5); for (let k = 0; k < 7; k++) { ctx.globalAlpha = 0.35; ctx.fillStyle = P.bands[k % P.bands.length]; ctx.fillRect(-R, -R + (k + r() * 0.4) * (R * 2 / 7), R * 2, R * 0.18 + r() * R * 0.12); } ctx.rotate(-it.tilt * 0.5); }
  if (P.land) { ctx.globalAlpha = 0.85; ctx.fillStyle = P.land; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse((r() - 0.5) * R, (r() - 0.5) * R * 1.2, R * (0.2 + r() * 0.28), R * (0.12 + r() * 0.2), r() * 3, 0, TAU); ctx.fill(); } ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -R * 0.9, R * 0.6, R * 0.2, 0, 0, TAU); ctx.fill(); }
  if (P.cracks) { ctx.globalAlpha = 0.7; ctx.strokeStyle = P.cracks; ctx.lineWidth = Math.max(1, R * 0.05); for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo((r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6); ctx.lineTo((r() - 0.5) * R * 1.6, (r() - 0.5) * R * 1.6); ctx.stroke(); } }
  if (P.craters) { ctx.globalAlpha = 0.4; ctx.fillStyle = P.d; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc((r() - 0.5) * R * 1.5, (r() - 0.5) * R * 1.5, R * (0.07 + r() * 0.12), 0, TAU); ctx.fill(); } }
  ctx.globalAlpha = 1;
  const sh = ctx.createRadialGradient(-R * 0.55, -R * 0.55, R * 0.6, R * 0.2, R * 0.2, R * 1.4); // night side
  sh.addColorStop(0, 'rgba(0,0,10,0)'); sh.addColorStop(1, 'rgba(0,0,12,0.72)');
  ctx.fillStyle = sh; ctx.fillRect(-R, -R, R * 2, R * 2);
  ctx.restore();
  if (it.rings) { ctx.save(); ctx.rotate(it.tilt); ctx.strokeStyle = `rgba(${P.glow},0.7)`; ctx.lineWidth = Math.max(2, R * 0.16); ctx.beginPath(); ctx.ellipse(0, 0, R * 1.75, R * 0.42, 0, 0, Math.PI); ctx.stroke(); ctx.restore(); } // front of the ring
  ctx.restore();
}

function drawScenery(ctx, w, h, seed, scroll, t) {
  const sc = scroll + 5000; // start with things already in view
  const first = Math.max(0, Math.floor((sc - 16000) / SCENE_SPACING)), last = Math.ceil((sc + 1600) / SCENE_SPACING);
  const vis = [];
  for (let i = first; i <= last; i++) {
    const it = sceneryItem(seed, i);
    const y = (sc - it.s) * it.z + h * 0.2;
    if (y > -320 && y < h + 320) vis.push([it, y]);
  }
  vis.sort((a, b) => a[0].z - b[0].z); // far things first
  for (const [it, y] of vis) {
    const x = it.x * w, depth = 0.55 + it.z * 1.5, a = (0.5 + it.z * 1.2) * 0.72; // nearer = bigger and brighter, all kept dim so the wreckage stays readable
    ctx.save(); ctx.globalAlpha = Math.min(1, a);
    switch (it.kind) {
      case 'planet': drawPlanet(ctx, x, y, (16 + it.k * 46) * depth, it, t); break;
      case 'moon': {
        const R = (7 + it.k * 14) * depth;
        const g = ctx.createRadialGradient(x - R * 0.4, y - R * 0.4, 1, x, y, R * 1.1);
        g.addColorStop(0, '#e8e6e0'); g.addColorStop(1, '#2a2a34');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(40,40,55,0.45)'; ctx.beginPath(); ctx.arc(x + R * 0.25, y + R * 0.1, R * 0.28, 0, TAU); ctx.arc(x - R * 0.35, y + R * 0.4, R * 0.18, 0, TAU); ctx.fill();
        break;
      }
      case 'comet': {
        const ang = it.dir > 0 ? 0.9 : Math.PI - 0.9, vx = Math.cos(ang), vy = Math.sin(ang);
        const hx = x + ((t * 22 * it.dir) % 80), hy = y + ((t * 16) % 60), L = 80 + it.k * 90;
        const tail = ctx.createLinearGradient(hx, hy, hx - vx * L, hy - vy * L);
        tail.addColorStop(0, 'rgba(190,235,255,0.6)'); tail.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = tail; ctx.beginPath(); ctx.moveTo(hx + vy * 5, hy - vx * 5); ctx.lineTo(hx - vy * 5, hy + vx * 5); ctx.lineTo(hx - vx * L, hy - vy * L); ctx.fill();
        ctx.strokeStyle = 'rgba(160,220,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + 4, hy); ctx.lineTo(hx - vx * L * 0.8 + 10, hy - vy * L * 0.8); ctx.stroke();
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 12); hg.addColorStop(0, '#fff'); hg.addColorStop(1, 'rgba(180,230,255,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 12, 0, TAU); ctx.fill();
        break;
      }
      case 'asteroids': {
        const r = mulberry32(it.i * 131 + 5);
        for (let k = 0; k < 11; k++) {
          const ax = x + (r() - 0.5) * 150 * depth, ay = y + (r() - 0.5) * 60 * depth, sz = (2 + r() * 6) * depth;
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(t * (r() - 0.5) * 1.2 + k);
          ctx.fillStyle = r() < 0.5 ? '#6a6f8a' : '#8a7a6a';
          ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.4); ctx.lineTo(sz * 0.8, -sz * 0.8); ctx.lineTo(sz, sz * 0.5); ctx.lineTo(-sz * 0.4, sz); ctx.fill(); ctx.restore();
        }
        break;
      }
      case 'nebula': {
        ctx.globalCompositeOperation = 'lighter';
        const r = mulberry32(it.i * 977 + 1);
        for (let k = 0; k < 4; k++) {
          const nx = x + (r() - 0.5) * 140, ny = y + (r() - 0.5) * 120, NR = (90 + r() * 120) * depth;
          const hue = (it.hue + k * 28) % 360, gg = ctx.createRadialGradient(nx, ny, 4, nx, ny, NR);
          gg.addColorStop(0, `hsla(${hue},80%,60%,0.09)`); gg.addColorStop(1, `hsla(${hue},80%,50%,0)`);
          ctx.fillStyle = gg; ctx.fillRect(nx - NR, ny - NR, NR * 2, NR * 2);
        }
        break;
      }
      case 'galaxy': {
        const r = mulberry32(it.i * 313 + 9);
        ctx.translate(x, y); ctx.rotate(it.tilt + t * 0.02); ctx.scale(1, 0.5);
        const gg = ctx.createRadialGradient(0, 0, 1, 0, 0, 40 * depth); gg.addColorStop(0, 'rgba(255,240,210,0.9)'); gg.addColorStop(1, 'rgba(255,200,150,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 40 * depth, 0, TAU); ctx.fill();
        for (let k = 0; k < 90; k++) { const arm = k % 2 ? 0 : Math.PI, ang = k * 0.22 + arm, rad = (3 + k * 0.5) * depth; ctx.fillStyle = `rgba(200,215,255,${0.7 * (1 - k / 100)})`; ctx.fillRect(Math.cos(ang) * rad + (r() - 0.5) * 4, Math.sin(ang) * rad + (r() - 0.5) * 4, 1.4, 1.4); }
        break;
      }
      case 'sun': {
        const R = (10 + it.k * 10) * depth;
        const gg = ctx.createRadialGradient(x, y, 0, x, y, R * 4); gg.addColorStop(0, 'rgba(255,245,210,0.95)'); gg.addColorStop(0.2, 'rgba(255,200,120,0.5)'); gg.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, R * 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,240,210,0.5)'; ctx.lineWidth = 1.5;
        for (const [dx, dy] of [[1, 0], [0, 1]]) { ctx.beginPath(); ctx.moveTo(x - dx * R * 5, y - dy * R * 5); ctx.lineTo(x + dx * R * 5, y + dy * R * 5); ctx.stroke(); }
        break;
      }
      case 'station': { // a derelict, dark and tumbling slowly
        ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.2 + it.k * 6) * 0.3 + it.tilt); const s = 16 * depth;
        ctx.fillStyle = '#2f3858'; ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
        ctx.fillStyle = '#242c4a'; ctx.fillRect(-s * 2.2, -s * 0.12, s * 1.7, s * 0.24); ctx.fillRect(s * 0.5, -s * 0.12, s * 1.7, s * 0.24);
        ctx.fillStyle = '#3a4a80'; ctx.fillRect(-s * 2.1, -s * 0.5, s * 0.9, s * 1.0); ctx.fillRect(s * 1.2, -s * 0.5, s * 0.9, s * 1.0);
        ctx.fillStyle = Math.sin(t * 3 + it.i) > 0.6 ? '#ff4d5e' : '#3a1020'; ctx.beginPath(); ctx.arc(0, -s * 0.6, s * 0.1, 0, TAU); ctx.fill();
        break;
      }
      case 'pulsar': {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6 + it.i), ang = t * 1.6 + it.k * 6;
        ctx.globalCompositeOperation = 'lighter';
        for (const sgn of [1, -1]) {
          const bx = Math.cos(ang) * 150 * depth * sgn, by = Math.sin(ang) * 150 * depth * sgn;
          const bg = ctx.createLinearGradient(x, y, x + bx, y + by); bg.addColorStop(0, `rgba(150,220,255,${0.55 * pulse + 0.2})`); bg.addColorStop(1, 'rgba(150,220,255,0)');
          ctx.strokeStyle = bg; ctx.lineWidth = 5 * depth; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bx, y + by); ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.2 * depth, 0, TAU); ctx.fill();
        break;
      }
      case 'binary': {
        const ang = t * 0.8 + it.k * 6, d = 14 * depth;
        for (const [sg, col] of [[1, '255,170,110'], [-1, '150,190,255']]) {
          const bx = x + Math.cos(ang) * d * sg, by = y + Math.sin(ang) * d * 0.6 * sg, R = (5 + (sg > 0 ? 3 : 0)) * depth;
          const bg = ctx.createRadialGradient(bx, by, 0, bx, by, R * 3.2); bg.addColorStop(0, `rgba(${col},0.95)`); bg.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, R * 3.2, 0, TAU); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }
}

// ---------- wreckage (the bars) ----------

export function drawGirder(ctx, x0, x1, y, h, t, hot = false) {
  const w = x1 - x0;
  if (w < 3) return;
  ctx.save();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, '#39446f'); g.addColorStop(0.5, PAL.steel); g.addColorStop(1, '#171d36');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(x0, y - h / 2, w, h, 3); ctx.fill();
  ctx.fillStyle = PAL.steelHi; ctx.globalAlpha = 0.7; ctx.fillRect(x0 + 2, y - h / 2 + 1, Math.max(0, w - 4), 1.5);
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
  for (let x = x0 + 22; x < x1 - 6; x += 26) ctx.fillRect(x, y - h / 2 + 3, 1, h - 6); // panel seams
  ctx.globalAlpha = 0.8; ctx.fillStyle = '#7d8fd0';
  for (let x = x0 + 9; x < x1 - 4; x += 26) { ctx.beginPath(); ctx.arc(x, y, 1.1, 0, TAU); ctx.fill(); } // rivets
  // hazard stripes where the plate was torn off, and a warning light
  const cap = Math.min(14, w / 3);
  ctx.globalAlpha = 0.9; ctx.save(); ctx.beginPath(); ctx.rect(x0, y - h / 2, cap, h); ctx.rect(x1 - cap, y - h / 2, cap, h); ctx.clip();
  ctx.fillStyle = hot ? '#ff5a4d' : PAL.amber; ctx.fillRect(x0 - 2, y - h / 2, w + 4, h);
  ctx.fillStyle = PAL.hazard;
  for (let k = -h; k < w + h; k += 8) { ctx.beginPath(); ctx.moveTo(x0 + k, y + h / 2); ctx.lineTo(x0 + k + 4, y + h / 2); ctx.lineTo(x0 + k + 4 + h, y - h / 2); ctx.lineTo(x0 + k + h, y - h / 2); ctx.fill(); }
  ctx.restore();
  if (w > 50) {
    const on = Math.sin(t * 5 + x0) > 0.2;
    ctx.globalAlpha = on ? 1 : 0.25; ctx.fillStyle = PAL.danger;
    ctx.beginPath(); ctx.arc(x0 + w / 2, y, 2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------- small icons (powers, hearts) ----------

export function drawIcon(ctx, kind, cx, cy, s, color = '#fff') {
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.4, s * 0.16); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const arrow = (dir) => { ctx.beginPath(); ctx.moveTo(dir * s * 0.1, 0); ctx.lineTo(dir * s * 0.85, 0); ctx.moveTo(dir * s * 0.55, -s * 0.28); ctx.lineTo(dir * s * 0.85, 0); ctx.lineTo(dir * s * 0.55, s * 0.28); ctx.stroke(); };
  switch (kind) {
    case 'nitro': ctx.beginPath(); ctx.moveTo(s * 0.2, -s); ctx.lineTo(-s * 0.55, s * 0.12); ctx.lineTo(-s * 0.02, s * 0.12); ctx.lineTo(-s * 0.25, s); ctx.lineTo(s * 0.6, -s * 0.18); ctx.lineTo(s * 0.05, -s * 0.18); ctx.closePath(); ctx.fill(); break;
    case 'shield': ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(-s * 0.28, -s * 0.3, s * 0.3, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke(); break;
    case 'slowmo': ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, 0); ctx.lineTo(s * 0.4, s * 0.25); ctx.stroke(); break;
    case 'exorcise': ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, TAU); ctx.fill(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55); ctx.lineTo(Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.95); ctx.stroke(); } break;
    case 'widen': ctx.save(); ctx.translate(-s * 0.05, 0); arrow(-1); ctx.restore(); ctx.save(); ctx.translate(s * 0.05, 0); arrow(1); ctx.restore(); break;
    case 'shrink': ctx.save(); ctx.translate(-s * 0.95, 0); arrow(1); ctx.restore(); ctx.save(); ctx.translate(s * 0.95, 0); arrow(-1); ctx.restore(); break;
    case 'gold': ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.fill(); ctx.fillStyle = '#5a3d00'; ctx.font = `800 ${Math.round(s * 1.15)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('3', 0, s * 0.06); break;
    case 'foresight': ctx.beginPath(); ctx.ellipse(0, 0, s * 0.95, s * 0.55, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, TAU); ctx.fill(); break;
    case 'heal': ctx.beginPath(); ctx.moveTo(0, s * 0.85); ctx.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.6, -s * 0.95, 0, -s * 0.3); ctx.bezierCurveTo(s * 0.6, -s * 0.95, s * 1.3, -s * 0.1, 0, s * 0.85); ctx.fill(); break;
    case 'phase': ctx.setLineDash([s * 0.28, s * 0.22]); ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, TAU); ctx.fill(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export const POWER_NAME = { nitro: 'Nitro', shield: 'Shield', slowmo: 'Slow-mo', exorcise: 'Exorcise', widen: 'Wide gaps', shrink: 'Shrink', gold: 'Gold rush', foresight: 'Foresight', heal: 'Repair', phase: 'Phase' };
export const POWER_HELP = {
  nitro: 'Faster sideways and double points for 4 s.',
  shield: 'Absorbs the next hit. Lasts up to 8 s.',
  slowmo: 'The wreckage and the aliens\' shots move at half speed for 5 s.',
  exorcise: 'Crew ghosts and alien shots pass through you for 4 s.',
  widen: 'Every gap grows wider for 5 s.',
  shrink: 'You get smaller for 6 s, so tight gaps fit.',
  gold: 'Triple points for 5 s.',
  foresight: 'For 8 s, shows the safe route, where shots will land and where the crew will be.',
  heal: 'Restores a suit cell. At full, 5 s of safety.',
  phase: 'Fly straight through wreckage and shots for 2 s.',
};
export const tierColor = (kind) => ({ 1: PAL.friend, 2: PAL.violet, 3: PAL.captain }[POWERS[kind].tier]);

// ---------- you: the rescue bot ----------
// o: { t, vx (px/s), thrust, power, blink (flicker while safe), bubble, scared, dead, scale }

export function drawBot(ctx, x, y, r, o = {}) {
  const { t = 0, vx = 0, power = null, bubble = 0, blink = false, scared = false, dead = false, scale = 1 } = o;
  const R = r * 1.25 * scale;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 3.2) * r * 0.08);
  ctx.rotate(Math.max(-0.35, Math.min(0.35, vx * 0.0005)));
  if (blink && Math.floor(t * 14) % 2) ctx.globalAlpha = 0.35;
  if (power === 'phase') ctx.globalAlpha *= 0.55;
  // thrusters: a main flame, and a puff on the side we are pushing away from
  const flame = R * (0.9 + Math.min(1.2, Math.abs(vx) * 0.0012) + (power === 'nitro' ? 1.1 : 0)) * (0.85 + 0.15 * Math.sin(t * 50));
  const fg = ctx.createLinearGradient(0, R * 0.8, 0, R * 0.8 + flame);
  fg.addColorStop(0, power === 'nitro' ? '#fff3c8' : '#ffe2a0'); fg.addColorStop(0.5, power === 'nitro' ? '#ff7b2e' : PAL.flame); fg.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-R * 0.38, R * 0.8); ctx.lineTo(R * 0.38, R * 0.8); ctx.lineTo(0, R * 0.8 + flame); ctx.fill();
  if (Math.abs(vx) > 30) {
    const dir = Math.sign(vx);
    ctx.fillStyle = 'rgba(180,230,255,0.7)'; ctx.beginPath(); ctx.ellipse(-dir * R * 1.05, R * 0.1, R * 0.35 * (0.6 + Math.random() * 0.4), R * 0.14, 0, 0, TAU); ctx.fill();
  }
  // antenna
  ctx.strokeStyle = PAL.botShade; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -R * 0.85); ctx.lineTo(0, -R * 1.3); ctx.stroke();
  ctx.fillStyle = Math.sin(t * 6) > 0 ? PAL.led : '#2a7a88'; ctx.beginPath(); ctx.arc(0, -R * 1.34, R * 0.14, 0, TAU); ctx.fill();
  // body
  const bg = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, PAL.botShade);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(-R, -R * 0.85, R * 2, R * 1.75, R * 0.8); ctx.fill();
  ctx.strokeStyle = 'rgba(20,30,70,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
  // visor with eyes that look where we are heading
  ctx.fillStyle = PAL.visor; ctx.beginPath(); ctx.roundRect(-R * 0.78, -R * 0.55, R * 1.56, R * 0.85, R * 0.4); ctx.fill();
  const look = Math.max(-1, Math.min(1, vx * 0.004)) * R * 0.14;
  const wink = Math.floor(t * 0.9) % 5 === 0 && (t * 0.9) % 1 < 0.1;
  ctx.fillStyle = dead ? PAL.danger : PAL.led; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
  for (const ex of [-R * 0.3, R * 0.3]) {
    if (dead) { ctx.beginPath(); ctx.moveTo(ex - 3 + look, -R * 0.3); ctx.lineTo(ex + 3 + look, -R * 0.08); ctx.moveTo(ex + 3 + look, -R * 0.3); ctx.lineTo(ex - 3 + look, -R * 0.08); ctx.stroke(); }
    else if (wink) ctx.fillRect(ex - 3 + look, -R * 0.2, 6, 1.6);
    else { ctx.beginPath(); ctx.ellipse(ex + look, -R * 0.2, scared ? 4.2 : 3, scared ? 5 : 4, 0, 0, TAU); ctx.fill(); }
  }
  // shield bubble
  if (bubble > 0) {
    const low = bubble < 120 && Math.floor(t * 10) % 2;
    ctx.globalAlpha = (low ? 0.3 : 0.9) * (ctx.globalAlpha || 1);
    ctx.strokeStyle = 'rgba(120,220,255,0.95)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.75, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(100,200,255,0.14)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 1.5, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
  }
  ctx.restore();
}

// ---------- the dead crew (your past runs) ----------
// o: { t, kind: 'best'|'recent', armed, near, shattered (0..1 while re-forming), vx, fade }

export function drawCrew(ctx, x, y, r, o = {}) {
  const { t = 0, kind = 'recent', armed = true, near = false, shattered = 0, vx = 0, fade = 1 } = o;
  const col = kind === 'best' ? PAL.captain : PAL.crew;
  const R = r * 1.15;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2.4 + x) * r * 0.1);
  ctx.rotate(Math.max(-0.3, Math.min(0.3, vx * 0.0004)));
  if (shattered > 0) {
    // broken apart: a faint ring and a few drifting shards until it re-forms
    ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(0, 0, R * (1.1 + (1 - shattered) * 0.8), 0, TAU); ctx.stroke();
    ctx.restore(); return;
  }
  ctx.globalAlpha = (armed ? 0.82 : 0.4) * fade;
  // ectoplasm tail instead of legs
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-R * 0.78, 0);
  ctx.lineTo(-R * 0.78, R * 1.15);
  for (let i = 0; i <= 4; i++) { const px = -R * 0.78 + (R * 1.56 * i) / 4; ctx.quadraticCurveTo(px - R * 0.2, R * (1.55 + 0.25 * Math.sin(t * 7 + i * 1.8 + x * 0.1)), px, R * 1.15); }
  ctx.lineTo(R * 0.78, 0); ctx.arc(0, 0, R * 0.78, 0, Math.PI, true); ctx.fill();
  // helmet glass, hollow, with two faint lights
  ctx.globalAlpha *= 1.0; ctx.fillStyle = 'rgba(6,10,28,0.85)';
  ctx.beginPath(); ctx.ellipse(0, -R * 0.05, R * 0.56, R * 0.48, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = col; ctx.globalAlpha = (armed ? 0.95 : 0.5) * fade;
  ctx.beginPath(); ctx.arc(-R * 0.2, -R * 0.1, R * 0.1, 0, TAU); ctx.arc(R * 0.2, -R * 0.1, R * 0.1, 0, TAU); ctx.fill();
  if (kind === 'best') { // the captain keeps a crown
    ctx.beginPath(); ctx.moveTo(-R * 0.45, -R * 0.78); ctx.lineTo(-R * 0.45, -R * 1.15); ctx.lineTo(-R * 0.2, -R * 0.92); ctx.lineTo(0, -R * 1.25); ctx.lineTo(R * 0.2, -R * 0.92); ctx.lineTo(R * 0.45, -R * 1.15); ctx.lineTo(R * 0.45, -R * 0.78); ctx.closePath(); ctx.fill();
  }
  // outline: dashed until awake, a red warning pulse when it is close to you
  ctx.globalAlpha = (armed ? 0.5 : 0.85) * fade; ctx.strokeStyle = near && armed ? PAL.danger : col; ctx.lineWidth = near && armed ? 2.5 : 1.5;
  if (!armed) ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(0, 0, R * (near && armed ? 1.55 + 0.15 * Math.sin(t * 14) : 1.4), 0, TAU); ctx.stroke();
  ctx.restore();
}

// ---------- friendly crew spirit: carries a power ----------

export function drawFriend(ctx, x, y, r, kind, t = 0) {
  const R = r * 1.25;
  const tc = tierColor(kind);
  ctx.save(); ctx.translate(x, y + Math.sin(t * 2.8 + x * 3) * r * 0.2);
  // glow in the tier colour, so a better power is easy to spot
  const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 2.4);
  g.addColorStop(0, tc + '88'); g.addColorStop(1, tc + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 2.4, 0, TAU); ctx.fill();
  // ghostly crewmate body, smiling
  ctx.globalAlpha = 0.92; ctx.fillStyle = '#d9fff2';
  ctx.beginPath(); ctx.moveTo(-R * 0.8, 0); ctx.lineTo(-R * 0.8, R * 1.0);
  for (let i = 0; i <= 3; i++) { const px = -R * 0.8 + (R * 1.6 * i) / 3; ctx.quadraticCurveTo(px - R * 0.22, R * (1.4 + 0.18 * Math.sin(t * 6 + i * 2)), px, R * 1.0); }
  ctx.lineTo(R * 0.8, 0); ctx.arc(0, 0, R * 0.8, 0, Math.PI, true); ctx.fill();
  ctx.fillStyle = 'rgba(8,24,40,0.85)'; ctx.beginPath(); ctx.ellipse(0, -R * 0.05, R * 0.55, R * 0.42, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = PAL.friend; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, R * 0.02, R * 0.26, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); // smile
  ctx.fillStyle = PAL.friend; ctx.beginPath(); ctx.arc(-R * 0.2, -R * 0.14, R * 0.08, 0, TAU); ctx.arc(R * 0.2, -R * 0.14, R * 0.08, 0, TAU); ctx.fill();
  // halo
  ctx.globalAlpha = 0.95; ctx.strokeStyle = PAL.captain; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -R * 0.95, R * 0.5, R * 0.14, 0, 0, TAU); ctx.stroke();
  // the capsule it is offering
  ctx.globalAlpha = 1;
  const cy = -R * 2.0 + Math.sin(t * 4) * 2;
  ctx.fillStyle = 'rgba(8,14,40,0.9)'; ctx.strokeStyle = tc; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, cy, R * 0.82, 0, TAU); ctx.fill(); ctx.stroke();
  drawIcon(ctx, kind, 0, cy, R * 0.5, tc);
  ctx.restore();
}

// ---------- aliens (the snails) ----------
// o: { t, kind, tele (0..1 while charging), recoil (0..1 just after firing), look (-1..1) }

export function drawAlien(ctx, x, y, o = {}) {
  const { t = 0, kind = 'hammer', tele = 0, recoil = 0, look = 0 } = o;
  const shake = tele > 0 ? Math.sin(t * 60) * 1.6 * tele : 0;
  ctx.save(); ctx.translate(x + shake, y);
  ctx.scale(1 - recoil * 0.12, 1 + recoil * 0.1);
  // slime trail
  ctx.fillStyle = 'rgba(155,227,95,0.25)'; ctx.beginPath(); ctx.ellipse(-4, 1, 34, 3, 0, 0, TAU); ctx.fill();
  // slug body
  const bg = ctx.createLinearGradient(0, -14, 0, 4);
  bg.addColorStop(0, '#b8f27c'); bg.addColorStop(1, PAL.alienDark);
  ctx.fillStyle = bg; ctx.beginPath();
  ctx.moveTo(-22, 2); ctx.quadraticCurveTo(-26, -6, -12, -8); ctx.quadraticCurveTo(10, -10, 24, -6); ctx.quadraticCurveTo(30, -2, 26, 2); ctx.closePath(); ctx.fill();
  // eye stalks that follow you
  for (const sx of [14, 22]) {
    ctx.strokeStyle = PAL.alienDark; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(sx, -6); ctx.quadraticCurveTo(sx + 3, -14, sx + 4 + look * 2, -19 + Math.sin(t * 3 + sx) * 1.5); ctx.stroke();
    const ey = -20 + Math.sin(t * 3 + sx) * 1.5;
    ctx.fillStyle = '#f4ffd8'; ctx.beginPath(); ctx.arc(sx + 4 + look * 2, ey, 3.8, 0, TAU); ctx.fill();
    ctx.fillStyle = tele > 0 ? '#ff2a4d' : '#d4142f'; ctx.beginPath(); ctx.arc(sx + 4.8 + look * 3, ey, 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1d3a0c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 0.5, ey - 5.6); ctx.lineTo(sx + 8, ey - 2.4); ctx.stroke(); // angry brow
  }
  // mouth cannon, with teeth
  ctx.fillStyle = tele > 0 ? PAL.danger : '#2d1450'; ctx.beginPath(); ctx.ellipse(27, -2, 3.5, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f4ffd8'; for (const ty of [-5, -2, 1]) { ctx.beginPath(); ctx.moveTo(25.5, ty); ctx.lineTo(29.5, ty + 1); ctx.lineTo(25.5, ty + 2.2); ctx.fill(); }
  // spiral shell: it glows hot while the alien charges
  const sg = ctx.createRadialGradient(-6, -16, 2, -6, -12, 16);
  sg.addColorStop(0, tele > 0 ? '#ff9a8a' : '#c76be0'); sg.addColorStop(1, tele > 0 ? '#c0182f' : '#6a1f86');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(-6, -13, 13, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(40,0,70,0.6)'; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let a = 0; a < 11; a += 0.2) { const rr = 1 + a * 1.05; ctx.lineTo(-6 + Math.cos(a) * rr, -13 + Math.sin(a) * rr); }
  ctx.stroke();
  ctx.fillStyle = tele > 0 ? '#ff6a5a' : '#8f2aa8'; // spikes along the top of the shell
  for (let a = -2.7; a <= -0.4; a += 0.45) { ctx.beginPath(); ctx.moveTo(-6 + Math.cos(a) * 11, -13 + Math.sin(a) * 11); ctx.lineTo(-6 + Math.cos(a) * 18, -13 + Math.sin(a) * 18); ctx.lineTo(-6 + Math.cos(a + 0.22) * 11.5, -13 + Math.sin(a + 0.22) * 11.5); ctx.fill(); }
  if (tele > 0) { ctx.globalAlpha = 0.5 + 0.5 * tele; ctx.strokeStyle = PAL.danger; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-6, -13, 15 + tele * 5, 0, TAU); ctx.stroke(); }
  ctx.restore();
  // what it is about to throw
  if (tele > 0.15) {
    ctx.save(); ctx.globalAlpha = Math.min(1, tele * 1.4); ctx.translate(x, y - 40 - tele * 6);
    ctx.fillStyle = 'rgba(8,10,30,0.85)'; ctx.strokeStyle = PAL.danger; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke();
    drawShotIcon(ctx, kind, 0, 0, 6.5, t);
    ctx.restore();
  }
}

function drawShotIcon(ctx, kind, cx, cy, s, t) {
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = '#dfe6ff'; ctx.fillStyle = '#dfe6ff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  if (kind === 'hammer') { ctx.rotate(-0.6); ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, -s * 0.5); ctx.stroke(); ctx.fillRect(-s * 0.7, -s * 0.95, s * 1.4, s * 0.6); }
  else if (kind === 'jacks' || kind === 'jack') { for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s); ctx.lineTo(-Math.cos(a) * s, -Math.sin(a) * s); ctx.stroke(); } }
  else { ctx.fillStyle = '#1b1b2e'; ctx.beginPath(); ctx.arc(0, s * 0.15, s * 0.75, 0, TAU); ctx.fill(); ctx.stroke(); ctx.strokeStyle = PAL.amber; ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.5); ctx.quadraticCurveTo(s * 0.6, -s * 0.95, s * 0.9, -s * 0.8); ctx.stroke(); }
  ctx.restore();
}

// ---------- shots ----------
// pos in pixels. s: a shot from the core; px: pixels per world unit.

export function drawShot(ctx, s, x, y, px, t, blastFrac = 1) {
  const r = s.r * px;
  ctx.save(); ctx.translate(x, y);
  if (s.kind === 'bomb') {
    if (s.mode === 'blast') {
      const k = 1 - s.blast / 8;
      const R = 0.13 * px * (0.5 + k * 0.7);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,220,0.95)'); g.addColorStop(0.5, 'rgba(255,150,40,0.7)'); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    } else {
      if (s.mode === 'fuse') { // a pulsing blast-radius warning that closes in as the fuse burns down
        const k = s.fuse / 30;
        ctx.strokeStyle = `rgba(255,77,94,${0.35 + 0.5 * (1 - k)})`; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(0, 0, 0.13 * px, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,77,94,${0.06 + 0.16 * (1 - k)})`; ctx.fill();
      }
      ctx.fillStyle = '#16162a'; ctx.strokeStyle = '#8fa0e0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.22, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAL.amber; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.8); ctx.quadraticCurveTo(r * 0.7, -r * 1.4, r * 1.1, -r * 1.2); ctx.stroke();
      ctx.fillStyle = Math.floor(t * 20) % 2 ? '#fff6a8' : PAL.amber; ctx.beginPath(); ctx.arc(r * 1.1, -r * 1.2, 2.2, 0, TAU); ctx.fill();
    }
  } else {
    ctx.rotate(t * (s.kind === 'hammer' ? 14 : 9) + s.id);
    if (s.kind === 'hammer') {
      ctx.strokeStyle = '#c9b38a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, r * 1.2); ctx.lineTo(0, -r * 0.4); ctx.stroke();
      ctx.fillStyle = '#b6c0e8'; ctx.beginPath(); ctx.roundRect(-r * 0.95, -r * 1.05, r * 1.9, r * 0.8, 2); ctx.fill();
      ctx.fillStyle = PAL.danger; ctx.fillRect(-r * 0.95, -r * 0.7, r * 1.9, 2);
    } else {
      ctx.strokeStyle = '#e6ecff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); ctx.lineTo(-Math.cos(a) * r * 1.15, -Math.sin(a) * r * 1.15); ctx.stroke(); }
      ctx.fillStyle = '#e6ecff';
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, 2.4, 0, TAU); ctx.fill(); }
    }
  }
  ctx.restore();
}
