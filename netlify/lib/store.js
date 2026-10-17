// netlify/lib/store.js
// 旧Netlify Blobsの代わりに、SupabaseのPostgresテーブル public.mixall_kv をKVとして使う共通ラッパー。
// 既存の関数から見たAPI（getJSON / setJSON / deleteKey / listKeys / chunked系）は従来どおり。
// Netlify時代の論理シャード（容量ローテーション）はPostgresでは不要なので廃止した。

const STORE_NAMES = {
  ACCOUNTS: 'netrify-accounts', UCH_THREADS: 'netrify-uch-threads', UCH_BOTS: 'netrify-uch-bots', UCH_AI_JOBS: 'netrify-uch-ai-jobs',
  SESSIONS: 'netrify-sessions', PRESENCE: 'netrify-presence', POCKET_ROOMS: 'netrify-pocket-rooms',
  MAIL_THREADS: 'netrify-mail-threads', GHOST_POSTS: 'netrify-ghost-posts', GHOST_STAMPS: 'netrify-stamps', GHOST_TAGS: 'netrify-ghost-tags', GHOST_MODERATION: 'netrify-ghost-age-moderation',
  LENDING_SITES: 'netrify-lending-sites', LENDING_DATA: 'netrify-lending-data', ADMIN_AUDIT: 'netrify-admin-audit',
  SITE_STATE: 'netrify-site-state', CALLS: 'netrify-calls', ADMIN_FILES: 'netrify-admin-files',
  ADMIN_SECRETS: 'netrify-admin-secrets', GHOST_ID_REQUESTS: 'netrify-ghost-id-requests', GHOST_CHATS: 'netrify-ghost-chats', SESSION_LOGOUTS: 'netrify-session-logout-requests', ATTACHMENTS: 'netrify-attachments',
  CUSTOM_ROOMS: 'netrify-custom-rooms', CUSTOM_PROJECTS: 'netrify-custom-projects', CUSTOM_DATA: 'netrify-custom-data', CUSTOM_SIGNALS: 'netrify-custom-signals', FILE_CHUNKS: 'netrify-file-chunks', FILE_MANIFESTS: 'netrify-file-manifests',
  STAMPS: 'netrify-stamps', COINS: 'netrify-coins', STAMP_OWNERS: 'netrify-stamp-owners',
  NOTIFICATION_SETTINGS: 'netrify-notification-settings', NOTIFICATIONS: 'netrify-notifications', COIN_EARNING_SITES: 'netrify-coin-earning-sites', WEBHOOKS: 'netrify-webhooks', LANGUAGES: 'netrify-languages', CALENDARS: 'netrify-calendars', OFFICIAL_ACCOUNTS: 'netrify-official-accounts', GEMINI_MEMORIES: 'netrify-gemini-memories', SEARCH_HISTORY: 'netrify-search-history',
  TOOL_DATA: 'netrify-tools-data', MESSAGE_FILTER_SETTINGS: 'netrify-message-filter-settings', MESSAGE_FILTER_CACHE: 'netrify-message-filter-cache', ANON_BOXES: 'netrify-anon-boxes', TEMP_ROOMS: 'netrify-temporary-rooms', TEMP_SHARES: 'netrify-temporary-shares', WIKI: 'netrify-wiki-pages', EXTENSIONS: 'netrify-extensions', EXTENSION_DATA: 'netrify-extension-data', AI_JOBS: 'netrify-ai-background-jobs', ACCOUNT_RECOVERY: 'netrify-account-recovery',
  // 端末保存チャット用: アカウントごとの端末一覧
  CHAT_DEVICES: 'mixall-chat-devices'
};

// ---- バックエンド -------------------------------------------------------
// MIXALL_STORE=memory のときはプロセス内Map（ローカル検証用）。それ以外はPostgres。
let backend = null;

function memoryBackend() {
  const data = new Map();
  const inbox = [];
  let seq = 0;
  const id = (s, k) => `${s}\u0000${k}`;
  return {
    async get(s, k) { const v = data.get(id(s, k)); return v === undefined ? null : JSON.parse(v); },
    async getMany(s, keys) { const out = new Map(); for (const k of keys) { const v = data.get(id(s, k)); if (v !== undefined) out.set(k, JSON.parse(v)); } return out; },
    async set(s, k, v) { data.set(id(s, k), JSON.stringify(v)); },
    async del(s, k) { data.delete(id(s, k)); },
    async list(s, prefix) { const head = `${s}\u0000${prefix || ''}`; return [...data.keys()].filter((key) => key.startsWith(head)).map((key) => key.slice(s.length + 1)).sort(); },
    async inboxInsert(rows) { for (const row of rows) inbox.push({ id: ++seq, ...row, created_at: Date.now() }); },
    async inboxFetch(email, device, limit) { return inbox.filter((row) => row.email === email && (row.device_id === device || row.device_id === null)).slice(0, limit); },
    async inboxAck(email, device, maxId) { for (let i = inbox.length - 1; i >= 0; i -= 1) { const row = inbox[i]; if (row.email === email && (row.device_id === device || row.device_id === null) && row.id <= maxId) inbox.splice(i, 1); } },
    async inboxPurge() {},
    async sql() { throw new Error('memory backendではSQLを使えません'); },
    _data: data,
    _inbox: inbox
  };
}

function postgresBackend() {
  const url = process.env.SUPABASE_DB_URL || process.env.MIXALL_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URLが設定されていません');
  // eslint-disable-next-line global-require
  const postgres = globalThis.__mixallPostgres || require('postgres');
  const sql = postgres(url, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10 });
  return {
    async get(s, k) {
      const rows = await sql`select value from public.mixall_kv where store = ${s} and key = ${k}`;
      return rows.length ? rows[0].value : null;
    },
    async getMany(s, keys) {
      const out = new Map();
      if (!keys.length) return out;
      const rows = await sql`select key, value from public.mixall_kv where store = ${s} and key = any(${keys})`;
      for (const row of rows) out.set(row.key, row.value);
      return out;
    },
    async set(s, k, v) {
      const text = JSON.stringify(v === undefined ? null : v);
      await sql`insert into public.mixall_kv (store, key, value, bytes, updated_at)
        values (${s}, ${k}, ${text}::jsonb, ${Buffer.byteLength(text, 'utf8')}, now())
        on conflict (store, key) do update set value = excluded.value, bytes = excluded.bytes, updated_at = now()`;
    },
    async del(s, k) { await sql`delete from public.mixall_kv where store = ${s} and key = ${k}`; },
    async inboxInsert(rows) {
      if (!rows.length) return;
      const values = rows.map((row) => ({ email: row.email, device_id: row.device_id, channel: row.channel, conv_id: row.conv_id, msg_id: row.msg_id, kind: row.kind || 'message', payload: row.payload, expires_at: new Date(Date.now() + Number(row.expires_days || 30) * 86400000) }));
      for (let i = 0; i < values.length; i += 500) {
        await sql`insert into public.mixall_chat_inbox ${sql(values.slice(i, i + 500), 'email', 'device_id', 'channel', 'conv_id', 'msg_id', 'kind', 'payload', 'expires_at')}`;
      }
    },
    async inboxFetch(email, device, limit) {
      return sql`select id, payload from public.mixall_chat_inbox
        where email = ${email} and (device_id = ${device} or device_id is null) and expires_at > now()
        order by id limit ${limit}`;
    },
    async inboxAck(email, device, maxId) {
      await sql`delete from public.mixall_chat_inbox where email = ${email} and (device_id = ${device} or device_id is null) and id <= ${maxId}`;
    },
    async inboxPurge() { await sql`delete from public.mixall_chat_inbox where expires_at <= now()`; },
    async list(s, prefix) {
      const pattern = `${String(prefix || '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const rows = await sql`select key from public.mixall_kv where store = ${s} and key like ${pattern} order by key`;
      return rows.map((row) => row.key);
    },
    sql
  };
}

function db() {
  if (!backend) backend = process.env.MIXALL_STORE === 'memory' ? memoryBackend() : postgresBackend();
  return backend;
}

// ---- 公開API ------------------------------------------------------------

async function getJSON(storeName, key) {
  return db().get(storeName, String(key));
}

async function getManyJSON(storeName, keys) {
  return db().getMany(storeName, keys.map(String));
}

let chatVault = null;
async function setJSON(storeName, key, value) {
  // 端末保存チャットのストアは、本文を抜き出して配送キューへ回してから保存する
  if (!chatVault) chatVault = require('../../server/chat-vault');
  if (chatVault.VAULT_STORES.has(storeName)) await chatVault.beforeWrite(storeName, String(key), value);
  await db().set(storeName, String(key), value);
}

async function deleteKey(storeName, key) {
  await db().del(storeName, String(key));
}

async function listKeys(storeName, prefix) {
  return db().list(storeName, prefix);
}

async function putChunkedText(storeName, fileId, text, meta = {}) {
  const raw = String(text || '');
  const chunkSize = Math.max(64 * 1024, Number(process.env.BLOBS_CHUNK_SIZE_BYTES || 512 * 1024));
  const chunks = [];
  let offset = 0;
  for (let index = 0; offset < raw.length || index === 0; index += 1) {
    const chunk = raw.slice(offset, offset + chunkSize);
    chunks.push({ index, bytes: Buffer.byteLength(chunk, 'utf8') });
    await setJSON(storeName, `chunk:${fileId}:${String(index).padStart(8, '0')}`, { fileId, index, data: chunk });
    offset += chunk.length;
    if (offset >= raw.length) break;
  }
  await setJSON(storeName, `meta:${fileId}`, { fileId, totalChunks:chunks.length, bytes:Buffer.byteLength(raw, 'utf8'), ...meta, createdAt:new Date().toISOString() });
  return { fileId, totalChunks:chunks.length, bytes:Buffer.byteLength(raw, 'utf8') };
}

async function getChunkedText(storeName, fileId) {
  const meta = await getJSON(storeName, `meta:${fileId}`);
  if (!meta) return null;
  const chunks = [];
  for (let index = 0; index < Number(meta.totalChunks || 0); index += 1) {
    const item = await getJSON(storeName, `chunk:${fileId}:${String(index).padStart(8, '0')}`);
    if (!item) return null;
    chunks.push(item.data || '');
  }
  return { ...meta, data:chunks.join('') };
}

async function deleteChunked(storeName, fileId) {
  const meta = await getJSON(storeName, `meta:${fileId}`);
  if (meta) for (let index = 0; index < Number(meta.totalChunks || 0); index += 1) await deleteKey(storeName, `chunk:${fileId}:${String(index).padStart(8, '0')}`);
  await deleteKey(storeName, `meta:${fileId}`);
}

module.exports = { STORE_NAMES, getJSON, getManyJSON, setJSON, deleteKey, listKeys, putChunkedText, getChunkedText, deleteChunked, db };
