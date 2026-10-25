// scripts/build-edgeone.mjs
// EdgeOne Pages 用のフォルダ（edgeone-build/）を組み立てる。EdgeOne 版（v27c）はもともと EdgeOne 用なので、
// 画面はほぼそのまま、サーバー（cloud/）は cloud-functions/ に戻す。データは今の Supabase（kv テーブル）を使う。
//   node scripts/build-edgeone.mjs --site https://<ドメイン> [--out edgeone-build]
//   edgeone makers deploy edgeone-build -n <プロジェクト名>
// GitHub 版との違い:
// - 各関数の入口で、設定値（kv の mixall-config/env）を context.env に足す（_lib/mixall-config.js）
//   → EdgeOne に登録する環境変数は SUPABASE_URL と SUPABASE_SECRET_KEY だけ
// - Supabase 版の追加 API（archive-job・vault-restore）も /api/ に置く
import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
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
cpSync('supabase/edgeone/edgeone.json', join(OUT, 'edgeone.json'));
// 元の middleware.js（Ghost投稿のリンクプレビュー用）は、入れると公開に失敗するか全ページが 545 になるので入れない（2026-10 時点）
for (const rel of ['js/vault-restore.js', 'css/mixall-gh.css', 'css/plus.css', 'js/plus-ux.js', 'js/plus.js', 'js/plus-ghost.js', 'js/plus-coin.js', 'js/plus-account.js', 'js/plus-admin.js', 'js/plus-pocket.js', 'js/plus-qol.js']) cpSync(join('overlay', rel), join(OUT, rel));
// MixAll + で足している機能（overlay/js/plus*.js）。plus-ux.js と plus.js は fetch を包むので、ページのスクリプトより先に読む
const PLUS_PAGES = [[/^ghost\//i, 'plus-ghost.js'], [/^coin\//i, 'plus-coin.js'], [/^account\//i, 'plus-account.js'], [/^admin\/index\.html$/i, 'plus-admin.js'], [/^pocket\/(room|thread)\.html$/i, 'plus-pocket.js']];

const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.txt', '.xml']);
const STANDALONE = new Set(['downloads/mixall-emergency.html']);
function site(text) {
  return text.split(`https://${FRIEND_SITE}`).join(SITE).split(FRIEND_SITE).join(SITE.replace(/^https:\/\//, ''));
}
function page(html, rel) {
  if (STANDALONE.has(rel)) return html;
  let out = rename(html);
  const extra = PLUS_PAGES.filter(([re]) => re.test(rel)).map(([, f]) => `<script src="/js/${f}" defer></script>`).join('');
  const head = '<link rel="stylesheet" href="/css/mixall-gh.css"><link rel="stylesheet" href="/css/plus.css"><script src="/js/plus-ux.js"></script><script src="/js/plus.js"></script><script src="/js/vault-restore.js" defer></script><script src="/js/plus-qol.js" defer></script>' + extra;
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, (m) => head + m) : head + out;
  // サービスワーカーが古いJS/CSSを先に返すため、公開のたびにURLを変えて最新を読ませる
  out = out.replace(/((?:src|href)="\/(?:js|css)\/[^"?#]+\.(?:js|css))(?=")/g, `$1?v=${BUILD_ID}`);
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

// サーバー
const FN = join(OUT, 'cloud-functions');
cpSync('cloud', FN, { recursive: true });
cpSync('server/edgeone/mixall-config.js', join(FN, '_lib', 'mixall-config.js'));
for (const name of ['archive-job.js', 'vault-restore.js', 'plus.js']) {
  writeFileSync(join(FN, '_lib', name), readFileSync(join('server', name), 'utf8').split("'./cloud/_lib/blobs.js'").join("'./blobs.js'").split("'./cloud/_lib/push.js'").join("'./push.js'"));
}
// 各関数の onRequest* を、設定値を足してから呼ぶ形に包む
const HANDLER = /export (async )?function (onRequest\w*)\s*\(/g;
let wrapped = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== '_lib') walk(full); continue; }
    if (extname(name) !== '.js') continue;
    let code = site(readFileSync(full, 'utf8'));
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
