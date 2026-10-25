// Web Push(RFC 8030/8291/8292)をnode:cryptoだけで実装。アプリを開いていなくても、端末に通知を届ける。
// 購読情報は端末ごとに保存(ユーザー1人あたり最大8台)。送信に失敗(404/410)した購読は自動で削除する。
import crypto from 'node:crypto';
import { getStore } from './blobs.js';

// VAPID鍵。本番は環境変数 VAPID_PRIVATE_JWK(JSON) と VAPID_PUBLIC_KEY で差し替えできる。
const FALLBACK = { d: '', x: '', y: '', pub: '' };
const env = (k) => (typeof process !== 'undefined' && process.env && process.env[k]) || '';
function vapid() {
  try { const j = env('VAPID_PRIVATE_JWK'); if (j) { const o = JSON.parse(j); return { d: o.d, x: o.x, y: o.y, pub: env('VAPID_PUBLIC_KEY') || FALLBACK.pub }; } } catch (_) {}
  return FALLBACK;
}
export const vapidPublicKey = () => vapid().pub;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
const SUBJECT = env('VAPID_SUBJECT') || 'mailto:admin@mixalls.edgeone.dev';

function vapidAuth(endpoint) {
  const v = vapid();
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.d, x: v.x, y: v.y }, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${v.pub}`;
}

// aes128gcm(RFC 8291)で本文を暗号化
export function encryptPayload(sub, payload) {
  const uaPub = fromB64u(sub.keys.p256dh), authSecret = fromB64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPub);
  const salt = crypto.randomBytes(16);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, body]);
}

const store = () => getStore({ name: 'mixall-push' });
const keyOf = (email) => 'subs:' + crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 32);
export async function getSubs(email) { try { const t = await store().get(keyOf(email), { type: 'text' }); return t ? JSON.parse(t) : []; } catch (_) { return []; } }
async function putSubs(email, list) { await store().set(keyOf(email), JSON.stringify(list.slice(-8))); }
export async function addSub(email, sub, ua) {
  if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('購読情報が不正です');
  const list = (await getSubs(email)).filter((s) => s.endpoint !== sub.endpoint);
  list.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ua: String(ua || '').slice(0, 120), at: Date.now() });
  await putSubs(email, list);
  return list.length;
}
export async function removeSub(email, endpoint) { const list = (await getSubs(email)).filter((s) => s.endpoint !== endpoint); await putSubs(email, list); return list.length; }

async function sendOne(sub, payload, opts = {}) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(opts.ttl ?? 86400), Urgency: opts.urgency || 'normal', Authorization: vapidAuth(sub.endpoint) },
    body: encryptPayload(sub, JSON.stringify(payload)),
    signal: AbortSignal.timeout(6000)
  }).catch(() => null);
  return res ? res.status : 0;
}

// emailの全端末へ送る。{title, body, url, tag}
export async function pushToEmail(email, payload, opts) {
  const subs = await getSubs(email);
  if (!subs.length) return 0;
  const dead = new Set(); let sent = 0;
  await Promise.all(subs.map(async (s) => { const st = await sendOne(s, payload, opts); if (st >= 200 && st < 300) sent++; else if (st === 404 || st === 410) dead.add(s.endpoint); }));
  if (dead.size) await putSubs(email, subs.filter((s) => !dead.has(s.endpoint)));
  return sent;
}

// 通知レコード(addNotificationで作られたもの)を、見やすい通知にして送る。待たされすぎないよう上限3秒。
export async function pushNotificationRecord(email, rec) {
  try {
    const title = String(rec.title || rec.actorName || 'MixAll').slice(0, 80);
    const body = String(rec.body || rec.message || rec.text || rec.type || '新しいお知らせがあります').replace(/\s+/g, ' ').slice(0, 140);
    const url = rec.url || (rec.type === 'pocketMessage' ? '/Pocket' : '/Notifications/');
    await Promise.race([pushToEmail(email, { title, body, url, tag: String(rec.id || rec.type || 'mixall') }), new Promise((r) => setTimeout(r, 3000))]);
  } catch (_) {}
}
