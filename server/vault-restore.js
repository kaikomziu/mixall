// server/vault-restore.js
// 以前の版（端末保存チャット）で端末だけにある本文を、書いた本人の端末から戻す（js/vault-restore.js が呼ぶ）。
// 戻せるのは自分が書いたメッセージ（サーバー側で vault:true のまま本文が無いもの）だけ。他人の発言は書き換えられない。
// Supabase 版は server/edge-router.js、EdgeOne 版は cloud-functions/api/vault-restore.js から呼ぶ。
import { getStore } from './cloud/_lib/blobs.js';

const VAULT_FIELDS = ['text', 'attachment', 'editHistory', 'deletedText', 'deletedAttachment', 'media', 'stamp', 'imageUrl'];
const VAULT_STORES = { pocket: 'netrify-pocket-rooms', mail: 'netrify-mail-threads' };

export async function vaultRestore(request) {
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  if (request.method !== 'POST') return reply(405, { error: 'POSTのみ対応しています' });
  let body;
  try { body = await request.json(); } catch (_) { return reply(400, { error: 'invalid json' }); }
  const session = body.token ? await getStore({ name: 'netrify-sessions' }).get(String(body.token), { type: 'json' }).catch(() => null) : null;
  if (!session || !session.email || Number(session.expiresAt || 0) < Date.now()) return reply(401, { error: 'ログインが必要です' });
  const email = String(session.email).toLowerCase();
  const byConv = new Map();
  for (const item of (Array.isArray(body.items) ? body.items.slice(0, 500) : [])) {
    const store = VAULT_STORES[item && item.channel];
    if (!store || !item.convId || !item.msgId || !item.fields || typeof item.fields !== 'object') continue;
    const key = `${store}\u0000${item.convId}`;
    if (!byConv.has(key)) byConv.set(key, { store, convId: String(item.convId), items: [] });
    byConv.get(key).items.push(item);
  }
  let restored = 0;
  for (const { store, convId, items } of byConv.values()) {
    const kv = getStore({ name: store });
    const conv = await kv.get(convId, { type: 'json' }).catch(() => null);
    if (!conv || !Array.isArray(conv.messages)) continue;
    let changed = false;
    for (const item of items) {
      const message = conv.messages.find((m) => m && String(m.id) === String(item.msgId));
      if (!message || message.vault !== true || String(message.authorEmail || '').toLowerCase() !== email) continue;
      const fields = {};
      for (const name of VAULT_FIELDS) if (item.fields[name] !== undefined && item.fields[name] !== null) fields[name] = item.fields[name];
      if (!Object.keys(fields).length || JSON.stringify(fields).length > 2_000_000) continue;
      Object.assign(message, fields);
      delete message.vault;
      changed = true;
      restored += 1;
    }
    if (changed) await kv.setJSON(convId, conv);
  }
  return reply(200, { restored });
}
