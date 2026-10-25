// scripts/smoke-test.mjs
// 公開前の確認（npm test）:
// - cloud/・public/ に友人の鍵が残っていない
// - cloud/api のすべての関数が server/edge-router.js から呼べる
// - GitHub Pages 用ビルドで、サイト内パスにベースが付き、/api/ がAPIのURLになっている
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failed = 0;
const fail = (message) => { console.error('NG', message); failed += 1; };
const ok = (message) => console.log('OK', message);

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out); else out.push(full);
  }
  return out;
}

const SECRETS = [/sb_secret_[A-Za-z0-9]{6}/, /am_us_inbox[A-Za-z0-9_]{6}/, /[a-z]{20}\.supabase\.co/, /XGD_API_KEY = \[/, /CRON_SECRET = "[0-9a-f]{8,}"/, /MIXALL_ARCHIVE_SECRET\) \|\| "[0-9a-f]{8,}"/, /_SESSION = '\d+_/, /d: '[A-Za-z0-9_-]{40,}'/];
const OWN_PROJECT = 'kifnzvktwbomxthzvvgy.supabase.co';
for (const file of [...files('cloud'), ...files('public')].filter((f) => /\.(js|html|json|md|txt)$/.test(f))) {
  const text = readFileSync(file, 'utf8').split(OWN_PROJECT).join('');
  for (const re of SECRETS) if (re.test(text)) fail(`${file} に鍵らしき文字列 (${re})`);
}
ok('鍵の確認');

const router = readFileSync('server/edge-router.js', 'utf8');
for (const name of readdirSync('cloud/api').map((f) => f.replace(/\.js$/, ''))) {
  if (!router.includes(`import('./cloud/api/${name}.js')`)) fail(`edge-router.js に ${name} がありません`);
  const code = readFileSync(`cloud/api/${name}.js`, 'utf8');
  if (!/export (async )?function onRequest(Get|Post)?\b/.test(code)) fail(`cloud/api/${name}.js に onRequest がありません`);
}
ok('関数の一覧');

execFileSync(process.execPath, ['scripts/build-pages.mjs', '--out', 'build-test'], { stdio: 'ignore' });
const built = files('build-test').filter((f) => /\.(js|html)$/.test(f) && !/mixall-emergency\.html$/.test(f));
for (const file of built) {
  const text = readFileSync(file, 'utf8');
  if (/fetch\(\s*['"`]\/api\//.test(text)) fail(`${file} に /api/ のままの呼び出し`);
  if (/(href|src)="\/(Pocket|Ghost|Uch|Mail|js|css)\//.test(text)) fail(`${file} にベースの無いパス`);
}
const home = readFileSync('build-test/index.html', 'utf8');
if (!home.includes('<title>MixAll +（二世代）')) fail('トップのタイトルが MixAll +（二世代） になっていない');
if (!home.includes('/mixall/js/mixall-base.js')) fail('mixall-base.js が読み込まれていない');
ok('Pages 用ビルド');

if (failed) { console.error(`${failed} 件の問題があります`); process.exit(1); }
console.log('all checks passed');
