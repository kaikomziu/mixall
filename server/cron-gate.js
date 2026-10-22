// server/cron-gate.js
// pg_cron は毎分などで mixall_cron_call(fn) を呼ぶが、仕事が無いときは Edge Function を起動しない。
// mixall_kv の ('mixall-config', 'cron-next:<fn>') に「次に起動すべき時刻(ms)」を置き、SQL側でそれより前なら呼び出しを省く。
// 予定が増えたとき（時報botの保存・予約投稿）は wake() で即時起動に戻す。
const { db } = require('../netlify/lib/store');

const STORE = 'mixall-config';
const key = (fn) => `cron-next:${fn}`;

async function sleepUntil(fn, at, runStartedAt = 0) {
  try {
    // 実行中に wake された場合は、その予定を優先して眠らない
    const current = await db().get(STORE, key(fn));
    if (current && Number(current.at) === 0 && Number(current.setAt || 0) > runStartedAt) return;
    await db().set(STORE, key(fn), { at: Math.floor(at), setAt: Date.now() });
  } catch (error) { console.error('[cron-gate] sleep failed:', error.message); }
}

async function wake(fn) {
  try { await db().set(STORE, key(fn), { at: 0, setAt: Date.now() }); }
  catch (error) { console.error('[cron-gate] wake failed:', error.message); }
}

module.exports = { sleepUntil, wake };
