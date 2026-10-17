// server/runtime-config.js
// Edge Functionのシークレットに加え、mixall_kv の store='mixall-config' key='env' に置いた設定を
// process.env へ読み込む（シークレット側が優先）。Supabaseの画面を開かずにSQLで設定を変えられるようにするため。
const { db } = require('../netlify/lib/store');

let loadedAt = 0;
const TTL_MS = 60 * 1000;
const fromSecrets = new Set(Object.keys(process.env));

async function loadRuntimeConfig() {
  if (Date.now() - loadedAt < TTL_MS) return;
  loadedAt = Date.now();
  try {
    const env = await db().get('mixall-config', 'env');
    if (!env || typeof env !== 'object') return;
    for (const [key, value] of Object.entries(env)) {
      if (fromSecrets.has(key)) continue;
      if (value === null || value === undefined || value === '') delete process.env[key];
      else process.env[key] = String(value);
    }
  } catch (error) {
    console.error('runtime config load failed:', error.message);
  }
}

module.exports = { loadRuntimeConfig };
