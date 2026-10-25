// 自動圧縮(バックグラウンド): Supabase(第1)のテキスト行をgzipに置き直して容量を空ける。
// Supabase の pg_cron から10分おきに呼ばれる(supabase/cron.sql)。運営が押す必要はない。読む側は自動で展開する。
import { getStore, setEnv, kvCompressBatch } from '../_lib/blobs.js';
import { CRON_SECRET } from '../_lib/config.js';

const STORES = ['netrify-uch-threads', 'netrify-pocket-rooms', 'netrify-mail-threads', 'netrify-ghost-posts', 'netrify-ghost-chats', 'netrify-stamps',
  'netrify-attachments', 'netrify-file-chunks', 'netrify-file-manifests', 'netrify-lending-sites', 'netrify-lending-data', 'netrify-custom-rooms', 'netrify-custom-projects',
  'netrify-custom-data', 'netrify-calendars', 'netrify-languages', 'netrify-tools-data', 'netrify-wiki-pages', 'netrify-extensions', 'netrify-extension-data', 'netrify-webhooks',
  'netrify-coins', 'netrify-gemini-memories', 'netrify-search-history', 'netrify-admin-files', 'netrify-admin-audit', 'netrify-notifications', 'netrify-ghost-tags',
  'netrify-official-accounts', 'netrify-maws', 'netrify-appstore'];
const SYS = 'netrify-system', CUR = 'compact-cursor';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequest(context) {
  const { request, env } = context;
  setEnv(env);
  const isCron = request.headers.get('x-cron-secret') === ((env && env.CRON_SECRET) || CRON_SECRET);
  const ping = new URL(request.url).searchParams.get('ping') === '1'; // ログイン中のブラウザが10分に1回こっそり呼ぶ(cron未設定でも進むように)
  if (!isCron && !ping) return json({ error: 'forbidden' }, 403);
  const t0 = Date.now();
  const sys = getStore({ name: SYS });
  let cur = {};
  try { cur = JSON.parse((await sys.get(CUR, { type: 'text' })) || '{}'); } catch (_) {}
  if (!isCron && Date.now() - (cur.at || 0) < 5 * 60 * 1000) return json({ ok: true, skipped: 'recent' });
  let i = Number.isInteger(cur.i) ? cur.i % STORES.length : 0, after = cur.after || '';
  let saved = 0, compressed = 0, scanned = 0, rounds = 0;
  try {
    while (Date.now() - t0 < 20000 && rounds < 12) {
      const r = await kvCompressBatch(STORES[i], after, 60);
      rounds++; saved += r.saved; compressed += r.compressed; scanned += r.scanned;
      if (r.done) { i = (i + 1) % STORES.length; after = ''; } else after = r.next || '';
    }
  } catch (e) { /* 容量が満杯などで書けないときは次回に持ち越し */ }
  try { await sys.set(CUR, JSON.stringify({ i, after, at: Date.now(), lastSaved: saved })); } catch (_) {}
  return json({ ok: true, store: STORES[i], scanned, compressed, savedBytes: saved });
}
