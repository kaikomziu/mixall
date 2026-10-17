const { STORE_NAMES, getJSON, setJSON } = require('../lib/store');
const { requireSession } = require('../lib/session');
const { getNotificationSettings, saveNotificationSettings, listNotifications } = require('../lib/notifications');

function json(status, body) { return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }; }
exports.handler = async (event) => {

  try {
    const payload = event.httpMethod === 'GET' ? (event.queryStringParameters || {}) : JSON.parse(event.body || '{}');
    const email = await requireSession(payload.token);
    if (!email) return json(401, { error: 'ログインが必要です' });
    const scope = String(payload.scope || 'global').slice(0, 160);
    if (event.httpMethod === 'GET') return json(200, { settings: await getNotificationSettings(email, scope), notifications: await listNotifications(email) });
    if (payload.action === 'getSettings') return json(200, { settings: await getNotificationSettings(email, scope) });
    if (payload.action === 'saveSettings') return json(200, { settings: await saveNotificationSettings(email, scope, payload.settings || {}) });
    if (payload.action === 'markRead') {
      const item = await getJSON(STORE_NAMES.NOTIFICATIONS, `${email}:${payload.id}`);
      if (item && item.recipientEmail === email) { item.read = true; await setJSON(STORE_NAMES.NOTIFICATIONS, `${email}:${payload.id}`, item); }
      return json(200, { ok: true });
    }
    return json(400, { error: '不明なactionです' });
  } catch (error) { console.error('notifications error:', error); return json(500, { error: `内部エラー: ${error.message}` }); }
};
