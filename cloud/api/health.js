// /api/health を開いて {"ok":true} が出れば、Supabaseとの接続はOKです。
import { getStore, setEnv } from '../_lib/blobs.js';

export async function onRequestGet(context) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  try {
    setEnv(context.env);
    const store = getStore('_health');
    await store.set('ping', String(Date.now()));
    const value = await store.get('ping');
    await store.delete('ping');
    return json({ ok: value !== null, supabase: 'connected' });
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}
