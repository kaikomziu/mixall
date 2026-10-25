// 学校モード API: 学校メールの判定・確認 / 学校コード / 画面共有の信号受け渡し / Kahoot風クイズ課題
import crypto from 'node:crypto';
import { getStore, setEnv } from '../_lib/blobs.js';

const AGENTMAIL_API_KEY = ((typeof process !== "undefined" && process.env && process.env.AGENTMAIL_API_KEY) || "");
const AGENTMAIL_INBOX = ((typeof process !== "undefined" && process.env && process.env.AGENTMAIL_INBOX) || "");

const ST = {
  ACCOUNTS: 'netrify-accounts', SESSIONS: 'netrify-sessions',
  PROFILES: 'school-profiles', EMAILS: 'school-emails', OTPS: 'school-otps', PROOFS: 'school-proofs',
  CLASSES: 'school-classes', SIG_S: 'school-signal-s', SIG_T: 'school-signal-t', PRES: 'school-presence',
  TCODES: 'school-teacher-codes', QUIZZES: 'school-quizzes', ATTEMPTS: 'school-attempts', DOMAINS: 'school-domains', REQUESTS: 'school-requests'
};
const ADMIN_EMAIL = 'bix.admin@bix.3erver';
const MAX_STUDENTS = 300;
const now = () => Date.now();
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (status, message, extra = {}) => json(status, { error: message, ...extra });
const gj = async (store, key) => { try { const v = await getStore(store).get(key, { type: 'json' }); return v || null; } catch (_) { return null; } };
const sj = (store, key, value) => getStore(store).setJSON(key, value);
const del = (store, key) => getStore(store).delete(key).catch(() => {});
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rid = (n = 12) => crypto.randomBytes(n).toString('hex');
const normTCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const newTCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 10; i++) c += a[crypto.randomInt(0, a.length)]; return c; };
const fmtTCode = (c) => c.slice(0, 5) + '-' + c.slice(5);
async function takeTCode(raw, email) {
  const c = normTCode(raw); if (c.length !== 10) return null;
  const rec = await gj(ST.TCODES, c); if (!rec || rec.usedBy || rec.revoked) return null;
  rec.usedBy = email; rec.usedAt = new Date().toISOString(); await sj(ST.TCODES, c, rec); return rec;
}
const safe = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9@._+-]/g, '');

// ---------- 学校メールの判定 ----------
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|gmx|mail|yandex|qq|163|126|naver|daum|docomo|ezweb|softbank|au|nifty|biglobe)\./i;
const STRONG_SLD = new Set(['edu', 'ac', 'sch', 'school', 'k12', 'ed']);
const KR_SCHOOL = new Set(['es', 'ms', 'hs', 'sc']);
const KEYWORDS = ['school', 'schule', 'scuola', 'escuela', 'colegio', 'ecole', 'college', 'lycee', 'gymnasium', 'academy', 'univ', 'university', 'institute', 'kindergarten', 'elementary', 'highschool', 'juniorhigh', 'gakuen', 'gakuin', 'gakko', 'daigaku', 'edu'];
const STUDENT_LABELS = new Set(['student', 'students', 'stu', 'pupil', 'pupils', 'alumni', 'std', 'gakusei', 'learner', 'learners']);
const TEACHER_LABELS = new Set(['staff', 'teacher', 'teachers', 'faculty', 'employee', 'employees', 'educator', 'educators', 'kyoin', 'sensei', 'hr']);
const ROLE_LABELS = new Set([...STUDENT_LABELS, ...TEACHER_LABELS, 'mail', 'g', 'gmail', 'ml', 's', 'st', 'www']);

function parseEmail(input) {
  const v = String(input || '').trim().toLowerCase();
  const m = v.match(/^([a-z0-9][a-z0-9._%+'-]{0,63})@([a-z0-9][a-z0-9.-]{0,120}\.[a-z]{2,})$/);
  if (!m) return null;
  return { email: v, local: m[1], domain: m[2], labels: m[2].split('.') };
}
function domainLevel(p, override) {
  if (override === 'denied') return 'denied';
  if (override === 'approved') return 'strong';
  if (FREE_MAIL.test(p.domain)) return 'unknown';
  const L = p.labels, tld = L[L.length - 1], sld = L[L.length - 2];
  if (tld === 'edu') return 'strong';
  if (tld.length === 2 && STRONG_SLD.has(sld)) return 'strong';
  if (tld === 'kr' && KR_SCHOOL.has(sld)) return 'strong';
  if (L.includes('k12') || L.includes('edu')) return 'strong';
  if (L.some((l) => KEYWORDS.some((k) => l.includes(k)))) return 'probable';
  return 'unknown';
}
function orgKey(p) {
  const L = p.labels.slice();
  while (L.length > 2 && ROLE_LABELS.has(L[0])) L.shift();
  return L.join('.');
}
function classifyRole(p, level) {
  const reasons = []; let s = 0, t = 0;
  const subs = p.labels.slice(0, -1);
  if (subs.some((l) => STUDENT_LABELS.has(l))) { s += 2; reasons.push('メールのドメインに生徒用を示す語が含まれています'); }
  if (subs.some((l) => TEACHER_LABELS.has(l))) { t += 2; reasons.push('メールのドメインに教職員用を示す語が含まれています'); }
  const l = p.local;
  if (/\d{4,}/.test(l) || /^\d{2}[a-z]\d{3,}/.test(l) || /^[a-z]{1,2}\d{5,}/.test(l)) { s += 2; reasons.push('学籍番号のような数字が含まれています'); }
  else if (/(?:^|[^0-9])(?:[12][0-9]|3[0-9])$/.test(l)) { s += 1; reasons.push('卒業年のような数字で終わっています'); }
  if (/(student|^stu[._-]|pupil|gakusei)/.test(l)) { s += 2; reasons.push('アドレスに生徒を示す語が含まれています'); }
  if (/(teacher|sensei|prof|faculty|staff|principal|headmaster|kyoin|kyoushi|^dr[._-]|^mr[._-]|^mrs[._-]|^ms[._-])/.test(l)) { t += 2; reasons.push('アドレスに教職員を示す語が含まれています'); }
  if (t >= 2 && s === 0 && level === 'strong') return { role: 'teacher', confidence: 'high', reasons };
  if (s >= 2 && t === 0) return { role: 'student', confidence: 'high', reasons };
  if (!reasons.length) reasons.push('アドレスから生徒・教員を判別できる特徴がありませんでした');
  return { role: 'student', confidence: 'low', reasons };
}
async function classify(emailInput) {
  const p = parseEmail(emailInput);
  if (!p) return { ok: false, error: '学校のメールアドレスの形式が正しくありません' };
  const dom = await gj(ST.DOMAINS, p.domain);
  const level = domainLevel(p, dom && dom.status);
  const r = classifyRole(p, level);
  const allowed = level === 'strong' || level === 'probable';
  return { ok: true, email: p.email, domain: p.domain, orgKey: orgKey(p), level, allowed, ...r };
}

// ---------- メール送信(AgentMail) ----------
async function sendMail(to, subject, text) {
  const base = 'https://api.agentmail.to/v0/inboxes/' + encodeURIComponent(AGENTMAIL_INBOX);
  const html = '<div>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
  const res = await fetch(base + '/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AGENTMAIL_API_KEY }, body: JSON.stringify({ to: [to], subject, text, html }) });
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error('確認メールを送信できませんでした（' + res.status + ' ' + b.slice(0, 120) + '）'); }
}

// ---------- セッション ----------
async function auth(token) {
  token = String(token || '');
  if (token.length < 8 || token.length > 200) return null;
  const s = await gj(ST.SESSIONS, token);
  if (!s || (s.expiresAt && s.expiresAt < now())) return null;
  const account = await gj(ST.ACCOUNTS, s.email);
  if (!account) return null;
  const profile = await gj(ST.PROFILES, s.email);
  return { email: s.email, account, profile, isAdmin: account.isAdmin === true || s.email === ADMIN_EMAIL };
}
const nameOf = async (email) => { const a = await gj(ST.ACCOUNTS, email); return (a && a.displayName) || String(email).split('@')[0]; };

// ---------- 学校コード ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function newCode() {
  for (let i = 0; i < 20; i++) {
    let c = ''; const b = crypto.randomBytes(6);
    for (let j = 0; j < 6; j++) c += CODE_CHARS[b[j] % CODE_CHARS.length];
    if (!(await gj(ST.CLASSES, c))) return c;
  }
  throw new Error('学校コードを作成できませんでした');
}
async function ensureClass(profile, p) {
  if (profile.classCode) { const c = await gj(ST.CLASSES, profile.classCode); if (c) return c; }
  const code = await newCode();
  const cls = { code, teacherEmail: profile.email, orgKey: profile.orgKey, name: (profile.domain || '') + ' の学校', students: [], createdAt: new Date().toISOString() };
  await sj(ST.CLASSES, code, cls);
  profile.classCode = code; await sj(ST.PROFILES, profile.email, profile);
  return cls;
}
const publicProfile = (p) => p && ({ role: p.role, schoolEmail: p.schoolEmail, domain: p.domain, classCode: p.classCode || null, confidence: p.confidence, teacherPending: !!p.teacherPending });

// ---------- クイズ ----------
function cleanQuiz(q, teacherEmail, existing) {
  const title = String(q && q.title || '').trim().slice(0, 80);
  if (!title) throw new Error('クイズのタイトルを入力してください');
  const src = Array.isArray(q.questions) ? q.questions : [];
  if (!src.length) throw new Error('問題を1つ以上追加してください');
  if (src.length > 50) throw new Error('問題は50個までです');
  const questions = src.map((x, i) => {
    const text = String(x.text || '').trim().slice(0, 200);
    const choices = (Array.isArray(x.choices) ? x.choices : []).map((c) => String(c || '').trim().slice(0, 80)).slice(0, 4);
    if (!text) throw new Error((i + 1) + '問目: 問題文を入力してください');
    if (choices.filter(Boolean).length < 2) throw new Error((i + 1) + '問目: 選択肢を2つ以上入力してください');
    const correct = Number(x.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= choices.length || !choices[correct]) throw new Error((i + 1) + '問目: 正解の選択肢を選んでください');
    const timeSec = Math.min(120, Math.max(5, Number(x.timeSec) || 20));
    return { id: x.id || rid(4), text, choices, correct, timeSec, points: 1000 };
  });
  return { id: (existing && existing.id) || rid(6), teacherEmail, classCode: (existing && existing.classCode) || null, title, questions, status: (existing && existing.status) || 'draft', createdAt: (existing && existing.createdAt) || new Date().toISOString(), publishedAt: (existing && existing.publishedAt) || null, dueAt: (existing && existing.dueAt) || null };
}
const stripQuestion = (quiz, idx) => { const q = quiz.questions[idx]; return { index: idx, total: quiz.questions.length, text: q.text, choices: q.choices, timeSec: q.timeSec }; };
function settleTimeout(att, quiz) {
  const q = quiz.questions[att.idx];
  if (!att.awaiting && q && att.qStartedAt && now() - att.qStartedAt > (q.timeSec + 3) * 1000) {
    att.answers.push({ qid: q.id, choice: -1, correct: false, points: 0, ms: q.timeSec * 1000 });
    att.awaiting = true;
  }
}
async function leaderboard(quiz) {
  const keys = (await getStore(ST.ATTEMPTS).list({ prefix: quiz.id + '~' })).blobs.map((b) => b.key);
  const rows = [];
  for (const k of keys) {
    const a = await gj(ST.ATTEMPTS, k); if (!a) continue;
    rows.push({ email: a.student, name: await nameOf(a.student), total: a.total || 0, finished: !!a.finishedAt, correct: (a.answers || []).filter((x) => x.correct).length, answered: (a.answers || []).length });
  }
  rows.sort((x, y) => y.total - x.total);
  return rows;
}

// ---------- ハンドラ ----------
export async function onRequest({ request, env }) {
  setEnv(env);
  if (request.method !== 'POST') return json(200, { ok: true, service: 'school' });
  let p; try { p = await request.json(); } catch (_) { return err(400, '不正なリクエストです'); }
  const action = String(p.action || '');
  try {
    // ----- 認証不要 -----
    if (action === 'check') {
      const r = await classify(p.schoolEmail);
      if (!r.ok) return err(400, r.error);
      return json(200, { ...r, role: 'student', message: r.allowed ? '' : (r.level === 'denied' ? 'このドメインは利用できません。' : '学校のドメインとして確認できませんでした。学校から配布されたメールアドレスを入力してください。') });
    }
    if (action === 'start') {
      const r = await classify(p.schoolEmail);
      if (!r.ok) return err(400, r.error);
      if (!r.allowed) return err(400, r.level === 'denied' ? 'このドメインは利用できません。' : '学校のドメインとして確認できませんでした。学校から配布されたメールアドレスを入力してください。', r);
      const used = await gj(ST.EMAILS, r.email);
      const prev = await gj(ST.OTPS, r.email);
      if (prev && prev.sentAt && now() - prev.sentAt < 60000) return err(429, '確認コードは1分に1回まで送れます。しばらく待ってください。');
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), salt = rid(8);
      await sj(ST.OTPS, r.email, { hash: sha(code + salt + r.email), salt, expires: now() + 15 * 60000, tries: 0, sentAt: now(), role: 'student', confidence: r.confidence, domain: r.domain, orgKey: r.orgKey, level: r.level });
      await sendMail(r.email, '【MixAll 学校モード】確認コード', '学校モードの登録を受け付けました。\n\n確認コード: ' + code + '\n\nこのコードは15分間有効です。心当たりがない場合は、このメールを無視してください。');
      return json(200, { ok: true, role: 'student', confidence: r.confidence, reasons: r.reasons, domain: r.domain, alreadyUsed: !!used });
    }
    if (action === 'verify') {
      const email = safe(p.schoolEmail), o = await gj(ST.OTPS, email);
      if (!o || o.used || o.expires < now()) return err(400, '確認コードの有効期限が切れています。もう一度送信してください。');
      if (o.tries >= 5) return err(429, '入力の失敗が多すぎます。確認コードをもう一度送信してください。');
      if (sha(String(p.code || '').trim() + o.salt + email) !== o.hash) { o.tries++; await sj(ST.OTPS, email, o); return err(400, '確認コードが違います'); }
      await sj(ST.OTPS, email, { ...o, used: true });
      const proof = rid(16);
      await sj(ST.PROOFS, proof, { schoolEmail: email, role: o.role, confidence: o.confidence, domain: o.domain, orgKey: o.orgKey, level: o.level, expires: now() + 30 * 60000 });
      return json(200, { ok: true, proof, role: o.role, confidence: o.confidence });
    }

    // ----- 要ログイン -----
    const me = await auth(p.token);
    if (!me) return err(401, 'ログインが必要です');
    const isTeacher = me.profile && me.profile.role === 'teacher';
    const isStudent = me.profile && me.profile.role === 'student';
    const needTeacher = () => { if (!isTeacher) throw Object.assign(new Error('教員のみ使えます'), { status: 403 }); };
    const needStudent = () => { if (!isStudent) throw Object.assign(new Error('生徒のみ使えます'), { status: 403 }); };
    const teacherClass = async () => { needTeacher(); return ensureClass(me.profile); };

    if (action === 'enroll') {
      const pr = await gj(ST.PROOFS, String(p.proof || ''));
      if (!pr || pr.expires < now()) return err(400, '確認の有効期限が切れています。最初からやり直してください。');
      const owner = await gj(ST.EMAILS, pr.schoolEmail);
      if (owner && owner !== me.email) return err(409, 'この学校メールアドレスは、すでに別のアカウントに登録されています。');
      let enrollRole = 'student';
      if (p.teacherCode) { const rec = await takeTCode(p.teacherCode, me.email); if (!rec) return err(400, '教員ログインコードが正しくないか、すでに使われています'); enrollRole = 'teacher'; }
      const profile = { email: me.email, role: enrollRole, schoolEmail: pr.schoolEmail, domain: pr.domain, orgKey: pr.orgKey, confidence: pr.confidence, level: pr.level, classCode: null, createdAt: new Date().toISOString() };
      await sj(ST.EMAILS, pr.schoolEmail, me.email);
      await sj(ST.PROFILES, me.email, profile);
      await del(ST.PROOFS, String(p.proof));
      if (profile.role === 'teacher') await ensureClass(profile);
      return json(200, { ok: true, profile: publicProfile(await gj(ST.PROFILES, me.email)) });
    }
    if (action === 'me') {
      if (!me.profile) return json(200, { ok: true, profile: null, isAdmin: me.isAdmin });
      const out = { ok: true, profile: publicProfile(me.profile), isAdmin: me.isAdmin };
      if (isTeacher) { const c = await ensureClass(me.profile); out.class = { code: c.code, students: c.students.length, name: c.name }; out.profile.classCode = c.code; }
      if (isStudent && me.profile.classCode) { const c = await gj(ST.CLASSES, me.profile.classCode); out.class = c ? { code: c.code, teacher: await nameOf(c.teacherEmail), name: c.name } : null; if (!c) { me.profile.classCode = null; await sj(ST.PROFILES, me.email, me.profile); out.profile.classCode = null; } }
      return json(200, out);
    }
    if (action === 'requestTeacher') return err(400, '教員は、運営が発行する「教員ログインコード」で登録します。コードを入力してください。');
    if (action === 'redeemTeacherCode') {
      if (isTeacher) return err(400, 'すでに教員です');
      const rec = await takeTCode(p.teacherCode, me.email);
      if (!rec) return err(400, '教員ログインコードが正しくないか、すでに使われています');
      let sp = me.profile;
      if (sp) { if (sp.classCode) { const old = await gj(ST.CLASSES, sp.classCode); if (old) { old.students = old.students.filter((x) => x !== me.email); await sj(ST.CLASSES, old.code, old); } } sp.role = 'teacher'; sp.classCode = null; delete sp.teacherPending; }
      else sp = { email: me.email, role: 'teacher', schoolEmail: null, domain: '', orgKey: 'teacher:' + me.email, confidence: 'code', level: 'code', classCode: null, createdAt: new Date().toISOString() };
      await sj(ST.PROFILES, me.email, sp); await ensureClass(sp);
      return json(200, { ok: true });
    }
    if (action === 'join') {
      needStudent();
      const code = String(p.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const c = code.length === 6 ? await gj(ST.CLASSES, code) : null;
      if (!c) return err(404, '学校コードが見つかりません');
      if (c.orgKey !== me.profile.orgKey) return err(403, 'この学校コードは、別の学校のものです（メールのドメインが一致しません）');
      if (me.profile.classCode && me.profile.classCode !== code) {
        const old = await gj(ST.CLASSES, me.profile.classCode);
        if (old) { old.students = old.students.filter((e) => e !== me.email); await sj(ST.CLASSES, old.code, old); }
      }
      if (!c.students.includes(me.email)) { if (c.students.length >= MAX_STUDENTS) return err(400, 'この学校コードは定員に達しています'); c.students.push(me.email); await sj(ST.CLASSES, code, c); }
      me.profile.classCode = code; await sj(ST.PROFILES, me.email, me.profile);
      return json(200, { ok: true, class: { code, teacher: await nameOf(c.teacherEmail), name: c.name } });
    }
    if (action === 'leave') {
      needStudent();
      if (me.profile.classCode) { const c = await gj(ST.CLASSES, me.profile.classCode); if (c) { c.students = c.students.filter((e) => e !== me.email); await sj(ST.CLASSES, c.code, c); } me.profile.classCode = null; await sj(ST.PROFILES, me.email, me.profile); }
      return json(200, { ok: true });
    }
    if (action === 'rotateCode') {
      const c = await teacherClass(); const code = await newCode();
      const next = { ...c, code }; await sj(ST.CLASSES, code, next); await del(ST.CLASSES, c.code);
      me.profile.classCode = code; await sj(ST.PROFILES, me.email, me.profile);
      for (const e of c.students) { const sp = await gj(ST.PROFILES, e); if (sp) { sp.classCode = code; await sj(ST.PROFILES, e, sp); } }
      return json(200, { ok: true, code });
    }
    if (action === 'removeStudent') {
      const c = await teacherClass(); const e = String(p.student || '');
      c.students = c.students.filter((x) => x !== e); await sj(ST.CLASSES, c.code, c);
      const sp = await gj(ST.PROFILES, e); if (sp && sp.classCode === c.code) { sp.classCode = null; await sj(ST.PROFILES, e, sp); }
      return json(200, { ok: true });
    }

    // ----- 画面共有 -----
    if (action === 'beat') {
      needStudent(); if (!me.profile.classCode) return json(200, { ok: true, classCode: null });
      await sj(ST.PRES, me.profile.classCode + '~' + me.email, { at: now(), sharing: !!p.sharing, sessionId: String(p.sessionId || '').slice(0, 40) });
      return json(200, { ok: true, classCode: me.profile.classCode });
    }
    if (action === 'classState') {
      const c = await teacherClass(); const students = [];
      for (const e of c.students) {
        const pr = await gj(ST.PRES, c.code + '~' + e); const on = !!pr && now() - pr.at < 15000;
        students.push({ email: e, name: await nameOf(e), online: on, sharing: on && !!pr.sharing, sessionId: on ? pr.sessionId : '' });
      }
      return json(200, { ok: true, code: c.code, students });
    }
    if (action === 'signalPut') {
      const data = { sessionId: String(p.sessionId || '').slice(0, 40), sdp: p.sdp && typeof p.sdp.sdp === 'string' && p.sdp.sdp.length < 40000 ? { type: String(p.sdp.type), sdp: p.sdp.sdp } : null, ice: (Array.isArray(p.ice) ? p.ice : []).slice(0, 60).map((x) => JSON.stringify(x).slice(0, 600)), at: now() };
      if (isStudent) { if (!me.profile.classCode) return err(400, '学校コードが未入力です'); await sj(ST.SIG_S, me.profile.classCode + '~' + me.email, data); return json(200, { ok: true }); }
      const c = await teacherClass(); const e = String(p.student || '');
      if (!c.students.includes(e)) return err(403, 'このクラスの生徒ではありません');
      await sj(ST.SIG_T, c.code + '~' + e, data); return json(200, { ok: true });
    }
    if (action === 'signalGet') {
      if (isStudent) { const d = me.profile.classCode ? await gj(ST.SIG_T, me.profile.classCode + '~' + me.email) : null; return json(200, { ok: true, signal: d }); }
      const c = await teacherClass(); const e = String(p.student || '');
      if (!c.students.includes(e)) return err(403, 'このクラスの生徒ではありません');
      return json(200, { ok: true, signal: await gj(ST.SIG_S, c.code + '~' + e) });
    }

    // ----- クイズ -----
    if (action === 'quizSave') {
      const c = await teacherClass();
      const existing = p.quiz && p.quiz.id ? await gj(ST.QUIZZES, String(p.quiz.id)) : null;
      if (existing && existing.teacherEmail !== me.email) return err(403, '編集できません');
      const q = cleanQuiz(p.quiz, me.email, existing); q.classCode = c.code;
      await sj(ST.QUIZZES, q.id, q); return json(200, { ok: true, quiz: q });
    }
    if (action === 'quizList') {
      const out = [];
      const keys = (await getStore(ST.QUIZZES).list()).blobs.map((b) => b.key);
      if (isTeacher) {
        const c = await teacherClass();
        for (const k of keys) { const q = await gj(ST.QUIZZES, k); if (q && q.teacherEmail === me.email) { const n = (await getStore(ST.ATTEMPTS).list({ prefix: q.id + '~' })).blobs.length; out.push({ ...q, attempts: n, students: c.students.length }); } }
        out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        return json(200, { ok: true, quizzes: out });
      }
      needStudent();
      if (me.profile.classCode) for (const k of keys) {
        const q = await gj(ST.QUIZZES, k);
        if (q && q.status === 'published' && q.classCode === me.profile.classCode) {
          const a = await gj(ST.ATTEMPTS, q.id + '~' + me.email);
          out.push({ id: q.id, title: q.title, count: q.questions.length, publishedAt: q.publishedAt, dueAt: q.dueAt, finished: !!(a && a.finishedAt), started: !!a, total: a ? a.total : 0 });
        }
      }
      out.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
      return json(200, { ok: true, quizzes: out });
    }
    if (action === 'quizPublish') {
      needTeacher(); const q = await gj(ST.QUIZZES, String(p.id || ''));
      if (!q || q.teacherEmail !== me.email) return err(404, 'クイズが見つかりません');
      q.status = p.publish === false ? 'draft' : 'published';
      if (q.status === 'published') { q.publishedAt = new Date().toISOString(); q.dueAt = /^\d{4}-\d{2}-\d{2}$/.test(String(p.dueAt || '')) ? p.dueAt : null; }
      await sj(ST.QUIZZES, q.id, q); return json(200, { ok: true, quiz: q });
    }
    if (action === 'quizDelete') {
      needTeacher(); const q = await gj(ST.QUIZZES, String(p.id || ''));
      if (!q || q.teacherEmail !== me.email) return err(404, 'クイズが見つかりません');
      for (const b of (await getStore(ST.ATTEMPTS).list({ prefix: q.id + '~' })).blobs) await del(ST.ATTEMPTS, b.key);
      await del(ST.QUIZZES, q.id); return json(200, { ok: true });
    }
    if (action === 'quizResults') {
      needTeacher(); const q = await gj(ST.QUIZZES, String(p.id || ''));
      if (!q || q.teacherEmail !== me.email) return err(404, 'クイズが見つかりません');
      const keys = (await getStore(ST.ATTEMPTS).list({ prefix: q.id + '~' })).blobs.map((b) => b.key);
      const perQ = q.questions.map(() => ({ answered: 0, correct: 0 }));
      for (const k of keys) { const a = await gj(ST.ATTEMPTS, k); (a && a.answers || []).forEach((x, i) => { if (perQ[i]) { perQ[i].answered++; if (x.correct) perQ[i].correct++; } }); }
      const c = await teacherClass();
      const rows = await leaderboard(q); const have = new Set(rows.map((r) => r.email));
      const notYet = []; for (const e of c.students) if (!have.has(e)) notYet.push({ email: e, name: await nameOf(e) });
      return json(200, { ok: true, title: q.title, questions: q.questions.map((x, i) => ({ text: x.text, ...perQ[i] })), rows, notYet });
    }
    if (action === 'quizStart' || action === 'quizAnswer' || action === 'quizNext') {
      needStudent();
      const q = await gj(ST.QUIZZES, String(p.id || ''));
      if (!q || q.status !== 'published' || q.classCode !== me.profile.classCode) return err(404, '課題が見つかりません');
      const key = q.id + '~' + me.email;
      let a = await gj(ST.ATTEMPTS, key);
      if (action === 'quizStart') {
        if (a && a.finishedAt) return json(200, { ok: true, done: true, total: a.total, rows: (await leaderboard(q)).slice(0, 5), you: me.email, count: q.questions.length });
        if (!a) { a = { quizId: q.id, student: me.email, idx: 0, qStartedAt: now(), awaiting: false, answers: [], total: 0, startedAt: now(), finishedAt: null }; }
        settleTimeout(a, q); await sj(ST.ATTEMPTS, key, a);
        if (a.awaiting) { const last = a.answers[a.answers.length - 1], qq = q.questions[a.idx]; return json(200, { ok: true, awaiting: true, result: { correct: last.correct, points: last.points, correctIndex: qq.correct, choice: last.choice }, question: stripQuestion(q, a.idx), total: a.total }); }
        const left = Math.max(1, q.questions[a.idx].timeSec - Math.floor((now() - a.qStartedAt) / 1000));
        return json(200, { ok: true, question: stripQuestion(q, a.idx), total: a.total, secondsLeft: left });
      }
      if (!a || a.finishedAt) return err(400, '課題はすでに終了しています');
      if (action === 'quizAnswer') {
        settleTimeout(a, q);
        if (a.awaiting) { await sj(ST.ATTEMPTS, key, a); const last = a.answers[a.answers.length - 1]; return json(200, { ok: true, result: { correct: last.correct, points: last.points, correctIndex: q.questions[a.idx].correct, choice: last.choice }, total: a.total, late: true }); }
        const qq = q.questions[a.idx], choice = Number(p.choice), ms = Math.max(0, now() - a.qStartedAt);
        const ok = Number.isInteger(choice) && choice === qq.correct;
        const pts = ok ? Math.round(qq.points * (1 - Math.min(1, ms / (qq.timeSec * 1000)) / 2)) : 0;
        a.answers.push({ qid: qq.id, choice: Number.isInteger(choice) ? choice : -1, correct: ok, points: pts, ms }); a.total += pts; a.awaiting = true;
        await sj(ST.ATTEMPTS, key, a);
        return json(200, { ok: true, result: { correct: ok, points: pts, correctIndex: qq.correct, choice }, total: a.total });
      }
      // quizNext
      settleTimeout(a, q);
      if (!a.awaiting) return err(400, 'まだ回答していません');
      a.idx++; a.awaiting = false;
      if (a.idx >= q.questions.length) { a.finishedAt = now(); await sj(ST.ATTEMPTS, key, a); return json(200, { ok: true, done: true, total: a.total, rows: (await leaderboard(q)).slice(0, 5), you: me.email, count: q.questions.length }); }
      a.qStartedAt = now(); await sj(ST.ATTEMPTS, key, a);
      return json(200, { ok: true, question: stripQuestion(q, a.idx), total: a.total, secondsLeft: q.questions[a.idx].timeSec });
    }

    // ----- 管理者 -----
    if (action === 'adminList') {
      if (!me.isAdmin) return err(403, '管理者のみ使えます');
      const reqs = []; for (const b of (await getStore(ST.REQUESTS).list()).blobs) { const r = await gj(ST.REQUESTS, b.key); if (r) reqs.push(r); }
      const doms = []; for (const b of (await getStore(ST.DOMAINS).list()).blobs) { const d = await gj(ST.DOMAINS, b.key); if (d) doms.push({ domain: b.key, ...d }); }
      const codes = []; for (const b of (await getStore(ST.TCODES).list()).blobs) { const c = await gj(ST.TCODES, b.key); if (c) codes.push({ code: fmtTCode(b.key), note: c.note || '', createdAt: c.createdAt, usedBy: c.usedBy || null, revoked: !!c.revoked }); }
      codes.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
      return json(200, { ok: true, requests: reqs, domains: doms, codes });
    }
    if (action === 'adminResolveRequest') {
      if (!me.isAdmin) return err(403, '管理者のみ使えます');
      const e = String(p.email || ''), r = await gj(ST.REQUESTS, e), sp = await gj(ST.PROFILES, e);
      if (!r || !sp) return err(404, '申請が見つかりません');
      if (p.approve) { if (sp.classCode) { const old = await gj(ST.CLASSES, sp.classCode); if (old) { old.students = old.students.filter((x) => x !== e); await sj(ST.CLASSES, old.code, old); } } sp.role = 'teacher'; sp.classCode = null; delete sp.teacherPending; await sj(ST.PROFILES, e, sp); await ensureClass(sp); }
      else { delete sp.teacherPending; await sj(ST.PROFILES, e, sp); }
      await del(ST.REQUESTS, e); return json(200, { ok: true });
    }
    if (action === 'adminIssueTeacherCode') {
      if (!me.isAdmin) return err(403, '管理者のみ使えます');
      const code = newTCode(); await sj(ST.TCODES, code, { note: String(p.note || '').slice(0, 80), createdAt: new Date().toISOString(), createdBy: me.email });
      return json(200, { ok: true, code: fmtTCode(code) });
    }
    if (action === 'adminRevokeTeacherCode') {
      if (!me.isAdmin) return err(403, '管理者のみ使えます');
      const c = normTCode(p.code), rec = await gj(ST.TCODES, c); if (!rec) return err(404, 'コードが見つかりません');
      if (rec.usedBy) return err(400, '使用済みのコードです'); await del(ST.TCODES, c); return json(200, { ok: true });
    }
    if (action === 'adminSetDomain') {
      if (!me.isAdmin) return err(403, '管理者のみ使えます');
      const d = String(p.domain || '').trim().toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return err(400, 'ドメインの形式が正しくありません');
      if (p.status === 'clear') await del(ST.DOMAINS, d); else await sj(ST.DOMAINS, d, { status: p.status === 'denied' ? 'denied' : 'approved', updatedAt: new Date().toISOString() });
      return json(200, { ok: true });
    }
    return err(400, '不明な操作です');
  } catch (e) {
    return err(e.status || 500, e.message || 'サーバーエラー');
  }
}
