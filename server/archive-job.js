// server/archive-job.js
// 1時間ごとの定期処理から呼ばれ、しばらく書き換えられていない大きなファイル類を GitHub のデータ置き場へ移す。
// 移した行は小さなスタブに置き換える。移している間に書き換えられた行は置き換えない（updated_at で確認）。
const { db, ARCHIVE_STORES } = require('../netlify/lib/store');
const archive = require('../netlify/lib/github-archive');

const MIN_BYTES = 16 * 1024;
const COLD_AFTER = '1 hour';

async function archiveColdFiles({ limit = 30, timeBudgetMs = 100 * 1000 } = {}) {
  if (!archive.config().enabled) return { skipped: 'not configured' };
  const { sql } = db();
  const started = Date.now();
  const rows = await sql`select store, key, updated_at from public.mixall_kv
    where store = any(${[...ARCHIVE_STORES]}) and bytes >= ${MIN_BYTES}
      and updated_at < now() - ${COLD_AFTER}::interval and not (value ? '__archived')
    order by updated_at limit ${limit}`;
  let moved = 0; let freed = 0; const errors = [];
  for (const row of rows) {
    if (Date.now() - started > timeBudgetMs) break;
    try {
      const [full] = await sql`select value, bytes from public.mixall_kv where store = ${row.store} and key = ${row.key} and updated_at = ${row.updated_at}`;
      if (!full) continue;
      const stub = await archive.archive(row.store, row.key, full.value);
      const text = JSON.stringify(stub);
      const done = await sql`update public.mixall_kv set value = ${sql.json(stub)}, bytes = ${Buffer.byteLength(text, 'utf8')}
        where store = ${row.store} and key = ${row.key} and updated_at = ${row.updated_at} returning key`;
      if (done.length) { moved += 1; freed += Number(full.bytes || 0); }
    } catch (error) {
      errors.push(`${row.store}: ${error.message}`);
      if (errors.length >= 3) break;
    }
  }
  const remaining = await sql`select count(*)::int as n from public.mixall_kv
    where store = any(${[...ARCHIVE_STORES]}) and bytes >= ${MIN_BYTES} and not (value ? '__archived')`;
  if (errors.length) console.error('[archive-job]', errors.join(' / '));
  return { moved, freedBytes: freed, remaining: remaining[0].n, errors };
}

module.exports = { archiveColdFiles };
