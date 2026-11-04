// Renders the Android launcher icons, splash screens and Play Store graphics from the game's own
// drawing code (src/art.js), so they always match the game.
// Usage: node scripts/make-icons.mjs   (needs Playwright's Chromium; writes into android/ and store/)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const res = join(root, 'android/app/src/main/res');
const BG = '#0a0f2a';

// A tiny static server: the page imports src/art.js as an ES module, which file:// does not allow.
const server = createServer(async (req, rsp) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { rsp.writeHead(200, { 'content-type': 'text/html' }); rsp.end('<!doctype html><body style="margin:0"></body>'); return; }
  try {
    const body = await readFile(join(root, path));
    rsp.writeHead(200, { 'content-type': extname(path) === '.js' ? 'text/javascript' : 'application/octet-stream' });
    rsp.end(body);
  } catch { rsp.writeHead(404); rsp.end(); }
});
await new Promise((ok) => server.listen(0, ok));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.goto(base + '/');
await page.addScriptTag({ type: 'module', content: `
  import { drawBot } from '/src/art.js';
  // kind: 'fg' adaptive foreground (transparent), 'square' legacy icon, 'round' round icon,
  // 'splash' a splash screen, 'feature' the Play Store feature graphic
  window.render = (kind, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const s = Math.min(w, h);
    const sky = () => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#02030a'); gr.addColorStop(0.6, '${BG}'); gr.addColorStop(1, '#1a1040');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      let a = 7;
      const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < Math.round(w * h / 900); i++) {
        g.globalAlpha = 0.25 + rnd() * 0.65; g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.4 + rnd() * Math.max(1, s / 260), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    };
    if (kind === 'square' || kind === 'round') {
      g.save(); g.beginPath();
      if (kind === 'round') g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      else g.roundRect(0, 0, w, h, w * 0.18);
      g.clip(); sky(); g.restore();
    } else if (kind !== 'fg') sky();
    // the rescue bot: icons keep it inside the adaptive icon's safe zone (66 of 108)
    const r = kind === 'fg' ? s * 0.15 : kind === 'splash' ? s * 0.11 : kind === 'feature' ? s * 0.16 : s * 0.2;
    const cy = kind === 'splash' ? h * 0.44 : kind === 'feature' ? h * 0.5 : h * 0.55;
    const cx = kind === 'feature' ? w * 0.26 : w / 2;
    drawBot(g, cx, cy, r, { t: 1.2 });
    if (kind === 'splash' || kind === 'feature') {
      g.fillStyle = '#e8ecff'; g.textAlign = kind === 'feature' ? 'left' : 'center'; g.textBaseline = 'middle';
      const fs = kind === 'feature' ? h * 0.2 : s * 0.075;
      g.font = '700 ' + fs + 'px ui-monospace, monospace';
      const tx = kind === 'feature' ? w * 0.42 : w / 2, ty = kind === 'feature' ? h * 0.42 : cy + r * 3.2;
      g.fillText('ECHOES', tx, ty);
      if (kind === 'feature') {
        g.fillStyle = '#9aa6d8'; g.font = '500 ' + (h * 0.06) + 'px ui-monospace, monospace';
        g.fillText('Dodge the wreckage.', tx, h * 0.6);
        g.fillText('Outrun your own ghosts.', tx, h * 0.69);
      }
    }
    return c.toDataURL('image/png').split(',')[1];
  };
` });
await page.waitForFunction(() => typeof window.render === 'function');

const out = async (file, kind, w, h) => {
  const b64 = await page.evaluate(([k, a, b]) => window.render(k, a, b), [kind, w, h]);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, Buffer.from(b64, 'base64'));
};

const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  await out(join(res, `mipmap-${d}/ic_launcher.png`), 'square', 48 * k, 48 * k);
  await out(join(res, `mipmap-${d}/ic_launcher_round.png`), 'round', 48 * k, 48 * k);
  await out(join(res, `mipmap-${d}/ic_launcher_foreground.png`), 'fg', 108 * k, 108 * k);
  await out(join(res, `drawable-port-${d}/splash.png`), 'splash', 320 * k, 480 * k);
  await out(join(res, `drawable-land-${d}/splash.png`), 'splash', 480 * k, 320 * k);
}
await out(join(res, 'drawable/splash.png'), 'splash', 480, 320);
await out(join(root, 'store/icon-512.png'), 'store', 512, 512); // full square: Play applies its own mask
await out(join(root, 'store/feature-1024x500.png'), 'feature', 1024, 500);

await browser.close();
server.close();
console.log('icons, splash screens and store graphics written');
