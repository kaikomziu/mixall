// server/chat-vault.js
// 端末保存チャット: Pocket / Ghostチャット / Mail / Ghostライブの本文をサーバーに残さない仕組み。
//
// - store.js の setJSON から呼ばれ、保存直前のオブジェクトから本文（text・添付など）を抜き出す。
//   抜き出した本文は public.mixall_chat_inbox へ「宛先アカウントの端末ごと」に入れ、
//   保存されるオブジェクトには vault:true の目印だけを残す（ID・送信者・時刻・既読などのメタ情報は残る）。
// - 端末は API 応答に同梱される __vault を IndexedDB に保存し、次の要求の x-mixall-ack で受領を伝える。
//   受領済みの行はすぐ削除する。未受信の行も30日で期限切れになる。
// - 抜き出しはメモリ上のオブジェクトをその場で書き換える。同じリクエスト内で何度保存しても
//   本文の重複配送が起きないようにするため。

const { STORE_NAMES, getJSON, setJSON, db } = require('../netlify/lib/store');

const DEVICE_ACTIVE_MS = 30 * 24 * 60 * 60 * 1000;
const PULL_LIMIT = 300;
// 旧サイトからの移行分は、利用者が戻ってくるまで長めに保持する
const MIGRATION_EXPIRES_DAYS = 365;
let migrationMode = false;
function setMigrationMode(on) { migrationMode = Boolean(on); }

// メッセージ単位で抜き出す本文フィールド
const MESSAGE_FIELDS = ['text', 'attachment', 'editHistory', 'deletedText', 'deletedAttachment', 'media', 'stamp', 'imageUrl'];

function hasContent(value) {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// 投票は集計をサーバーで行う必要があるため、投票の添付だけはサーバーに残す。
function keepOnServer(field, value) {
  return field === 'attachment' && value && typeof value === 'object' && value.isPoll === true;
}

function stripObject(obj, fields) {
  const taken = {};
  let any = false;
  for (const field of fields) {
    if (!(field in obj)) continue;
    const value = obj[field];
    if (keepOnServer(field, value)) continue;
    if (hasContent(value)) { taken[field] = value; any = true; }
    if (field === 'text' || field === 'subject') obj[field] = '';
    else if (field === 'editHistory') delete obj[field];
    else obj[field] = Array.isArray(value) ? [] : null;
  }
  if (any || obj.vault) obj.vault = true;
  return any ? taken : null;
}

function messageMeta(message) {
  return { authorEmail: message.authorEmail || null, authorName: message.authorName || null, createdAt: message.createdAt || null };
}

// ストアごとの「会話」と「メンバー」の取り出し方
function describe(storeName, key, value) {
  if (!value || typeof value !== 'object') return null;
  if (storeName === STORE_NAMES.POCKET_ROOMS && Array.isArray(value.messages)) {
    return { channel: 'pocket', convId: value.id || key, members: value.memberEmails || [], messages: value.messages };
  }
  if (storeName === STORE_NAMES.GHOST_CHATS && Array.isArray(value.messages)) {
    return { channel: 'ghost-chat', convId: value.id || key, members: value.members || [], messages: value.messages };
  }
  if (storeName === STORE_NAMES.MAIL_THREADS && Array.isArray(value.messages)) {
    return { channel: 'mail', convId: value.id || key, members: value.memberEmails || [], messages: value.messages, threadFields: ['subject'] };
  }
  return null;
}

async function activeDevices(email) {
  const record = await getJSON(STORE_NAMES.CHAT_DEVICES, email);
  const devices = record?.devices || {};
  const now = Date.now();
  return Object.entries(devices).filter(([, info]) => now - Number(info?.lastSeen || 0) < DEVICE_ACTIVE_MS).map(([id]) => id);
}

async function registerDevice(email, deviceId) {
  if (!email || !/^[A-Za-z0-9_-]{8,64}$/.test(String(deviceId || ''))) return;
  const record = (await getJSON(STORE_NAMES.CHAT_DEVICES, email)) || { devices: {} };
  record.devices = record.devices || {};
  const prev = record.devices[deviceId];
  // 書き込み回数を抑えるため、最終利用時刻は1時間に1回だけ更新する
  if (prev && Date.now() - Number(prev.lastSeen || 0) < 60 * 60 * 1000) return;
  record.devices[deviceId] = { lastSeen: Date.now(), firstSeen: prev?.firstSeen || Date.now() };
  for (const [id, info] of Object.entries(record.devices)) if (Date.now() - Number(info?.lastSeen || 0) > DEVICE_ACTIVE_MS) delete record.devices[id];
  await setJSON(STORE_NAMES.CHAT_DEVICES, email, record);
}

async function enqueue(rows) {
  if (!rows.length) return;
  const targets = new Map();
  for (const row of rows) {
    if (!targets.has(row.email)) targets.set(row.email, await activeDevices(row.email));
  }
  const expiresDays = migrationMode ? MIGRATION_EXPIRES_DAYS : 30;
  const expanded = [];
  for (const row of rows) {
    const devices = targets.get(row.email);
    if (devices.length) for (const deviceId of devices) expanded.push({ ...row, device_id: deviceId, expires_days: expiresDays });
    else expanded.push({ ...row, device_id: null, expires_days: expiresDays });
  }
  await db().inboxInsert(expanded);
}

// store.js の setJSON から呼ばれる。value を書き換え、本文を配送キューへ入れる。
async function beforeWrite(storeName, key, value) {
  const info = describe(storeName, key, value);
  if (!info) return;
  const members = Array.from(new Set(info.members.filter((email) => typeof email === 'string' && email.includes('@'))));
  const items = [];
  if (info.threadFields) {
    const taken = stripObject(value, info.threadFields);
    if (taken) items.push({ msgId: info.convId, kind: 'thread', fields: taken, meta: { createdAt: value.createdAt || null } });
  }
  for (const message of info.messages) {
    if (!message || typeof message !== 'object' || !message.id) continue;
    if (message.deleted) { stripObject(message, MESSAGE_FIELDS); continue; }
    const taken = stripObject(message, MESSAGE_FIELDS);
    if (taken) items.push({ msgId: String(message.id), kind: 'message', fields: taken, meta: messageMeta(message) });
  }
  if (!items.length || !members.length) return;
  const rows = [];
  for (const email of members) {
    for (const item of items) {
      rows.push({ email, channel: info.channel, conv_id: String(info.convId), msg_id: item.msgId, kind: item.kind, payload: { ...item, channel: info.channel, convId: String(info.convId) } });
    }
  }
  await enqueue(rows);
}

// Ghostライブのコメントは不特定の視聴者へ配るため配送キューではなく、配信中だけサーバーに置き、
// 終了時（アーカイブ化）に本文を消す。
function stripLiveComments(comments) {
  for (const comment of comments || []) {
    if (comment && comment.isLiveChat) stripObject(comment, ['text', 'stamp', 'media', 'attachment']);
  }
}

// 指定アカウント・端末あての受信待ちを取り出す（受領は ack で別途）
async function pull(email, deviceId, ackId) {
  const device = /^[A-Za-z0-9_-]{8,64}$/.test(String(deviceId || '')) ? String(deviceId) : null;
  if (!device) return null;
  await registerDevice(email, device);
  if (Number(ackId) > 0) await db().inboxAck(email, device, Number(ackId));
  const rows = await db().inboxFetch(email, device, PULL_LIMIT);
  const items = rows.map((row) => ({ seq: Number(row.id), ...row.payload }));
  await applyMinefieldFilter(email, items);
  const maxId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0);
  return { items, maxId, more: rows.length >= PULL_LIMIT };
}

// Pocketの地雷フィルター: 受信者が有効にしている場合、配送時に表示用の文へ変換して原文と一緒に渡す。
// 変換結果はサーバーに保存しない（端末側が originalText と text の両方を持つ）。
async function applyMinefieldFilter(email, items) {
  const targets = items.filter((item) => item.channel === 'pocket' && item.kind === 'message' && item.fields?.text && item.meta?.authorEmail !== email);
  if (!targets.length) return;
  const pocket = require('../netlify/functions/pocket');
  const settings = await pocket.getMinefieldSettings(email);
  if (!settings.enabled) return;
  for (const item of targets) {
    const message = { id: item.msgId, text: item.fields.text, authorEmail: item.meta.authorEmail, authorName: item.meta.authorName };
    const result = await pocket.transformForViewer(message, email, { id: item.convId, memberEmails: [] }, {}, settings, false, { noCache: true });
    if (result.transformed) item.fields = { ...item.fields, originalText: item.fields.text, text: result.text, transformed: true, originalAvailable: true };
  }
}

async function purgeExpired() {
  await db().inboxPurge();
}

// 「chat」API: 端末からの明示的な受信要求（本文の同梱は entry.js が行う）
exports.handler = async (event) => {
  let payload = {};
  try { payload = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : (event.queryStringParameters || {}); } catch { payload = {}; }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: true, action: payload.action || 'pull' }) };
};

module.exports.beforeWrite = beforeWrite;
module.exports.pull = pull;
module.exports.purgeExpired = purgeExpired;
module.exports.stripLiveComments = stripLiveComments;
module.exports.registerDevice = registerDevice;
module.exports.setMigrationMode = setMigrationMode;
module.exports.VAULT_STORES = new Set([STORE_NAMES.POCKET_ROOMS, STORE_NAMES.GHOST_CHATS, STORE_NAMES.MAIL_THREADS]);
