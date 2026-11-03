// Zero-dependency static server for local play: `npm start`, then open http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
const port = +(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  if (/^\/(node_modules|test|scripts|\.git)\b/.test(path)) { res.writeHead(404).end('Not found'); return; }
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(join(root, path)));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Echoes on http://localhost:${port}`));
