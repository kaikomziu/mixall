// server/migrate.js
// 旧Netlify版の運営バックアップZIP（blob/<ストア>/part-*.json）を取り込むAPI。
// scripts/migrate-backup.mjs がZIPを読み、ストアごとに小分けして送ってくる。
// 認証は mixall-config の MIXALL_MIGRATION_SECRET（移行が終わったら消す）。
// チャット系ストアは setJSON 経由で保存するので、本文は自動的に配送キュー（端末行き）へ回る。
const crypto = require('crypto');
const { STORE_NAMES, setJSON } = require('../netlify/lib/store');
const chatVault = require('./chat-vault');

// 旧サイトのログイン状態・短命データは移さない
const SKIP_STORES = new Set(['SESSIONS', 'PRESENCE', 'AI_JOBS', 'MESSAGE_FILTER_CACHE', 'CUSTOM_SIGNALS', 'SESSION_LOGOUTS']);

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

function secretMatches(given) {
  const expected = String(process.env.MIXALL_MIGRATION_SECRET || '');
  if (expected.length < 24 || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POSTのみ' });
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なJSONです' }); }
  if (!secretMatches(payload.secret)) return json(403, { error: '移行用シークレットが違うか、移行が無効です' });
  const store = String(payload.store || '');
  if (!STORE_NAMES[store]) return json(400, { error: `未対応のストアです: ${store}` });
  if (SKIP_STORES.has(store)) return json(200, { ok: true, skipped: true, written: 0 });
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  chatVault.setMigrationMode(true);
  let written = 0;
  try {
    for (const entry of entries) {
      if (!entry || typeof entry.key !== 'string') continue;
      await setJSON(STORE_NAMES[store], entry.key, entry.value);
      written += 1;
    }
  } finally {
    chatVault.setMigrationMode(false);
  }
  return json(200, { ok: true, store, written });
};
