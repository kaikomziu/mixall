const crypto = require('crypto');
const { STORE_NAMES, setJSON, deleteKey } = require('./store');

// Supabase移行後はEdge Function「mixall-api」の ai-bot-background を叩く。
function backgroundUrl(event) {
  const base = String(process.env.MIXALL_API_BASE || '').trim().replace(/\/$/, '');
  if (base) return `${base}/ai-bot-background`;
  const headers = Object.fromEntries(Object.entries(event?.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  if (!headers.host) throw new Error('Background FunctionのURLを取得できません');
  const protocol = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${protocol}://${headers.host}/functions/v1/mixall-api/ai-bot-background`;
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function enqueueBackgroundTask(event, type, payload) {
  const jobId = crypto.randomBytes(24).toString('hex');
  const secret = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const job = {
    id: jobId,
    type: String(type),
    payload: payload && typeof payload === 'object' ? payload : {},
    secretHash: digest(secret),
    status: 'queued',
    attempts: 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + 24 * 60 * 60 * 1000
  };
  await setJSON(STORE_NAMES.AI_JOBS, jobId, job);
  try {
    const response = await fetch(backgroundUrl(event), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, secret }),
      signal: AbortSignal.timeout(5000)
    });
    if (response.status !== 202) throw new Error(`Background FunctionがHTTP ${response.status}を返しました`);
    return { jobId };
  } catch (error) {
    try { await deleteKey(STORE_NAMES.AI_JOBS, jobId); } catch (cleanupError) { console.error('failed to remove undispatched AI job:', cleanupError); }
    throw new Error(`Background Functionを起動できません: ${error.message}`);
  }
}

module.exports = { enqueueBackgroundTask };
