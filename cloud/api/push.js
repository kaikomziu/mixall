// バックグラウンド通知(Web Push)の購読API。
//  GET  /api/push                         → { publicKey }
//  POST /api/push {action:'subscribe', token, subscription}   この端末で通知を受け取る
//  POST /api/push {action:'unsubscribe', token, endpoint}     この端末の通知を止める
//  POST /api/push {action:'status', token, endpoint}          購読中か
//  POST /api/push {action:'test', token}                      自分の端末へテスト通知
import { getStore, setEnv } from '../_lib/blobs.js';
import { addSub, removeSub, getSubs, pushToEmail, vapidPublicKey } from '../_lib/push.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
async function sessionEmail(token) {
  if (!token) return null;
  const v = await getStore({ name: 'netrify-sessions' }).get(String(token), { type: 'text' }).catch(() => null);
  if (!v) return null;
  try { const s = JSON.parse(v); return s && s.expiresAt > Date.now() && s.email ? String(s.email).toLowerCase() : null; } catch (_) { return null; }
}

export async function onRequest(context) {
  const req = context.request;
  setEnv(context.env || {});
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method === 'GET') return json(200, { publicKey: vapidPublicKey() });
  if (req.method !== 'POST') return json(405, { error: 'GET/POSTのみ対応しています' });
  const p = await req.json().catch(() => ({}));
  const email = await sessionEmail(p.token);
  if (!email) return json(401, { error: 'ログインが必要です' });
  try {
    if (p.action === 'subscribe') { const n = await addSub(email, p.subscription, req.headers.get('user-agent')); return json(200, { ok: true, devices: n }); }
    if (p.action === 'unsubscribe') { const n = await removeSub(email, String(p.endpoint || '')); return json(200, { ok: true, devices: n }); }
    if (p.action === 'status') { const subs = await getSubs(email); return json(200, { subscribed: subs.some((s) => s.endpoint === p.endpoint), devices: subs.length }); }
    if (p.action === 'test') { const n = await pushToEmail(email, { title: 'MixAll', body: 'バックグラウンド通知のテストです。このまま閉じても届きます。', url: '/Notifications/', tag: 'mixall-test' }); return json(200, { ok: true, sent: n }); }
  } catch (e) { return json(400, { error: e.message || '失敗しました' }); }
  return json(400, { error: '不明な操作です' });
}
