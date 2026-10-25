// scripts/build-pages.mjs
// public/（EdgeOne版の画面）を GitHub Pages 用に build/ へ書き出す。
// - サイトは https://<user>.github.io/<repo>/ 配下になるため、"/Ghost" などのサイト内パスにベースを付ける
// - "/api/<name>" を Supabase Edge Function（mixall-api）のURLへ置き換える
// - EdgeOne の書き換えルール（edgeone.json）の代わりに 404.html でURLを振り分ける
// - サイト名を「MixAll +（二世代）」にそろえ、検索向けのタグを補う
// - overlay/ にある GitHub 版だけのファイル（js/mixall-base.js など）を上に重ねる
//   node scripts/build-pages.mjs [--base /mixall] [--api https://...] [--site https://...]
import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { NAME, rename, seoTags, sitemap } from './lib/site-meta.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const BASE = String(args.base ?? process.env.MIXALL_BASE ?? '/mixall').replace(/\/$/, '');
const API = String(args.api || process.env.MIXALL_API_BASE || 'https://kifnzvktwbomxthzvvgy.supabase.co/functions/v1/mixall-api').replace(/\/$/, '');
const SITE = String(args.site || process.env.MIXALL_SITE_URL || `https://kaikomziu.github.io${BASE}`).replace(/\/$/, '');
const OUT = args.out || 'build';
const BUILD_ID = Date.now().toString(36);

// 出力先の中身だけ消す（フォルダ自体は開いているシェルやエディタが掴んでいることがあるため残す）
mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) rmSync(join(OUT, name), { recursive: true, force: true });
cpSync('public', OUT, { recursive: true });
// EdgeOne は大文字小文字を区別しないが、GitHub Pages は区別する。リンクは /Ghost/ なのでフォルダ名を合わせる
// （Windows でも大文字小文字だけの改名が効くよう、いったん別名を経由する）
if (readdirSync(OUT).includes('ghost')) { renameSync(join(OUT, 'ghost'), join(OUT, 'ghost.tmp')); renameSync(join(OUT, 'ghost.tmp'), join(OUT, 'Ghost')); }
cpSync('overlay', OUT, { recursive: true });
for (const name of ['manus-routes.json']) rmSync(join(OUT, name), { force: true });

// サイト直下にある名前（これらで始まる "/..." はサイト内パスとみなす）
const ROOTS = readdirSync(OUT).concat(['ghost', 'r', 'site-view'])
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length);
const ROOT_RE = new RegExp(`(["'\`(])\\/((?:${ROOTS.join('|')})(?=[\\/?#"'\`)]|$))`, 'g');
// 比較の相手（=== '/admin' や startsWith('/Ghost/') など）のパスは、ベースを除いた MixAllBase.path() と比べるので書き換えない
const COMPARE_BEFORE = /(===|!==|==|!=|startsWith\(|endsWith\(|includes\(|indexOf\(|case|\.test\()\s*$/;
// 端末に保存して単独で開くページ（オフライン用）は書き換えない
const STANDALONE = new Set(['downloads/mixall-emergency.html']);

// ['/login', '/register'].includes(path) のような比較用の配列も書き換えない
const COMPARE_ARRAY = /\[(?:\s*(["'])[^"'\n]*\1\s*,?)+\s*\]\s*\.(?:includes|indexOf|some)\(/g;

function rewriteRoots(text) {
  const kept = [];
  const masked = text.replace(COMPARE_ARRAY, (m) => { kept.push(m); return `\u0000${kept.length - 1}\u0000`; });
  return masked.replace(ROOT_RE, (match, quote, rest, offset) => {
    if (COMPARE_BEFORE.test(masked.slice(Math.max(0, offset - 16), offset))) return match;
    return `${quote}${BASE}/${rest}`;
  }).replace(/\u0000(\d+)\u0000/g, (m, i) => kept[Number(i)]);
}

function rewriteJs(text) {
  // 現在パスはベースを除いたパス（EdgeOne版の location.pathname 相当）で扱う。代入（画面移動）は除く
  let out = text.replace(/(?:window\.)?location\.pathname(?!\s*=(?!=))/g, '(window.MixAllBase?MixAllBase.path():location.pathname)');
  // 保存データ・入力由来のURLへ移動する箇所はベースを補う
  out = out
    .replace(/location\.href = next\b/g, 'location.href = MixAllBase.fix(next)')
    .replace(/location\.replace\(next\)/g, 'location.replace(MixAllBase.fix(next))')
    .replace(/location\.replace\(target\)/g, 'location.replace(MixAllBase.fix(target))');
  // トップ（"/"）への移動
  out = out
    .replace(/location\.replace\((['"])\/\1\)/g, `location.replace('${BASE}/')`)
    .replace(/location\.href ?= ?(['"])\/\1/g, `location.href = '${BASE}/'`)
    .replace(/(['"])\/\?next=/g, `$1${BASE}/?next=`)
    .replace(/params\.get\('next'\) \|\| '\/'/g, `params.get('next') || '${BASE}/'`);
  return rewriteRoots(out);
}

function rewriteCommon(text) {
  return text
    .replace(/(["'`])\/api\//g, `$1${API}/`)
    .split('https://mixalls.edgeone.dev').join(SITE)
    .split('mixalls.edgeone.dev').join(SITE.replace(/^https:\/\//, ''));
}

function rewrite(text, ext, rel) {
  let out = rewriteCommon(text);
  if (ext === '.html') {
    if (STANDALONE.has(rel)) return out;
    out = out.replace(/(href|src|action|poster|content)="\/"/g, `$1="${BASE}/"`);
    out = rewriteJs(out);
    out = rename(out);
    const head = `<script>window.MIXALL_BASE=${JSON.stringify(BASE)};window.MIXALL_API_BASE=${JSON.stringify(API)};window.MIXALL_SITE_URL=${JSON.stringify(SITE)};</script>`
      + `<script src="${BASE}/js/mixall-base.js"></script><script src="${BASE}/js/vault-restore.js" defer></script><link rel="stylesheet" href="${BASE}/css/mixall-gh.css">`;
    out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => m + head) : head + out;
    // サービスワーカーが古いJS/CSSを先に返すため、公開のたびにURLを変えて最新を読ませる
    out = out.replace(new RegExp(`((?:src|href)="${BASE}/(?:js|css)/[^"?#]+\\.(?:js|css))(?=")`, 'g'), `$1?v=${BUILD_ID}`);
    return out;
  }
  if (rel === 'sw.js') return rewriteSw(out);
  if (ext === '.js') return rewriteJs(out);
  if (ext === '.css') return out.replace(/url\((['"]?)\/(?!\/)/g, `url($1${BASE}/`);
  if (ext === '.webmanifest') {
    const manifest = JSON.parse(rewriteRoots(out).replace(/"(start_url|scope)":\s*"\/"/g, `"$1": "${BASE}/"`));
    manifest.name = NAME;
    if (!/MixAll/.test(manifest.short_name || '')) manifest.short_name = 'MixAll+';
    return JSON.stringify(manifest, null, 2);
  }
  if (ext === '.json') return rewriteRoots(out);
  return out;
}

// サービスワーカー: 保存するファイル・通知のURLにベースを付ける（MixAllBase は使えない）
function rewriteSw(text) {
  let out = rewriteRoots(text);
  out = out.replace("const url = new URL((event.notification.data && event.notification.data.url) || '/Notifications/', self.location.origin).href;",
    `const __raw = String((event.notification.data && event.notification.data.url) || '/Notifications/');\n  const url = new URL(__raw.startsWith('/') && !__raw.startsWith('${BASE}/') ? '${BASE}' + __raw : __raw, self.location.origin).href;`);
  out = out.replace(/caches\.match\('\/emergency\.html'\)/g, `caches.match('${BASE}/emergency.html')`);
  return out;
}

const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.txt', '.xml']);
const SKIP = new Set(['js/mixall-base.js', 'js/vault-restore.js']);
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    const ext = extname(name).toLowerCase();
    const rel = relative(OUT, full).replace(/\\/g, '/');
    if (!TEXT.has(ext) || SKIP.has(rel) || rel.startsWith('js/vendor/')) continue;
    let text = rewrite(readFileSync(full, 'utf8'), ext, rel);
    if (ext === '.html') text = seoTags(text, rel, SITE);
    writeFileSync(full, text);
  }
}
walk(OUT);

// EdgeOne の書き換えルールの代わり（存在しないURLは GitHub Pages が 404.html を返す）
const pages = [];
(function list(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) list(full);
    else if (name.endsWith('.html')) pages.push('/' + relative(OUT, full).replace(/\\/g, '/'));
  }
})(OUT);

const router = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${NAME}</title><meta name="robots" content="noindex">
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
  if ((m = clean.match(/^\\/r\\/([^/]+)$/))) { location.replace(API + '/r/' + encodeURIComponent(decodeURIComponent(m[1]))); return; }
  if ((m = clean.match(/^\\/site-view\\/([^/]+)$/i))) return go('/site-view/', withQuery('slug=' + m[1]));
  if (/^\\/tools(\\/|$)/i.test(clean)) return go('/Tools/', q);
  if (lower === '/create/text') return go('/Create/text.html', q);
  // 大文字小文字だけ違うページ・ディレクトリ（例: /ghost/watch → /Ghost/watch.html、/fomasu → /Fomasu/）
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
writeFileSync(join(OUT, 'site-view', 'index.html'), `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${NAME} サイト</title><meta name="robots" content="noindex">
</head><body style="margin:0;background:#0f1115;color:#eee;font-family:sans-serif">
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

writeFileSync(join(OUT, 'sitemap.xml'), sitemap(SITE));
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`built ${OUT}/ (base=${BASE || '/'}, api=${API})`);
