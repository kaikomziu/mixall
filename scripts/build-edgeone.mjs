// scripts/build-edgeone.mjs
// EdgeOne Pages 用のフォルダ（edgeone-build/）を組み立てる。EdgeOne 版（v27c）はもともと EdgeOne 用なので、
// 画面はほぼそのまま、サーバー（cloud/）は cloud-functions/ に戻す。データは今の Supabase（kv テーブル）を使う。
//   node scripts/build-edgeone.mjs --site https://<ドメイン> [--out edgeone-build]
//   edgeone makers deploy edgeone-build -n <プロジェクト名>
// GitHub 版との違い:
// - 各関数の入口で、設定値（kv の mixall-config/env）を context.env に足す（_lib/mixall-config.js）
//   → EdgeOne に登録する環境変数は SUPABASE_URL と SUPABASE_SECRET_KEY だけ
// - Supabase 版の追加 API（archive-job・vault-restore）も /api/ に置く
// 軽量化:
// - 画面の JS・CSS（ページ内の <script> も）を圧縮する。トップレベルの名前は変えない（onclick="..." などから呼ばれるため）
// - ＋の機能のファイルを2つにまとめる（plus-core.js = 先に読むもの、plus-late.js = defer）
// - ?v= はファイルの中身から作る（変わっていないファイルは公開し直しても読み直さない）
// - サービスワーカーは ?v= 付きのファイルを裏で読み直さず、古い版はキャッシュから消す
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';
import { NAME, rename, seoTags, sitemap } from './lib/site-meta.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const SITE = String(args.site || process.env.MIXALL_SITE_URL || '').replace(/\/$/, '');
if (!/^https:\/\//.test(SITE)) {
  console.error('usage: node scripts/build-edgeone.mjs --site https://<EdgeOneのドメイン>');
  process.exit(1);
}
const OUT = args.out || 'edgeone-build';
const BUILD_ID = Date.now().toString(36);
const FRIEND_SITE = 'mixalls.edgeone.dev';

mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) rmSync(join(OUT, name), { recursive: true, force: true });

// 画面
cpSync('public', OUT, { recursive: true });
for (const name of ['manus-routes.json']) rmSync(join(OUT, name), { force: true });
// 元のZIPは画面の Ghost/ と、/Ghost/ へ移るだけの ghost/index.html を両方持つが、Windows で展開すると ghost/ 1つにまとまる。
// EdgeOne は大文字小文字を区別するので Ghost/ に戻す（/ghost は edgeone.json の書き換えで Ghost/ に届く。別名を経由しないと Windows では改名されない）
if (readdirSync(OUT).includes('ghost')) { renameSync(join(OUT, 'ghost'), join(OUT, 'ghost.tmp')); renameSync(join(OUT, 'ghost.tmp'), join(OUT, 'Ghost')); }
// ＋広場（/Plus/）は MixAll + だけのページなので、書き換えルールにも足す
{
  const conf = JSON.parse(readFileSync('supabase/edgeone/edgeone.json', 'utf8'));
  conf.rewrites = [{ source: '/Plus', destination: '/Plus/index.html' }, { source: '/Plus/', destination: '/Plus/index.html' }, ...(conf.rewrites || [])];
  writeFileSync(join(OUT, 'edgeone.json'), JSON.stringify(conf, null, 2));
}
// 元の middleware.js（Ghost投稿のリンクプレビュー用）は、入れると公開に失敗するか全ページが 545 になるので入れない（2026-10 時点）
// MixAll + で足している機能（overlay/js/plus*.js・overlay/plus/*.html）
for (const name of readdirSync('overlay/js')) if (/^(plus|vault-restore)/.test(name)) cpSync(join('overlay/js', name), join(OUT, 'js', name));
for (const name of readdirSync('overlay/css')) cpSync(join('overlay/css', name), join(OUT, 'css', name));
if (existsSync('overlay/plus')) cpSync('overlay/plus', join(OUT, 'Plus'), { recursive: true });
// CSS は1つにまとめる（plus.css + 機能ごとの plus-*.css）
writeFileSync(join(OUT, 'css/plus.css'), ['plus.css', ...readdirSync('overlay/css').filter((n) => /^plus-.+\.css$/.test(n)).sort()].map((n) => readFileSync(join('overlay/css', n), 'utf8')).join('\n'));
// まとめたファイル（元のファイルも残す。古いページがキャッシュから出たときに読めるように）
// plus-ux.js と plus.js は fetch を包むので、ページのスクリプトより先に読む。plus-theme.js は描画前に色を当てるので先に読む
const optional = (list) => list.filter((f) => existsSync(join('overlay', f)));
const BUNDLES = {
  'js/plus-core.js': optional(['js/plus-ux.js', 'js/plus.js', 'js/plus-theme.js']),
  'js/plus-late.js': optional(['js/vault-restore.js', 'js/plus-qol.js', 'js/plus-bookmarks.js', 'js/plus-tools.js'])
};
for (const [out, parts] of Object.entries(BUNDLES)) writeFileSync(join(OUT, out), parts.map((f) => readFileSync(join('overlay', f), 'utf8')).join('\n;\n'));
const PLUS_PAGES = [[/^ghost\//i, 'plus-ghost.js'], [/^coin\//i, 'plus-coin.js'], [/^account\//i, 'plus-account.js'], [/^admin\/index\.html$/i, 'plus-admin.js'], [/^admin\/index\.html$/i, 'plus-admin-layout.js'], [/^pocket\/(room|thread)\.html$/i, 'plus-pocket.js'],
  [/^index\.html$/i, 'plus-dash.js'], [/^create\//i, 'plus-create.js'], [/^lending\//i, 'plus-lending.js']]; // ＋広場（Plus/index.html）は plus-hub.js をページ内で読む

const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.txt', '.xml']);
// 小窓の中の道具（Plus/tool.html）は自己完結のページなので、MixAll + の共通部品を入れない
const STANDALONE = new Set(['downloads/mixall-emergency.html', 'Plus/tool.html']);
function site(text) {
  return text.split(`https://${FRIEND_SITE}`).join(SITE).split(FRIEND_SITE).join(SITE.replace(/^https:\/\//, ''));
}
// Supabase の節約: 友人のコードの決まった箇所を置き換える（形が変わっていたら置き換えずに知らせる）
const patched = {};
function patch(text, label, from, to) {
  if (!text.includes(from)) return text;
  patched[label] = (patched[label] || 0) + 1;
  return text.split(from).join(to);
}
// 機能ごとの置き換えは scripts/patches/*.mjs に分けて書く（export const labels = [...]; export function apply({ kind, rel, text, patch }) → text）
//   kind: 'page'（画面の HTML）/ 'script'（画面の JS）/ 'cloud'（サーバー関数。rel は cloud-functions/ からのパス）
const PATCH_MODULES = [];
for (const name of existsSync('scripts/patches') ? readdirSync('scripts/patches').filter((n) => n.endsWith('.mjs')).sort() : []) {
  PATCH_MODULES.push(await import(new URL(`./patches/${name}`, import.meta.url)));
}
function applyPatches(kind, rel, text) {
  for (const m of PATCH_MODULES) text = m.apply({ kind, rel, text, patch }) ?? text;
  return text;
}
function page(html, rel) {
  if (STANDALONE.has(rel)) return html;
  let out = rename(html);
  // Uch のスレッド: 8秒ごとの読み込みを、タブが裏にある間は止める（表に戻ったらすぐ読む）
  if (rel === 'Uch/thread.html') out = patch(out, 'Uchの裏タブ停止', 'setInterval(loadThread, 8000);',
    "setInterval(() => { if (!document.hidden) loadThread(); }, 8000); document.addEventListener('visibilitychange', () => { if (!document.hidden) loadThread(); });");
  out = applyPatches('page', rel, out);
  return pageTail(out, rel);
}
// 画面の JS の置き換え（2026-10-26 に確認してもらったもの）
function script(code, rel) {
  code = applyPatches('script', rel, code);
  // ぽけっと: 直接つなぐための接続確認（6〜9秒ごと）を、タブが裏にある間は止める（表に戻ると chat-rt.js 自身がすぐ再開する）
  if (rel === 'js/chat-rt.js') code = patch(code, 'ぽけっとの裏タブ停止', 'function schedule(ms) { if (timer) clearTimeout(timer); if (!cfg) return;', 'function schedule(ms) { if (timer) clearTimeout(timer); if (!cfg || document.hidden) return;');
  // 未読バッジの定期更新を30秒→60秒に（表に戻ったときはすぐ更新する）
  // メニューの「ツール」に＋広場を足す
  if (rel === 'js/mixall-nav.js') code = patch(code, '＋広場のリンク', "link('/Tools', 'ツールセンター', icons.tools),", "link('/Tools', 'ツールセンター', icons.tools),\n      link('/Plus/', '＋広場（お題・ランキング・ギャラリー・アバター）', icons.studio),");
  if (rel === 'js/mixall-nav.js') code = patch(code, 'バッジ更新の間引き', 'setInterval(() => { if (!document.hidden) refreshBadges(); }, 30000);', 'setInterval(() => { if (!document.hidden) refreshBadges(); }, 60000);');
  return code;
}
function pageTail(out, rel) {
  const extra = PLUS_PAGES.filter(([re]) => re.test(rel)).map(([, f]) => `<script src="/js/${f}" defer></script>`).join('');
  const head = '<link rel="stylesheet" href="/css/mixall-gh.css"><link rel="stylesheet" href="/css/plus.css"><script src="/js/plus-core.js"></script><script src="/js/plus-late.js" defer></script>' + extra;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, (m) => head + m) : head + out;
  // サービスワーカーが古いJS/CSSを先に返すため、中身が変わったらURLも変える（版は圧縮のあとで中身から決める）
  out = out.replace(/((?:src|href)="\/(?:js|css)\/[^"?#]+\.(?:js|css))(?=")/g, '$1?v=@@V@@');
  return seoTags(out, rel, SITE);
}
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    const ext = extname(name).toLowerCase();
    const rel = relative(OUT, full).replace(/\\/g, '/');
    if (!TEXT.has(ext) || rel.startsWith('js/vendor/') || rel === 'edgeone.json') continue;
    let text = site(readFileSync(full, 'utf8'));
    if (ext === '.html') text = page(text, rel);
    if (ext === '.js') text = script(text, rel);
    if (ext === '.webmanifest') {
      const manifest = JSON.parse(text);
      manifest.name = NAME;
      if (!/MixAll/.test(manifest.short_name || '')) manifest.short_name = 'MixAll+';
      text = JSON.stringify(manifest, null, 2);
    }
    writeFileSync(full, text);
  }
})(OUT);
writeFileSync(join(OUT, 'sitemap.xml'), sitemap(SITE));

// ---- 軽量化: 圧縮 → 版を付ける → サービスワーカー ----
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'cloud-functions') walk(full); continue; }
    files.push([full, relative(OUT, full).replace(/\\/g, '/')]);
  }
})(OUT);
const MIN = { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: true, charset: 'utf8', legalComments: 'none' };
async function minify(code, loader) {
  try { return (await transform(code, { ...MIN, loader })).code; } catch (_) { return null; }
}
let before = 0;
let after = 0;
for (const [full, rel] of files) {
  const ext = extname(rel).toLowerCase();
  if (rel.startsWith('js/vendor/') || rel === 'sw.js' || STANDALONE.has(rel) || !['.js', '.css', '.html'].includes(ext)) continue;
  const text = readFileSync(full, 'utf8');
  let out = text;
  if (ext === '.html') {
    // ページ内の <script>（src なし・JavaScript のもの）だけ圧縮する。失敗したらそのまま
    const parts = [];
    const re = /(<script\b(?![^>]*\bsrc=)(?![^>]*\btype=["']?(?!text\/javascript|module)[^"'\s>]+)[^>]*>)([\s\S]*?)(<\/script>)/gi;
    let last = 0;
    for (let m; (m = re.exec(text));) {
      const min = m[2].trim() ? await minify(m[2], 'js') : null;
      parts.push(text.slice(last, m.index), m[1], min !== null && !/<\/script/i.test(min) ? min.trim() : m[2], m[3]);
      last = m.index + m[0].length;
    }
    out = parts.join('') + text.slice(last);
  } else {
    const min = await minify(text, ext.slice(1));
    if (min !== null) out = min;
  }
  before += Buffer.byteLength(text); after += Buffer.byteLength(out);
  if (out !== text) writeFileSync(full, out);
}
const version = (rel) => {
  const f = join(OUT, rel);
  return existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 10) : BUILD_ID;
};
for (const [full, rel] of files) {
  if (extname(rel) !== '.html') continue;
  const html = readFileSync(full, 'utf8');
  if (html.includes('@@V@@')) writeFileSync(full, html.replace(/\/((?:js|css)\/[^"?#]+)\?v=@@V@@/g, (m, p) => `/${p}?v=${version(p)}`));
}
// サービスワーカー: ?v= 付きのファイルは中身が変わらないので裏で読み直さない。新しい版を入れたら同じファイルの古い版は消す
{
  const swPath = join(OUT, 'sw.js');
  let sw = readFileSync(swPath, 'utf8');
  const from = "const refresh = fetch(request).then((response) => { if (response && response.ok) cache.put(request, response.clone()).catch(() => {}); return response; });";
  if (!sw.includes(from)) throw new Error('sw.js の形が変わったので、build-edgeone.mjs の書き換えを見直してください');
  sw = sw.replace(from, `const versioned = isStatic && url.searchParams.has('v');
    if (versioned && cached) return cached;
    const refresh = fetch(request).then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
        if (versioned) cache.keys().then((keys) => keys.forEach((k) => { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) cache.delete(k); })).catch(() => {});
      }
      return response;
    });`)
    // キャッシュの名前を変えて、これまでに溜まった古い版を一度まとめて消す
    .replace(/const CACHE_NAME = '([^']+)';/, "const CACHE_NAME = '$1-lite1';");
  writeFileSync(swPath, sw);
}
console.log(`minified ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`);

// サーバー
const FN = join(OUT, 'cloud-functions');
cpSync('cloud', FN, { recursive: true });
cpSync('server/edgeone/mixall-config.js', join(FN, '_lib', 'mixall-config.js'));
for (const name of ['archive-job.js', 'vault-restore.js', 'plus.js']) {
  writeFileSync(join(FN, '_lib', name), readFileSync(join('server', name), 'utf8').split("'./cloud/_lib/blobs.js'").join("'./blobs.js'").split("'./cloud/_lib/push.js'").join("'./push.js'"));
}
// GitHub に移した行（アーカイブ）の読み込みを、関数ごとに60秒覚えておく。
// 元は読むたびに Supabase へ「消された行か」を問い合わせ、GitHub からも取り直していた（Supabase への問い合わせで一番多かった）
function archiveCache(code) {
  code = patch(code, 'アーカイブの記憶', 'async function __archiveRow(store, key) {', 'async function __archiveRowRaw(store, key) {');
  return patch(code, 'アーカイブの記憶(削除)', 'async function __archiveTomb(store, key) {',
    'async function __archiveRow(store, key) { const c = globalThis.__mxArchRows || (globalThis.__mxArchRows = new Map()); const k = store + "/" + key; const h = c.get(k); if (h && Date.now() - h.at < 60000) return h.row; const row = await __archiveRowRaw(store, key); if (c.size > 500) c.clear(); c.set(k, { at: Date.now(), row }); return row; }\n'
    + 'async function __archiveTomb(store, key) { if (globalThis.__mxArchRows) globalThis.__mxArchRows.delete(store + "/" + key);');
}
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (extname(name) === '.js') { const code = readFileSync(full, 'utf8'); const out = archiveCache(code); if (out !== code) writeFileSync(full, out); }
  }
})(FN);
// 各関数の onRequest* を、設定値を足してから呼ぶ形に包む
const HANDLER = /export (async )?function (onRequest\w*)\s*\(/g;
let wrapped = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== '_lib') walk(full); continue; }
    if (extname(name) !== '.js') continue;
    let code = applyPatches('cloud', relative(FN, full).replace(/\\/g, '/'), site(readFileSync(full, 'utf8')));
    const names = [];
    code = code.replace(HANDLER, (m, isAsync, fn) => { names.push(fn); return `${isAsync || ''}function __mixall_${fn}(`; });
    if (!names.length) throw new Error(`${full} に onRequest がありません`);
    const lib = relative(dirname(full), join(FN, '_lib', 'mixall-config.js')).replace(/\\/g, '/');
    code = `import { withMixallConfig as __withMixallConfig } from '${lib.startsWith('.') ? lib : './' + lib}';\n${code}\n`
      + names.map((fn) => `export async function ${fn}(context) { return __mixall_${fn}(await __withMixallConfig(context)); }\n`).join('');
    writeFileSync(full, code);
    wrapped += 1;
  }
})(FN);
// 設定値は process.env にも入れる（cloud/_lib/push.js などが process.env から読む）
const extraApi = (file, fn, call) => `// scripts/build-edgeone.mjs が作るファイル（Supabase 版の追加 API）
import { withMixallConfig } from '../_lib/mixall-config.js';
import { setEnv } from '../_lib/blobs.js';
import { ${fn} } from '../_lib/${file}.js';
export async function onRequest(context) {
  const ctx = await withMixallConfig(context);
  setEnv(ctx.env);
  for (const [k, v] of Object.entries(ctx.env)) if (process.env[k] === undefined) process.env[k] = String(v);
  return ${call};
}
`;
writeFileSync(join(FN, 'api', 'archive-job.js'), extraApi('archive-job', 'archiveJob', 'archiveJob(ctx.request, ctx.env)'));
writeFileSync(join(FN, 'api', 'vault-restore.js'), extraApi('vault-restore', 'vaultRestore', 'vaultRestore(ctx.request)'));
writeFileSync(join(FN, 'api', 'plus.js'), extraApi('plus', 'plusApi', 'plusApi(ctx.request)'));
writeFileSync(join(FN, 'api', 'plus-cron.js'), extraApi('plus', 'plusCron', 'plusCron(ctx.request, ctx.env)'));

console.log(`built ${OUT}/ (site=${SITE}, ${wrapped} functions)`);
for (const label of [...PATCH_MODULES.flatMap((m) => m.labels || []), 'Uchの裏タブ停止', '＋広場のリンク', 'ぽけっとの裏タブ停止', 'バッジ更新の間引き','アーカイブの記憶', 'アーカイブの記憶(削除)']) if (!patched[label]) console.warn(`⚠ 置き換えられませんでした: ${label}（友人のコードの形が変わった可能性）`);
console.log('patched:', JSON.stringify(patched));
