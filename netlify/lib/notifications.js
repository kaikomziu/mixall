const { STORE_NAMES, getJSON, setJSON, listKeys } = require('./store');
const crypto = require('crypto');

function notificationId() { return crypto.randomBytes(10).toString('hex'); }
function settingsKey(email, scope) { return `${String(email).toLowerCase()}:${String(scope)}`; }
function defaultSettings() { return { reply: true, all: false, mention: true }; }

async function getNotificationSettings(email, scope) {
  const value = await getJSON(STORE_NAMES.NOTIFICATION_SETTINGS, settingsKey(email, scope));
  return { ...defaultSettings(), ...(value && typeof value === 'object' ? value : {}) };
}

async function saveNotificationSettings(email, scope, input) {
  const settings = { reply: Boolean(input?.reply), all: Boolean(input?.all), mention: Boolean(input?.mention) };
  await setJSON(STORE_NAMES.NOTIFICATION_SETTINGS, settingsKey(email, scope), settings);
  return settings;
}

async function addNotification(recipientEmail, data) {
  const email = String(recipientEmail || '').toLowerCase();
  if (!email) return null;
  const record = { id: notificationId(), recipientEmail: email, read: false, createdAt: new Date().toISOString(), ...data };
  await setJSON(STORE_NAMES.NOTIFICATIONS, `${email}:${record.id}`, record);
  return record;
}

async function listNotifications(email, limit = 100) {
  const prefix = `${String(email).toLowerCase()}:`;
  const keys = await listKeys(STORE_NAMES.NOTIFICATIONS);
  const values = [];
  for (const key of keys) if (key.startsWith(prefix)) { const item = await getJSON(STORE_NAMES.NOTIFICATIONS, key); if (item) values.push(item); }
  return values.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
}

module.exports = { getNotificationSettings, saveNotificationSettings, addNotification, listNotifications };

async function notifyRecipients(recipients, scope, event) {
  const unique = Array.from(new Set(recipients.filter(Boolean).map((value) => String(value).toLowerCase())));
  for (const recipient of unique) {
    if (recipient === String(event.actorEmail || '').toLowerCase()) continue;
    const settings = await getNotificationSettings(recipient, scope);
    const mentioned = Array.isArray(event.mentionedEmails) && event.mentionedEmails.includes(recipient);
    const shouldNotify = ((event.isReply && String(event.replyToEmail || '').toLowerCase() === recipient) && settings.reply) || (event.isMessage && settings.all) || (mentioned && settings.mention);
    if (shouldNotify) await addNotification(recipient, event);
  }
}
module.exports.notifyRecipients = notifyRecipients;

module.exports.settingsKey = settingsKey;
