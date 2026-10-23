// netlify/functions/auth.js
// [ユーザー名]@bix.3erver 形式の疑似メールアカウント認証。
// 実電話番号・実メール不要で登録可能。ログイン後に本人確認済み回復先を設定すると自己再設定できます。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { getSessionInfo } = require('../lib/session');
const { isStoredAvatarUrl, storeAvatarDataUrl, removeStoredAvatar } = require('../lib/avatar-storage');
const { getAgeFromBirthDate, isValidBirthDate } = require('../lib/ghost-age');
const { handleRecoveryAction, clearRecoveryRecords } = require('../lib/account-recovery');

const DOMAIN = '@bix.3erver';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14日

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function randomLocalPart() {
  // 発音しやすいランダム文字列 (英小文字+数字, 8文字)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

function normalizeEmail(input) {
  if (!input) return null;
  let local = String(input).trim().toLowerCase();
  if (local.endsWith(DOMAIN)) local = local.slice(0, -DOMAIN.length);
  // 英数字・アンダースコア・ハイフン・ドットを許可。先頭と末尾は英数字。3〜32文字。
  if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(local)) return null;
  return local + DOMAIN;
}

const ADMIN_EMAIL = 'bix.admin' + DOMAIN;
// 運営アカウントの初回自動作成用パスワード。コードには書かず環境変数で渡す（未設定なら自動作成しない）。
const ADMIN_INITIAL_PASSWORD = String(process.env.MIXALL_ADMIN_INITIAL_PASSWORD || '');

function hashPassword(password, salt) {
  const derived = crypto.scryptSync(password, salt, 64);
  return derived.toString('hex');
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function connectionAudit(event) {
  const headers = event.headers || {};
  const first = (value) => String(value || '').split(',')[0].trim();
  const ip = first(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || headers['client-ip'] || '');
  const country = first(headers['x-country'] || headers['x-nf-geo-country'] || '');
  const region = first(headers['x-region'] || headers['x-nf-geo-region'] || '');
  // 市区町村・番地・建物名・緯度経度は取得・保存しない。国・都道府県相当の地域だけを保持する。
  return { ip: ip.slice(0, 80), country:country.slice(0, 80), region:region.slice(0, 120), area:region.slice(0, 120), accuracy: region ? '推定' : '不明', collectedAt:new Date().toISOString() };
}

async function findAccountByLogin(email) {
  const normalized=normalizeEmail(email); if (!normalized) return null;
  const direct=await getJSON(STORE_NAMES.ACCOUNTS, normalized); if (direct) return { email:normalized, account:direct };
  for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
    const account=await getJSON(STORE_NAMES.ACCOUNTS,key);
    if (Array.isArray(account?.loginAliases) && account.loginAliases.map(normalizeEmail).includes(normalized)) return { email:key, account };
  }
  return null;
}
function replaceEmailReferences(value, oldEmail, newEmail) {
  if (typeof value === 'string') return value === oldEmail ? newEmail : value;
  if (Array.isArray(value)) return value.map((item)=>replaceEmailReferences(item,oldEmail,newEmail));
  if (value && typeof value === 'object') { const out={}; for (const [key,item] of Object.entries(value)) out[key]=replaceEmailReferences(item,oldEmail,newEmail); return out; }
  return value;
}
async function migrateAdminEmail(oldEmail, newEmail, account) {
  await clearRecoveryRecords(oldEmail);
  const skip=new Set([STORE_NAMES.ADMIN_AUDIT,STORE_NAMES.SESSIONS,STORE_NAMES.ACCOUNTS]);
  const storeNames=[...new Set(Object.values(STORE_NAMES))];
  for (const storeName of storeNames) {
    if (skip.has(storeName)) continue;
    for (const key of await listKeys(storeName)) {
      const value=await getJSON(storeName,key); if (value===null || value===undefined) continue;
      const migrated=replaceEmailReferences(value,oldEmail,newEmail); const nextKey=key===oldEmail?newEmail:key.split(oldEmail).join(newEmail);
      if (nextKey!==key || JSON.stringify(migrated)!==JSON.stringify(value)) { await setJSON(storeName,nextKey,migrated); if(nextKey!==key) await deleteKey(storeName,key); }
    }
  }
  for (const key of await listKeys(STORE_NAMES.SESSIONS)) { const value=await getJSON(STORE_NAMES.SESSIONS,key); if(value?.email===oldEmail || value?.email===newEmail) await deleteKey(STORE_NAMES.SESSIONS,key); }
  const migratedAccount={...account,email:newEmail,loginAliases:[...new Set([...(account.loginAliases||[]),oldEmail].map(normalizeEmail).filter(Boolean))],emailChangedAt:new Date().toISOString()};
  await setJSON(STORE_NAMES.ACCOUNTS,newEmail,migratedAccount); await deleteKey(STORE_NAMES.ACCOUNTS,oldEmail);
  const audit={kind:'audit',id:`email-change:${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,actorEmail:newEmail,action:'changeAdminEmail',targetType:'account',targetId:newEmail,detail:`運営ログインメールを変更。旧アドレス ${oldEmail} はログイン別名として保持。既存端末を一括失効。`,metadata:{oldEmail,newEmail,revokedAllSessions:true,migratedAt:new Date().toISOString()},createdAt:new Date().toISOString()};
  await setJSON(STORE_NAMES.ADMIN_AUDIT,`audit:${audit.id}`,audit); return migratedAccount;
}

exports.handler = async (event) => {


  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POSTのみ対応しています' });
  }

  try {
    return await handlePost(event);
  } catch (err) {
    console.error('auth function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

async function handlePost(event) {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: '不正なリクエストです' });
  }

  const { action } = payload;

  const recoveryResponse = await handleRecoveryAction(event, payload);
  if (recoveryResponse) return recoveryResponse;

  // --- ランダムメールアドレス生成 (アカウント作成前のプレビュー用) ---
  if (action === 'suggest') {
    let candidate;
    let tries = 0;
    do {
      candidate = randomLocalPart() + DOMAIN;
      tries++;
    } while ((await getJSON(STORE_NAMES.ACCOUNTS, candidate)) && tries < 10);
    return json(200, { email: candidate });
  }

  // --- 重複チェック ---
  if (action === 'checkEmail') {
    const email = normalizeEmail(payload.email);
    if (!email) return json(400, { error: 'アドレスの形式が不正です' });
    const existing = await findAccountByLogin(email);
    return json(200, { available: !existing });
  }

  // --- 新規登録 ---
  if (action === 'register') {
    const email = normalizeEmail(payload.email);
    const password = payload.password;
    const birthDate = String(payload.birthDate || '').trim();
    const age = getAgeFromBirthDate(birthDate);
    // captcha検証は payload.captchaToken をここで実際のCaptchaサービスと突き合わせる想定
    // (Phase1では簡易人間判定として payload.humanCheck === true のみ確認)
    if (!email) return json(400, { error: 'アドレスの形式が不正です' });
    if (!isValidBirthDate(birthDate)) return json(400, { error: '有効な生年月日を入力してください（未来の日付・120歳を超える日付は使えません）' });
    if (!password || password.length < 6) {
      return json(400, { error: 'パスワードは6文字以上にしてください' });
    }
    if (!payload.humanCheck) {
      return json(400, { error: '人間判定チェックが未完了です' });
    }
    const existing = await findAccountByLogin(email);
    if (existing) return json(409, { error: 'このアドレスは既に使用されています' });

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const account = {
      email,
      displayName: payload.displayName || email.split('@')[0],
      birthDate,
      age,
      birthDateSubmittedAt: new Date().toISOString(),
      salt,
      passwordHash,
      linked: {},
      isOfficial: false,
      createdAt: new Date().toISOString()
    };
    await setJSON(STORE_NAMES.ACCOUNTS, email, account);

    const token = makeToken();
    await setJSON(STORE_NAMES.SESSIONS, token, {
      email,
      sessionId: crypto.randomBytes(12).toString('hex'),
      deviceLabel: String(payload.device?.label || '不明なデバイス').slice(0, 120),
      userAgent: String(payload.device?.userAgent || '').slice(0, 300),
      createdAt: new Date().toISOString(),
      lastSeenAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      connectionAudit: connectionAudit(event)
    });

    return json(201, { email, token, age, hasBirthDate:true, displayName: account.displayName, avatarUrl: account.avatarDataUrl || null, avatarType: account.avatarType || null, avatarCrop: account.avatarCrop || null, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
  }

  // --- ログイン ---
  if (action === 'login') {
    const email = normalizeEmail(payload.email);
    const password = payload.password;
    if (!email || !password) return json(400, { error: 'アドレスとパスワードを入力してください' });

    const resolved = await findAccountByLogin(email);
    let canonicalEmail = resolved?.email;
    let account = resolved?.account;

    // 運営アカウント(bix.admin@bix.3erver)は、初回だけ初期パスワードでの
    // ログインをきっかけに自動発行する(以後は通常のアカウントと同じ扱い)。
    if (!account && email === ADMIN_EMAIL) {
      if (!ADMIN_INITIAL_PASSWORD || password !== ADMIN_INITIAL_PASSWORD) {
        return json(401, { error: 'アドレスまたはパスワードが違います' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      canonicalEmail = email;
      account = {
        email,
        displayName: '運営',
        salt,
        passwordHash: hashPassword(ADMIN_INITIAL_PASSWORD, salt),
        linked: {},
        isAdmin: true,
        isOfficial: true,
        createdAt: new Date().toISOString()
      };
      await setJSON(STORE_NAMES.ACCOUNTS, email, account);
    }

    if (!account) return json(401, { error: 'アドレスまたはパスワードが違います' });

    const check = hashPassword(password, account.salt);
    if (check !== account.passwordHash) {
      return json(401, { error: 'アドレスまたはパスワードが違います' });
    }

    const token = makeToken();
    await setJSON(STORE_NAMES.SESSIONS, token, {
      email: canonicalEmail || email,
      sessionId: crypto.randomBytes(12).toString('hex'),
      deviceLabel: String(payload.device?.label || '不明なデバイス').slice(0, 120),
      userAgent: String(payload.device?.userAgent || '').slice(0, 300),
      createdAt: new Date().toISOString(),
      lastSeenAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      connectionAudit: connectionAudit(event)
    });

    const age = getAgeFromBirthDate(account.birthDate);
    return json(200, { email: canonicalEmail || email, token, age, hasBirthDate:age !== null, displayName: account.displayName, avatarUrl: account.avatarDataUrl || null, avatarType: account.avatarType || null, avatarCrop: account.avatarCrop || null, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
  }

  // Existing sessions can inspect/set their own date of birth without passing the new birthdate gate.
  if (action === 'getBirthDate' || action === 'setBirthDate') {
    const token = String(payload.token || '');
    const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!session || session.expiresAt < Date.now()) return json(401, { error:'ログインが必要です' });
    const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
    if (!account) return json(404, { error:'アカウントが見つかりません' });
    if (action === 'getBirthDate') return json(200, { birthDate:isValidBirthDate(account.birthDate) ? account.birthDate : null, hasBirthDate:isValidBirthDate(account.birthDate), age:getAgeFromBirthDate(account.birthDate) });
    if (isValidBirthDate(account.birthDate)) return json(409, { error:'生年月日は登録後に利用者自身では変更できません。修正が必要な場合は運営へ連絡してください。' });
    const birthDate = String(payload.birthDate || '').trim();
    const age = getAgeFromBirthDate(birthDate);
    if (!isValidBirthDate(birthDate)) return json(400, { error:'有効な生年月日を入力してください（未来の日付・120歳を超える日付は使えません）' });
    account.birthDate = birthDate;
    account.age = age;
    account.birthDateSubmittedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
    return json(200, { ok:true, age, hasBirthDate:true });
  }

  if (action === 'updateProfile') {
    const session = await getSessionInfo(payload.token);
    if (!session) return json(401, { error: 'ログインが必要です' });
    const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
    if (!account) return json(404, { error: 'アカウントが見つかりません' });
    const avatar = payload.avatarDataUrl == null ? account.avatarDataUrl || null : String(payload.avatarDataUrl);
    const avatarType = payload.avatarType == null ? account.avatarType || null : String(payload.avatarType);
    const avatarCrop = payload.avatarCrop && typeof payload.avatarCrop === 'object' ? { x:Number(payload.avatarCrop.x)||50, y:Number(payload.avatarCrop.y)||50, size:Math.max(10, Math.min(100, Number(payload.avatarCrop.size)||80)), start:Math.max(0, Number(payload.avatarCrop.start)||0), end:Math.max(0, Number(payload.avatarCrop.end)||0) } : (account.avatarCrop || null);
    // 保存済みのアイコン（Storage のURL）はそのまま使える。新しく送られたものは data URL のみ受け付ける
    const avatarIsStored = avatar && avatar === account.avatarDataUrl && isStoredAvatarUrl(avatar);
    if (avatar && !avatarIsStored && (!/^data:(image\/(png|jpeg|jpg|webp|gif)|video\/(mp4|webm|ogg));base64,/i.test(avatar) || avatar.length > 8000000)) return json(400, { error: 'アイコン画像・動画は対応形式で8MB以下にしてください' });
    account.displayName = String(payload.displayName || account.displayName || session.email.split('@')[0]).trim().slice(0, 80) || session.email.split('@')[0];
    // 新しいアイコンは Storage に置き、アカウントにはURLだけを入れる（毎回の読み込み・応答を軽くする）
    const previousAvatar = account.avatarDataUrl || null;
    const storedAvatar = avatar && !avatarIsStored ? await storeAvatarDataUrl(session.email, avatar) : avatar;
    account.avatarDataUrl = storedAvatar || null;
    account.avatarType = avatar ? avatarType : null;
    account.avatarCrop = avatar ? avatarCrop : null;
    await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
    if (previousAvatar && previousAvatar !== account.avatarDataUrl) await removeStoredAvatar(previousAvatar);
    return json(200, { email: session.email, displayName: account.displayName, avatarUrl: account.avatarDataUrl, avatarType:account.avatarType, avatarCrop:account.avatarCrop, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
  }

  // --- 予約ログアウト通知を一度だけ取得 ---
  if (action === 'consumeLogoutNotice') {
    const token = String(payload.token || '');
    if (!token) return json(200, { notified:false });
    const fingerprint = crypto.createHash('sha256').update(token).digest('hex');
    const noticeKey = `notice:${fingerprint}`;
    const notice = await getJSON(STORE_NAMES.SESSION_LOGOUTS, noticeKey);
    if (!notice || (notice.expiresAt && notice.expiresAt < Date.now())) {
      if (notice) await deleteKey(STORE_NAMES.SESSION_LOGOUTS, noticeKey);
      return json(200, { notified:false });
    }
    await deleteKey(STORE_NAMES.SESSION_LOGOUTS, noticeKey);
    return json(200, { notified:true, reason:notice.reason, message:notice.message });
  }

  // --- 現在の端末をログアウト（サーバー側セッションも削除） ---
  if (action === 'logout') {
    const token = payload.token;
    const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!session || session.expiresAt < Date.now()) return json(200, { ok: true, alreadyLoggedOut: true });
    await deleteKey(STORE_NAMES.SESSIONS, token);
    return json(200, { ok: true });
  }

  // --- 自分のログイン端末一覧 ---
  if (action === 'listSessions') {
    const token = payload.token;
    const current = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!current || current.expiresAt < Date.now()) return json(401, { error: 'ログインが必要です' });
    const keys = await listKeys(STORE_NAMES.SESSIONS);
    const sessions = [];
    for (const key of keys) {
      const item = await getJSON(STORE_NAMES.SESSIONS, key);
      if (!item || item.email !== current.email || item.expiresAt < Date.now()) continue;
      sessions.push({ sessionId: item.sessionId || null, deviceLabel: item.deviceLabel || '不明なデバイス', userAgent: item.userAgent || '', createdAt: item.createdAt || null, lastSeenAt: item.lastSeenAt || null, expiresAt: item.expiresAt, current: key === token });
    }
    sessions.sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
    return json(200, { sessions });
  }

  // --- 自分のセッションを失効 ---
  if (action === 'revokeSession') {
    const token = payload.token;
    const current = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!current || current.expiresAt < Date.now()) return json(401, { error: 'ログインが必要です' });
    const keys = await listKeys(STORE_NAMES.SESSIONS);
    for (const key of keys) {
      const item = await getJSON(STORE_NAMES.SESSIONS, key);
      if (item && item.email === current.email && item.sessionId === payload.sessionId) {
        await deleteKey(STORE_NAMES.SESSIONS, key);
        return json(200, { ok: true, revokedCurrent: key === token });
      }
    }
    return json(404, { error: 'セッションが見つかりません' });
  }

  // --- パスワード変更 ---
  if (action === 'changePassword') {
    const token = payload.token;
    const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!session || session.expiresAt < Date.now()) {
      return json(401, { error: 'ログインが必要です' });
    }
    const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
    if (!account) return json(404, { error: 'アカウントが見つかりません' });

    const currentCheck = hashPassword(payload.currentPassword || '', account.salt);
    if (currentCheck !== account.passwordHash) {
      return json(401, { error: '現在のパスワードが違います' });
    }
    const newPassword = payload.newPassword || '';
    if (newPassword.length < 6) {
      return json(400, { error: '新しいパスワードは6文字以上にしてください' });
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    account.salt = newSalt;
    account.passwordHash = hashPassword(newPassword, newSalt);
    await setJSON(STORE_NAMES.ACCOUNTS, session.email, account);
    await clearRecoveryRecords(session.email);
    return json(200, { ok: true });
  }

  // --- 主運営のログインメール変更・全データ移行・全端末失効 ---
  if (action === 'changeAdminEmail') {
    const token=String(payload.token||''), session=token?await getJSON(STORE_NAMES.SESSIONS,token):null;
    if(!session||session.expiresAt<Date.now()) return json(401,{error:'ログインが必要です'});
    const account=await getJSON(STORE_NAMES.ACCOUNTS,session.email);
    if(!account?.isAdmin) return json(403,{error:'主運営アカウントのみ変更できます'});
    if(hashPassword(payload.currentPassword||'',account.salt)!==account.passwordHash) return json(401,{error:'現在のパスワードが違います'});
    const newEmail=normalizeEmail(payload.newEmail); if(!newEmail)return json(400,{error:'新メールアドレスの形式が不正です'});
    if(newEmail===session.email)return json(400,{error:'現在と異なる新メールアドレスを指定してください'});
    if(await findAccountByLogin(newEmail))return json(409,{error:'新メールアドレスは既に使用されています'});
    await migrateAdminEmail(session.email,newEmail,account);
    return json(200,{ok:true,email:newEmail,loginAlias:session.email,reauthRequired:true,revokedAllSessions:true});
  }

  // --- アドレス変更 (パスワードは維持) ---
  if (action === 'changeEmail') {
    const token = payload.token;
    const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!session || session.expiresAt < Date.now()) {
      return json(401, { error: 'ログインが必要です' });
    }
    const newEmail = normalizeEmail(payload.newEmail);
    if (!newEmail) return json(400, { error: 'アドレスの形式が不正です' });

    const existing = await getJSON(STORE_NAMES.ACCOUNTS, newEmail);
    if (existing) return json(409, { error: 'このアドレスは既に使用されています' });

    const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
    if (!account) return json(404, { error: 'アカウントが見つかりません' });
    if (account.isAdmin === true) return json(403, { error: '運営アカウントは運営メール変更画面から変更してください' });

    await clearRecoveryRecords(session.email);
    account.email = newEmail;
    await setJSON(STORE_NAMES.ACCOUNTS, newEmail, account);
    await deleteKey(STORE_NAMES.ACCOUNTS, session.email);

    session.email = newEmail;
    await setJSON(STORE_NAMES.SESSIONS, token, session);

    return json(200, { email: newEmail });
  }

  // --- 本人によるアカウント削除 ---
  if (action === 'deleteAccount') {
    const token = payload.token; const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!session || session.expiresAt < Date.now()) return json(401, { error:'ログインが必要です' });
    if (String(payload.confirm || '') !== 'DELETE') return json(400, { error:'確認文字列 DELETE が必要です' });
    const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
    if (!account) return json(404, { error:'アカウントが見つかりません' });
    const check = hashPassword(payload.password || '', account.salt);
    if (check !== account.passwordHash) return json(401, { error:'パスワードが違います' });
    if (account.isAdmin === true) return json(403, { error:'運営アカウントは通常の削除ボタンから削除できません' });
    await clearRecoveryRecords(session.email);
    for (const key of await listKeys(STORE_NAMES.SESSIONS)) { const item = await getJSON(STORE_NAMES.SESSIONS, key); if (item?.email === session.email) await deleteKey(STORE_NAMES.SESSIONS, key); }
    await deleteKey(STORE_NAMES.ACCOUNTS, session.email);
    await setJSON(STORE_NAMES.ADMIN_AUDIT, `account-delete:${Date.now()}-${crypto.randomBytes(6).toString('hex')}`, { kind:'audit', action:'accountDeleteSelf', targetType:'account', targetId:session.email, detail:'本人によるアカウント削除', createdAt:new Date().toISOString() });
    return json(200, { ok:true, deleted:true });
  }

  // --- セッション検証 (他のfunctionからも共通で使うロジックをここでも公開) ---
  if (action === 'verify') {
    const token = payload.token;
    const session = token ? await getJSON(STORE_NAMES.SESSIONS, token) : null;
    if (!session || session.expiresAt < Date.now()) {
      return json(401, { error: 'セッションが無効です' });
    }
    const account = await getJSON(STORE_NAMES.ACCOUNTS, session.email);
    if (!account) return json(401, { error: 'セッションが無効です' });
    return json(200, { email: session.email, displayName: account.displayName, avatarUrl: account.avatarDataUrl || null, avatarType: account.avatarType || null, avatarCrop: account.avatarCrop || null, isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true || account.isAdmin === true });
  }

  return json(400, { error: '不明なactionです' });
}
