// Mcコインの「みつばち」API(/api/jobs)。
// 発注: 報酬のMcコインを預けて仕事を出す → 受注者が引き受ける → 完了を申請 → 発注者が承認すると、預かった報酬が受注者へ渡る。
// 状態: open(募集中) → accepted(受注中) → submitted(完了申請中) → completed(完了) / cancelled(取り下げ)
import { getStore, setEnv } from '../_lib/blobs.js';

const S = { ACCOUNTS: 'netrify-accounts', SESSIONS: 'netrify-sessions', COINS: 'netrify-coins', LOGOUTS: 'netrify-session-logout-requests', JOBS: 'netrify-jobs' };
const store = (name) => getStore({ name });
async function getJSON(name, key) { const v = await store(name).get(key, { type: 'json' }); return v === undefined ? null : v; }
async function setJSON(name, key, value) { await store(name).setJSON(key, value); }
async function listKeys(name, prefix) { const r = await store(name).list(prefix ? { prefix } : undefined); return r.blobs.map((b) => b.key); }

const MAX_TITLE = 60, MAX_DESC = 2000, MAX_NOTE = 1000, MAX_REWARD = 1000000;
const MAX_OPEN_PER_CLIENT = 20, MAX_ACTIVE_PER_WORKER = 10, LIST_LIMIT = 300;
const busy = new Set(); // 同じ仕事への同時操作を止める(同一インスタンス内)

function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
const str = (v, max) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

async function getUser(token) {
  if (!token) return null;
  const session = await getJSON(S.SESSIONS, String(token));
  if (!session || session.expiresAt < Date.now()) return null;
  if (session.sessionId) {
    const lo = await getJSON(S.LOGOUTS, `logout:${session.sessionId}`);
    if (lo && lo.status === 'pending') return null;
  }
  const email = String(session.email || '').toLowerCase();
  const account = await getJSON(S.ACCOUNTS, session.email) || await getJSON(S.ACCOUNTS, email);
  if (!account) return null;
  return {
    email: session.email,
    name: account.displayName || String(session.email).split('@')[0],
    isOperator: account.isAdmin === true || account.isDeputyAdmin === true,
    unlimited: account.isAdmin === true || account.isOfficial === true,
  };
}
async function nameOf(email) {
  try { const a = await getJSON(S.ACCOUNTS, email); return (a && a.displayName) || String(email).split('@')[0]; } catch (_) { return String(email).split('@')[0]; }
}
const getBalance = async (email) => Number(await getJSON(S.COINS, email)) || 0;
const setBalance = (email, v) => setJSON(S.COINS, email, v);

function pushLog(job, type, by, note) {
  job.log = Array.isArray(job.log) ? job.log : [];
  job.log.push({ t: new Date().toISOString(), type, by, note: note ? String(note).slice(0, MAX_NOTE) : '' });
  if (job.log.length > 60) job.log = job.log.slice(-60);
}

// 一覧用の見せ方。申請メッセージ・履歴は当事者(発注者/受注者/運営)にだけ見せる。
function view(job, me) {
  const mine = me && (job.clientEmail === me.email);
  const worker = me && job.workerEmail && job.workerEmail === me.email;
  const party = mine || worker || (me && me.isOperator);
  return {
    id: job.id, title: job.title, description: job.description, reward: job.reward, status: job.status,
    clientName: job.clientName, workerName: job.workerName || null,
    createdAt: job.createdAt, acceptedAt: job.acceptedAt || null, submittedAt: job.submittedAt || null, completedAt: job.completedAt || null,
    isClient: !!mine, isWorker: !!worker, escrowFree: !!job.escrowFree,
    submitNote: party ? job.submitNote || '' : undefined,
    rejectNote: party ? job.rejectNote || '' : undefined,
    log: party ? (job.log || []).map((l) => ({ t: l.t, type: l.type, note: l.note })) : undefined,
  };
}

async function loadJobs() {
  const keys = (await listKeys(S.JOBS, 'job:')).sort().reverse().slice(0, LIST_LIMIT);
  const jobs = await Promise.all(keys.map((k) => getJSON(S.JOBS, k).catch(() => null)));
  return jobs.filter(Boolean);
}

async function handle(context) {
  setEnv(context.env);
  const req = context.request;
  const url = new URL(req.url);
  let payload = {};
  if (req.method === 'POST') { try { payload = await req.json(); } catch (_) { return json(400, { error: 'リクエストが不正です' }); } }
  else if (req.method !== 'GET') return json(405, { error: 'GET/POSTのみ対応しています' });
  const q = req.method === 'GET' ? Object.fromEntries(url.searchParams) : payload;
  const me = await getUser(q.token);
  if (!me) return json(401, { error: 'ログインが必要です' });
  const action = String(q.action || 'list');

  if (req.method === 'GET') {
    if (action === 'list') {
      const viewKey = String(q.view || 'open');
      const terms = str(q.q, 100).toLowerCase().split(/\s+/).filter(Boolean);
      const minReward = Math.max(0, Math.floor(Number(q.minReward) || 0));
      let jobs = await loadJobs();
      if (viewKey === 'open') jobs = jobs.filter((j) => j.status === 'open');
      else if (viewKey === 'posted') jobs = jobs.filter((j) => j.clientEmail === me.email);
      else if (viewKey === 'taken') jobs = jobs.filter((j) => j.workerEmail === me.email);
      else if (viewKey === 'done') jobs = jobs.filter((j) => j.status === 'completed');
      else if (viewKey === 'all' && me.isOperator) { /* 運営は全件 */ }
      else jobs = jobs.filter((j) => j.status === 'open');
      if (minReward) jobs = jobs.filter((j) => j.reward >= minReward);
      if (terms.length) jobs = jobs.filter((j) => { const hay = `${j.title}\n${j.description}\n${j.clientName}`.toLowerCase(); return terms.every((t) => hay.includes(t)); });
      if (String(q.sort) === 'reward') jobs.sort((a, b) => b.reward - a.reward || (a.id < b.id ? 1 : -1));
      else jobs.sort((a, b) => (a.id < b.id ? 1 : -1));
      return json(200, { jobs: jobs.slice(0, 100).map((j) => view(j, me)), balance: await getBalance(me.email), unlimited: me.unlimited });
    }
    if (action === 'get') {
      const job = await getJSON(S.JOBS, `job:${str(q.id, 80).replace(/[^A-Za-z0-9_-]/g, '')}`);
      if (!job) return json(404, { error: '仕事が見つかりません' });
      return json(200, { job: view(job, me) });
    }
    return json(400, { error: '不明な操作です' });
  }

  // ===== POST =====
  if (action === 'create') {
    const title = str(payload.title, MAX_TITLE), description = str(payload.description, MAX_DESC);
    const reward = Math.floor(Number(payload.reward));
    if (!title) return json(400, { error: '仕事のタイトルを入力してください' });
    if (!description) return json(400, { error: '仕事の内容を入力してください' });
    if (!Number.isFinite(reward) || reward < 1 || reward > MAX_REWARD) return json(400, { error: `報酬は1〜${MAX_REWARD.toLocaleString('ja-JP')}Mcコインで指定してください` });
    const mineOpen = (await loadJobs()).filter((j) => j.clientEmail === me.email && ['open', 'accepted', 'submitted'].includes(j.status)).length;
    if (mineOpen >= MAX_OPEN_PER_CLIENT) return json(400, { error: `進行中の発注は${MAX_OPEN_PER_CLIENT}件までです` });
    if (!me.unlimited) {
      const bal = await getBalance(me.email);
      if (bal < reward) return json(400, { error: `Mcコインが足りません(所持 ${bal.toLocaleString('ja-JP')} / 必要 ${reward.toLocaleString('ja-JP')})` });
      await setBalance(me.email, bal - reward); // 報酬を預かる
    }
    const id = `${Date.now().toString(36).padStart(9, '0')}${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const job = { id, title, description, reward, status: 'open', clientEmail: me.email, clientName: me.name, escrowFree: me.unlimited, createdAt: now, log: [] };
    pushLog(job, 'created', me.name, `報酬 ${reward} Mcコインを添付して発注`);
    try { await setJSON(S.JOBS, `job:${id}`, job); }
    catch (e) { if (!me.unlimited) await setBalance(me.email, (await getBalance(me.email)) + reward); throw e; }
    return json(200, { ok: true, job: view(job, me), balance: await getBalance(me.email) });
  }

  const id = str(payload.id, 80).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) return json(400, { error: '仕事IDがありません' });
  if (busy.has(id)) return json(429, { error: '処理中です。少し待ってからもう一度お試しください' });
  busy.add(id);
  try {
    const key = `job:${id}`;
    const job = await getJSON(S.JOBS, key);
    if (!job) return json(404, { error: '仕事が見つかりません' });
    const isClient = job.clientEmail === me.email, isWorker = job.workerEmail === me.email;

    if (action === 'accept') {
      if (isClient) return json(400, { error: '自分が発注した仕事は受けられません' });
      if (job.status !== 'open') return json(400, { error: 'この仕事はすでに受注されたか、募集を終えています' });
      const active = (await loadJobs()).filter((j) => j.workerEmail === me.email && ['accepted', 'submitted'].includes(j.status)).length;
      if (active >= MAX_ACTIVE_PER_WORKER) return json(400, { error: `同時に受けられる仕事は${MAX_ACTIVE_PER_WORKER}件までです` });
      job.status = 'accepted'; job.workerEmail = me.email; job.workerName = me.name; job.acceptedAt = new Date().toISOString(); job.rejectNote = '';
      pushLog(job, 'accepted', me.name, '仕事を引き受けました');
    } else if (action === 'giveUp') {
      if (!isWorker || !['accepted', 'submitted'].includes(job.status)) return json(403, { error: '操作できません' });
      pushLog(job, 'gaveUp', me.name, str(payload.note, MAX_NOTE) || '受注を辞退しました');
      job.status = 'open'; job.workerEmail = null; job.workerName = null; job.acceptedAt = null; job.submittedAt = null; job.submitNote = '';
    } else if (action === 'submit') {
      if (!isWorker || job.status !== 'accepted') return json(403, { error: '完了を申請できる状態ではありません' });
      job.status = 'submitted'; job.submittedAt = new Date().toISOString(); job.submitNote = str(payload.note, MAX_NOTE); job.rejectNote = '';
      pushLog(job, 'submitted', me.name, job.submitNote || '仕事が終わったので確認をお願いします');
    } else if (action === 'reject') {
      if (!isClient || job.status !== 'submitted') return json(403, { error: '操作できません' });
      job.status = 'accepted'; job.rejectNote = str(payload.note, MAX_NOTE); job.submittedAt = null;
      pushLog(job, 'rejected', me.name, job.rejectNote || 'やり直しをお願いします');
    } else if (action === 'approve') {
      if (!isClient || job.status !== 'submitted' || !job.workerEmail) return json(403, { error: '承認できる状態ではありません' });
      if (await getJSON(S.JOBS, `payout:${id}`)) return json(400, { error: 'この仕事の報酬はすでに支払い済みです' });
      const before = { ...job };
      job.status = 'completed'; job.completedAt = new Date().toISOString();
      pushLog(job, 'completed', me.name, '仕事を確認しました。報酬を支払いました');
      await setJSON(S.JOBS, key, job); // 先に完了にして二重払いを防ぐ
      try {
        await setJSON(S.JOBS, `payout:${id}`, { jobId: id, to: job.workerEmail, amount: job.reward, at: job.completedAt });
        await setBalance(job.workerEmail, (await getBalance(job.workerEmail)) + job.reward);
      } catch (e) {
        await setJSON(S.JOBS, key, before).catch(() => {});
        await store(S.JOBS).delete(`payout:${id}`).catch(() => {});
        throw e;
      }
      return json(200, { ok: true, job: view(job, me), balance: await getBalance(me.email) });
    } else if (action === 'cancel') {
      const operatorCancel = me.isOperator && !isClient;
      if (!(isClient || operatorCancel)) return json(403, { error: '操作できません' });
      if (isClient && job.status !== 'open') return json(400, { error: '受注されたあとは取り下げできません。受注者に辞退してもらってください' });
      if (!['open', 'accepted', 'submitted'].includes(job.status)) return json(400, { error: 'この仕事は取り下げできません' });
      const before = { ...job };
      job.status = 'cancelled'; job.cancelledAt = new Date().toISOString();
      pushLog(job, 'cancelled', operatorCancel ? `運営(${me.name})` : me.name, str(payload.note, MAX_NOTE) || '取り下げ');
      await setJSON(S.JOBS, key, job);
      if (!job.escrowFree) {
        try { await setBalance(job.clientEmail, (await getBalance(job.clientEmail)) + job.reward); }
        catch (e) { await setJSON(S.JOBS, key, before).catch(() => {}); throw e; }
      }
    } else return json(400, { error: '不明な操作です' });

    await setJSON(S.JOBS, key, job);
    return json(200, { ok: true, job: view(job, me), balance: await getBalance(me.email) });
  } finally { busy.delete(id); }
}

export async function onRequest(context) {
  try { return await handle(context); }
  catch (e) { console.error('jobs error:', e && e.stack || e); return json(500, { error: '内部エラー: ' + String((e && e.message) || e).slice(0, 200) }); }
}
