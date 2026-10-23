// netlify/lib/avatar-storage.js
// アカウントのアイコン画像・動画を Supabase Storage の公開バケット（mixall-avatars）に置く。
// 以前は data URL のままアカウント（mixall_kv）に入れていたため、アカウントを読むたび・返すたびに
// 数百KBが転送され、Supabaseの転送量（Egress）を大きく消費していた。
// Storage に置けば、アカウントにはURL（約150文字）だけが入り、画像はCDNのキャッシュから配られる。
const crypto = require('crypto');

const BUCKET = 'mixall-avatars';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv' };

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

function publicPrefix() {
  const c = config();
  const url = c ? c.url : String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  return url ? `${url}/storage/v1/object/public/${BUCKET}/` : null;
}

// このバケットに置いたアイコンのURLか
function isStoredAvatarUrl(value) {
  const prefix = publicPrefix();
  return Boolean(prefix && typeof value === 'string' && value.startsWith(prefix) && /^[a-z0-9/._-]+$/i.test(value.slice(prefix.length)));
}

// data URL をアップロードして公開URLを返す。Storage の設定が無い環境（ローカル検証など）では data URL のまま返す
async function storeAvatarDataUrl(email, dataUrl) {
  const c = config();
  const match = /^data:([a-z0-9.+/-]+);base64,(.*)$/is.exec(String(dataUrl || ''));
  if (!c || !match) return dataUrl;
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const ext = EXT[mime];
  if (!ext) return dataUrl;
  const body = Buffer.from(match[2], 'base64');
  // 中身のハッシュをファイル名にする（同じ画像は同じURL。中身が変わればURLも変わるので長くキャッシュできる）
  const owner = crypto.createHash('sha256').update(String(email)).digest('hex').slice(0, 16);
  const name = crypto.createHash('sha256').update(body).digest('hex').slice(0, 32);
  const path = `${owner}/${name}.${ext}`;
  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}`, apikey: c.key, 'Content-Type': mime, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' },
    body
  });
  if (!res.ok) throw new Error(`アイコンの保存に失敗しました (${res.status})`);
  return `${publicPrefix()}${path}`;
}

// 使わなくなったアイコンを消す（このバケットのものだけ。失敗しても処理は続ける）
async function removeStoredAvatar(url) {
  const c = config();
  if (!c || !isStoredAvatarUrl(url)) return;
  const path = url.slice(publicPrefix().length);
  try {
    await fetch(`${c.url}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${c.key}`, apikey: c.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] })
    });
  } catch (_) { /* 消し損ねても表示には影響しない */ }
}

// まだ data URL のまま入っているアカウントのアイコンを Storage へ移す（起動時・設定の再読み込み時に呼ぶ）。
// 対象が無ければ「キーだけ」を問い合わせる軽い確認で終わる。アイコン以外の項目は触らない（jsonb_set で1項目だけ置き換え）
let migrating = false;
async function migrateDataUrlAvatars() {
  if (migrating || !config()) return;
  // eslint-disable-next-line global-require
  const { db, STORE_NAMES } = require('./store');
  const store = db();
  if (typeof store.sql !== 'function') return;
  migrating = true;
  try {
    const sql = store.sql;
    const pending = await sql`select key from public.mixall_kv
      where store = ${STORE_NAMES.ACCOUNTS} and value->>'avatarDataUrl' like 'data:%' limit 20`;
    for (const { key } of pending) {
      const rows = await sql`select value->>'avatarDataUrl' as avatar from public.mixall_kv where store = ${STORE_NAMES.ACCOUNTS} and key = ${key}`;
      const avatar = rows[0] && rows[0].avatar;
      if (!avatar || !avatar.startsWith('data:')) continue;
      const url = await storeAvatarDataUrl(key, avatar);
      if (!url || url === avatar) continue;
      // 移している間にアイコンが変えられていたら上書きしない
      await sql`update public.mixall_kv
        set value = jsonb_set(value, '{avatarDataUrl}', to_jsonb(${url}::text)),
            bytes = octet_length(jsonb_set(value, '{avatarDataUrl}', to_jsonb(${url}::text))::text),
            updated_at = now()
        where store = ${STORE_NAMES.ACCOUNTS} and key = ${key} and value->>'avatarDataUrl' = ${avatar}`;
    }
  } catch (error) {
    console.error('avatar migration failed:', error.message);
  } finally {
    migrating = false;
  }
}

module.exports = { BUCKET, isStoredAvatarUrl, storeAvatarDataUrl, removeStoredAvatar, migrateDataUrlAvatars };
