// scripts/import-edgeone.mjs
// 友人の EdgeOne 版（ZIPを展開したフォルダ）を、このリポジトリへ取り込む。
//   node scripts/import-edgeone.mjs <展開したフォルダ>
// - 画面（静的ファイル）     → public/
// - サーバー（cloud-functions）→ cloud/   （Supabase Edge Function mixall-api の中で動かす）
// - SQL                       → supabase/edgeone/
// このリポジトリは公開なので、コードに直接書かれた鍵・パスワードは取り除き、環境変数（mixall-config の env）から読むようにする。
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC = process.argv[2];
if (!SRC || !existsSync(join(SRC, 'cloud-functions'))) {
  console.error('usage: node scripts/import-edgeone.mjs <EdgeOne版を展開したフォルダ>');
  process.exit(1);
}

const SERVER_ONLY = new Set(['cloud-functions', 'supabase', 'edgeone.json', 'middleware.js', 'README-EdgeOne.md']);

function emptyDir(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true });
}

emptyDir('public');
for (const name of readdirSync(SRC)) {
  if (SERVER_ONLY.has(name)) continue;
  cpSync(join(SRC, name), join('public', name), { recursive: true });
}
emptyDir('cloud');
cpSync(join(SRC, 'cloud-functions'), 'cloud', { recursive: true });
emptyDir('supabase/edgeone');
cpSync(join(SRC, 'supabase'), 'supabase/edgeone', { recursive: true });
cpSync(join(SRC, 'README-EdgeOne.md'), 'README-EdgeOne.md');
cpSync(join(SRC, 'edgeone.json'), 'supabase/edgeone/edgeone.json');

const env = (name, fallback = '""') => `((typeof process !== "undefined" && process.env && process.env.${name}) || ${fallback})`;

// サーバー側コードの鍵を取り除く
const SERVER_RULES = [
  // Supabase の secret key / URL（第1〜第5）。第1は Edge Function の環境変数から渡す
  [/(["'])sb_secret_[A-Za-z0-9_-]+\1/g, '""'],
  [/(["'])https:\/\/[a-z0-9]{20}\.supabase\.co\1/g, '""'],
  // cron の合言葉
  [/((?:export const |^\s*)CRON_SECRET\s*=\s*)(["'])[^"']*\2/gm, '$1""'],
  // AgentMail
  [/((?:var|const|let) AGENTMAIL_API_KEY\s*=\s*)(["'])[^"']*\2/g, `$1${env('AGENTMAIL_API_KEY')}`],
  [/((?:var|const|let) AGENTMAIL_INBOX\s*=\s*)(["'])[^"']*\2/g, `$1${env('AGENTMAIL_INBOX')}`],
  // x.gd（文字コードの配列で埋め込まれている）
  [/((?:var|const|let) XGD_API_KEY\s*=\s*)\[[0-9,\s]+\]\.map\([^;]*?\)\.join\(""\)/g, `$1${env('XGD_API_KEY')}`],
  [/AGENTMAIL_KEY: "am_us_inbox[^"]*", AGENTMAIL_BOX: "[^"]*"/g, `AGENTMAIL_KEY: ${env('AGENTMAIL_API_KEY')}, AGENTMAIL_BOX: ${env('AGENTMAIL_INBOX')}`],
  // データ書き出しの暗号鍵の既定値
  [/(process\.env\.MIXALL_ARCHIVE_SECRET\) \|\| )"[0-9a-f]{32,}"/g, '$1""'],
  // pixiv のログインセッション（友人のアカウント）
  [/const (DEFAULT_SESSION|SHARED_SESSION) = '[^']*';/g, (m, name) => `const ${name} = ${env(`PIXIV_${name}`)};`],
  [/if \(!list\.includes\(XGD_API_KEY\)\) list\.push\(XGD_API_KEY\)/g, 'if (XGD_API_KEY && !list.includes(XGD_API_KEY)) list.push(XGD_API_KEY)'],
  // 運営アカウントの初期パスワード
  [/((?:var|const|let) ADMIN_INITIAL_PASSWORD\s*=\s*)(["'])[^"']*\2/g, `$1${env('MIXALL_ADMIN_INITIAL_PASSWORD')}`],
  // Web Push の VAPID 鍵
  [/const FALLBACK = \{ d: '[^']*', x: '[^']*', y: '[^']*', pub: '[^']*' \};/g, "const FALLBACK = { d: '', x: '', y: '', pub: '' };"]
];

const SECRET_CHECKS = [/MIXALL_ARCHIVE_SECRET\) \|\| "[0-9a-f]{8,}"/, /_SESSION = '\d+_/, /CRON_SECRET = "[0-9a-f]{8,}"/, /sb_secret_[A-Za-z0-9]/, /am_us_inbox[A-Za-z0-9]/, /[a-z0-9]{20}\.supabase\.co/, /XGD_API_KEY = \[/, /"unei0000"|'unei0000'/, /d: '[A-Za-z0-9_-]{40,}'/];

function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, fn); else fn(full);
  }
}

let leaks = 0;
walk('cloud', (file) => {
  if (extname(file) !== '.js') return;
  let text = readFileSync(file, 'utf8');
  for (const [re, to] of SERVER_RULES) text = text.replace(re, to);
  writeFileSync(file, text);
  for (const re of SECRET_CHECKS) if (re.test(text)) { console.error(`まだ鍵が残っています: ${file} (${re})`); leaks += 1; }
});
// cron.sql にも合言葉が書かれている
walk('supabase/edgeone', (file) => {
  if (extname(file) !== '.sql') return;
  writeFileSync(file, readFileSync(file, 'utf8').replace(/"x-cron-secret":"[^"]*"/g, '"x-cron-secret":"YOUR-CRON-SECRET"'));
});
walk('public', (file) => {
  if (!/\.(js|html|json)$/.test(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const re of SECRET_CHECKS.slice(0, 2)) if (re.test(text)) { console.error(`まだ鍵が残っています: ${file} (${re})`); leaks += 1; }
});
// 自動圧縮(auto-compact)から Uch の bot 設定を外す。時報 bot の有無を定期実行のSQL（mixall_cron_call2）が読むため
{
  const file = 'cloud/api/auto-compact.js';
  writeFileSync(file, readFileSync(file, 'utf8').replace(" 'netrify-uch-bots',", ''));
}
if (leaks) process.exit(1);
console.log('imported EdgeOne version into public/, cloud/, supabase/edgeone/');
