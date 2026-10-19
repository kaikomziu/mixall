// scripts/build-pages.mjs
// public/ を GitHub Pages 用に build/ へ書き出す。
// - サイトは https://<user>.github.io/<repo>/ 配下になるため、"/Ghost" などのサイト内パスにベースを付ける
// - "/.netlify/functions/<name>" を Supabase Edge Function（mixall-api）のURLへ置き換える
// - Netlifyの書き換えルール（_redirects / netlify.toml）の代わりに 404.html でURLを振り分ける
//   node scripts/build-pages.mjs [--base /mixall] [--api https://...] [--site https://...]
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const BASE = String(args.base ?? process.env.MIXALL_BASE ?? '/mixall').replace(/\/$/, '');
const API = String(args.api || process.env.MIXALL_API_BASE || 'https://kifnzvktwbomxthzvvgy.supabase.co/functions/v1/mixall-api').replace(/\/$/, '');
const SITE = String(args.site || process.env.MIXALL_SITE_URL || `https://kaikomziu.github.io${BASE}`).replace(/\/$/, '');
const OUT = args.out || 'build';
// Googleドライブ連携（任意機能）のOAuthクライアントID。公開して問題ない値（秘密ではない）。
const GOOGLE_CLIENT_ID = String(args['google-client-id'] || process.env.MIXALL_GOOGLE_CLIENT_ID || '');

// 出力先の中身だけ消す（フォルダ自体は開いているシェルやエディタが掴んでいることがあるため残す）
mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) rmSync(join(OUT, name), { recursive: true, force: true });
cpSync('public', OUT, { recursive: true });
for (const name of ['_redirects', 'manus-routes.json']) rmSync(join(OUT, name), { force: true });

// サイト直下にある名前（これらで始まる "/..." はサイト内パスとみなす）
const ROOTS = readdirSync('public').filter((name) => !name.startsWith('_')).concat(['ghost', 'r', 'site-view'])
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length);
const ROOT_RE = new RegExp(`(["'\`(])\\/((?:${ROOTS.join('|')})(?=[\\/?#"'\`)]|$))`, 'g');
// パス比較をしている行は、比較相手の文字列を書き換えない（比較側を MixAllBase.path() にする）
const COMPARE_LINE = /MixAllBase\.path\(\)|normalizedPath|mailPath|\bpath ===|\bpath\.startsWith|===\s*['"]\/|!==\s*['"]\//;

function rewriteJs(text) {
  let out = text;
  // 現在パスの比較はベースを除いたパスで行う
  out = out
    .replace(/window\.location\.pathname\.toLowerCase\(\) !== '\/age\.html'/g, "MixAllBase.path().toLowerCase() !== '/age.html'")
    .replace(/const path = window\.location\.pathname\.toLowerCase\(\);/g, 'const path = MixAllBase.path().toLowerCase();')
    .replace(/const path = window\.location\.pathname\.replace\(/g, 'const path = MixAllBase.path().replace(')
    .replace(/location\.pathname === '\/admin' \|\| location\.pathname\.startsWith\('\/admin\/'\)/g, "MixAllBase.path() === '/admin' || MixAllBase.path().startsWith('/admin/')")
    .replace(/window\.location\.pathname\.toLowerCase\(\)\.startsWith\('\/register'\)/g, "MixAllBase.path().toLowerCase().startsWith('/register')")
    .replace(/const mailPath = window\.location\.pathname\./g, 'const mailPath = MixAllBase.path().');
  // 保存データ・入力由来のURLへ移動する箇所はベースを補う
  out = out
    .replace(/location\.href = next\b/g, 'location.href = MixAllBase.fix(next)')
    .replace(/location\.replace\(next\)/g, 'location.replace(MixAllBase.fix(next))')
    .replace(/location\.replace\(target\)/g, 'location.replace(MixAllBase.fix(target))')
    .replace(/location\.href=url;/g, 'location.href=MixAllBase.fix(url);');
  // トップ（"/"）への移動
  out = out
    .replace(/location\.replace\((['"])\/\1\)/g, `location.replace('${BASE}/')`)
    .replace(/location\.href = (['"])\/\1/g, `location.href = '${BASE}/'`)
    .replace(/(['"])\/\?next=/g, `$1${BASE}/?next=`)
    .replace(/params\.get\('next'\) \|\| '\/'/g, `params.get('next') || '${BASE}/'`)
    .replace(/\? candidate : '\/';/g, `? candidate : '${BASE}/';`)
    .replace(/link\('\/', /g, `link('${BASE}/', `);
  out = out.split('\n').map((line) => (COMPARE_LINE.test(line) ? line : line.replace(ROOT_RE, `$1${BASE}/$2`))).join('\n');
  return out;
}

function rewrite(text, ext) {
  let out = text.split('/.netlify/functions/').join(`${API}/`).split("'/api/").join(`'${API}/`);
  out = out.split('https://mix-alls.netlify.app').join(SITE);
  if (ext === '.html') {
    out = out.replace(/(href|src|action|poster|content)="\/"/g, `$1="${BASE}/"`);
    // <script> の中身も含めて JS と同じ規則で書き換える
    out = rewriteJs(out);
    const head = `<script>window.MIXALL_BASE=${JSON.stringify(BASE)};window.MIXALL_API_BASE=${JSON.stringify(API)};window.MIXALL_SITE_URL=${JSON.stringify(SITE)};window.MIXALL_GOOGLE_CLIENT_ID=${JSON.stringify(GOOGLE_CLIENT_ID)};</script>`
      + `<script src="${BASE}/js/mixall-base.js"></script><script src="${BASE}/js/chat-vault.js"></script><script src="${BASE}/js/mixall-ux.js"></script><script src="${BASE}/js/google-drive-sync.js" defer></script>`;
    out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => m + head) : head + out;
    return out;
  }
  if (ext === '.js') return rewriteJs(out);
  if (ext === '.css') return out.replace(/url\((['"]?)\/(?!\/)/g, `url($1${BASE}/`);
  if (ext === '.json' || ext === '.webmanifest') return out.replace(ROOT_RE, `$1${BASE}/$2`).replace(/"(start_url|scope)":\s*"\/"/g, `"$1": "${BASE}/"`);
  return out;
}

const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest']);
const SKIP_JS = new Set(['js/vendor/fflate.min.js', 'js/mixall-base.js', 'js/chat-vault.js', 'js/google-drive-sync.js', 'js/mixall-ux.js']);
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    const ext = extname(name).toLowerCase();
    const rel = relative(OUT, full).replace(/\\/g, '/');
    if (!TEXT.has(ext) || SKIP_JS.has(rel)) continue;
    writeFileSync(full, rewrite(readFileSync(full, 'utf8'), ext));
  }
}
walk(OUT);

// 旧Netlifyの書き換えルールの代わり（存在しないURLは GitHub Pages が 404.html を返す）
const pages = [];
(function list(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) list(full);
    else if (name.endsWith('.html')) pages.push('/' + relative(OUT, full).replace(/\\/g, '/'));
  }
})(OUT);

const router = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MixAll</title>
<script>
(function () {
  var BASE = ${JSON.stringify(BASE)}, API = ${JSON.stringify(API)}, PAGES = ${JSON.stringify(pages)};
  var p = location.pathname; if (BASE && p.indexOf(BASE) === 0) p = p.slice(BASE.length) || '/';
  var q = location.search, h = location.hash, m;
  function go(path, query) { location.replace(BASE + path + (query || '') + h); }
  function withQuery(extra) { return (q ? q + '&' : '?') + extra; }
  var clean = p.replace(/\\/+$/, '') || '/';
  var lower = clean.toLowerCase();
  if ((m = clean.match(/^\\/mail\\/thread\\/([^/]+)$/i))) return go('/Mail/thread.html', withQuery('id=' + m[1]));
  if ((m = lower.match(/^\\/mail\\/(inbox|sent|all|compose)$/))) return go('/Mail/', withQuery('view=' + m[1]));
  if ((m = clean.match(/^\\/ghost\\/@([^/]+)$/i))) return go('/Ghost/profile.html', withQuery('handle=' + m[1]));
  if ((m = clean.match(/^\\/ghost\\/post\\/([^/]+)$/i))) return go('/Ghost/post.html', withQuery('id=' + m[1]));
  if ((m = clean.match(/^\\/r\\/([^/]+)$/))) { location.replace(API + '/tools?action=redirectGet&id=' + encodeURIComponent(decodeURIComponent(m[1]))); return; }
  if ((m = clean.match(/^\\/site-view\\/([^/]+)$/i))) return go('/site-view/', withQuery('slug=' + m[1]));
  if (/^\\/tools(\\/|$)/i.test(clean)) return go('/Tools/', q);
  if (lower === '/create/text') return go('/Create/text.html', q);
  // 大文字小文字だけ違うページ・ディレクトリ（例: /ghost/watch → /Ghost/watch.html）
  for (var i = 0; i < PAGES.length; i++) {
    var page = PAGES[i], lp = page.toLowerCase();
    if (lp === lower || lp === lower + '.html' || lp === lower + '/index.html') return go(page.replace(/index\\.html$/, ''), q);
  }
  go('/', q);
})();
</script></head><body></body></html>`;
writeFileSync(join(OUT, '404.html'), router);

// 貸し出しサイト /site-view/<slug>: Supabaseの関数URLはHTMLを text/plain で返すため、ページ側で描画する
mkdirSync(join(OUT, 'site-view'), { recursive: true });
writeFileSync(join(OUT, 'site-view', 'index.html'), `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MixAllサイト</title>
<meta property="og:image" content="${SITE}/ogp/14-website-creation.jpg?v=20261013-1"></head><body style="margin:0;background:#0f1115;color:#eee;font-family:sans-serif">
<p id="s" style="padding:24px">読み込み中...</p>
<script>
(async function () {
  var slug = new URLSearchParams(location.search).get('slug') || '';
  try {
    var res = await fetch(${JSON.stringify(API)} + '/site-view?slug=' + encodeURIComponent(slug), { cache: 'no-store' });
    var html = await res.text();
    document.open(); document.write(html); document.close();
  } catch (e) { document.getElementById('s').textContent = 'サイトを読み込めませんでした。'; }
})();
</script></body></html>`);

// 検索エンジン用サイトマップ（ログインなしで中身が見えるページだけ）。
// ルートの robots.txt（kaikomziu.github.io）は別リポジトリなので、Search Console から送信する。
const today = new Date().toISOString().slice(0, 10);
const publicPages = ['/', '/login/', '/register/', '/emergency.html'];
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicPages.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod>${p === '/' ? '<priority>1.0</priority>' : ''}</url>`).join('\n')}
</urlset>
`);

writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`built ${OUT}/ (base=${BASE || '/'}, api=${API})`);
