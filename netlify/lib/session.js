const crypto = require('crypto');
function stablePeerId(email) { return 'mixall-' + crypto.createHash('sha256').update(String(email)).digest('hex').slice(0, 24); }
function stableUchId(email, createdAt) { return 'u' + crypto.createHmac('sha256', process.env.UCH_ID_SECRET || 'mixall-uch-id-v1').update(`${String(email)}|${String(createdAt || '')}`).digest('hex').slice(0, 10); }
const { STORE_NAMES, getJSON, getJSONWithout, setJSON, deleteKey, db } = require('./store');
// アイコン画像はdata URLで数百KBあることがあり、毎リクエスト読むとSupabaseの転送量（Egress）を大きく消費する。
// ログイン確認や名前だけ必要な場面では、DB側でこの項目を除いて読む。
const HEAVY_ACCOUNT_FIELDS = ['avatarDataUrl'];
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

  // アイコン画像を除いて読む（呼び出し側はアイコンを使っていない）
  const account = await getJSONWithout(STORE_NAMES.ACCOUNTS, session.email, HEAVY_ACCOUNT_FIELDS);
  if (!account) return null;
  const age = getAgeFromBirthDate(account.birthDate);
  if (age === null) return null;
  if (account.age !== age) {
    // 書き戻すときは、アイコンを消さないよう全体を読み直してから保存する
    const full = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
    if (full) { full.age = age; await setJSON(STORE_NAMES.ACCOUNTS, session.email, full); }
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
    // アイコン本体は読んでいないので返さない（必要な画面は getAccountProfile やログイン応答で受け取る）
    avatarUrl: null,
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

// アイコンの目印（md5）。端末が同じ目印のアイコンを持っていれば、本体を送らずに済ませる
function avatarKeyOf(dataUrl) { return dataUrl ? crypto.createHash('md5').update(String(dataUrl), 'utf8').digest('hex') : null; }

// アカウントを読み、アイコンは「端末が持っていない（knownに無い）ときだけ」本体を返す。
// DB側で md5 を計算して比べるので、端末が持っているアイコンはDBからも転送しない。
async function readAccountWithAvatarKey(email, known) {
  const store = db();
  if (typeof store.sql === 'function') {
    // 空配列だと型が決まらないことがあるので、一致しないダミーを入れておく
    const list = known.length ? known : ['-'];
    try {
      const rows = await store.sql`select value - 'avatarDataUrl' as value,
          md5(value->>'avatarDataUrl') as akey,
          case when md5(value->>'avatarDataUrl') = any(${list}::text[]) then null else value->>'avatarDataUrl' end as avatar
        from public.mixall_kv where store = ${STORE_NAMES.ACCOUNTS} and key = ${email}`;
      if (!rows.length || !rows[0].value) return { account:null, avatarKey:null, avatarCached:false };
      const account = rows[0].value;
      const avatarKey = rows[0].akey || null;
      const avatarCached = Boolean(avatarKey && rows[0].avatar === null);
      if (!avatarCached && rows[0].avatar) account.avatarDataUrl = rows[0].avatar;
      return { account, avatarKey, avatarCached };
    } catch (_) { /* メモリ版など SQL が使えないときは下の通常の読み方へ */ }
  }
  const account = await getJSON(STORE_NAMES.ACCOUNTS, email);
  const avatarKey = avatarKeyOf(account && account.avatarDataUrl);
  const avatarCached = Boolean(avatarKey && known.includes(avatarKey));
  if (account && avatarCached) delete account.avatarDataUrl;
  return { account, avatarKey, avatarCached };
}

// options.avatar === false のときはアイコン画像を読まない（名前・権限・オンライン状態だけ必要な場面用）
// options.knownAvatars（端末が持っているアイコンの目印の配列）を渡すと、avatarKey を付け、
// 端末が持っているアイコンは avatarUrl を null・avatarCached を true にして返す（端末側で補う）
async function getAccountProfile(email, options = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { email: normalized, displayName: normalized, isAdmin: false, isOfficial: false };
  let avatarInfo = null;
  let account;
  if (Array.isArray(options.knownAvatars)) {
    avatarInfo = await readAccountWithAvatarKey(normalized, options.knownAvatars);
    account = avatarInfo.account;
  } else {
    account = options.avatar === false
      ? await getJSONWithout(STORE_NAMES.ACCOUNTS, normalized, HEAVY_ACCOUNT_FIELDS)
      : await getJSON(STORE_NAMES.ACCOUNTS, normalized);
  }
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
    peerId: stablePeerId(normalized),
    ...(avatarInfo ? { avatarKey: avatarInfo.avatarKey, avatarCached: avatarInfo.avatarCached } : {})
  };
}

module.exports = { getSessionInfo, getAccountProfile, requireSession, requireAdmin };
