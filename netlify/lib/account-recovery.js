const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('./store');
const { getSessionInfo } = require('./session');
const { buildSiteUrl, sendEmailTemplate, emailConfigurationMissing } = require('./email-integration');

const RECOVERY_STORE = STORE_NAMES.ACCOUNT_RECOVERY;
const VERIFY_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESET_MESSAGE = '該当アカウントに確認済みの回復メールが登録されている場合、再設定案内を送信します。';

function json(status, body) {
  return { statusCode:status, headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }, body:JSON.stringify(body) };
}
function normalizeLoginId(input) {
  if (!input) return null;
  let local = String(input).trim().toLowerCase();
  if (local.endsWith('@bix.3erver')) local = local.slice(0, -'@bix.3erver'.length);
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(local)) return null;
  return `${local}@bix.3erver`;
}
function normalizeRealEmail(input) {
  const email = String(input || '').trim().toLowerCase();
  if (!email || email.length > 254 || /[\s\r\n\0]/.test(email) || /@bix\.3erver$/i.test(email)) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (domain.length > 253 || !domain.includes('.') || domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  return email;
}
function digestHex(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function recoveryHmacSecret() { return process.env.ACCOUNT_RECOVERY_SECRET || process.env.NETLIFY_EMAILS_SECRET || ''; }
function verificationDigest(accountEmail, email, nonce, code) {
  const secret = recoveryHmacSecret();
  if (!secret) throw new Error('回復コード用の秘密鍵が未設定です');
  return crypto.createHmac('sha256', secret).update(`${accountEmail}\n${email}\n${nonce}\n${code}`).digest('hex');
}
function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(String(left || '')) || !/^[a-f0-9]{64}$/.test(String(right || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
async function findAccountByLogin(loginId) {
  const direct = await getJSON(STORE_NAMES.ACCOUNTS, loginId);
  if (direct) return { email:loginId, account:direct };
  for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
    const account = await getJSON(STORE_NAMES.ACCOUNTS, key);
    if (Array.isArray(account?.loginAliases) && account.loginAliases.map(normalizeLoginId).includes(loginId)) return { email:key, account };
  }
  return null;
}
async function getAuthenticatedAccount(payload) {
  const session = await getSessionInfo(String(payload.token || ''));
  if (!session) return null;
  const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
  return account ? { session, account } : null;
}
async function limitByIp(event, action, maxCount = 10) {
  const headers = event.headers || {};
  const ip = String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 100);
  const key = `rate:${action}:${digestHex(ip)}`;
  const now = Date.now();
  const item = await getJSON(RECOVERY_STORE, key);
  if (item && Number(item.expiresAt) > now && Number(item.count) >= maxCount) return false;
  const next = item && Number(item.expiresAt) > now ? { count:Number(item.count || 0) + 1, expiresAt:item.expiresAt } : { count:1, expiresAt:now + 15 * 60 * 1000 };
  await setJSON(RECOVERY_STORE, key, next);
  return true;
}
function emailServiceError(error) {
  if (error?.code === 'EMAIL_NOT_CONFIGURED') return 'メール送信設定が未完了です。Netlify Email Integrationと送信元アドレスを設定してください。';
  return 'メールを送信できませんでした。しばらくしてから再試行してください。';
}
async function clearRecoveryRecords(accountEmail) {
  const normalized=String(accountEmail||'').toLowerCase();
  const activeKey=`reset-active:${digestHex(normalized)}`;
  for(const key of await listKeys(RECOVERY_STORE)){
    if(key===`verify:${normalized}`||key===activeKey){await deleteKey(RECOVERY_STORE,key);continue;}
    const record=await getJSON(RECOVERY_STORE,key);
    if(String(record?.accountEmail||'').toLowerCase()===normalized)await deleteKey(RECOVERY_STORE,key);
  }
}

async function handleRecoveryAction(event, payload) {
  const action = payload.action;

  if (action === 'getRecoveryEmailStatus') {
    const result = await getAuthenticatedAccount(payload);
    if (!result) return json(401, { error:'ログインが必要です' });
    const { account } = result;
    const verified = Boolean(account.recoveryEmail && account.recoveryEmailVerifiedAt);
    return json(200, { verified, recoveryEmail:verified ? account.recoveryEmail : null, verifiedAt:verified ? account.recoveryEmailVerifiedAt : null });
  }

  if (action === 'requestRecoveryEmailVerification') {
    const result = await getAuthenticatedAccount(payload);
    if (!result) return json(401, { error:'ログインが必要です' });
    if (await emailConfigurationMissing()) return json(503, { error:'Netlify Email Integrationの送信設定がまだ完了していません。運営に設定を確認してください。' });
    const { session, account } = result;
    const email = normalizeRealEmail(payload.recoveryEmail);
    if (!email) return json(400, { error:'受信可能な実メールアドレスを入力してください。MixAllのログインIDは登録できません。' });
    if (account.recoveryEmail === email && account.recoveryEmailVerifiedAt) return json(200, { ok:true, verified:true, recoveryEmail:email, message:'このメールアドレスは確認済みです。' });
    const key = `verify:${session.email}`;
    const prior = await getJSON(RECOVERY_STORE, key);
    if (prior && Number(prior.nextSendAt || 0) > Date.now()) return json(429, { error:'確認コードは1分に1回まで送信できます。少し待ってから再試行してください。' });
    const nonce = crypto.randomBytes(16).toString('hex');
    const code = String(crypto.randomInt(100000, 1000000));
    const now = Date.now();
    const record = { accountEmail:session.email, email, nonce, codeHash:verificationDigest(session.email, email, nonce, code), attempts:0, createdAt:new Date(now).toISOString(), expiresAt:now + VERIFY_TTL_MS, nextSendAt:now + RESEND_COOLDOWN_MS };
    await setJSON(RECOVERY_STORE, key, record);
    try {
      await sendEmailTemplate(event, { template:'recovery-verify', to:email, subject:'MixAll 回復用メールアドレスの確認コード', parameters:{ displayName:String(account.displayName || session.email.split('@')[0]).slice(0, 80), code, expiresMinutes:10 } });
    } catch (error) {
      await deleteKey(RECOVERY_STORE, key);
      return json(503, { error:emailServiceError(error) });
    }
    return json(200, { ok:true, expiresInSeconds:VERIFY_TTL_MS / 1000, message:'確認コードを送りました。10分以内に入力してください。' });
  }

  if (action === 'verifyRecoveryEmail') {
    const result = await getAuthenticatedAccount(payload);
    if (!result) return json(401, { error:'ログインが必要です' });
    const { session, account } = result;
    const key = `verify:${session.email}`;
    const record = await getJSON(RECOVERY_STORE, key);
    if (!record || Number(record.expiresAt) < Date.now()) {
      if (record) await deleteKey(RECOVERY_STORE, key);
      return json(400, { error:'確認コードが無効か、有効期限が切れています。新しいコードを依頼してください。' });
    }
    if (Number(record.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
      await deleteKey(RECOVERY_STORE, key);
      return json(429, { error:'確認コードの入力回数を超えました。新しいコードを依頼してください。' });
    }
    const code = String(payload.code || '').trim();
    const candidate = /^\d{6}$/.test(code) ? verificationDigest(session.email, record.email, record.nonce, code) : '';
    if (!safeHexEqual(candidate, record.codeHash)) {
      record.attempts = Number(record.attempts || 0) + 1;
      if (record.attempts >= MAX_VERIFY_ATTEMPTS) await deleteKey(RECOVERY_STORE, key);
      else await setJSON(RECOVERY_STORE, key, record);
      return json(400, { error:record.attempts >= MAX_VERIFY_ATTEMPTS ? '入力回数を超えました。新しい確認コードを依頼してください。' : '確認コードが違います。' });
    }
    account.recoveryEmail = record.email;
    account.recoveryEmailVerifiedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
    await deleteKey(RECOVERY_STORE, key);
    return json(200, { ok:true, verified:true, recoveryEmail:record.email, verifiedAt:account.recoveryEmailVerifiedAt });
  }

  if (action === 'requestPasswordReset') {
    if (await emailConfigurationMissing()) return json(503, { error:'メール送信設定が未完了です。運営に設定を確認してください。' });
    const generic = () => json(200, { ok:true, message:RESET_MESSAGE });
    if (!(await limitByIp(event, 'reset-request', 10))) return generic();
    const loginId = normalizeLoginId(payload.accountEmail || payload.email);
    if (!loginId) return generic();
    const resolved = await findAccountByLogin(loginId);
    if (!resolved?.account?.recoveryEmail || !resolved.account.recoveryEmailVerifiedAt) return generic();
    const accountHash = digestHex(resolved.email);
    const activeKey = `reset-active:${accountHash}`;
    const prior = await getJSON(RECOVERY_STORE, activeKey);
    const now = Date.now();
    if (prior && Number(prior.expiresAt) > now && now - Number(prior.lastSentAt || 0) < RESEND_COOLDOWN_MS) return generic();
    if (prior?.tokenHash) await deleteKey(RECOVERY_STORE, `reset:${prior.tokenHash}`);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = digestHex(rawToken);
    const expiresAt = now + RESET_TTL_MS;
    await setJSON(RECOVERY_STORE, `reset:${tokenHash}`, { accountEmail:resolved.email, tokenHash, createdAt:new Date(now).toISOString(), expiresAt, used:false });
    await setJSON(RECOVERY_STORE, activeKey, { tokenHash, lastSentAt:now, expiresAt });
    try {
      const resetUrl = buildSiteUrl(event, `/reset-password/?token=${rawToken}`);
      await sendEmailTemplate(event, { template:'password-reset', to:resolved.account.recoveryEmail, subject:'MixAll パスワード再設定のご案内', parameters:{ displayName:String(resolved.account.displayName || resolved.email.split('@')[0]).slice(0, 80), resetUrl, expiresMinutes:30 } });
    } catch (error) {
      await deleteKey(RECOVERY_STORE, `reset:${tokenHash}`);
      await deleteKey(RECOVERY_STORE, activeKey);
      console.error('Password reset email was not sent:', error?.code || error?.message || 'unknown error');
    }
    return generic();
  }

  if (action === 'resetPassword') {
    const token = String(payload.resetToken || '');
    const newPassword = String(payload.newPassword || '');
    if (!/^[a-f0-9]{64}$/.test(token)) return json(400, { error:'再設定リンクが無効か、有効期限が切れています。' });
    if (newPassword.length < 6 || newPassword.length > 1024) return json(400, { error:'新しいパスワードは6文字以上にしてください。' });
    const tokenHash = digestHex(token);
    const key = `reset:${tokenHash}`;
    const record = await getJSON(RECOVERY_STORE, key);
    if (!record || record.used || Number(record.expiresAt) < Date.now() || !safeHexEqual(record.tokenHash, tokenHash)) return json(400, { error:'再設定リンクが無効か、有効期限が切れています。新しい再設定メールを依頼してください。' });
    const activeKey = `reset-active:${digestHex(record.accountEmail)}`;
    const active = await getJSON(RECOVERY_STORE, activeKey);
    if (!active || !safeHexEqual(active.tokenHash, tokenHash)) return json(400, { error:'この再設定リンクはすでに無効です。新しい再設定メールを依頼してください。' });
    const account = await getJSON(STORE_NAMES.ACCOUNTS, record.accountEmail);
    if (!account) return json(400, { error:'再設定対象のアカウントが見つかりません。' });
    const salt = crypto.randomBytes(16).toString('hex');
    account.salt = salt;
    account.passwordHash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
    account.passwordChangedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.ACCOUNTS, record.accountEmail, account);
    for (const sessionKey of await listKeys(STORE_NAMES.SESSIONS)) {
      const session = await getJSON(STORE_NAMES.SESSIONS, sessionKey);
      if (session?.email === record.accountEmail) await deleteKey(STORE_NAMES.SESSIONS, sessionKey);
    }
    await deleteKey(RECOVERY_STORE, key);
    await deleteKey(RECOVERY_STORE, activeKey);
    return json(200, { ok:true, message:'パスワードを更新し、すべてのログイン端末をログアウトしました。' });
  }

  return null;
}

module.exports = { handleRecoveryAction, normalizeRealEmail, clearRecoveryRecords };
