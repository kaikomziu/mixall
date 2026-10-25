// チャットのリアルタイム用(WebRTC)シグナリング。メッセージ本体はここを通らない(端末同士で直接送る)。ここで扱うのは
// 「ルームを開いている端末の一覧(在室)」と、接続のためのoffer/answer/candidateだけ。メッセージの履歴は従来どおりSupabaseに保存される。
//  POST /api/rt {action:'sync', roomId, deviceId}   在室を更新し、同じルームの在室端末と自分宛のシグナルを返す(読んだシグナルは削除)
//  POST /api/rt {action:'signal', roomId, toDevice, data}
//  POST /api/rt {action:'bye', roomId, deviceId}
import { getStore, setEnv } from '../_lib/blobs.js';

const RT = 'netrify-rt', ROOMS = 'netrify-pocket-rooms', SESSIONS = 'netrify-sessions';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const st = (n) => getStore({ name: n });
const getJ = async (store, key) => { const v = await st(store).get(key, { type: 'text' }); if (!v) return null; try { return JSON.parse(v); } catch (_) { return null; } };
const ID = /^[A-Za-z0-9_-]{6,60}$/;

export async function onRequest(context) {
  const req = context.request; setEnv(context.env || {});
  if (req.method !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  try {
    const p = await req.json().catch(() => ({}));
    const s = p.token ? await getJ(SESSIONS, String(p.token)) : null;
    if (!s || !(s.expiresAt > Date.now()) || !s.email) return json(401, { error: 'ログインが必要です' });
    const email = String(s.email), roomId = String(p.roomId || '');
    if (!ID.test(roomId)) return json(400, { error: 'roomIdが不正です' });
    const room = await getJ(ROOMS, roomId);
    if (!room || !Array.isArray(room.memberEmails) || !room.memberEmails.includes(email)) return json(404, { error: 'ルームが見つかりません' });
    const a = p.action, now = Date.now();
    if (a === 'sync') {
      const deviceId = String(p.deviceId || ''); if (!ID.test(deviceId)) return json(400, { error: 'deviceIdが不正です' });
      await st(RT).set(`ann:${roomId}:${deviceId}`, JSON.stringify({ email, deviceId, at: now }));
      const peers = [];
      for (const k of (await st(RT).list({ prefix: `ann:${roomId}:` })).blobs.map((b) => b.key).slice(0, 60)) {
        const v = await getJ(RT, k); if (!v) continue;
        if (now - v.at > 5 * 60_000) { st(RT).delete(k).catch(() => {}); continue; }
        if (now - v.at <= 30_000 && v.deviceId !== deviceId) peers.push({ email: v.email, deviceId: v.deviceId });
      }
      const signals = [];
      for (const k of (await st(RT).list({ prefix: `sig:${roomId}:${deviceId}:` })).blobs.map((b) => b.key).sort().slice(0, 80)) {
        const v = await getJ(RT, k); await st(RT).delete(k).catch(() => {});
        if (v && now - v.at < 120_000) signals.push({ from: v.from, data: v.data });
      }
      return json(200, { peers, signals });
    }
    if (a === 'signal') {
      const toDevice = String(p.toDevice || ''); if (!ID.test(toDevice)) return json(400, { error: 'toDeviceが不正です' });
      const raw = JSON.stringify(p.data || {}); if (raw.length > 20_000) return json(400, { error: 'データが大きすぎます' });
      const fromDevice = String(p.deviceId || ''); if (!ID.test(fromDevice)) return json(400, { error: 'deviceIdが不正です' });
      const sid = now.toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 6);
      await st(RT).set(`sig:${roomId}:${toDevice}:${sid}`, JSON.stringify({ from: { email, deviceId: fromDevice }, data: p.data, at: now }));
      return json(200, { ok: true });
    }
    if (a === 'bye') {
      const deviceId = String(p.deviceId || ''); if (ID.test(deviceId)) await st(RT).delete(`ann:${roomId}:${deviceId}`).catch(() => {});
      return json(200, { ok: true });
    }
    return json(400, { error: '不明な操作です' });
  } catch (e) { return json(500, { error: e.message || 'エラーが発生しました' }); }
}
