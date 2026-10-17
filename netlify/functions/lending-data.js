// 貸し出しサイトごとのBlobデータAPI。
// キーはサイト内の安全な名前に限定し、公開データと非公開データを分離する。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireSession, requireAdmin } = require('../lib/session');

const MAX_VALUE_BYTES = 512 * 1024;
const MAX_SITE_DATA_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 200;

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function newId() { return crypto.randomBytes(8).toString('hex'); }
function safeSlug(input) {
  const slug = String(input || '').trim().toLowerCase();
  return /^[a-z0-9-]{2,40}$/.test(slug) ? slug : null;
}
function safeKey(input) {
  const key = String(input || '').trim();
  return /^[a-zA-Z0-9._-]{1,80}$/.test(key) ? key : null;
}
function valueBytes(value) { return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8'); }
async function siteFor(slug) { return getJSON(STORE_NAMES.LENDING_SITES, slug); }
async function dataRecords(slug) {
  const keys = await listKeys(STORE_NAMES.LENDING_DATA, `${slug}:`);
  const records = [];
  for (const storageKey of keys) {
    const record = await getJSON(STORE_NAMES.LENDING_DATA, storageKey);
    if (record && record.slug === slug) records.push(record);
  }
  return records;
}

exports.handler = async (event) => {

  try { return await handle(event); } catch (err) { console.error('lending-data function error:', err); return json(500, { error: `内部エラー: ${err.message}` }); }
};

async function handle(event) {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};
  let payload = {};
  if (method === 'POST') {
    try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なリクエストです' }); }
  } else if (method !== 'GET') return json(405, { error: 'GETまたはPOSTのみ対応しています' });

  const source = method === 'GET' ? qs : payload;
  const slug = safeSlug(source.slug);
  if (!slug) return json(400, { error: 'サイト識別子が不正です' });
  const site = await siteFor(slug);
  if (!site) return json(404, { error: 'サイトが見つかりません' });

  if (method === 'GET') {
    const key = safeKey(qs.key);
    if (qs.public === '1') {
      if (!key) return json(400, { error: 'データキーが必要です' });
      const record = await getJSON(STORE_NAMES.LENDING_DATA, `${slug}:${key}`);
      if (!record || !record.publicRead) return json(404, { error: '公開データが見つかりません' });
      return json(200, { data: { key: record.key, value: record.value, contentType: record.contentType, updatedAt: record.updatedAt } });
    }
    const token = qs.token;
    const email = await requireSession(token);
    const isAdmin = Boolean(await requireAdmin(token));
    if (!email || (site.ownerEmail !== email && !isAdmin)) return json(403, { error: 'サイト所有者または運営のみ利用できます' });
    const records = await dataRecords(slug);
    if (key) {
      const record = records.find((item) => item.key === key);
      return record ? json(200, { data: record }) : json(404, { error: 'データが見つかりません' });
    }
    return json(200, { data: records.map((record) => ({ key: record.key, contentType: record.contentType, publicRead: record.publicRead, bytes: valueBytes(record.value), updatedAt: record.updatedAt })) });
  }

  const token = payload.token;
  const email = await requireSession(token);
  const isAdmin = Boolean(await requireAdmin(token));
  if (!email || (site.ownerEmail !== email && !isAdmin)) return json(403, { error: 'サイト所有者または運営のみ利用できます' });
  const action = payload.action;
  const key = safeKey(payload.key);
  if (!key) return json(400, { error: 'データキーは英数字、ドット、ハイフン、アンダースコアを1〜80文字で指定してください' });

  if (action === 'saveData') {
    const value = payload.value;
    if (value === undefined || value === null) return json(400, { error: '保存する値が必要です' });
    const bytes = valueBytes(value);
    if (bytes > MAX_VALUE_BYTES) return json(400, { error: '1件のデータは512KBまでです' });
    const records = await dataRecords(slug);
    const existing = records.find((record) => record.key === key);
    if (!existing && records.length >= MAX_ITEMS) return json(400, { error: `サイトごとのデータ件数は${MAX_ITEMS}件までです` });
    const totalBytes = records.reduce((sum, record) => sum + valueBytes(record.value), 0) - (existing ? valueBytes(existing.value) : 0) + bytes;
    if (totalBytes > MAX_SITE_DATA_BYTES) return json(400, { error: 'サイトごとのデータ容量は5MBまでです' });
    const now = new Date().toISOString();
    const record = { id: existing?.id || newId(), slug, key, value, contentType: String(payload.contentType || 'application/json').slice(0, 100), publicRead: payload.publicRead === true, ownerEmail: site.ownerEmail, createdAt: existing?.createdAt || now, updatedAt: now };
    await setJSON(STORE_NAMES.LENDING_DATA, `${slug}:${key}`, record);
    return json(200, { data: { key, contentType: record.contentType, publicRead: record.publicRead, bytes, updatedAt: now } });
  }

  if (action === 'deleteData') {
    const existing = await getJSON(STORE_NAMES.LENDING_DATA, `${slug}:${key}`);
    if (!existing) return json(404, { error: 'データが見つかりません' });
    await deleteKey(STORE_NAMES.LENDING_DATA, `${slug}:${key}`);
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
}

