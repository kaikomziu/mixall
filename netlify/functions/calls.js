const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, listKeys, db } = require('../lib/store');
const { requireSession, getAccountProfile } = require('../lib/session');

const RING_TTL_MS = 2 * 60 * 1000;
const ACTIVE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SIGNAL_BYTES = 32 * 1024;
const TEMP_BLOB_TTL_MS = 15 * 60 * 1000;

function json(status, body) { return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }; }
function newId() { return crypto.randomBytes(12).toString('hex'); }
function normalizeEmail(value) { const email = String(value || '').trim().toLowerCase(); return /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?@bix\.3erver$/.test(email) ? email : null; }
function publicCall(call) { return { id:call.id, callerEmail:call.callerEmail, calleeEmail:call.calleeEmail, callerPeerId:call.callerPeerId || null, calleePeerId:call.calleePeerId || null, mode:call.mode, status:call.status, createdAt:call.createdAt, updatedAt:call.updatedAt, expiresAt:call.expiresAt, missedReadAt:call.missedReadAt || null }; }
function allowed(call, email) { return call && (call.callerEmail === email || call.calleeEmail === email); }

async function listCallsFor(email) {
  const keys = await listKeys(STORE_NAMES.CALLS, 'call:');
  const calls = [];
  for (const key of keys) {
    const call = await getJSON(STORE_NAMES.CALLS, key);
    if (!call || !allowed(call, email)) continue;
    if (call.expiresAt < Date.now() && call.status === 'ringing') { call.status = 'missed'; call.updatedAt = new Date().toISOString(); await setJSON(STORE_NAMES.CALLS, key, call); }
    calls.push(call);
  }
  return calls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// 着信待ちの定期確認（poll）用。自分が関わる「呼び出し中」か、自分宛ての「未確認の不在着信」の通話だけを、
// シグナリングデータ（signals）を除いてDBから取る。全通話を毎回読んでいたのを減らし、転送量を抑える。
async function listIncomingFor(email) {
  const store = db();
  if (typeof store.sql !== 'function' || !store.getWithout) return listCallsFor(email);
  let rows;
  try {
    rows = await store.sql`select key, value - 'signals' as value from public.mixall_kv
      where store = ${STORE_NAMES.CALLS} and key like 'call:%'
        and ((value->>'calleeEmail' = ${email}
              and (value->>'status' = 'ringing' or (value->>'status' = 'missed' and coalesce(value->>'missedReadAt', '') = '')))
          -- 自分がかけた呼び出し中の通話も、時間切れなら「不在」に切り替えるため対象にする（従来の挙動を維持）
          or (value->>'callerEmail' = ${email} and value->>'status' = 'ringing'))`;
  } catch (_) {
    return listCallsFor(email); // メモリ版など SQL が使えないときは従来どおり
  }
  const calls = [];
  for (const row of rows) {
    let call = row.value;
    if (!call) continue;
    if (call.expiresAt < Date.now() && call.status === 'ringing') {
      // 状態を書き換えるときは signals を消さないよう全体を読み直す
      const full = await getJSON(STORE_NAMES.CALLS, row.key);
      if (!full) continue;
      full.status = 'missed'; full.updatedAt = new Date().toISOString(); await setJSON(STORE_NAMES.CALLS, row.key, full);
      call = full;
    }
    calls.push(call);
  }
  return calls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なJSONです' }); }
  try {
    const email = await requireSession(payload.token);
    if (!email) return json(401, { error: 'ログインが必要です' });
    const action = payload.action;
    if (action === 'start') {
      const calleeEmail = normalizeEmail(payload.calleeEmail);
      if (!calleeEmail || calleeEmail === email) return json(400, { error: '相手のアカウントが不正です' });
      const profile = await getAccountProfile(calleeEmail, { avatar:false });
      const callerProfile = await getAccountProfile(email, { avatar:false });
      if (!profile.createdAt) return json(404, { error: '相手のアカウントが見つかりません' });
      const now = new Date().toISOString();
      const call = { id:newId(), callerEmail:email, calleeEmail, callerPeerId: callerProfile.peerId, calleePeerId: profile.peerId, mode:['audio','video','screen'].includes(payload.mode) ? payload.mode : 'audio', status:profile.online ? 'ringing' : 'missed', createdAt:now, updatedAt:now, expiresAt:Date.now() + (profile.online ? RING_TTL_MS : 0), signals:[], transport:'temporary-netlify-blob-signaling', stateExpiresAt:Date.now()+TEMP_BLOB_TTL_MS, missedReadAt:null };
      await setJSON(STORE_NAMES.CALLS, `call:${call.id}`, call);
      return json(201, { call:publicCall(call), recipientOnline:profile.online });
    }
    if (action === 'poll') {
      const calls = await listIncomingFor(email);
      return json(200, { incoming:calls.filter((call) => call.calleeEmail === email && call.status === 'ringing').map(publicCall), missed:calls.filter((call) => call.calleeEmail === email && call.status === 'missed' && !call.missedReadAt).map(publicCall) });
    }
    const callId = String(payload.callId || '');
    const call = await getJSON(STORE_NAMES.CALLS, `call:${callId}`);
    if (!call || !allowed(call, email)) return json(404, { error: '通話が見つかりません' });
    if (action === 'get') { call.stateExpiresAt=Date.now()+TEMP_BLOB_TTL_MS; await setJSON(STORE_NAMES.CALLS, `call:${call.id}`, call); return json(200, { call:publicCall(call), signals:(call.signals || []).filter((signal) => signal.toEmail === email), transport:'temporary-netlify-blob-signaling' }); }
    if (action === 'signal') {
      const raw = JSON.stringify(payload.signal || {});
      if (Buffer.byteLength(raw, 'utf8') > MAX_SIGNAL_BYTES) return json(400, { error: 'シグナリングデータが大きすぎます' });
      const toEmail = call.callerEmail === email ? call.calleeEmail : call.callerEmail;
      call.signals = [...(call.signals || []), { id:newId(), fromEmail:email, toEmail, data:payload.signal, createdAt:new Date().toISOString() }].slice(-40);
      call.updatedAt = new Date().toISOString(); call.stateExpiresAt=Date.now()+TEMP_BLOB_TTL_MS; await setJSON(STORE_NAMES.CALLS, `call:${call.id}`, call);
      return json(200, { ok:true });
    }
    if (action === 'status') {
      const status = ['accepted','declined','ended','missed'].includes(payload.status) ? payload.status : null;
      if (!status) return json(400, { error: '不正な通話状態です' });
      if (status === 'accepted' && email !== call.calleeEmail) return json(403, { error: '着信側のみ応答できます' });
      call.status = status; call.updatedAt = new Date().toISOString();
      if (status === 'accepted') call.expiresAt = Date.now() + ACTIVE_TTL_MS;
      if (status === 'ended' || status === 'declined') call.expiresAt = Date.now();
      await setJSON(STORE_NAMES.CALLS, `call:${call.id}`, call);
      return json(200, { call:publicCall(call) });
    }
    if (action === 'markMissedRead') {
      if (email !== call.calleeEmail || call.status !== 'missed') return json(403, { error: '未通話履歴を確認できません' });
      call.missedReadAt = new Date().toISOString(); call.updatedAt = new Date().toISOString(); await setJSON(STORE_NAMES.CALLS, `call:${call.id}`, call);
      return json(200, { ok:true });
    }
    return json(400, { error: '不明なactionです' });
  } catch (error) { console.error('calls function error:', error); return json(500, { error: `内部エラー: ${error.message}` }); }
};
