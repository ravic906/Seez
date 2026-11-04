// One-off: downloads the two Google Fonts the page uses into app/fonts/ so the Android app never
// contacts Google and works offline. Both fonts are under the SIL Open Font License (OFL.txt).
// Usage: node scripts/fetch-fonts.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dir = join(root, 'app', 'fonts');
const CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Mono:wght@400;500&display=swap';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'; // asks for woff2
await mkdir(dir, { recursive: true });
let css = await (await fetch(CSS, { headers: { 'user-agent': UA } })).text();
const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g))];
for (const [i, u] of urls.entries()) {
  const name = `f${i}.woff2`;
  await writeFile(join(dir, name), Buffer.from(await (await fetch(u)).arrayBuffer()));
  css = css.split(u).join(name); // relative to fonts.css, which sits next to the font files
}
await writeFile(join(dir, 'fonts.css'), css);
console.log(`saved ${urls.length} font files and fonts.css`);
