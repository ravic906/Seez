// The opening scene: the SS Meridian is attacked and destroyed, and the rescue bot escapes.
// A pure function of time, so it can be drawn at any moment, skipped, and replayed.
import { mulberry32 } from './core.js';
import { PAL, drawSpace, drawBot, drawCrew, drawAlien } from './art.js';

export const INTRO_LENGTH = 14;
const CAPTIONS = [
  [0.0, 'Aboard the SS Meridian, 41 crew were flying home.'],
  [3.4, 'Then the aliens found them.'],
  [6.0, 'Nobody made it out.'],
  [9.0, 'Almost nobody.'],
  [11.8, 'Fly the wreckage. The crew will follow you.'],
];
export const captionAt = (t) => CAPTIONS.filter(([s]) => t >= s).at(-1)?.[1] ?? '';

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const lerp = (a, b, t) => a + (b - a) * t;

// Fixed random pieces, made once.
const rng = mulberry32(2026);
const DEBRIS = Array.from({ length: 46 }, () => ({
  u: rng(), v: (rng() - 0.5) * 0.5, vx: (rng() - 0.5) * 240, vy: (rng() - 0.35) * 200, spin: (rng() - 0.5) * 9, s: 3 + rng() * 9, hot: rng() < 0.4,
}));
const BLASTS = Array.from({ length: 12 }, (_, i) => ({ t: 5.5 + i * 0.17 + rng() * 0.1, u: 0.08 + rng() * 0.84, v: (rng() - 0.5) * 0.8, size: 24 + rng() * 38 }));
const WINDOWS = Array.from({ length: 16 }, () => rng());
const SHOTS = [
  { t: 3.5, from: [0.82, 0.08], to: 0.7, kind: 'hammer' },
  { t: 3.9, from: [0.62, 0.04], to: 0.45, kind: 'bomb' },
  { t: 4.3, from: [0.9, 0.16], to: 0.28, kind: 'jacks' },
  { t: 4.7, from: [0.7, 0.1], to: 0.55, kind: 'hammer' },
  { t: 5.0, from: [0.5, 0.06], to: 0.18, kind: 'bomb' },
];

function hull(ctx, cx, cy, L, H, part, jag) {
  // part 'rear' = engines and body, 'front' = bridge and nose. Edges facing the break are jagged.
  const x0 = cx - L / 2, split = cx - L / 2 + L * 0.56;
  ctx.beginPath();
  if (part === 'rear') {
    ctx.moveTo(x0 + H * 0.2, cy - H / 2); ctx.lineTo(split, cy - H / 2);
    const n = 6;
    for (let i = 0; i <= n; i++) ctx.lineTo(split - (jag && i % 2 ? H * 0.12 : 0), cy - H / 2 + (H * i) / n);
    ctx.lineTo(x0 + H * 0.2, cy + H / 2); ctx.quadraticCurveTo(x0, cy + H / 2, x0, cy + H * 0.2); ctx.lineTo(x0, cy - H * 0.2); ctx.quadraticCurveTo(x0, cy - H / 2, x0 + H * 0.2, cy - H / 2);
  } else {
    ctx.moveTo(split, cy - H / 2); ctx.lineTo(cx + L / 2 - H * 0.9, cy - H / 2); ctx.quadraticCurveTo(cx + L / 2, cy - H * 0.15, cx + L / 2, cy);
    ctx.quadraticCurveTo(cx + L / 2, cy + H * 0.15, cx + L / 2 - H * 0.9, cy + H / 2); ctx.lineTo(split, cy + H / 2);
    const n = 6;
    for (let i = n; i >= 0; i--) ctx.lineTo(split + (jag && !(i % 2) ? H * 0.12 : 0), cy - H / 2 + (H * i) / n);
  }
  ctx.closePath();
}

function drawShip(ctx, cx, cy, L, H, o) {
  const { split = 0, lit = 1, glow = 0, t = 0, engines = 1 } = o;
  const split0 = cx - L / 2 + L * 0.56;
  for (const part of ['rear', 'front']) {
    ctx.save();
    const dir = part === 'rear' ? -1 : 1;
    ctx.translate(dir * split * L * 0.16, dir * split * -H * 0.35 * 0 + (part === 'rear' ? split * H * 0.5 : -split * H * 0.3));
    ctx.rotate(dir * split * 0.28);
    const g = ctx.createLinearGradient(0, cy - H / 2, 0, cy + H / 2);
    g.addColorStop(0, '#8d9cc9'); g.addColorStop(0.5, '#56648f'); g.addColorStop(1, '#2a3355');
    ctx.fillStyle = g; hull(ctx, cx, cy, L, H, part, split > 0.01 || glow > 0); ctx.fill();
    if (split > 0.01 || glow > 0) { ctx.strokeStyle = 'rgba(10,14,40,0.7)'; ctx.lineWidth = 2; ctx.stroke(); }
    // panel line and a stripe
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - L / 2 + H * 0.3, cy - H * 0.32); ctx.lineTo(cx + L / 2 - H, cy - H * 0.32); ctx.stroke();
    ctx.fillStyle = PAL.amber; ctx.globalAlpha = 0.8; ctx.fillRect(cx - L / 2 + H * 0.3, cy + H * 0.26, L * 0.5, 3); ctx.globalAlpha = 1;
    // windows
    for (let i = 0; i < WINDOWS.length; i++) {
      const wx = cx - L / 2 + L * (0.07 + i * 0.055);
      const inPart = part === 'rear' ? wx < split0 - H * 0.2 : wx > split0 + H * 0.2;
      if (!inPart) continue;
      const on = WINDOWS[i] < lit;
      ctx.fillStyle = on ? '#ffe8a8' : '#1a2140';
      ctx.fillRect(wx, cy - H * 0.12, H * 0.16, H * 0.2);
    }
    if (part === 'rear') {
      // engines
      for (const ey of [-0.28, 0.28]) {
        ctx.fillStyle = '#1b2240'; ctx.fillRect(cx - L / 2 - H * 0.18, cy + ey * H - H * 0.1, H * 0.2, H * 0.2);
        const f = engines * (0.7 + 0.3 * Math.sin(t * 40 + ey * 9));
        if (f > 0.02) {
          const fg = ctx.createLinearGradient(cx - L / 2 - H * 0.18, 0, cx - L / 2 - H * 0.18 - H * 1.3 * f, 0);
          fg.addColorStop(0, '#fff2c0'); fg.addColorStop(0.4, '#6fb8ff'); fg.addColorStop(1, 'rgba(60,120,255,0)');
          ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(cx - L / 2 - H * 0.18, cy + ey * H - H * 0.09); ctx.lineTo(cx - L / 2 - H * 0.18 - H * 1.3 * f, cy + ey * H); ctx.lineTo(cx - L / 2 - H * 0.18, cy + ey * H + H * 0.09); ctx.fill();
        }
      }
    }
    if (glow > 0) { // fire glowing through the torn edge
      ctx.globalCompositeOperation = 'lighter';
      const x = part === 'rear' ? split0 - H * 0.1 : split0 + H * 0.1;
      const eg = ctx.createRadialGradient(x, cy, 2, x, cy, H * 0.9);
      eg.addColorStop(0, `rgba(255,190,90,${0.8 * glow})`); eg.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = eg; ctx.fillRect(x - H, cy - H, H * 2, H * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}

export function drawIntro(ctx, w, h, t, stars) {
  ctx.save();
  // a little shake while the ship is being torn apart
  const quake = t > 3.4 && t < 9 ? (t < 5.5 ? 0.25 : t < 7.6 ? 1 : Math.max(0, 1 - (t - 7.6) / 1.4)) : 0;
  if (quake) ctx.translate((Math.random() - 0.5) * 9 * quake, (Math.random() - 0.5) * 9 * quake);
  drawSpace(ctx, w, h, stars, t * 70, t);

  const L = w * 0.92, H = w * 0.2;
  const cy = h * 0.36 + Math.sin(t * 0.7) * 3;
  const arrive = ease(t / 3);
  let cx = lerp(-L * 0.35, w * 0.5, arrive);
  const breakT = clamp01((t - 6.0) / 3.2);
  const split = ease(breakT);
  const lit = t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) / 4);
  cx += t > 9 ? (t - 9) * -6 : 0;

  // the aliens, up in the corner, throwing things
  if (t > 2.9 && t < 8.5) {
    const a = ease((t - 2.9) / 0.6) * (1 - ease((t - 7.6) / 0.9));
    for (const [ax, ay, sc] of [[0.78, 0.1, 1.5], [0.42, 0.06, 1.2], [0.9, 0.2, 1.1]]) {
      ctx.save(); ctx.globalAlpha = a; ctx.translate(w * ax, h * ay); ctx.scale(sc, sc);
      drawAlien(ctx, 0, 0, { t, kind: 'hammer', tele: (t % 0.8) < 0.3 ? 0.6 : 0, look: -0.5 });
      ctx.restore();
    }
  }

  drawShip(ctx, cx, cy, L, H, { split, lit, glow: clamp01((t - 5.4) / 1.2) * (1 - clamp01((t - 9) / 2.5)), t, engines: t < 6 ? 1 : Math.max(0, 1 - (t - 6) / 0.8) });

  // shots flying at the hull
  for (const s of SHOTS) {
    const k = clamp01((t - s.t) / 0.75);
    if (k <= 0 || k >= 1) { if (k >= 1 && t - s.t < 1.05) { const f = 1 - (t - s.t - 0.75) / 0.3; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,190,100,${Math.max(0, f)})`; ctx.beginPath(); ctx.arc(cx - L / 2 + L * s.to, cy, 10 + (1 - f) * 22, 0, TAU); ctx.fill(); ctx.restore(); } continue; }
    const sx = w * s.from[0], sy = h * s.from[1], tx = cx - L / 2 + L * s.to, ty = cy;
    const x = lerp(sx, tx, k), y = lerp(sy, ty, k * k);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 12);
    ctx.strokeStyle = s.kind === 'bomb' ? PAL.amber : '#dfe6ff'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    if (s.kind === 'bomb') { ctx.fillStyle = '#16162a'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.stroke(); }
    else if (s.kind === 'hammer') { ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, -4); ctx.stroke(); ctx.fillRect(-7, -9, 14, 6); }
    else for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(-Math.cos(a) * 8, -Math.sin(a) * 8); ctx.stroke(); }
    ctx.restore();
  }

  // explosions along the hull, then flying wreckage
  for (const b of BLASTS) {
    const k = (t - b.t) / 0.9;
    if (k < 0 || k > 1) continue;
    const x = cx - L / 2 + L * b.u, y = cy + b.v * H * 0.5, R = b.size * (0.4 + k * 1.1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 1, x, y, R);
    g.addColorStop(0, `rgba(255,250,220,${1 - k})`); g.addColorStop(0.4, `rgba(255,160,50,${0.8 * (1 - k)})`); g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (t > 6.2) {
    const dt = t - 6.2;
    for (const d of DEBRIS) {
      const x = cx - L / 2 + L * (0.15 + d.u * 0.7) + d.vx * dt, y = cy + d.v * H + d.vy * dt + 30 * dt * dt * 0.3;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.spin * dt);
      ctx.fillStyle = d.hot ? '#ff9a4a' : '#5a6797'; ctx.globalAlpha = d.hot ? Math.max(0.2, 1 - dt / 3) : 1;
      ctx.beginPath(); ctx.moveTo(-d.s, -d.s * 0.4); ctx.lineTo(d.s * 0.9, -d.s * 0.7); ctx.lineTo(d.s * 0.5, d.s * 0.8); ctx.lineTo(-d.s * 0.7, d.s * 0.5); ctx.fill();
      ctx.restore();
    }
  }
  const flash = t > 6.3 && t < 7.1 ? Math.sin(((t - 6.3) / 0.8) * Math.PI) : 0;
  if (flash > 0) { ctx.fillStyle = `rgba(255,245,225,${0.8 * flash})`; ctx.fillRect(-20, -20, w + 40, h + 40); }

  // the crew's ghosts, rising out of the wreck
  if (t > 6.9) {
    for (let i = 0; i < 9; i++) {
      const k = clamp01((t - 6.9 - i * 0.12) / 3.2);
      if (k <= 0) continue;
      const x = cx - L / 2 + L * (0.14 + i * 0.09) + Math.sin(t * 1.3 + i) * 10;
      const y = cy - H * 0.2 - k * h * 0.28;
      drawCrew(ctx, x, y, 9, { t: t + i, kind: i === 0 ? 'best' : 'recent', armed: true, fade: Math.sin(clamp01(k) * Math.PI) * 0.9 });
    }
  }

  // the rescue bot, launching from the tail
  if (t > 8.6) {
    const u = ease((t - 8.6) / 3.0);
    const bx0 = cx - L / 2 + L * 0.1, by0 = cy + H * 0.5;
    const x = lerp(bx0, w * 0.5, u) + Math.sin(u * 7) * (1 - u) * 26;
    const y = lerp(by0, h * 0.74, u);
    const vx = (Math.cos(u * 7) * 26 * 7 * (1 - u)) * 0.5 + (w * 0.5 - bx0) * 0.2 * (1 - u);
    ctx.save(); ctx.globalAlpha = ease((t - 8.6) / 0.4);
    drawBot(ctx, x, y, 12 + u * 4, { t, vx, scared: u < 0.6, scale: 1 });
    ctx.restore();
  }

  // title
  if (t > 11.8) {
    const k = ease((t - 11.8) / 1.2);
    ctx.save(); ctx.globalAlpha = k; ctx.textAlign = 'center'; ctx.fillStyle = PAL.ink;
    ctx.font = `800 ${Math.round(w * 0.2)}px "Bricolage Grotesque", system-ui, sans-serif`;
    ctx.shadowColor = PAL.led; ctx.shadowBlur = 24;
    ctx.fillText('ECHOES', w / 2, h * 0.58 - (1 - k) * 12);
    ctx.restore();
  }
  ctx.restore();
}
