const { STORE_NAMES, getJSON } = require('./store');
const EMAIL_TEMPLATE_PATH = '/.netlify/functions/emails/';
async function getEmailSettings() {
  const stored = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'email:settings');
  return { provider:String(stored?.provider || process.env.NETLIFY_EMAILS_PROVIDER || '').toLowerCase(), providerApiKey:String(stored?.providerApiKey || process.env.NETLIFY_EMAILS_PROVIDER_API_KEY || ''), secret:String(stored?.secret || process.env.NETLIFY_EMAILS_SECRET || ''), from:String(stored?.from || process.env.MIXALL_EMAIL_FROM || ''), mailgunDomain:String(stored?.mailgunDomain || process.env.NETLIFY_EMAILS_MAILGUN_DOMAIN || ''), mailgunHostRegion:String(stored?.mailgunHostRegion || process.env.NETLIFY_EMAILS_MAILGUN_HOST_REGION || ''), webhookId:String(stored?.webhookId || ''), webhookSecret:String(stored?.webhookSecret || '') };
}

function configuredSiteOrigin(event) {
  const candidate = process.env.MIXALL_SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!candidate) throw new Error('NetlifyサイトURLが設定されていません');
  const url = new URL(candidate);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('NetlifyサイトURLの形式が不正です');
  if (process.env.CONTEXT === 'production' && url.protocol !== 'https:') throw new Error('本番のサイトURLはHTTPSである必要があります');
  return url.origin;
}

async function emailConfigurationMissing() {
  const settings=await getEmailSettings();
  if(settings.provider==='brevo'||settings.provider==='agentmail') return !settings.providerApiKey || !settings.from;
  if(!['mailgun','sendgrid','postmark'].includes(settings.provider)||!settings.providerApiKey||!settings.secret||!settings.from)return true;
  if(settings.provider==='mailgun'&&(!settings.mailgunDomain||!['eu','non-eu'].includes(settings.mailgunHostRegion)))return true;
  return false;
}

function buildSiteUrl(event, pathname) {
  return new URL(pathname, configuredSiteOrigin(event)).toString();
}

async function sendEmailTemplate(event, { template, to, subject, parameters, attachments, replyToMessageId }) {
  if (await emailConfigurationMissing()) {
    const error = new Error('メール送信設定が未完了です。Netlify Email Integrationと送信元アドレスを設定してください');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  if (!/^[a-z0-9-]{1,64}$/.test(String(template || ''))) throw new Error('メールテンプレートが不正です');
  const settings = await getEmailSettings();
  if (settings.provider === 'agentmail') return sendViaAgentMail(settings, { to, subject, parameters, attachments, replyToMessageId });
  if (settings.provider === 'brevo') {
    const params = parameters || {};
    const body = String(params.body || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const reset = params.resetUrl ? `<p><a href=\"${String(params.resetUrl).replace(/\"/g,'') }\">パスワード再設定を開く</a></p>` : '';
    const verify = params.code ? `<p>確認コード: <strong>${String(params.code)}</strong></p>` : '';
    const htmlContent = `<div><p>${body}</p>${verify}${reset}</div>`;
    const brevoAttachments = (Array.isArray(attachments) ? attachments : []).map((item) => ({ name:String(item.filename || item.name || 'attachment'), content:String(item.content || '') }));
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method:'POST', headers:{'Content-Type':'application/json','api-key':settings.providerApiKey}, body:JSON.stringify({ sender:{email:settings.from}, to:[{email:String(to)}], subject:String(subject), htmlContent, ...(brevoAttachments.length ? {attachment:brevoAttachments} : {}) }) });
    if (!response.ok) { console.error('Brevo rejected a message:', response.status); const error = new Error('Brevoでメールを送信できませんでした'); error.code='EMAIL_DELIVERY_FAILED'; throw error; }
    return true;
  }
  const origin = configuredSiteOrigin(event);
  const response = await fetch(new URL(`${EMAIL_TEMPLATE_PATH}${template}`, origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'netlify-emails-secret': settings.secret },
    body: JSON.stringify({ from:settings.from, to:String(to), subject:String(subject), parameters:parameters || {}, ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}) })
  });
  if (!response.ok) {
    console.error('Netlify Email Integration rejected a message:', response.status);
    const error = new Error('メールを送信できませんでした。メール連携・送信元認証・プロバイダー設定を確認してください');
    error.code = 'EMAIL_DELIVERY_FAILED';
    throw error;
  }
  return true;
}

// ---- AgentMail（https://agentmail.to）----
// 共用の受信箱（例: agent-3097@agentmail.to）から送る。相手が返信すると Webhook で MixAll+ のMailに戻る。
const AGENTMAIL_API = 'https://api.agentmail.to/v0';

async function agentMailRequest(apiKey, method, path, body) {
  const response = await fetch(`${AGENTMAIL_API}${path}`, { method, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    console.error('AgentMail rejected a request:', response.status, data?.name || '', data?.code || '', data?.message || '');
    const error = new Error(`AgentMailでエラーが発生しました（${response.status}${data?.message ? `: ${data.message}` : ''}）`);
    error.code = 'EMAIL_DELIVERY_FAILED';
    error.status = response.status;
    throw error;
  }
  return data;
}

function mailPageUrl() {
  const base = String(process.env.MIXALL_SITE_URL || '').replace(/\/+$/, '');
  return base ? `${base}/Mail/` : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendViaAgentMail(settings, { to, subject, parameters, attachments, replyToMessageId }) {
  if (!settings.webhookSecret) { try { await ensureAgentMailWebhook(); } catch (error) { console.error('agentmail webhook setup failed:', error.message); } }
  const params = parameters || {};
  let text; let html;
  if (params.senderAccount) {
    const who = `${String(params.senderName || params.senderAccount)}（${params.senderAccount}）`;
    const footer = 'このメールに返信すると、MixAll+ のMailで相手に届きます。';
    text = `${params.body || ''}\n\n--\nMixAll+ の ${who} さんからのメールです。\n${footer}${mailPageUrl() ? `\n${mailPageUrl()}` : ''}`;
    html = `<div style="font-family:sans-serif;line-height:1.7">${escapeHtml(params.body || '').replace(/\n/g, '<br>')}</div>`
      + `<hr style="border:0;border-top:1px solid #ddd;margin:20px 0 10px"><p style="font-size:12px;color:#888;margin:0">MixAll+ の <b>${escapeHtml(who)}</b> さんからのメールです。<br>${footer}</p>`;
  } else {
    const lines = [params.body, params.code ? `確認コード: ${params.code}` : '', params.resetUrl ? `パスワード再設定: ${params.resetUrl}` : ''].filter(Boolean);
    text = lines.join('\n\n');
    html = `<div style="font-family:sans-serif;line-height:1.7">${lines.map((line) => escapeHtml(line).replace(/\n/g, '<br>')).join('<br><br>')}</div>`;
  }
  const files = (Array.isArray(attachments) ? attachments : []).map((item) => ({ filename: String(item.filename || item.name || 'attachment'), content_type: String(item.type || 'application/octet-stream'), content: String(item.content || '') }));
  const inbox = encodeURIComponent(settings.from);
  const body = { text, html, ...(files.length ? { attachments: files } : {}) };
  if (replyToMessageId) {
    try { return normalizeAgentMailResult(await agentMailRequest(settings.providerApiKey, 'POST', `/inboxes/${inbox}/messages/${encodeURIComponent(replyToMessageId)}/reply`, { ...body, to: [String(to)] })); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  return normalizeAgentMailResult(await agentMailRequest(settings.providerApiKey, 'POST', `/inboxes/${inbox}/messages/send`, { ...body, to: [String(to)], subject: String(subject) }));
}

function normalizeAgentMailResult(data) {
  return { provider: 'agentmail', messageId: data?.message_id || null, threadId: data?.thread_id || null };
}

// 返信を取り込むWebhookがまだ無ければ登録する（受信箱限定キーでは inbox_ids を付けられないので付けずに再試行）
async function ensureAgentMailWebhook({ force = false } = {}) {
  const stored = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'email:settings');
  if (!stored || stored.provider !== 'agentmail' || !stored.providerApiKey || !stored.from) return { ok: false, reason: 'not agentmail' };
  if (stored.webhookSecret && !force) return { ok: true, existing: true };
  const apiBase = String(process.env.MIXALL_API_BASE || '').replace(/\/+$/, '');
  if (!apiBase) return { ok: false, reason: 'MIXALL_API_BASE missing' };
  if (stored.webhookId) { try { await agentMailRequest(stored.providerApiKey, 'DELETE', `/webhooks/${encodeURIComponent(stored.webhookId)}`); } catch (_) {} }
  const body = { url: `${apiBase}/agentmail-webhook`, event_types: ['message.received'] };
  let hook;
  try { hook = await agentMailRequest(stored.providerApiKey, 'POST', '/webhooks', { ...body, inbox_ids: [stored.from] }); }
  catch (error) { if (error.status !== 403) throw error; hook = await agentMailRequest(stored.providerApiKey, 'POST', '/webhooks', body); }
  const { setJSON } = require('./store');
  await setJSON(STORE_NAMES.ADMIN_SECRETS, 'email:settings', { ...stored, webhookId: hook?.webhook_id || null, webhookSecret: hook?.secret || '' });
  return { ok: Boolean(hook?.secret), webhookId: hook?.webhook_id || null };
}

module.exports = { buildSiteUrl, sendEmailTemplate, emailConfigurationMissing, getEmailSettings, agentMailRequest, ensureAgentMailWebhook };
