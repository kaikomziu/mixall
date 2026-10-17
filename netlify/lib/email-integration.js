const { STORE_NAMES, getJSON } = require('./store');
const EMAIL_TEMPLATE_PATH = '/.netlify/functions/emails/';
async function getEmailSettings() {
  const stored = await getJSON(STORE_NAMES.ADMIN_SECRETS, 'email:settings');
  return { provider:String(stored?.provider || process.env.NETLIFY_EMAILS_PROVIDER || '').toLowerCase(), providerApiKey:String(stored?.providerApiKey || process.env.NETLIFY_EMAILS_PROVIDER_API_KEY || ''), secret:String(stored?.secret || process.env.NETLIFY_EMAILS_SECRET || ''), from:String(stored?.from || process.env.MIXALL_EMAIL_FROM || ''), mailgunDomain:String(stored?.mailgunDomain || process.env.NETLIFY_EMAILS_MAILGUN_DOMAIN || ''), mailgunHostRegion:String(stored?.mailgunHostRegion || process.env.NETLIFY_EMAILS_MAILGUN_HOST_REGION || '') };
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
  if(settings.provider==='brevo') return !settings.providerApiKey || !settings.from;
  if(!['mailgun','sendgrid','postmark'].includes(settings.provider)||!settings.providerApiKey||!settings.secret||!settings.from)return true;
  if(settings.provider==='mailgun'&&(!settings.mailgunDomain||!['eu','non-eu'].includes(settings.mailgunHostRegion)))return true;
  return false;
}

function buildSiteUrl(event, pathname) {
  return new URL(pathname, configuredSiteOrigin(event)).toString();
}

async function sendEmailTemplate(event, { template, to, subject, parameters, attachments }) {
  if (await emailConfigurationMissing()) {
    const error = new Error('メール送信設定が未完了です。Netlify Email Integrationと送信元アドレスを設定してください');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  if (!/^[a-z0-9-]{1,64}$/.test(String(template || ''))) throw new Error('メールテンプレートが不正です');
  const settings = await getEmailSettings();
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

module.exports = { buildSiteUrl, sendEmailTemplate, emailConfigurationMissing, getEmailSettings };
