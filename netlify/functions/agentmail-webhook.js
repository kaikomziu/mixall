// netlify/functions/agentmail-webhook.js
// AgentMail の Webhook（message.received）を受け取り、外部の相手からの返信を Mail のスレッドに追加する。
// 署名は Svix 形式（svix-id / svix-timestamp / svix-signature）。秘密値は運営画面で保存した設定に入っている。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON } = require('../lib/store');
const { getEmailSettings } = require('../lib/email-integration');
const { addNotification } = require('../lib/notifications');

const MAX_TEXT_BYTES = 100 * 1024;
const TOLERANCE_SEC = 5 * 60;

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

function verifySvix(secret, headers, rawBody) {
  const id = headers['svix-id'] || headers['webhook-id'];
  const timestamp = headers['svix-timestamp'] || headers['webhook-timestamp'];
  const signatures = String(headers['svix-signature'] || headers['webhook-signature'] || '');
  if (!secret || !id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SEC) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return signatures.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const a = Buffer.from(value); const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

function parseAddress(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw || '');
  const match = /<([^>]+)>/.exec(text);
  const email = (match ? match[1] : text).trim().toLowerCase();
  const name = match ? text.slice(0, match.index).replace(/^"|"$/g, '').trim() : '';
  return { email, name };
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// 返信の引用部分（「> 」の行や「〜 wrote:」以降）を取り除く
function stripQuoted(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = `${line} ${lines[i + 1] || ''}`;
    if (/^\s*>/.test(line)) break;
    if (/^On .+wrote:\s*$/i.test(line) || /^On .+$/i.test(line) && /wrote:\s*$/i.test(lines[i + 1] || '')) break;
    if (/(\d{4}年.*(書きました|wrote)|.+<[^>]+>\s*(のメッセージ|は書きました)).*[:：]\s*$/.test(next) && /[:：]\s*$/.test(lines[i + 1] || line)) break;
    if (/^-{2,}\s*(Original Message|元のメッセージ)/i.test(line)) break;
    if (/^--\s*$/.test(line) && /MixAll\+/.test(lines.slice(i, i + 3).join(' '))) break;
    out.push(line);
  }
  const result = out.join('\n').trim();
  return result || String(text || '').trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : String(event.body || '');
  const settings = await getEmailSettings();
  if (settings.provider !== 'agentmail' || !settings.webhookSecret) return json(503, { error: 'not configured' });
  if (!verifySvix(settings.webhookSecret, event.headers || {}, rawBody)) return json(401, { error: 'invalid signature' });

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return json(400, { error: 'invalid json' }); }
  if (payload.event_type !== 'message.received' || !payload.message) return json(200, { ok: true, ignored: true });

  // 同じイベントの再送は一度だけ処理する
  const eventKey = `event:${String(payload.event_id || payload.message.message_id || '').slice(0, 120)}`;
  if (await getJSON(STORE_NAMES.AGENTMAIL, eventKey)) return json(200, { ok: true, duplicate: true });
  await setJSON(STORE_NAMES.AGENTMAIL, eventKey, { at: new Date().toISOString() });

  const message = payload.message;
  const link = message.thread_id ? await getJSON(STORE_NAMES.AGENTMAIL, `thread:${message.thread_id}`) : null;
  if (!link) { console.log('agentmail: no matching thread for', message.thread_id); return json(200, { ok: true, unmatched: true }); }
  const thread = await getJSON(STORE_NAMES.MAIL_THREADS, link.mailThreadId);
  if (!thread || !thread.externalRecipient) return json(200, { ok: true, unmatched: true });

  // スレッドの相手（最初に送った宛先）からのメールだけを取り込む
  const from = parseAddress(message.from);
  if (from.email !== String(thread.externalRecipient).toLowerCase()) {
    console.log('agentmail: sender does not match thread recipient');
    return json(200, { ok: true, ignored: true });
  }

  let text = stripQuoted(message.extracted_text || message.text || htmlToText(message.html));
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) text = `${Buffer.from(text, 'utf8').subarray(0, MAX_TEXT_BYTES).toString('utf8')}\n…（長いため省略しました）`;
  const createdAt = new Date().toISOString();
  thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
  thread.messages.push({
    id: crypto.randomBytes(8).toString('hex'),
    authorEmail: from.email,
    authorName: from.name || from.email,
    text: text || '（本文なし）',
    attachment: null,
    external: true,
    createdAt
  });
  thread.agentmail = { threadId: message.thread_id, lastMessageId: message.message_id || thread.agentmail?.lastMessageId || null };
  await setJSON(STORE_NAMES.MAIL_THREADS, thread.id, thread);

  for (const member of thread.memberEmails || []) {
    if (member === from.email) continue;
    await addNotification(member, { type: 'mail', scope: `mail:${thread.id}`, title: `${from.name || from.email} さんから返信が届きました`, body: 'Mailを開いて確認してください', url: `/Mail/Thread/${thread.id}/`, actorEmail: from.email });
  }
  return json(200, { ok: true });
};
