// netlify/functions/stamps.js
// スタンプ機能。追加できるのは運営(isAdmin)または公認(isOfficial)アカウントのみ。
// 高画質のスタンプ本体は /.netlify/functions/files (チャンク連結保存) に事前アップロードし、
// ここではその参照(fileId)と、ピッカー表示用の軽量サムネイル(小さいBase64)だけを扱う。
// こうすることで、スタンプ一覧を開くたびに高画質画像を全部読み込む必要がなくなる。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { getSessionInfo } = require('../lib/session');

const MAX_THUMBNAIL_BYTES = 120 * 1024; // サムネイルは軽量に保つ(120KB程度まで)

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function newId() { return crypto.randomBytes(8).toString('hex'); }

exports.handler = async (event) => {

  try { return await handle(event); } catch (err) {
    console.error('stamps function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

async function handle(event) {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};

  // 一覧取得はログインしていれば誰でも(スタンプはチャット内で誰でも使う想定)
  if (method === 'GET') {
    const info = await getSessionInfo(qs.token);
    if (!info) return json(401, { error: 'ログインが必要です' });

    const keys = await listKeys(STORE_NAMES.STAMPS);
    const stamps = [];
    for (const key of keys) {
      const s = await getJSON(STORE_NAMES.STAMPS, key);
      if (s) stamps.push(s);
    }
    stamps.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const balance = Number(await getJSON(STORE_NAMES.COINS, info.email)) || 0;
    const unlimited = Boolean(info.isAdmin || info.isOfficial);
    const ownedStampIds = [];
    for (const stamp of stamps) if (await getJSON(STORE_NAMES.STAMP_OWNERS, `${info.email}:${stamp.id}`)) ownedStampIds.push(stamp.id);
    return json(200, { stamps, balance, unlimited, ownedStampIds, canManage: info.isAdmin || info.isOfficial });
  }

  if (method !== 'POST') return json(405, { error: '未対応のメソッドです' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なリクエストです' }); }

  const info = await getSessionInfo(payload.token);
  if (!info) return json(401, { error: 'ログインが必要です' });
  const { action } = payload;

  // 追加・削除は運営または公認アカウントのみ
  if (action === 'createStamp' || action === 'deleteStamp') {
    if (!info.isAdmin && !info.isOfficial) {
      return json(403, { error: 'スタンプの追加・削除は運営または公認アカウントのみ行えます' });
    }
  }

  if (action === 'purchaseStamp') {
    const stampId = String(payload.stampId || '').trim();
    const stamp = await getJSON(STORE_NAMES.STAMPS, stampId);
    if (!stamp) return json(404, { error: 'スタンプが見つかりません' });
    const stampKeys = await listKeys(STORE_NAMES.STAMPS);
    const packStamps = [];
    for (const key of stampKeys) { const candidate = await getJSON(STORE_NAMES.STAMPS, key); if (candidate && (candidate.packId || candidate.id) === (stamp.packId || stamp.id)) packStamps.push(candidate); }
    const pack = packStamps.length ? packStamps : [stamp];
    const ownerKey = `${info.email}:${stamp.id}`;
    if (await getJSON(STORE_NAMES.STAMP_OWNERS, ownerKey)) return json(200, { ok: true, alreadyOwned: true, balance: Number(await getJSON(STORE_NAMES.COINS, info.email)) || 0 });
    const price = Math.max(0, Number(stamp.priceCoins) || 0);
    const unlimited = Boolean(info.isAdmin || info.isOfficial);
    if (!unlimited) {
      const balance = Number(await getJSON(STORE_NAMES.COINS, info.email)) || 0;
      if (balance < price) return json(402, { error: `MixAll +コインが不足しています（必要: ${price}、残高: ${balance}）`, balance, required: price });
      await setJSON(STORE_NAMES.COINS, info.email, balance - price);
    }
    for (const item of pack) await setJSON(STORE_NAMES.STAMP_OWNERS, `${info.email}:${item.id}`, { email: info.email, stampId: item.id, packId: item.packId || item.id, purchasedAt: new Date().toISOString(), priceCoins: unlimited ? 0 : price, unlimited });
    return json(200, { ok: true, balance: unlimited ? null : (Number(await getJSON(STORE_NAMES.COINS, info.email)) || 0), unlimited, packId: stamp.packId || stamp.id, stamp });
  }

  if (action === 'grantCoins') {
    if (!info.isAdmin) return json(403, { error: 'コイン付与は運営のみ利用できます' });
    const targetEmail = String(payload.email || '').trim().toLowerCase();
    const amount = Math.max(0, Math.min(100000000, Math.floor(Number(payload.amount) || 0)));
    if (!targetEmail || !amount) return json(400, { error: '対象メールアドレスと正の付与量が必要です' });
    const nextBalance = (Number(await getJSON(STORE_NAMES.COINS, targetEmail)) || 0) + amount;
    await setJSON(STORE_NAMES.COINS, targetEmail, nextBalance);
    return json(200, { ok: true, email: targetEmail, balance: nextBalance });
  }

  if (action === 'giftStamp') {
    const stampId = String(payload.stampId || '').trim();
    const recipientEmail = String(payload.recipientEmail || '').trim().toLowerCase();
    const stamp = await getJSON(STORE_NAMES.STAMPS, stampId);
    if (!stamp) return json(404, { error: 'スタンプが見つかりません' });
    if (!recipientEmail || recipientEmail === info.email) return json(400, { error: 'プレゼント先のメールアドレスが不正です' });
    if (!await getJSON(STORE_NAMES.ACCOUNTS, recipientEmail)) return json(404, { error: 'プレゼント先のアカウントが見つかりません' });
    const stampKeys = await listKeys(STORE_NAMES.STAMPS);
    const pack = [];
    for (const key of stampKeys) { const candidate = await getJSON(STORE_NAMES.STAMPS, key); if (candidate && (candidate.packId || candidate.id) === (stamp.packId || stamp.id)) pack.push(candidate); }
    if (!pack.length) pack.push(stamp);
    const recipientKey = `${recipientEmail}:${stamp.id}`;
    if (await getJSON(STORE_NAMES.STAMP_OWNERS, recipientKey)) return json(409, { error: '相手はこのスタンプパックを既に所持しています' });
    const price = Math.max(0, Number(stamp.priceCoins) || 0);
    const senderUnlimited = Boolean(info.isAdmin || info.isOfficial);
    const senderOwner = await getJSON(STORE_NAMES.STAMP_OWNERS, `${info.email}:${stamp.id}`);
    const senderBalance = Number(await getJSON(STORE_NAMES.COINS, info.email)) || 0;
    if (!senderUnlimited && !senderOwner && senderBalance < price) return json(402, { error: `プレゼントに必要なコインが不足しています（必要: ${price}、残高: ${senderBalance}）` });
    if (!senderUnlimited && !senderOwner && price > 0) await setJSON(STORE_NAMES.COINS, info.email, senderBalance - price);
    for (const item of pack) await setJSON(STORE_NAMES.STAMP_OWNERS, `${recipientEmail}:${item.id}`, { email: recipientEmail, stampId: item.id, packId: item.packId || item.id, giftedBy: info.email, giftedAt: new Date().toISOString(), priceCoins: 0 });
    return json(200, { ok: true, recipientEmail, packId: stamp.packId || stamp.id, stamp });
  }

  if (action === 'createStamp') {
    const name = (payload.name || '').trim().slice(0, 40);
    const packName = String(payload.packName || 'スタンプ').trim().slice(0, 60);
    const packIcon = String(payload.packIcon || '😀').trim().slice(0, 8);
    const packId = String(payload.packId || `${info.email}:${packName.toLowerCase()}`).trim().slice(0, 80);
    const fileId = String(payload.fileId || '').trim();
    const thumbnailDataUrl = String(payload.thumbnailDataUrl || '');
    const priceCoins = Math.max(0, Math.min(100000, Math.floor(Number(payload.priceCoins) || 0)));
    if (!name) return json(400, { error: 'スタンプ名を入力してください' });
    if (!fileId) return json(400, { error: '画像がアップロードされていません(先に /.netlify/functions/files でアップロードしてください)' });
    if (!thumbnailDataUrl.startsWith('data:image/')) return json(400, { error: 'サムネイル画像が不正です' });
    if (thumbnailDataUrl.length > MAX_THUMBNAIL_BYTES) return json(400, { error: 'サムネイルが大きすぎます(内部エラー: 生成サイズ不正)' });
    const existingKeys = await listKeys(STORE_NAMES.STAMPS);
    for (const key of existingKeys) {
      const existing = await getJSON(STORE_NAMES.STAMPS, key);
      if (existing && existing.fileId === fileId) return json(200, { stamp: existing, duplicate: true });
    }

    const stamp = {
      id: newId(),
      name,
      packName,
      packIcon,
      packId,
      fileId,
      mimeType: String(payload.mimeType || 'image/png').slice(0, 80),
      thumbnailDataUrl,
      priceCoins,
      addedBy: info.email,
      createdAt: new Date().toISOString()
    };
    await setJSON(STORE_NAMES.STAMPS, stamp.id, stamp);
    return json(201, { stamp });
  }

  if (action === 'deleteStamp') {
    const stampId = String(payload.stampId || '');
    const stamp = await getJSON(STORE_NAMES.STAMPS, stampId);
    if (!stamp) return json(404, { error: 'スタンプが見つかりません' });
    await deleteKey(STORE_NAMES.STAMPS, stampId);
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
}
