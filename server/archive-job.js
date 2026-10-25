// server/archive-job.js
// 毎日の「Supabase → GitHub（kaikomziu/mixall-data）」書き出し用の API（/mixall-api/archive-job）。
// mixall-data の GitHub Actions（scripts/archive.mjs）が x-archive-secret を付けて呼ぶ。
// 仕組みは v27c の運営「データ書き出し」（cloud/api/archive.js）と同じ: 暗号化したファイルを MIXALL_DATA_URL に置き、
// 置き場に同じ内容があると確かめられた行だけ Supabase から消す。読む側（cloud/_lib/blobs.js）は Supabase に無いキーを置き場から読む。
import { archiveName, archiveSeal, archiveOpen, kvConfig, kvDeleteKey, kvKeysPrefix } from './cloud/_lib/blobs.js';

// 書き出してよいストア（アカウント・セッション・秘密情報は含めない）。更新の多いストア（ぽけっとルーム・Uchスレッド・通知・Coin・Ghostチャット）は
// 書き出しても毎日戻ってくるだけなので外す。netrify-uch-bots は時報botの定期実行SQL（mixall_cron_call2）が読むので外す
export const STORES = [
  'netrify-mail-threads','netrify-ghost-posts', 'netrify-stamps',
  'netrify-attachments', 'netrify-file-chunks', 'netrify-file-manifests', 'netrify-lending-sites',
  'netrify-lending-data', 'netrify-custom-rooms', 'netrify-custom-projects', 'netrify-custom-data',
  'netrify-calendars', 'netrify-languages', 'netrify-tools-data', 'netrify-wiki-pages',
  'netrify-extensions', 'netrify-extension-data', 'netrify-webhooks', 'netrify-gemini-memories',
  'netrify-search-history', 'netrify-admin-files', 'netrify-admin-audit', 'netrify-ghost-tags', 'netrify-official-accounts'
];
// この日数より前から更新されていない行だけ書き出す（書き出した直後に書き換わる行を避ける）
const QUIET_DAYS = 1;
const EXPORT_BYTES = 3_000_000;

const enc = encodeURIComponent;
const pmap = async (items, limit, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };

async function rest(path, init = {}) {
  const { url, key } = kvConfig();
  const headers = { apikey: key, 'Content-Type': 'application/json', ...(init.headers || {}) };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res;
}

// 置き場（GitHub Pages）から読む。CDN のキャッシュ（最大10分）を避けるため毎回別のURLにする
function dataUrl(env) {
  return String(env.MIXALL_DATA_URL || '').replace(/\/+$/, '');
}
async function liveJson(env, path) {
  try {
    const r = await fetch(`${dataUrl(env)}${path}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}
async function liveIndex(env, store) {
  const j = await archiveOpen(await liveJson(env, `/data/${enc(store)}/_index.json`));
  return j && Array.isArray(j.keys) ? new Set(j.keys) : null;
}

async function tombKeys(store) {
  const out = []; let after = '';
  for (;;) {
    const ks = await kvKeysPrefix('_deleted', store + '/', after, 500);
    out.push(...ks.map((k) => k.slice(store.length + 1)));
    if (ks.length < 500) return out;
    after = ks[ks.length - 1];
  }
}

const ACTIONS = {
  stores: async () => ({ stores: STORES }),

  // Supabase に残っている（しばらく更新されていない）行を、暗号化したファイルにして返す
  async export(p) {
    const store = p.store;
    const before = new Date(Date.now() - QUIET_DAYS * 86400000).toISOString();
    const after = p.after ? `&key=gt.${enc(p.after)}` : '';
    // 大きい行（ファイル本体など）をまとめて読むと時間切れになるので、先にキーだけ取り、中身は数件ずつ読む
    const keys = (await (await rest(`kv?store=eq.${enc(store)}${after}&updated_at=lt.${enc(before)}&select=key&order=key.asc&limit=200`)).json()).map((r) => r.key);
    const page = []; let size = 0, read = 0;
    while (read < keys.length && size < EXPORT_BYTES) {
      const batch = keys.slice(read, read + 4);
      const got = await Promise.all(batch.map(async (key) => (await (await rest(`kv?store=eq.${enc(store)}&key=eq.${enc(key)}&select=key,value,encoding,metadata`)).json())[0]));
      for (const r of got) if (r) { page.push(r); size += String(r.value || '').length; }
      read += batch.length;
    }
    const rows = keys.slice(0, read);
    const files = await pmap(page, 16, async (r) => ({
      key: r.key,
      name: await archiveName(store, r.key),
      box: await archiveSeal({ key: r.key, value: r.value, encoding: r.encoding, metadata: r.metadata || null })
    }));
    return { files, next: rows.length ? rows[rows.length - 1] : null, done: keys.length < 200 && read === keys.length };
  },

  // 削除された（_deleted に記録がある）キー。Supabase にまた作られたキーは除く
  async tombs(p) {
    const keys = await tombKeys(p.store);
    const alive = new Set();
    for (let i = 0; i < keys.length; i += 100) {
      const list = keys.slice(i, i + 100).map((k) => `"${k.replace(/["\\]/g, (c) => '\\' + c)}"`).join(',');
      const res = await rest(`kv?store=eq.${enc(p.store)}&key=in.(${enc(list)})&select=key`);
      for (const r of await res.json()) alive.add(r.key);
    }
    const dead = keys.filter((k) => !alive.has(k));
    return { tombs: await pmap(dead, 32, async (key) => ({ key, name: await archiveName(p.store, key) })) };
  },

  // 置き場の索引（暗号化）を作り直す: いまの索引 + 追加 - 削除
  async index(p) {
    const old = p.existing ? await archiveOpen(p.existing) : null;
    if (p.existing && !old) throw new Error('いまの索引を読めません（MIXALL_ARCHIVE_SECRET が変わった?）');
    const keys = new Set(Array.isArray(old && old.keys) ? old.keys : []);
    for (const k of p.add || []) keys.add(String(k));
    for (const k of p.remove || []) keys.delete(String(k));
    const sorted = [...keys].sort();
    return { box: await archiveSeal({ keys: sorted, updatedAt: new Date().toISOString() }), count: sorted.length };
  },

  // 置き場に同じ内容があると確かめられた行だけ Supabase から消す
  async purge(p, env) {
    const store = p.store;
    const indexed = await liveIndex(env, store);
    if (!indexed) return { deleted: 0, failed: 0, done: true, skipped: true };
    const after = p.after ? `&key=gt.${enc(p.after)}` : '';
    const rows = await (await rest(`kv?store=eq.${enc(store)}${after}&select=key&order=key.asc&limit=60`)).json();
    let deleted = 0, failed = 0;
    await pmap(rows.filter((r) => indexed.has(r.key)), 8, async ({ key }) => {
      const file = await archiveOpen(await liveJson(env, `/data/${enc(store)}/${await archiveName(store, key)}.json`));
      const row = (await (await rest(`kv?store=eq.${enc(store)}&key=eq.${enc(key)}&select=value,encoding,updated_at`)).json())[0];
      if (!row || !row.updated_at || !file || file.key !== key || file.value !== row.value || file.encoding !== row.encoding) { failed += 1; return; }
      // 前に消されて作り直されたキーの削除記録が残っていると、置き場の内容が読まれなくなるので先に消す
      await kvDeleteKey('_deleted', `${store}/${key}`);
      // 確かめている間に書き換えられた行は消さない
      const gone = await (await rest(`kv?store=eq.${enc(store)}&key=eq.${enc(key)}&updated_at=eq.${enc(row.updated_at)}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' }
      })).json();
      if (gone.length) deleted += 1; else failed += 1;
    });
    return { deleted, failed, next: rows.length ? rows[rows.length - 1].key : null, done: rows.length < 60 };
  },

  // 置き場の索引にもう無いキーの削除記録を片付ける
  async purgeTombs(p, env) {
    const indexed = await liveIndex(env, p.store);
    if (!indexed) return { removed: 0, skipped: true };
    let removed = 0;
    for (const key of await tombKeys(p.store)) {
      if (!indexed.has(key)) { await kvDeleteKey('_deleted', `${p.store}/${key}`); removed += 1; }
    }
    return { removed };
  }
};

export async function archiveJob(request, env) {
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const secret = env.MIXALL_ARCHIVE_JOB_SECRET || '';
  if (request.method !== 'POST') return reply(405, { error: 'POSTのみ対応しています' });
  if (!secret || request.headers.get('x-archive-secret') !== secret) return reply(403, { error: 'forbidden' });
  if (!env.MIXALL_ARCHIVE_SECRET || !dataUrl(env)) return reply(500, { error: 'MIXALL_ARCHIVE_SECRET / MIXALL_DATA_URL が未設定です' });
  let p;
  try { p = await request.json(); } catch (_) { return reply(400, { error: 'invalid json' }); }
  const fn = ACTIONS[p.action];
  if (!fn) return reply(400, { error: '不明なactionです' });
  if (p.action !== 'stores' && !STORES.includes(p.store)) return reply(400, { error: '対象外のストアです' });
  try {
    return reply(200, await fn(p, env));
  } catch (e) {
    return reply(500, { error: String(e?.message || e).slice(0, 300) });
  }
}
