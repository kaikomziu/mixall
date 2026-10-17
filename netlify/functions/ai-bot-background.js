const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey } = require('../lib/store');
const uch = require('./uch');
const pocket = require('./pocket');
const ghost = require('./ghost');
const webhook = require('./webhook');
const backup = require('./backup');
const { enqueueBackgroundTask } = require('../lib/background-jobs');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}
function timingSafeMatch(expectedHash, secret) {
  if (!/^[a-f0-9]{64}$/.test(String(expectedHash || '')) || !/^[a-f0-9]{64}$/.test(String(secret || ''))) return false;
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(digest(secret), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const processors = {
  'uch-ai': uch.processBackgroundTask,
  'pocket-bots': pocket.processBackgroundTask,
  'ghost-post-bots': ghost.processBackgroundTask,
  'mail-official-bots': webhook.processBackgroundTask,
  'backup-export': backup.processBackgroundTask,
  'backup-import': backup.processBackgroundTask,
  'backup-cleanup': backup.processBackgroundTask
};

exports.handler = async (event) => {

  let request;
  try { request = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なジョブ要求です' }); }
  const jobId = String(request.jobId || '');
  if (!/^[a-f0-9]{48}$/.test(jobId)) return json(400, { error: 'ジョブIDが不正です' });

  const job = await getJSON(STORE_NAMES.AI_JOBS, jobId);
  if (!job || job.status === 'done' || job.status === 'failed') return json(200, { ok: true, ignored: true });
  if (!timingSafeMatch(job.secretHash, request.secret)) return json(403, { error: 'ジョブ認証に失敗しました' });
  if (Number(job.expiresAt) < Date.now()) {
    await deleteKey(STORE_NAMES.AI_JOBS, jobId);
    return json(200, { ok: true, expired: true });
  }
  if (job.status === 'running' && Date.now() - Date.parse(job.startedAt || '') < 2 * 60 * 1000) return json(200, { ok: true, alreadyRunning: true });

  const processor = processors[job.type];
  if (typeof processor !== 'function') return json(400, { error: '未対応のBackground Jobです' });
  job.status = 'running';
  job.attempts = Number(job.attempts || 0) + 1;
  job.startedAt = new Date().toISOString();
  await setJSON(STORE_NAMES.AI_JOBS, jobId, job);

  try {
    const result = await processor(job.payload || {}, jobId, event);
    if (result?.continue === true) {
      // 1回のBackground実行を15分未満に区切り、保存済みチェックポイントから次の関数へ引き継ぐ。
      await enqueueBackgroundTask(event, job.type, job.payload || {});
    }
    await deleteKey(STORE_NAMES.AI_JOBS, jobId);
    return json(200, { ok: true });
  } catch (error) {
    job.status = job.attempts >= 3 ? 'failed' : 'queued';
    job.lastError = String(error?.message || error || 'Background Job failed').slice(0, 300);
    job.updatedAt = new Date().toISOString();
    await setJSON(STORE_NAMES.AI_JOBS, jobId, job);
    if (job.type === 'backup-export' || job.type === 'backup-import' || job.type === 'backup-cleanup') {
      try { await backup.markBackgroundFailure(job.payload || {}, error, job.status === 'failed'); }
      catch (markError) { console.error('failed to persist backup job error:', markError); }
    }
    console.error('Background AI/bot job failed:', job.type, jobId, job.lastError);
    throw error;
  }
};
