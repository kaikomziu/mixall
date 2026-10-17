// Uch AI bot replies are queued by the authenticated post endpoint and processed here
// without requiring the posting user to remain connected or online.
const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { runAiBots } = require('./uch');

const WORKER_LOCK_KEY = '__worker-lock';
const MAX_JOBS_PER_RUN = 2;
const WORKER_LOCK_MS = 16 * 60 * 1000;
const JOB_LOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function newPostId() { return crypto.randomBytes(8).toString('hex'); }
function safeJsonResponse(statusCode, body) { return { statusCode, headers:{ 'Content-Type':'application/json; charset=utf-8' }, body:JSON.stringify(body) }; }

async function saveReplies(job, replies) {
  if (!replies.length) return 0;
  const thread = await getJSON(STORE_NAMES.UCH_THREADS, job.threadId);
  const originalPost = (thread?.posts || []).find((post) => post.id === job.postId && !post.deleted);
  if (!thread || !originalPost) return 0;
  let added = 0;
  for (const reply of replies) {
    const replyTo = reply.replyTo || job.postId;
    const exists = (thread.posts || []).some((post) => post.isAiBot === true && post.botId === reply.botId && post.replyTo === replyTo);
    if (exists) continue;
    thread.posts.push({
      id:newPostId(),
      author:reply.botName,
      botIcon:reply.botIcon,
      botId:reply.botId || null,
      isAiBot:true,
      text:reply.text,
      replyTo,
      sourceRefs:Array.isArray(reply.sourceRefs) ? reply.sourceRefs : [],
      createdAt:new Date().toISOString(),
      isBot:true
    });
    added += 1;
  }
  if (added) await setJSON(STORE_NAMES.UCH_THREADS, job.threadId, thread);
  return added;
}

async function processJob(jobId, job, now) {
  if (Number(job.lockUntil || 0) > now || Number(job.nextAttemptAt || 0) > now) return false;
  const attempts = Number(job.attempts || 0) + 1;
  const claimed = { ...job, status:'running', attempts, lockUntil:now + JOB_LOCK_MS, updatedAt:new Date(now).toISOString() };
  await setJSON(STORE_NAMES.UCH_AI_JOBS, jobId, claimed);
  try {
    const thread = await getJSON(STORE_NAMES.UCH_THREADS, job.threadId);
    const post = (thread?.posts || []).find((item) => item.id === job.postId);
    if (!thread || !post || post.deleted || post.isBot) {
      await deleteKey(STORE_NAMES.UCH_AI_JOBS, jobId);
      return true;
    }
    const result = await runAiBots(job.threadId, post.text || '', job.authorEmail || post.authorEmail || '', job.replyTo || post.replyTo || null, job.postId);
    await saveReplies(job, result.autoReplies || []);
    if (result.error) throw new Error(result.error);
    await deleteKey(STORE_NAMES.UCH_AI_JOBS, jobId);
  } catch (error) {
    console.error(`Uch AI reply job ${jobId} failed (attempt ${attempts}):`, error);
    if (attempts >= MAX_ATTEMPTS) {
      await deleteKey(STORE_NAMES.UCH_AI_JOBS, jobId);
    } else {
      const delay = Math.min(10 * 60 * 1000, 60 * 1000 * (2 ** (attempts - 1)));
      await setJSON(STORE_NAMES.UCH_AI_JOBS, jobId, { ...claimed, status:'pending', lockUntil:0, nextAttemptAt:Date.now() + delay, updatedAt:new Date().toISOString(), lastError:String(error.message || error).slice(0,300) });
    }
  }
  return true;
}

exports.handler = async (event) => {

  const now = Date.now();
  const runId = crypto.randomUUID();
  const existingLock = await getJSON(STORE_NAMES.UCH_AI_JOBS, WORKER_LOCK_KEY);
  if (Number(existingLock?.lockUntil || 0) > now) return safeJsonResponse(200, { skipped:true, reason:'worker already running' });
  await setJSON(STORE_NAMES.UCH_AI_JOBS, WORKER_LOCK_KEY, { owner:runId, lockUntil:now + WORKER_LOCK_MS, updatedAt:new Date(now).toISOString() });
  let processed = 0;
  try {
    const keys = await listKeys(STORE_NAMES.UCH_AI_JOBS);
    for (const jobId of keys) {
      if (jobId === WORKER_LOCK_KEY || processed >= MAX_JOBS_PER_RUN) continue;
      const job = await getJSON(STORE_NAMES.UCH_AI_JOBS, jobId);
      if (!job || job.status === 'failed' || job.status === 'complete') continue;
      if (await processJob(jobId, job, Date.now())) processed += 1;
    }
    return safeJsonResponse(200, { processed });
  } finally {
    const lock = await getJSON(STORE_NAMES.UCH_AI_JOBS, WORKER_LOCK_KEY);
    if (lock?.owner === runId) await setJSON(STORE_NAMES.UCH_AI_JOBS, WORKER_LOCK_KEY, { owner:null, lockUntil:0, updatedAt:new Date().toISOString() });
  }
};
