// 端末ロック(端末ごとのパスワード)
//  ・端末側: 乱数の「端末トークン」(ブラウザにだけ保存)  ・サーバー側: sha256(端末トークン)をキーに、パスワードのscryptハッシュとセッションを保存
//  端末トークンだけではパスワードを知らないと開けず、サーバーのデータだけでは(トークンが無いので)どの端末の記録かも分からない。
//  POST {action:'enable', token, password, session}        この端末にパスワードを設定(ログイン中)
//  POST {action:'unlock', deviceToken, password}            ロック解除。セッションを返す
//  POST {action:'refresh', deviceToken, session}            ロック直前に最新のセッションを預ける
//  POST {action:'change', deviceToken, oldPassword, newPassword} / {action:'disable', deviceToken, password} / {action:'status', deviceToken}
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { getStore, setEnv } from '../_lib/blobs.js';

const scrypt = promisify(crypto.scrypt);
const STORE = 'netrify-device-lock';
const SESSIONS = 'netrify-sessions';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const getJSON = async (store, key) => { const v = await getStore({ name: store }).get(key, { type: 'text' }); if (!v) return null; try { return JSON.parse(v); } catch (_) { return null; } };
const setJSON = (store, key, value) => getStore({ name: store }).set(key, JSON.stringify(value));
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const validDevice = (d) => typeof d === 'string' && /^[a-f0-9]{64}$/.test(d);
const hashPassword = async (password, saltHex) => (await scrypt(String(password), Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('hex');
const sameHash = (a, b) => { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function liveSession(token) {
  if (!token) return null;
  const s = await getJSON(SESSIONS, String(token));
  return s && s.expiresAt > Date.now() && s.email ? s : null;
}
function cleanSession(session, token) {
  if (!session || typeof session !== 'object' || session.token !== token) return null;
  const text = JSON.stringify(session);
  return text.length <= 8192 ? JSON.parse(text) : null;
}
// パスワード照合(失敗回数の制限つき)
async function check(key, rec, password) {
  const now = Date.now();
  if (rec.lockedUntil && rec.lockedUntil > now) return { ok: false, status: 429, error: `試行回数が多すぎます。${Math.ceil((rec.lockedUntil - now) / 60000)}分後にもう一度お試しください` };
  const ok = typeof password === 'string' && password.length > 0 && sameHash(await hashPassword(password, rec.salt), rec.hash);
  if (ok) { if (rec.fails) { rec.fails = 0; rec.lockedUntil = 0; await setJSON(STORE, key, rec); } return { ok: true }; }
  rec.fails = (rec.fails || 0) + 1;
  if (rec.fails % 5 === 0) rec.lockedUntil = now + Math.min(24 * 3600e3, 15 * 60e3 * 2 ** (rec.fails / 5 - 1));
  await setJSON(STORE, key, rec);
  return { ok: false, status: rec.lockedUntil > now ? 429 : 403, error: rec.lockedUntil > now ? '試行回数が多すぎます。しばらくしてからお試しください' : 'パスワードが違います' };
}

export async function onRequest(context) {
  setEnv(context.env || {});
  if (context.request.method !== 'POST') return json(405, { error: '未対応のメソッドです' });
  let p; try { p = await context.request.json(); } catch (_) { return json(400, { error: '不正なリクエストです' }); }
  try {
    if (p.action === 'enable') {
      const s = await liveSession(p.token);
      if (!s) return json(401, { error: 'ログインが必要です' });
      const password = String(p.password || '');
      if (password.length < 6 || password.length > 128) return json(400, { error: 'パスワードは6〜128文字にしてください' });
      const session = cleanSession(p.session, p.token);
      if (!session || session.email !== s.email) return json(400, { error: 'セッション情報が不正です' });
      const deviceToken = crypto.randomBytes(32).toString('hex');
      const salt = crypto.randomBytes(16).toString('hex');
      await setJSON(STORE, sha(deviceToken), { email: s.email, salt, hash: await hashPassword(password, salt), session, fails: 0, lockedUntil: 0, createdAt: new Date().toISOString() });
      return json(200, { ok: true, deviceToken });
    }
    if (!validDevice(p.deviceToken)) return json(400, { error: '端末情報が不正です' });
    const key = sha(p.deviceToken);
    const rec = await getJSON(STORE, key);
    if (!rec) return json(p.action === 'status' ? 200 : 404, p.action === 'status' ? { exists: false } : { error: 'この端末のロック情報が見つかりません。通常のログインをしてください', gone: true });
    if (p.action === 'status') return json(200, { exists: true, email: rec.email, displayName: rec.session?.displayName || '' });
    if (p.action === 'refresh') {
      const s = await liveSession(p.session?.token);
      const session = s && s.email === rec.email ? cleanSession(p.session, p.session.token) : null;
      if (!session) return json(400, { error: 'セッションを更新できません' });
      rec.session = session; await setJSON(STORE, key, rec);
      return json(200, { ok: true });
    }
    if (p.action === 'unlock' || p.action === 'disable') {
      const r = await check(key, rec, p.password);
      if (!r.ok) return json(r.status, { error: r.error });
      const s = await liveSession(rec.session?.token);
      if (p.action === 'disable') await getStore({ name: STORE }).delete(key);
      if (!s) { await getStore({ name: STORE }).delete(key); return json(200, { ok: true, needLogin: true }); } // ログインの有効期限切れ
      return json(200, { ok: true, session: rec.session });
    }
    if (p.action === 'change') {
      const r = await check(key, rec, p.oldPassword);
      if (!r.ok) return json(r.status, { error: r.error });
      const next = String(p.newPassword || '');
      if (next.length < 6 || next.length > 128) return json(400, { error: '新しいパスワードは6〜128文字にしてください' });
      rec.salt = crypto.randomBytes(16).toString('hex'); rec.hash = await hashPassword(next, rec.salt);
      await setJSON(STORE, key, rec);
      return json(200, { ok: true });
    }
    return json(400, { error: '不明な操作です' });
  } catch (error) {
    console.error('device-lock error:', error && error.stack || error);
    return json(500, { error: 'サーバーエラーが発生しました' });
  }
}
