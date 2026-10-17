// server/entry.js
// Supabase Edge Function「mixall-api」のエントリ。旧Netlify Functions（exports.handler形式）を
// そのまま1つの関数にまとめ、URL /functions/v1/mixall-api/<関数名> で呼び分ける。
// scripts/build-edge.mjs がこのファイルをDeno用の単一ESMへバンドルする。

const handlers = {
  admin: () => require('../netlify/functions/admin'),
  'ai-bot-background': () => require('../netlify/functions/ai-bot-background'),
  auth: () => require('../netlify/functions/auth'),
  backup: () => require('../netlify/functions/backup'),
  calendar: () => require('../netlify/functions/calendar'),
  calls: () => require('../netlify/functions/calls'),
  chat: () => require('./chat-vault'),
  coins: () => require('../netlify/functions/coins'),
  custom: () => require('../netlify/functions/custom'),
  extensions: () => require('../netlify/functions/extensions'),
  files: () => require('../netlify/functions/files'),
  'ghost-chat': () => require('../netlify/functions/ghost-chat'),
  ghost: () => require('../netlify/functions/ghost'),
  languages: () => require('../netlify/functions/languages'),
  'lending-data': () => require('../netlify/functions/lending-data'),
  lending: () => require('../netlify/functions/lending'),
  mail: () => require('../netlify/functions/mail'),
  media: () => require('../netlify/functions/media'),
  notifications: () => require('../netlify/functions/notifications'),
  'ogp-post': () => require('../netlify/functions/ogp-post'),
  pocket: () => require('../netlify/functions/pocket'),
  'scheduled-ghost-moderation-background': () => require('../netlify/functions/scheduled-ghost-moderation-background'),
  'scheduled-program-review-background': () => require('../netlify/functions/scheduled-program-review-background'),
  'scheduled-tokibou-background': () => require('../netlify/functions/scheduled-tokibou-background'),
  'scheduled-tools-cleanup': () => require('../netlify/functions/scheduled-tools-cleanup'),
  'scheduled-uch-ai-background': () => require('../netlify/functions/scheduled-uch-ai-background'),
  'site-state': () => require('../netlify/functions/site-state'),
  'site-view': () => require('../netlify/functions/site-view'),
  stamps: () => require('../netlify/functions/stamps'),
  tools: () => require('../netlify/functions/tools'),
  uch: () => require('../netlify/functions/uch'),
  webhook: () => require('../netlify/functions/webhook'),
  webhooks: () => require('../netlify/functions/webhooks'),
  migrate: () => require('./migrate')
};

const TEXT_TYPES = /^(text\/|application\/(json|x-www-form-urlencoded|xml|javascript))/i;

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(process.env.MIXALL_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = !allowed.length || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? (origin || '*') : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mixall-device, x-mixall-ack, x-webhook-signature, x-mixall-signature, range',
    'Access-Control-Expose-Headers': 'content-range, content-length, accept-ranges',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function functionNameFrom(url) {
  // /mixall-api/<name>/<rest...> または /functions/v1/mixall-api/<name>/...
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.indexOf('mixall-api');
  const rest = at >= 0 ? parts.slice(at + 1) : parts;
  return { name: rest[0] || '', subPath: `/${rest.join('/')}` };
}

async function toEvent(request, url, subPath) {
  const headers = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  const query = {};
  url.searchParams.forEach((value, key) => { query[key] = value; });
  let body = null;
  let isBase64Encoded = false;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const type = headers['content-type'] || '';
    if (!type || TEXT_TYPES.test(type)) body = await request.text();
    else { body = Buffer.from(await request.arrayBuffer()).toString('base64'); isBase64Encoded = true; }
  }
  return {
    httpMethod: request.method,
    headers,
    multiValueHeaders: {},
    queryStringParameters: query,
    path: subPath,
    rawUrl: url.toString(),
    body,
    isBase64Encoded
  };
}

function toResponse(result, extraHeaders) {
  const status = Number(result?.statusCode || 200);
  const headers = new Headers(extraHeaders);
  for (const [key, value] of Object.entries(result?.headers || {})) headers.set(key, String(value));
  let body = result?.body ?? '';
  if (result?.isBase64Encoded) body = Buffer.from(String(body), 'base64');
  if (status === 204 || status === 304) body = null;
  return new Response(body, { status, headers });
}

// 端末保存チャット: これらのAPI応答に、その端末あての受信待ち本文（__vault）を同梱する。
const VAULT_FUNCTIONS = new Set(['pocket', 'ghost-chat', 'mail', 'chat']);

function tokenFrom(event) {
  if (event.queryStringParameters?.token) return String(event.queryStringParameters.token);
  if (event.body && !event.isBase64Encoded) {
    try { return String(JSON.parse(event.body).token || ''); } catch { return ''; }
  }
  return '';
}

async function attachVault(event, result) {
  const deviceId = event.headers['x-mixall-device'];
  if (!deviceId || !result || !/json/i.test(String(result.headers?.['Content-Type'] || result.headers?.['content-type'] || ''))) return;
  const token = tokenFrom(event);
  if (!token) return;
  const { STORE_NAMES, getJSON } = require('../netlify/lib/store');
  const session = await getJSON(STORE_NAMES.SESSIONS, token);
  if (!session || session.expiresAt < Date.now() || !session.email) return;
  let body;
  try { body = JSON.parse(result.body || 'null'); } catch { return; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const vault = await require('./chat-vault').pull(session.email, deviceId, event.headers['x-mixall-ack']);
  if (!vault) return;
  body.__vault = vault;
  result.body = JSON.stringify(body);
}

function checkCronSecret(event) {
  const expected = String(process.env.MIXALL_CRON_SECRET || '');
  return expected && event.headers['x-mixall-cron'] === expected;
}

async function handle(request) {
  const url = new URL(request.url);
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const { name, subPath } = functionNameFrom(url);
  const load = handlers[name];
  if (!load) return new Response(JSON.stringify({ error: 'APIが見つかりません' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

  const event = await toEvent(request, url, subPath);
  // Netlifyでは外部から叩けなかった定期実行関数は、pg_cronからの秘密ヘッダー付き要求だけ受け付ける。
  if (name.startsWith('scheduled-') && !checkCronSecret(event)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const mod = load();
  const handler = mod.handler || mod.default;
  if (name === 'scheduled-tools-cleanup') {
    try { await require('./chat-vault').purgeExpired(); } catch (error) { console.error('[chat-vault purge]', error); }
  }

  // Background Function互換: すぐ202を返し、処理はレスポンス後も継続させる。
  if (name.endsWith('-background')) {
    const work = Promise.resolve().then(() => handler(event, {})).catch((error) => console.error(`[${name}]`, error));
    if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(work);
    return new Response('', { status: 202, headers: cors });
  }

  try {
    const result = await handler(event, {});
    if (VAULT_FUNCTIONS.has(name)) await attachVault(event, result);
    return toResponse(result, cors);
  } catch (error) {
    console.error(`[${name}]`, error);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
  }
}

module.exports = { handle, handlers };
