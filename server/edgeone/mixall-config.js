// server/edgeone/mixall-config.js → cloud-functions/_lib/mixall-config.js（scripts/build-edgeone.mjs がコピー）
// EdgeOne 版の各関数の入口で、設定値（Supabase の kv の mixall-config/env）を context.env に足す。
// EdgeOne に登録する環境変数は SUPABASE_URL と SUPABASE_SECRET_KEY だけでよく、
// AgentMail・cron の合言葉・VAPID 鍵などは Supabase 版（server/edge-router.js）と同じ行を共有する。EdgeOne の環境変数が優先。
let loadedAt = 0;
let values = {};

async function load(url, key) {
  if (Date.now() - loadedAt < 60_000) return;
  loadedAt = Date.now();
  try {
    const headers = { apikey: key };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${url}/rest/v1/kv?store=eq.mixall-config&key=eq.env&select=value`, { headers, signal: AbortSignal.timeout(5000) });
    const row = (await res.json())[0];
    values = row ? JSON.parse(row.value) || {} : {};
  } catch (error) {
    console.error('mixall-config load failed:', error.message);
  }
}

// 旧版の VAPID 鍵（web-push 形式）を EdgeOne 版の形式（JWK）に直す。既存の購読をそのまま生かすため
function vapid(env) {
  if (env.VAPID_PRIVATE_JWK || !env.MIXALL_VAPID_PUBLIC || !env.MIXALL_VAPID_PRIVATE) return;
  const pub = Buffer.from(env.MIXALL_VAPID_PUBLIC, 'base64url');
  if (pub.length !== 65) return;
  env.VAPID_PRIVATE_JWK = JSON.stringify({ kty: 'EC', crv: 'P-256', d: env.MIXALL_VAPID_PRIVATE, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') });
  env.VAPID_PUBLIC_KEY = env.MIXALL_VAPID_PUBLIC;
}

export async function withMixallConfig(context) {
  // EdgeOne の context.env は中身を列挙できないことがあるので、名前を指定して読む
  const base = (context && context.env) || {};
  const pe = (typeof process !== 'undefined' && process.env) || {};
  const platform = (k) => { const v = base[k] ?? pe[k]; return v === undefined || v === null || v === '' ? undefined : String(v); };
  const url = String(platform('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = String(platform('SUPABASE_SECRET_KEY') || platform('SUPABASE_SERVICE_ROLE_KEY') || '');
  if (url && key) await load(url, key);
  const extra = { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key };
  for (const [k, v] of Object.entries(values)) if (v !== null && v !== undefined && v !== '') extra[k] = String(v);
  vapid(extra);
  let names = [];
  try { names = Object.keys(base); } catch (_) {}
  const plain = {};
  for (const k of new Set([...names, ...Object.keys(extra)])) { const v = platform(k) ?? extra[k]; if (v !== undefined && v !== '') plain[k] = v; }
  const env = new Proxy(plain, { get: (t, k) => (typeof k === 'string' ? (t[k] ?? platform(k)) : undefined) });
  // context の他の値（request, params, waitUntil など）はそのまま、env だけ差し替える
  return new Proxy(context, {
    get(target, prop) {
      if (prop === 'env') return env;
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
