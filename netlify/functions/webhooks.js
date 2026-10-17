const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireSession } = require('../lib/session');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function newId() { return crypto.randomBytes(12).toString('hex'); }
function newSecret() { return crypto.randomBytes(32).toString('hex'); }
function safe(value, max = 100) { return String(value ?? '').trim().slice(0, max); }
function validId(value) { return /^[a-zA-Z0-9_-]{8,80}$/.test(String(value || '')); }
function publicWebhook(item) {
  return {
    id: item.id, name: item.name, type: item.type, enabled: item.enabled !== false,
    createdAt: item.createdAt, updatedAt: item.updatedAt || null,
    endpoint: `${process.env.MIXALL_API_BASE || '/.netlify/functions'}/webhook?id=${encodeURIComponent(item.id)}`
  };
}
async function ownedWebhook(email, id) {
  if (!validId(id)) return null;
  const item = await getJSON(STORE_NAMES.WEBHOOKS, `webhook:${id}`);
  return item && item.ownerEmail === email ? item : null;
}
async function ownedWebhooks(email) {
  const result = [];
  for (const key of await listKeys(STORE_NAMES.WEBHOOKS, 'webhook:')) {
    const item = await getJSON(STORE_NAMES.WEBHOOKS, key);
    if (item && item.ownerEmail === email) result.push(publicWebhook(item));
  }
  return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なリクエストです' }); }
  const email = await requireSession(payload.token);
  if (!email) return json(401, { error: 'ログインが必要です' });
  const action = payload.action;

  if (action === 'list') return json(200, { webhooks: await ownedWebhooks(email) });

  if (action === 'create') {
    const type = ['mail', 'pocket'].includes(payload.type) ? payload.type : null;
    if (!type) return json(400, { error: '種類はmailまたはpocketを指定してください' });
    const existing = await ownedWebhooks(email);
    if (existing.length >= 20) return json(429, { error: '作成できるWebhookは1アカウント20個までです' });
    const id = newId();
    const item = {
      id, type, ownerEmail: email, name: safe(payload.name, 80) || `${type === 'mail' ? 'Mail' : 'Pocket'} Webhook`,
      enabled: true, secret: newSecret(), createdAt: new Date().toISOString()
    };
    await setJSON(STORE_NAMES.WEBHOOKS, `webhook:${id}`, item);
    return json(201, { webhook: publicWebhook(item), secret: item.secret, warning: '秘密鍵は今回だけ表示されます。安全な場所へ保存してください。' });
  }

  if (action === 'toggle') {
    const item = await ownedWebhook(email, payload.id);
    if (!item) return json(404, { error: 'Webhookが見つかりません' });
    item.enabled = payload.enabled === true;
    item.updatedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.WEBHOOKS, `webhook:${item.id}`, item);
    return json(200, { webhook: publicWebhook(item) });
  }

  if (action === 'rotate') {
    const item = await ownedWebhook(email, payload.id);
    if (!item) return json(404, { error: 'Webhookが見つかりません' });
    item.secret = newSecret(); item.updatedAt = new Date().toISOString(); item.enabled = true;
    await setJSON(STORE_NAMES.WEBHOOKS, `webhook:${item.id}`, item);
    return json(200, { webhook: publicWebhook(item), secret: item.secret, warning: '旧秘密鍵は無効になりました。新しい秘密鍵へ更新してください。' });
  }

  if (action === 'delete') {
    const item = await ownedWebhook(email, payload.id);
    if (!item) return json(404, { error: 'Webhookが見つかりません' });
    await deleteKey(STORE_NAMES.WEBHOOKS, `webhook:${item.id}`);
    for (const key of await listKeys(STORE_NAMES.WEBHOOKS, `replay:${item.id}:`)) await deleteKey(STORE_NAMES.WEBHOOKS, key);
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
};
