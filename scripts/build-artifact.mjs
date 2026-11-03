// Builds a copy of the game for hosts that supply their own page wrapper.
// Usage: node scripts/build-artifact.mjs <out-dir>
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2];
if (!out) throw new Error('usage: build-artifact.mjs <out-dir>');

let html = await readFile(join(root, 'index.html'), 'utf8');
html = html
  .replace(/<style id="standalone">[\s\S]*?<\/style>\s*/i, '') // the host already pads for safe areas
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?(html|head|body)[^>]*>\s*/gi, '')
  .replace(/<meta (charset|name="viewport")[^>]*>\s*/gi, '');

await mkdir(join(out, 'src'), { recursive: true });
await writeFile(join(out, 'index.html'), html);
for (const f of await readdir(join(root, 'src'))) await copyFile(join(root, 'src', f), join(out, 'src', f));
console.log(`Wrote ${out}`);
