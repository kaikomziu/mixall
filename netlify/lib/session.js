const crypto = require('crypto');
function stablePeerId(email) { return 'mixall-' + crypto.createHash('sha256').update(String(email)).digest('hex').slice(0, 24); }
function stableUchId(email, createdAt) { return 'u' + crypto.createHmac('sha256', process.env.UCH_ID_SECRET || 'mixall-uch-id-v1').update(`${String(email)}|${String(createdAt || '')}`).digest('hex').slice(0, 10); }
const { STORE_NAMES, getJSON, setJSON, deleteKey } = require('./store');
const { getAgeFromBirthDate } = require('./ghost-age');
function tokenFingerprint(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

async function getSessionInfo(token) {
  if (!token) return null;
  const session = await getJSON(STORE_NAMES.SESSIONS, token);
  if (!session || session.expiresAt < Date.now()) return null;
  const logoutRequest = session.sessionId ? await getJSON(STORE_NAMES.SESSION_LOGOUTS, `logout:${session.sessionId}`) : null;
  if (logoutRequest && logoutRequest.status === 'pending') {
    logoutRequest.status = 'executed';
    logoutRequest.executedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.SESSION_LOGOUTS, `logout:${session.sessionId}`, logoutRequest);
    await setJSON(STORE_NAMES.SESSION_LOGOUTS, `notice:${tokenFingerprint(token)}`, { reason:'admin_logout', message:'運営によりログアウトさせられました。', createdAt:logoutRequest.executedAt, expiresAt:Date.now() + 10 * 60 * 1000 });
    await deleteKey(STORE_NAMES.SESSIONS, token);
    return null;
  }

  const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
  if (!account) return null;
  const age = getAgeFromBirthDate(account.birthDate);
  if (age === null) return null;
  if (account.age !== age) {
    account.age = age;
    await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
  }
  const now = Date.now();
  // 最終利用時刻・オンライン表示（90秒以内でオンライン）の更新は30秒に1回で十分。
  // 毎リクエスト2回の書き込みをしていたのを減らして、どの画面の応答も速くする。
  if (!Number(session.presenceAt) || now - Number(session.presenceAt) > 30 * 1000) {
    session.lastSeenAt = now;
    session.presenceAt = now;
    await Promise.all([
      setJSON(STORE_NAMES.SESSIONS, token, session),
      setJSON(STORE_NAMES.PRESENCE, session.email, { email: session.email, lastSeenAt: now })
    ]);
  }

  return {
    email: session.email,
    displayName: account.displayName || session.email.split('@')[0],
    age,
    avatarUrl: account.avatarDataUrl || null,
    avatarType: account.avatarType || null,
    avatarCrop: account.avatarCrop || null,
    uchName: account.uchName || account.displayName || session.email.split('@')[0],
    uchId: stableUchId(session.email, account.createdAt),
    isAdmin: account.isAdmin === true,
    isDeputyAdmin: account.isDeputyAdmin === true,
    isOperator: account.isAdmin === true || account.isDeputyAdmin === true,
    isOfficial: account.isOfficial === true || account.isAdmin === true,
    peerId: stablePeerId(session.email)
  };
}

async function requireSession(token) {
  const info = await getSessionInfo(token);
  return info ? info.email : null;
}

async function requireAdmin(token) {
  const info = await getSessionInfo(token);
  return info && info.isOperator ? info : null;
}

async function getAccountProfile(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { email: normalized, displayName: normalized, isAdmin: false, isOfficial: false };
  const account = await getJSON(STORE_NAMES.ACCOUNTS, normalized);
  const presence = await getJSON(STORE_NAMES.PRESENCE, normalized);
  return {
    email: normalized,
    displayName: account && account.displayName ? account.displayName : normalized.split('@')[0],
    avatarUrl: account?.avatarDataUrl || null,
    avatarType: account?.avatarType || null,
    avatarCrop: account?.avatarCrop || null,
    uchName: account && (account.uchName || account.displayName) ? (account.uchName || account.displayName) : normalized.split('@')[0],
    uchId: stableUchId(normalized, account?.createdAt),
    isAdmin: Boolean(account && account.isAdmin === true),
    isDeputyAdmin: Boolean(account && account.isDeputyAdmin === true),
    isOperator: Boolean(account && (account.isAdmin === true || account.isDeputyAdmin === true)),
    isOfficial: Boolean(account && (account.isOfficial === true || account.isAdmin === true)),
    createdAt: account ? account.createdAt : null,
    online: Boolean(presence && Number(presence.lastSeenAt) > Date.now() - 90 * 1000),
    lastSeenAt: presence ? presence.lastSeenAt : null,
    peerId: stablePeerId(normalized)
  };
}

module.exports = { getSessionInfo, getAccountProfile, requireSession, requireAdmin };
