// scripts/migrate-backup.mjs
// 旧Netlify版MixAllの運営バックアップZIP（分割パートも可）を Supabase 版へ取り込む。
//   MIXALL_MIGRATION_SECRET=... node scripts/migrate-backup.mjs backup-part1.zip [backup-part2.zip ...] [--api URL] [--dry-run]
// - ストアごとに小分けして mixall-api/migrate へ送る（チャット本文はサーバー側で自動的に端末行きキューへ回る）
// - 旧サイトのログインセッション等は移さない（サーバー側で除外）
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const argv = process.argv.slice(2);
const files = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--api'));
const api = (argv[argv.indexOf('--api') + 1] && argv.includes('--api') ? argv[argv.indexOf('--api') + 1] : 'https://kifnzvktwbomxthzvvgy.supabase.co/functions/v1/mixall-api').replace(/\/$/, '');
const dryRun = argv.includes('--dry-run');
const secret = process.env.MIXALL_MIGRATION_SECRET || '';
if (!files.length) { console.error('使い方: node scripts/migrate-backup.mjs <backup.zip> [...]'); process.exit(1); }
if (!dryRun && secret.length < 24) { console.error('MIXALL_MIGRATION_SECRET を設定してください'); process.exit(1); }

const BATCH_BYTES = 1_500_000;
// アカウントを先に入れておくと、チャットの宛先端末の判定などが安定する
const ORDER = ['ACCOUNTS', 'OFFICIAL_ACCOUNTS', 'ADMIN_SECRETS'];

const byStore = new Map();
let manifest = null;
for (const file of files) {
  // 旧形式: 1つのJSON（{ format:'netrify-data-backup', stores:{ ストア名:[{key,value}] } }）
  if (file.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.format !== 'netrify-data-backup' || !data.stores) throw new Error(`${file}: MixAllのJSONバックアップではありません`);
    manifest = manifest || data;
    for (const [name, entries] of Object.entries(data.stores)) {
      if (!Array.isArray(entries)) continue;
      if (!byStore.has(name)) byStore.set(name, []);
      byStore.get(name).push(...entries);
    }
    continue;
  }
  const zip = unzipSync(new Uint8Array(readFileSync(file)));
  const names = Object.keys(zip);
  const manifestName = names.find((n) => n === 'backup/manifest.json') || names.find((n) => n === 'manifest.json');
  if (!manifestName) throw new Error(`${file}: manifest.json がありません（MixAllのバックアップZIPではない可能性）`);
  manifest = manifest || JSON.parse(strFromU8(zip[manifestName]));
  for (const name of names.sort()) {
    const m = name.match(/^blob\/([^/]+)\/part-[0-9]{6}\.json$/);
    if (!m) continue;
    const parsed = JSON.parse(strFromU8(zip[name]));
    if (!Array.isArray(parsed.entries)) throw new Error(`${file}:${name} に entries がありません`);
    if (!byStore.has(m[1])) byStore.set(m[1], []);
    byStore.get(m[1]).push(...parsed.entries);
  }
}

console.log(`バックアップ: ${manifest?.createdAt || '日時不明'} / 形式 ${manifest?.format}`);
const stores = [...byStore.keys()].sort((a, b) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});
let total = 0;
for (const store of stores) {
  const entries = byStore.get(store);
  const bytes = entries.reduce((n, e) => n + JSON.stringify(e).length, 0);
  console.log(`${store.padEnd(26)} ${String(entries.length).padStart(7)}件  ${(bytes / 1024).toFixed(0).padStart(8)} KiB`);
  total += entries.length;
  if (dryRun) continue;
  let batch = [], size = 0, written = 0;
  const flush = async () => {
    if (!batch.length) return;
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetch(`${api}/migrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, store, entries: batch }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { written += Number(data.written || 0); if (data.skipped) written = -1; break; }
      if (attempt >= 4) throw new Error(`${store}: ${res.status} ${data.error || ''}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    batch = []; size = 0;
  };
  for (const entry of entries) {
    const n = JSON.stringify(entry).length;
    if (batch.length && size + n > BATCH_BYTES) await flush();
    batch.push(entry); size += n;
  }
  await flush();
  console.log(`  → ${written < 0 ? '対象外（移行しないストア）' : `${written}件 書き込み`}`);
}
console.log(`合計 ${total}件${dryRun ? '（--dry-run: 送信なし）' : ''}`);
