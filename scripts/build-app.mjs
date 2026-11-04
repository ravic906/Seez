// Builds the web bundle the Android app ships (Capacitor's webDir): the standalone page and src/.
// Usage: node scripts/build-app.mjs   (writes app/www, then run `npx cap sync android`)
import { rm, mkdir, copyFile, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'app', 'www');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'src'), { recursive: true });
// The app also loads Capacitor's runtime (no bundler here) so the game can reach the App plugin,
// and uses the bundled fonts in app/fonts instead of Google Fonts, so it never calls out and works offline.
let html = (await readFile(join(root, 'index.html'), 'utf8'))
  .replace('<script type="module" src="src/main.js"></script>', '<script src="capacitor.js"></script>\n<script type="module" src="src/main.js"></script>')
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">');
if (!html.includes('capacitor.js') || !html.includes('fonts/fonts.css')) throw new Error('could not adapt index.html for the app');
if (/https?:\/\//.test(html)) throw new Error('the app page still loads something from the internet');
await cp(join(root, 'app', 'fonts'), join(out, 'fonts'), { recursive: true });
await writeFile(join(out, 'index.html'), html);
await copyFile(join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), join(out, 'capacitor.js'));
for (const f of await readdir(join(root, 'src'))) await copyFile(join(root, 'src', f), join(out, 'src', f));
console.log(`Wrote ${out}`);
