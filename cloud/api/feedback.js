// フィードバック(★1〜5 + 理由)。たまに表示される入力欄から送られ、運営がzip(txtの集合)で書き出すと同時に削除できる。
//  POST /api/feedback {action:'submit', rating, reason, page}                  ログイン済みユーザー
//  POST /api/feedback {action:'stats'}                                          運営: 件数・平均
//  POST /api/feedback {action:'export'}                                         運営: 全件をzip(base64)で返す(まだ削除しない)
//  POST /api/feedback {action:'delete', keys:[...]}                             運営: 書き出し済みのものを削除(ダウンロード成功後にクライアントが呼ぶ)
import { getStore, setEnv } from '../_lib/blobs.js';
import zlib from 'node:zlib';

const FB = 'netrify-feedback', SESSIONS = 'netrify-sessions', ACCOUNTS = 'netrify-accounts';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const st = (n) => getStore({ name: n });
const getJ = async (store, key) => { const v = await st(store).get(key, { type: 'text' }); if (!v) return null; try { return JSON.parse(v); } catch (_) { return null; } };
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

async function who(token) {
  if (!token) return null;
  const s = await getJ(SESSIONS, String(token));
  if (!s || !(s.expiresAt > Date.now()) || !s.email) return null;
  const a = await getJ(ACCOUNTS, String(s.email)) || {};
  return { email: String(s.email), name: a.displayName || String(s.email).split('@')[0], staff: a.isAdmin === true || a.isDeputyAdmin === true };
}

// ---- 最小のZIPライター(無圧縮STORED / UTF-8ファイル名) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { if (zlib.crc32) return zlib.crc32(buf) >>> 0; let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(files) {
  const parts = [], central = []; let offset = 0;
  const d = new Date(); const dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()), tm = (d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1);
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = Buffer.from(f.data, 'utf8'), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8); lh.writeUInt16LE(tm, 10); lh.writeUInt16LE(dt, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(tm, 12); ch.writeUInt16LE(dt, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name); offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const listKeys = async () => (await st(FB).list({ prefix: 'fb:' })).blobs.map((b) => b.key).sort();

export async function onRequest(context) {
  const req = context.request; setEnv(context.env || {});
  if (req.method !== 'POST') return json(405, { error: 'POSTのみ対応しています' });
  try {
    const p = await req.json().catch(() => ({}));
    const me = await who(p.token); if (!me) return json(401, { error: 'ログインが必要です' });
    const a = p.action;
    if (a === 'submit') {
      const rating = Math.round(Number(p.rating)); if (!(rating >= 1 && rating <= 5)) return json(400, { error: '★の数を選んでください' });
      const last = await getJ(FB, 'last:' + me.email); if (last && Date.now() - last.at < 60_000) return json(429, { error: '少し時間をあけてください' });
      const at = Date.now(); const key = `fb:${String(at).padStart(14, '0')}:${Math.random().toString(36).slice(2, 7)}`;
      await st(FB).set(key, JSON.stringify({ rating, reason: clean(p.reason, 1500), page: clean(p.page, 200), user: me.name, email: me.email, ua: clean(req.headers.get('user-agent'), 160), at: new Date(at).toISOString() }));
      await st(FB).set('last:' + me.email, JSON.stringify({ at }));
      return json(200, { ok: true });
    }
    if (!me.staff) return json(403, { error: '運営のみ操作できます' });
    if (a === 'stats') {
      const keys = await listKeys(); let sum = 0, n = 0; const dist = [0, 0, 0, 0, 0];
      for (const k of keys.slice(0, 2000)) { const v = await getJ(FB, k); if (v && v.rating) { sum += v.rating; n++; dist[v.rating - 1]++; } }
      return json(200, { count: keys.length, average: n ? Math.round(sum / n * 100) / 100 : null, distribution: dist });
    }
    if (a === 'export') {
      const keys = (await listKeys()).slice(0, 1500); const files = [], used = [];
      let i = 0;
      for (const k of keys) {
        const v = await getJ(FB, k); if (!v) continue; i++; used.push(k);
        const day = String(v.at || '').slice(0, 10);
        files.push({ name: `${String(i).padStart(4, '0')}_${stars(v.rating)}_${day}.txt`, data: `評価: ${stars(v.rating)} (${v.rating}/5)\n日時: ${v.at}\nユーザー: ${v.user} <${v.email}>\nページ: ${v.page || ''}\n端末: ${v.ua || ''}\n\n【理由】\n${v.reason || '(未記入)'}\n` });
      }
      if (!files.length) return json(200, { count: 0, zipBase64: '', keys: [] });
      return json(200, { count: files.length, keys: used, zipBase64: makeZip(files).toString('base64') });
    }
    if (a === 'delete') {
      const keys = (Array.isArray(p.keys) ? p.keys : []).map(String).filter((k) => /^fb:\d{14}:[a-z0-9]+$/.test(k)).slice(0, 2000);
      for (const k of keys) await st(FB).delete(k);
      return json(200, { ok: true, deleted: keys.length });
    }
    return json(400, { error: '不明な操作です' });
  } catch (e) { return json(500, { error: e.message || 'エラーが発生しました' }); }
}
