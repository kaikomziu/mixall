const { STORE_NAMES, getJSON, setJSON, listKeys } = require('../lib/store');
const { monthKey, reviewTarget } = require('../lib/program-review');

const STATE_KEY = 'program-review:state';
const MAX_PER_RUN = 2;

async function targetsForMonth(month) {
  const targets = [];
  for (const [targetType, storeName] of [['custom',STORE_NAMES.CUSTOM_PROJECTS],['site',STORE_NAMES.LENDING_SITES]]) {
    for (const key of await listKeys(storeName)) {
      const item = await getJSON(storeName, key);
      const id = targetType === 'site' ? item?.slug || key : item?.id || key;
      if (!item || id !== key) continue;
      const review = item.programReview;
      if (review?.ai?.month !== month || review?.ai?.fingerprint !== item.reviewFingerprint) targets.push({ targetType, targetId:id });
    }
  }
  return targets;
}

async function beginAudit(month, targets) {
  return { month, status:'running', startedAt:new Date().toISOString(), updatedAt:new Date().toISOString(), cursor:0, targets, retryQueue:[], reviewedCount:0, failedCount:0, total:targets.length, lockUntil:0 };
}

exports.handler = async (event) => {

  const now = new Date();
  const month = monthKey(now);
  let state = await getJSON(STORE_NAMES.GHOST_MODERATION, STATE_KEY);
  if (!state || state.month !== month) state = await beginAudit(month, await targetsForMonth(month));
  else if (state.status === 'complete') {
    const pending = await targetsForMonth(month);
    if (!pending.length) {
      // 新しい審査対象が無いので、1時間は定期実行を止める
      await require('../../server/cron-gate').sleepUntil('scheduled-program-review-background', Date.now() + 60 * 60 * 1000, now.getTime());
      return { statusCode:200, body:JSON.stringify({ month, status:'complete', reviewedCount:state.reviewedCount || 0 }) };
    }
    state = await beginAudit(month, pending);
  }
  if (Number(state.lockUntil || 0) > Date.now()) return { statusCode:200, body:'program review worker already running' };
  state.lockUntil = Date.now() + 120000;
  state.updatedAt = now.toISOString();
  await setJSON(STORE_NAMES.GHOST_MODERATION, STATE_KEY, state);

  const tasks = [];
  while (tasks.length < MAX_PER_RUN) {
    if (state.retryQueue?.length) tasks.push({ ...state.retryQueue.shift(), retry:true });
    else if (state.cursor < state.targets.length) tasks.push({ ...state.targets[state.cursor++], retry:false });
    else break;
  }
  const outcomes = await Promise.all(tasks.map(async (task) => {
    try { return { task, result:await reviewTarget(task.targetType, task.targetId, state.month) }; }
    catch (error) { return { task, error:String(error.message || error).slice(0,400) }; }
  }));
  for (const outcome of outcomes) {
    if (outcome.error) {
      state.failedCount = Number(state.failedCount || 0) + 1;
      state.retryQueue.push({ targetType:outcome.task.targetType, targetId:outcome.task.targetId });
    } else if (outcome.result?.reviewed) state.reviewedCount = Number(state.reviewedCount || 0) + 1;
  }
  state.retryQueue = [...new Map((state.retryQueue || []).map((item) => [`${item.targetType}:${item.targetId}`, item])).values()].slice(0,10000);
  state.lastBatchAt = new Date().toISOString();
  state.lastBatch = outcomes.map((outcome) => outcome.error ? { targetType:outcome.task.targetType, targetId:outcome.task.targetId, error:outcome.error } : outcome.result);
  state.lockUntil = 0;
  if (state.cursor >= state.targets.length && state.retryQueue.length === 0) { state.status='complete'; state.completedAt=new Date().toISOString(); }
  state.updatedAt = new Date().toISOString();
  await setJSON(STORE_NAMES.GHOST_MODERATION, STATE_KEY, state);
  return { statusCode:200, body:JSON.stringify({ month:state.month, status:state.status, cursor:state.cursor, total:state.total, retryCount:state.retryQueue.length, reviewedCount:state.reviewedCount }) };
};
