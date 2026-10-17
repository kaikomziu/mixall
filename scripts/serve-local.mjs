// scripts/serve-local.mjs
// build/ を GitHub Pages と同じ形（/mixall/ 配下・存在しないURLは404.html）でローカル配信する確認用サーバー。
//   node scripts/serve-local.mjs [port] [base]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || 5173);
const base = String(process.argv[3] || '/mixall').replace(/\/$/, '');
const root = fileURLToPath(new URL('../build', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.apk': 'application/vnd.android.package-archive' };

async function tryFile(path) {
  try { const info = await stat(path); return info.isFile() ? path : (info.isDirectory() ? tryFile(join(path, 'index.html')) : null); } catch { return null; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = null;
  if (url.pathname === base) { res.writeHead(301, { Location: `${base}/` }); res.end(); return; }
  if (url.pathname.startsWith(`${base}/`)) {
    const rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^([/\\])+/, '');
    if (!rel.startsWith('..')) {
      const full = join(root, rel);
      file = await tryFile(full);
      if (!file && !rel.endsWith('/') && !extname(rel)) {
        try { if ((await stat(full)).isDirectory()) { res.writeHead(301, { Location: `${url.pathname}/${url.search}` }); res.end(); return; } } catch { /* not dir */ }
      }
    }
  }
  const status = file ? 200 : 404;
  file = file || join(root, '404.html');
  res.writeHead(status, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(await readFile(file));
}).listen(port, () => console.log(`http://localhost:${port}${base}/`));
