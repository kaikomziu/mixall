// server/edge-router.js
// Supabase Edge Function「mixall-api」の入口（Deno）。scripts/build-edge.mjs が
// supabase/functions/mixall-api/index.js としてコピーし、隣に cloud/（EdgeOne版のサーバー）を置く。
//
// URL:  /functions/v1/mixall-api/<名前>        → cloud/api/<名前>.js
//       /functions/v1/mixall-api/ghost/post/<id> → cloud/ghost/post/[id].js
//       /functions/v1/mixall-api/ghost/<handle>  → cloud/ghost/[handle].js
//       /functions/v1/mixall-api/r/<id>          → cloud/r/[id].js
//       /functions/v1/mixall-api/site-view/<…>   → cloud/site-view/[[default]].js
// EdgeOne の onRequest(context) をそのまま呼ぶ。関数から見たURLは EdgeOne と同じ /api/<名前> にする。
import nodeProcess from 'node:process';
import { Buffer } from 'node:buffer';

// Supabase Edge Runtime では Deno.env.set が使えないため、書き換えられる process.env を用意する
const env = { ...nodeProcess.env };
const processShim = new Proxy(nodeProcess, {
  get(target, key) {
    if (key === 'env') return env;
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
Object.defineProperty(globalThis, 'process', { value: processShim, writable: true, configurable: true });
globalThis.Buffer = globalThis.Buffer || Buffer;

// cloud/ のコードは SUPABASE_SECRET_KEY で kv テーブルを読み書きする
if (!env.SUPABASE_SECRET_KEY && env.SUPABASE_SERVICE_ROLE_KEY) env.SUPABASE_SECRET_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const FROM_SECRETS = new Set(Object.keys(env));

const API = {
  admin: () => import('./cloud/api/admin.js'),
  'ai-bot-background': () => import('./cloud/api/ai-bot-background.js'),
  'ai-sweep': () => import('./cloud/api/ai-sweep.js'),
  'anime-search': () => import('./cloud/api/anime-search.js'),
  archive: () => import('./cloud/api/archive.js'),
  auth: () => import('./cloud/api/auth.js'),
  'auto-compact': () => import('./cloud/api/auto-compact.js'),
  backup: () => import('./cloud/api/backup.js'),
  calendar: () => import('./cloud/api/calendar.js'),
  calls: () => import('./cloud/api/calls.js'),
  classroom: () => import('./cloud/api/classroom.js'),
  coins: () => import('./cloud/api/coins.js'),
  custom: () => import('./cloud/api/custom.js'),
  'device-lock': () => import('./cloud/api/device-lock.js'),
  extensions: () => import('./cloud/api/extensions.js'),
  feedback: () => import('./cloud/api/feedback.js'),
  files: () => import('./cloud/api/files.js'),
  fomasu: () => import('./cloud/api/fomasu.js'),
  'ghost-chat': () => import('./cloud/api/ghost-chat.js'),
  ghost: () => import('./cloud/api/ghost.js'),
  health: () => import('./cloud/api/health.js'),
  jobs: () => import('./cloud/api/jobs.js'),
  kodomiru: () => import('./cloud/api/kodomiru.js'),
  languages: () => import('./cloud/api/languages.js'),
  'lending-data': () => import('./cloud/api/lending-data.js'),
  lending: () => import('./cloud/api/lending.js'),
  mail: () => import('./cloud/api/mail.js'),
  maws: () => import('./cloud/api/maws.js'),
  media: () => import('./cloud/api/media.js'),
  notifications: () => import('./cloud/api/notifications.js'),
  'ogp-post': () => import('./cloud/api/ogp-post.js'),
  pixiv: () => import('./cloud/api/pixiv.js'),
  pocket: () => import('./cloud/api/pocket.js'),
  push: () => import('./cloud/api/push.js'),
  px: () => import('./cloud/api/px.js'),
  rt: () => import('./cloud/api/rt.js'),
  'scheduled-ghost-moderation-background': () => import('./cloud/api/scheduled-ghost-moderation-background.js'),
  'scheduled-program-review-background': () => import('./cloud/api/scheduled-program-review-background.js'),
  'scheduled-tokibou-background': () => import('./cloud/api/scheduled-tokibou-background.js'),
  'scheduled-tools-cleanup': () => import('./cloud/api/scheduled-tools-cleanup.js'),
  'scheduled-uch-ai-background': () => import('./cloud/api/scheduled-uch-ai-background.js'),
  school: () => import('./cloud/api/school.js'),
  'site-state': () => import('./cloud/api/site-state.js'),
  'site-view': () => import('./cloud/api/site-view.js'),
  stamps: () => import('./cloud/api/stamps.js'),
  store: () => import('./cloud/api/store.js'),
  tools: () => import('./cloud/api/tools.js'),
  uch: () => import('./cloud/api/uch.js'),
  webhook: () => import('./cloud/api/webhook.js'),
  webhooks: () => import('./cloud/api/webhooks.js')
};
const PAGES = {
  ghostPost: () => import('./cloud/ghost/post/[id].js'),
  ghostHandle: () => import('./cloud/ghost/[handle].js'),
  shortLink: () => import('./cloud/r/[id].js'),
  siteView: () => import('./cloud/site-view/[[default]].js')
};

function route(parts) {
  const [head, a, b] = parts;
  if (head === 'ghost' && a === 'post' && b) return { load: PAGES.ghostPost, params: { id: b }, path: `/Ghost/post/${b}` };
  if (head === 'ghost' && a) return { load: PAGES.ghostHandle, params: { handle: a }, path: `/ghost/${a}` };
  if (head === 'r' && a) return { load: PAGES.shortLink, params: { id: a }, path: `/r/${a}` };
  if (head === 'site-view') return { load: PAGES.siteView, params: { default: parts.slice(1).join('/') }, path: `/${parts.join('/')}` };
  // /api/<名前> の形で呼ばれても受け付ける（関数どうしの呼び出し）
  const name = head === 'api' ? a : head;
  if (name === 'vault-restore') return { builtin: vaultRestore };
  if (name === 'archive-job') return { builtin: archiveJob };
  if (API[name]) return { load: API[name], params: {}, path: `/api/${name}` };
  return null;
}

// 以前の版（端末保存チャット）で端末だけにある本文を、書いた本人の端末から戻す（js/vault-restore.js が呼ぶ）
// 戻せるのは自分が書いたメッセージ（サーバー側で vault:true のまま本文が無いもの）だけ。他人の発言は書き換えられない
const VAULT_FIELDS = ['text', 'attachment', 'editHistory', 'deletedText', 'deletedAttachment', 'media', 'stamp', 'imageUrl'];
const VAULT_STORES = { pocket: 'netrify-pocket-rooms', mail: 'netrify-mail-threads' };
async function vaultRestore(request) {
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  if (request.method !== 'POST') return reply(405, { error: 'POSTのみ対応しています' });
  let body;
  try { body = await request.json(); } catch (_) { return reply(400, { error: 'invalid json' }); }
  const { getStore, setEnv } = await import('./cloud/_lib/blobs.js');
  setEnv(env);
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

// 毎日の Supabase → GitHub（mixall-data）書き出し（server/archive-job.js）
async function archiveJob(request) {
  const { setEnv } = await import('./cloud/_lib/blobs.js');
  setEnv(env);
  const mod = await import('./archive-job.js');
  return mod.archiveJob(request, env);
}

// mixall-config の env 行（運営・管理用の設定値）を process.env に読み込む。シークレット側が優先
let configLoadedAt = 0;
async function loadRuntimeConfig() {
  if (Date.now() - configLoadedAt < 60_000) return;
  configLoadedAt = Date.now();
  try {
    const res = await originalFetch(`${env.SUPABASE_URL}/rest/v1/kv?store=eq.mixall-config&key=eq.env&select=value`, {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` }
    });
    const row = (await res.json())[0];
    const values = row ? JSON.parse(row.value) : {};
    for (const [key, value] of Object.entries(values || {})) {
      if (FROM_SECRETS.has(key)) continue;
      if (value === null || value === undefined || value === '') delete env[key];
      else env[key] = String(value);
    }
  } catch (error) {
    console.error('runtime config load failed:', error.message);
  }
  // 旧版の VAPID 鍵（web-push 形式）を EdgeOne 版の形式（JWK）に直して使う。既存の購読をそのまま生かすため
  if (!env.VAPID_PRIVATE_JWK && env.MIXALL_VAPID_PUBLIC && env.MIXALL_VAPID_PRIVATE) {
    const pub = Buffer.from(env.MIXALL_VAPID_PUBLIC, 'base64url');
    if (pub.length === 65) {
      env.VAPID_PRIVATE_JWK = JSON.stringify({ kty: 'EC', crv: 'P-256', d: env.MIXALL_VAPID_PRIVATE, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') });
      env.VAPID_PUBLIC_KEY = env.MIXALL_VAPID_PUBLIC;
    }
  }
}

// 関数どうしの呼び出し（例: /api/ai-bot-background）を、この Edge Function のURLへ向け直す
const originalFetch = globalThis.fetch.bind(globalThis);
let selfBase = '';
const siteOrigins = new Set();
globalThis.fetch = (input, init) => {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    if (selfBase && url.pathname.startsWith('/api/') && (siteOrigins.has(url.origin))) {
      const target = `${selfBase}/${url.pathname.slice(5)}${url.search}`;
      return originalFetch(typeof input === 'string' || input instanceof URL ? target : new Request(target, input), init);
    }
  } catch (_) {}
  return originalFetch(input, init);
};

function cors(request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') || 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Expose-Headers': 'content-range, content-length, accept-ranges, content-disposition',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  const url = new URL(request.url);
  // Supabase では URL の先頭が関数名（/mixall-api/<名前>）。ローカル確認でも同じ形で呼ぶ
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'functions' && parts[1] === 'v1') parts.splice(0, 2);
  const functionName = parts.shift() || 'mixall-api';
  const target = route(parts);
  if (!target) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { ...cors(request), 'Content-Type': 'application/json' } });

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const origin = `https://${host}`;
  selfBase = `${origin}/functions/v1/${functionName}`;
  siteOrigins.add(origin);
  if (env.MIXALL_SITE_URL) { try { siteOrigins.add(new URL(env.MIXALL_SITE_URL).origin); } catch (_) {} }

  await loadRuntimeConfig();
  if (target.builtin) {
    const res = await target.builtin(request);
    for (const [key, value] of Object.entries(cors(request))) res.headers.set(key, value);
    return res;
  }
  const headers = new Headers(request.headers);
  headers.set('host', host);
  headers.set('x-forwarded-proto', 'https');
  const inner = new Request(`${origin}${target.path}${url.search}`, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    duplex: 'half'
  });
  const clientIp = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';

  let response;
  try {
    const mod = await target.load();
    // EdgeOne は onRequest のほか onRequestGet / onRequestPost などメソッド別の書き方もある
    const method = request.method[0] + request.method.slice(1).toLowerCase();
    const handler = mod[`onRequest${method}`] || mod.onRequest;
    if (!handler) return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...cors(request), 'Content-Type': 'application/json' } });
    response = await handler({ request: inner, env, params: target.params, clientIp, waitUntil: (p) => globalThis.EdgeRuntime?.waitUntil?.(p) });
  } catch (error) {
    console.error('mixall-api error:', error?.stack || error);
    response = new Response(JSON.stringify({ error: 'サーバーエラー: ' + String(error?.message || error).slice(0, 200) }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  const out = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors(request))) out.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
});
