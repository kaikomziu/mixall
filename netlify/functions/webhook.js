const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, listKeys } = require('../lib/store');
const { getAccountProfile } = require('../lib/session');
const { notifyRecipients } = require('../lib/notifications');
const { runOfficialRules, hasOfficialAutomations } = require('../lib/official');
const { enqueueBackgroundTask } = require('../lib/background-jobs');
const pocket = require('./pocket');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function safe(value, max = 2000) { return String(value ?? '').trim().slice(0, max); }
function header(event, name) {
  const headers = event.headers || {};
  const wanted = String(name).toLowerCase();
  const key = Object.keys(headers).find((item) => String(item).toLowerCase() === wanted);
  return key ? String(headers[key] || '') : '';
}
function newId() { return crypto.randomBytes(12).toString('hex'); }
function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function signature(secret, rawBody) { return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'); }
function validId(value) { return /^[a-zA-Z0-9_-]{8,80}$/.test(String(value || '')); }
function normalizeEmail(value) {
  const email = safe(value, 160).toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?@bix\.3erver$/.test(email) ? email : null;
}
function idempotencyKey(value, rawBody) {
  return safe(value, 120) || crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
}
async function consumeRateLimit(config) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 30;
  const currentStart = Number(config.rateWindowStart) || 0;
  const start = now - currentStart >= windowMs ? now : currentStart;
  const count = start === currentStart ? Number(config.rateCount) || 0 : 0;
  if (count >= limit) return false;
  config.rateWindowStart = start;
  config.rateCount = count + 1;
  await setJSON(STORE_NAMES.WEBHOOKS, `webhook:${config.id}`, config);
  return true;
}

async function getWebhook(id) {
  if (!validId(id)) return null;
  return getJSON(STORE_NAMES.WEBHOOKS, `webhook:${id}`);
}
async function listOwnedWebhooks(ownerEmail) {
  const result = [];
  for (const key of await listKeys(STORE_NAMES.WEBHOOKS, 'webhook:')) {
    const item = await getJSON(STORE_NAMES.WEBHOOKS, key);
    if (item && item.ownerEmail === ownerEmail) result.push({
      id: item.id,
      name: item.name,
      type: item.type,
      enabled: item.enabled !== false,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || null,
      endpoint: `${process.env.MIXALL_API_BASE || '/.netlify/functions'}/webhook?id=${encodeURIComponent(item.id)}`
    });
  }
  return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function postPocket(config, payload, event) {
  const roomId = safe(payload.roomId, 100);
  const room = await getJSON(STORE_NAMES.POCKET_ROOMS, roomId);
  if (!room || !Array.isArray(room.memberEmails) || !room.memberEmails.includes(config.ownerEmail)) {
    return { status: 404, body: { error: 'Webhook所有者が参加しているPocketルームだけ指定できます' } };
  }
  const text = safe(payload.text, 12000);
  let attachment = null;
  if (payload.attachment && payload.attachment.fileId) {
    const fileId = safe(payload.attachment.fileId, 120);
    if (!/^[a-zA-Z0-9_-]{4,120}$/.test(fileId)) return { status: 400, body: { error: 'attachment.fileIdの形式が不正です' } };
    attachment = {
      fileId,
      name: safe(payload.attachment.name, 160) || 'file',
      type: safe(payload.attachment.type, 120) || 'application/octet-stream',
      sizeBytes: Math.max(0, Number(payload.attachment.sizeBytes) || 0),
      isStamp: payload.attachment.isStamp === true
    };
  }
  if (!text && !attachment) return { status: 400, body: { error: 'textまたはattachmentが必要です' } };
  const replyTo = payload.replyTo ? safe(payload.replyTo, 100) : null;
  const replyTarget = replyTo ? (room.messages || []).find((message) => message.id === replyTo && !message.deleted) : null;
  if (replyTo && !replyTarget) return { status: 404, body: { error: '返信先メッセージが見つかりません' } };
  room.messages = Array.isArray(room.messages) ? room.messages : [];
  const profile = await getAccountProfile(config.ownerEmail);
  const message = {
    id: newId(),
    authorEmail: config.ownerEmail,
    authorName: room.nicknames?.[config.ownerEmail] || profile.displayName || config.ownerEmail,
    text,
    attachment,
    replyTo,
    threadId: replyTo || null,
    createdAt: new Date().toISOString(),
    webhookId: config.id
  };
  room.messages.push(message);
  const mentionedEmails = Array.from(new Set((text.match(/@[A-Za-z0-9._%+-]+@bix\.3erver/g) || []).map((value) => value.slice(1).toLowerCase())));
  await setJSON(STORE_NAMES.POCKET_ROOMS, room.id, room);
  await notifyRecipients(room.memberEmails, `pocket:${room.id}`, {
    type: 'pocketMessage', scope: `pocket:${room.id}`, roomId: room.id, messageId: message.id,
    actorEmail: config.ownerEmail, title: room.title || 'Pocket', body: '新しいメッセージがあります',
    isReply: Boolean(replyTarget), replyToEmail: replyTarget?.authorEmail || null,
    isMessage: true, mentionedEmails, url: `/Pocket/room.html?id=${encodeURIComponent(room.id)}`
  });
  if ((room.bots || []).some((bot) => bot.enabled !== false) || await hasOfficialAutomations('pocket')) {
    const task = { roomId:room.id, messageId:message.id, text, hasAttachment:Boolean(attachment) };
    try { await enqueueBackgroundTask(event, 'pocket-bots', task); }
    catch (dispatchError) {
      console.error('Webhook Pocket bot Background Function dispatch failed; using inline fallback:', dispatchError);
      try { await pocket.processBackgroundTask(task, crypto.randomBytes(24).toString('hex')); }
      catch (fallbackError) { console.error('Webhook Pocket bot fallback failed:', fallbackError); }
    }
  }
  return { status: 201, body: { ok: true, type: 'pocket', roomId: room.id, messageId: message.id } };
}

async function postMail(config, payload, event) {
  const toEmail = normalizeEmail(payload.toEmail || payload.recipientEmail);
  if (!toEmail) return { status: 400, body: { error: 'toEmailは@bix.3erver形式で指定してください' } };
  if (!await getJSON(STORE_NAMES.ACCOUNTS, toEmail)) return { status: 404, body: { error: '宛先アカウントが見つかりません' } };
  const subject = safe(payload.subject, 180) || '(WebhookからのMail)';
  const text = safe(payload.text || payload.body, 12000);
  if (!text) return { status: 400, body: { error: 'textまたはbodyが必要です' } };
  const requestedThreadId = safe(payload.threadId, 100);
  let thread = requestedThreadId ? await getJSON(STORE_NAMES.MAIL_THREADS, requestedThreadId) : null;
  if (thread && (!Array.isArray(thread.memberEmails) || !thread.memberEmails.includes(config.ownerEmail) || !thread.memberEmails.includes(toEmail))) {
    return { status: 403, body: { error: '指定されたMailスレッドを利用する権限がありません' } };
  }
  if (!thread) {
    thread = {
      id: newId(), subject, memberEmails: [config.ownerEmail, toEmail],
      readBy: { [config.ownerEmail]: new Date().toISOString() }, messages: [], createdAt: new Date().toISOString()
    };
  }
  const message = { id: newId(), authorEmail: config.ownerEmail, authorName: config.ownerEmail, text, attachment: null, createdAt: new Date().toISOString(), webhookId: config.id };
  thread.subject = subject;
  thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
  thread.messages.push(message);
  thread.updatedAt = message.createdAt;
  await setJSON(STORE_NAMES.MAIL_THREADS, thread.id, thread);
  if (await hasOfficialAutomations('mail')) {
    const task = { threadId:thread.id, messageId:message.id, isReply:Boolean(requestedThreadId), text };
    try { await enqueueBackgroundTask(event, 'mail-official-bots', task); }
    catch (dispatchError) {
      console.error('Webhook Mail bot Background Function dispatch failed; using inline fallback:', dispatchError);
      try { await processMailOfficialTask(task, crypto.randomBytes(24).toString('hex')); }
      catch (fallbackError) { console.error('Webhook Mail bot fallback failed:', fallbackError); }
    }
  }
  return { status: 201, body: { ok: true, type: 'mail', threadId: thread.id, messageId: message.id } };
}

async function processMailOfficialTask(payload, jobId) {
  const thread = await getJSON(STORE_NAMES.MAIL_THREADS, String(payload?.threadId || ''));
  if (!thread || !Array.isArray(thread.messages)) return;
  const message = thread.messages.find((item) => item.id === String(payload?.messageId || '') && !item.deleted);
  if (!message) return;
  const replies = await runOfficialRules({ channel:'mail', text:String(payload?.text ?? message.text ?? ''), authorEmail:message.authorEmail, sourceId:message.id, threadId:thread.id, isReply:Boolean(payload?.isReply), now:Date.now(), historyMessageCount:thread.messages.length, history:thread.messages.slice(-24).map((item) => `[${item.authorName || item.authorEmail}] ${item.text}`).join('\n'), jobId });
  const latest = await getJSON(STORE_NAMES.MAIL_THREADS, thread.id);
  if (!latest || !Array.isArray(latest.messages) || !latest.messages.some((item) => item.id === message.id && !item.deleted)) return;
  for (const reply of replies) {
    const ruleIndex = Number.isInteger(reply.ruleIndex) ? reply.ruleIndex : 0;
    if (latest.messages.some((item) => item.backgroundJobId === jobId && item.officialAccountId === reply.account.id && item.backgroundRuleIndex === ruleIndex)) continue;
    const id = crypto.createHash('sha256').update(`mail-official:${jobId}:${reply.account.id}:${ruleIndex}`).digest('hex').slice(0, 20);
    latest.messages.push({ id, authorEmail:`official:${reply.account.id}`, authorName:reply.account.displayName, text:reply.text, attachment:null, isBot:true, isOfficial:true, officialAccountId:reply.account.id, backgroundRuleIndex:ruleIndex, replyTo:message.id, backgroundJobId:jobId, createdAt:new Date().toISOString() });
  }
  await setJSON(STORE_NAMES.MAIL_THREADS, latest.id, latest);
}
exports.processBackgroundTask = processMailOfficialTask;

async function parseBody(event) {
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : String(event.body || '');
  try { return { rawBody, payload: JSON.parse(rawBody || '{}') }; } catch { return { rawBody, payload: null }; }
}

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  const query = event.queryStringParameters || {};
  const config = await getWebhook(safe(query.id, 80));
  if (!config || config.enabled === false) return json(404, { error: 'Webhookが見つからないか、停止されています' });
  const { rawBody, payload } = await parseBody(event);
  const provided = (header(event, 'x-mixall-signature') || header(event, 'x-webhook-signature')).replace(/^sha256=/i, '').trim();
  if (!provided || !timingSafeEqualText(provided, signature(config.secret, rawBody))) return json(401, { error: '署名が不正です' });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(400, { error: 'JSONオブジェクトが必要です' });
  const type = payload.type || config.type;
  if (type !== config.type || !['mail', 'pocket'].includes(type)) return json(400, { error: `このWebhookは${config.type}専用です` });
  const key = idempotencyKey(payload.idempotencyKey || header(event, 'x-idempotency-key'), rawBody);
  const replayKey = `replay:${config.id}:${key}`;
  if (await getJSON(STORE_NAMES.WEBHOOKS, replayKey)) return json(200, { ok: true, duplicate: true });
  if (!await consumeRateLimit(config)) return json(429, { error: 'Webhookの利用回数が上限に達しました。1分後に再試行してください' });
  const result = type === 'mail' ? await postMail(config, payload, event) : await postPocket(config, payload, event);
  if (result.status >= 200 && result.status < 300) await setJSON(STORE_NAMES.WEBHOOKS, replayKey, { receivedAt: new Date().toISOString() });
  return json(result.status, result.body);
};

const handler = exports.handler;
module.exports = { handler, signature, processBackgroundTask:processMailOfficialTask };
