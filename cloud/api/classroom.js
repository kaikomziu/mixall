// 学校モード「クラスルーム」API(Googleクラスルーム風): 複数クラス・複数の先生・ストリーム・課題の提出と採点
// 既存の学校モードの登録(school-profiles: role = teacher | student)をそのまま使う。
import crypto from 'node:crypto';
import { getStore, setEnv } from '../_lib/blobs.js';

const ST = { ACCOUNTS: 'netrify-accounts', SESSIONS: 'netrify-sessions', PROFILES: 'school-profiles', CLASSES: 'classroom-classes', CODES: 'classroom-codes', MEMBERS: 'classroom-members', POSTS: 'classroom-posts', ASSIGN: 'classroom-assign', SUBS: 'classroom-subs' };
const MAX_STUDENTS = 300, MAX_CLASSES_PER_TEACHER = 30, MAX_POSTS = 200, MAX_ASSIGN = 100;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const now = () => Date.now();
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (status, message) => json(status, { error: message });
const gj = async (store, key) => { try { return (await getStore(store).get(key, { type: 'json' })) || null; } catch (_) { return null; } };
const sj = (store, key, value) => getStore(store).setJSON(key, value);
const del = (store, key) => getStore(store).delete(key).catch(() => {});
const rid = (n = 8) => crypto.randomBytes(n).toString('hex');
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const validId = (v) => /^[a-f0-9]{16}$/.test(String(v || ''));
const code = (len) => { let c = ''; const b = crypto.randomBytes(len); for (let i = 0; i < len; i++) c += CODE_CHARS[b[i] % CODE_CHARS.length]; return c; };
async function uniqueCode(len) { for (let i = 0; i < 20; i++) { const c = code(len); if (!(await gj(ST.CODES, c))) return c; } throw new Error('コードを作成できませんでした'); }

async function auth(token) {
  token = String(token || '');
  if (token.length < 8 || token.length > 200) return null;
  const s = await gj(ST.SESSIONS, token);
  if (!s || (s.expiresAt && s.expiresAt < now())) return null;
  const account = await gj(ST.ACCOUNTS, s.email);
  if (!account) return null;
  return { email: s.email, account, profile: await gj(ST.PROFILES, s.email) };
}
const nameCache = new Map();
const nameOf = async (email) => { if (!nameCache.has(email)) { const a = await gj(ST.ACCOUNTS, email); nameCache.set(email, (a && a.displayName) || String(email).split('@')[0]); } return nameCache.get(email); };
const memberAdd = async (email, id) => { const l = (await gj(ST.MEMBERS, email)) || []; if (!l.includes(id)) { l.push(id); await sj(ST.MEMBERS, email, l); } };
const memberDel = async (email, id) => { const l = (await gj(ST.MEMBERS, email)) || []; await sj(ST.MEMBERS, email, l.filter((x) => x !== id)); };
const roleIn = (cls, email) => (cls.teachers.includes(email) ? 'teacher' : cls.students.includes(email) ? 'student' : null);
const isoOrEmpty = (v) => { if (!v) return ''; const t = Date.parse(String(v)); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };

export async function onRequest({ request, env }) {
  setEnv(env);
  if (request.method !== 'POST') return json(200, { ok: true, service: 'classroom' });
  let p; try { p = await request.json(); } catch (_) { return err(400, '不正なリクエストです'); }
  const action = String(p.action || '');
  try {
    const me = await auth(p.token);
    if (!me) return err(401, 'ログインが必要です');
    if (!me.profile || !['teacher', 'student'].includes(me.profile.role)) return err(403, '先に学校モードの登録をしてください(/school/)');
    const isTeacher = me.profile.role === 'teacher';

    if (action === 'myClasses') {
      const ids = (await gj(ST.MEMBERS, me.email)) || [], out = [];
      for (const id of ids) {
        const c = await gj(ST.CLASSES, id); if (!c) continue;
        const role = roleIn(c, me.email); if (!role) continue;
        out.push({ id: c.id, name: c.name, section: c.section, role, owner: await nameOf(c.owner), students: c.students.length, code: role === 'teacher' ? c.code : undefined });
      }
      return json(200, { ok: true, role: me.profile.role, classes: out });
    }
    if (action === 'createClass') {
      if (!isTeacher) return err(403, 'クラスを作れるのは先生だけです');
      const name = clip(p.name, 60); if (!name) return err(400, 'クラス名を入力してください');
      const mine = ((await gj(ST.MEMBERS, me.email)) || []).length;
      if (mine >= MAX_CLASSES_PER_TEACHER) return err(429, `作れるクラスは${MAX_CLASSES_PER_TEACHER}個までです`);
      const id = rid(8), c = { id, name, section: clip(p.section, 40), description: clip(p.description, 300), owner: me.email, teachers: [me.email], students: [], code: await uniqueCode(6), tcode: '', createdAt: new Date().toISOString() };
      await sj(ST.CODES, c.code, { id, kind: 's' }); c.tcode = await uniqueCode(8); await sj(ST.CODES, c.tcode, { id, kind: 't' });
      await sj(ST.CLASSES, id, c); await memberAdd(me.email, id);
      return json(200, { ok: true, id });
    }
    if (action === 'joinClass') {
      const cd = String(p.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rec = cd ? await gj(ST.CODES, cd) : null; const c = rec && await gj(ST.CLASSES, rec.id);
      if (!c) return err(404, 'コードが見つかりません');
      if (rec.kind === 't') {
        if (!isTeacher) return err(403, '共同教員コードは先生だけが使えます');
        if (!c.teachers.includes(me.email)) { c.teachers.push(me.email); await sj(ST.CLASSES, c.id, c); await memberAdd(me.email, c.id); }
      } else {
        if (isTeacher) return err(403, '先生は、共同教員コードでクラスに参加してください');
        if (!c.students.includes(me.email)) { if (c.students.length >= MAX_STUDENTS) return err(400, 'このクラスは定員に達しています'); c.students.push(me.email); await sj(ST.CLASSES, c.id, c); await memberAdd(me.email, c.id); }
      }
      return json(200, { ok: true, id: c.id });
    }

    // ----- ここから先は classId が必要 -----
    const classId = String(p.classId || '');
    if (!validId(classId)) return err(400, 'クラスが不正です');
    const cls = await gj(ST.CLASSES, classId);
    if (!cls) return err(404, 'クラスが見つかりません');
    const role = roleIn(cls, me.email);
    if (!role) return err(403, 'このクラスのメンバーではありません');
    const needTeacher = () => { if (role !== 'teacher') throw Object.assign(new Error('先生だけができる操作です'), { status: 403 }); };

    if (action === 'classDetail') {
      const posts = (await gj(ST.POSTS, classId)) || [], assigns = (await gj(ST.ASSIGN, classId)) || [];
      const teachers = []; for (const e of cls.teachers) teachers.push({ name: await nameOf(e), owner: e === cls.owner });
      const students = []; for (const e of cls.students) students.push(role === 'teacher' ? { email: e, name: await nameOf(e) } : { name: await nameOf(e) });
      const outAssign = [];
      for (const a of assigns) {
        const subs = (await gj(ST.SUBS, classId + ':' + a.id)) || {};
        if (role === 'teacher') outAssign.push({ ...a, submitted: Object.keys(subs).length, total: cls.students.length });
        else outAssign.push({ ...a, mine: subs[me.email] || null });
      }
      return json(200, { ok: true, role, me: me.email,
        class: { id: cls.id, name: cls.name, section: cls.section, description: cls.description, code: role === 'teacher' ? cls.code : undefined, tcode: role === 'teacher' ? cls.tcode : undefined, isOwner: cls.owner === me.email },
        teachers, students, posts: posts.map((x) => ({ ...x, canDelete: role === 'teacher' || x.author === me.email, comments: (x.comments || []).map((c) => ({ ...c, canDelete: role === 'teacher' || c.author === me.email })) })), assignments: outAssign });
    }
    if (action === 'post') {
      needTeacher(); const text = clip(p.text, 2000); if (!text) return err(400, '本文を入力してください');
      const posts = (await gj(ST.POSTS, classId)) || [];
      posts.unshift({ id: rid(6), author: me.email, authorName: await nameOf(me.email), text, createdAt: new Date().toISOString(), comments: [] });
      await sj(ST.POSTS, classId, posts.slice(0, MAX_POSTS)); return json(200, { ok: true });
    }
    if (action === 'comment') {
      const text = clip(p.text, 500); if (!text) return err(400, 'コメントを入力してください');
      const posts = (await gj(ST.POSTS, classId)) || [], post = posts.find((x) => x.id === p.postId);
      if (!post) return err(404, '投稿が見つかりません');
      post.comments = post.comments || []; if (post.comments.length >= 200) return err(400, 'コメントが多すぎます');
      post.comments.push({ id: rid(6), author: me.email, authorName: await nameOf(me.email), text, createdAt: new Date().toISOString() });
      await sj(ST.POSTS, classId, posts); return json(200, { ok: true });
    }
    if (action === 'deletePost') {
      const posts = (await gj(ST.POSTS, classId)) || [], post = posts.find((x) => x.id === p.postId);
      if (!post) return json(200, { ok: true });
      if (p.commentId) { const c = (post.comments || []).find((x) => x.id === p.commentId); if (c && (role === 'teacher' || c.author === me.email)) post.comments = post.comments.filter((x) => x.id !== p.commentId); await sj(ST.POSTS, classId, posts); return json(200, { ok: true }); }
      if (role !== 'teacher' && post.author !== me.email) return err(403, '削除できません');
      await sj(ST.POSTS, classId, posts.filter((x) => x.id !== p.postId)); return json(200, { ok: true });
    }
    if (action === 'createAssignment') {
      needTeacher(); const title = clip(p.title, 100); if (!title) return err(400, '課題名を入力してください');
      const list = (await gj(ST.ASSIGN, classId)) || []; if (list.length >= MAX_ASSIGN) return err(400, '課題が多すぎます');
      const pts = Number(p.points); const a = { id: rid(6), title, instructions: clip(p.instructions, 3000), due: isoOrEmpty(p.due), points: Number.isFinite(pts) && pts > 0 ? Math.min(1000, Math.round(pts)) : null, createdAt: new Date().toISOString() };
      list.unshift(a); await sj(ST.ASSIGN, classId, list); return json(200, { ok: true, id: a.id });
    }
    if (action === 'deleteAssignment') {
      needTeacher(); const list = (await gj(ST.ASSIGN, classId)) || [];
      await sj(ST.ASSIGN, classId, list.filter((x) => x.id !== p.assignmentId)); await del(ST.SUBS, classId + ':' + p.assignmentId); return json(200, { ok: true });
    }
    if (action === 'submit') {
      if (role !== 'student') return err(403, '提出できるのは生徒だけです');
      const list = (await gj(ST.ASSIGN, classId)) || [], a = list.find((x) => x.id === p.assignmentId);
      if (!a) return err(404, '課題が見つかりません');
      const text = clip(p.text, 5000); let link = ''; if (p.link) { try { const u = new URL(String(p.link)); if (/^https?:$/.test(u.protocol)) link = u.href.slice(0, 500); } catch (_) {} }
      if (!text && !link) return err(400, '回答の文章またはリンクを入力してください');
      const key = classId + ':' + a.id, subs = (await gj(ST.SUBS, key)) || {}, prev = subs[me.email];
      if (prev && prev.gradedAt) return err(400, '採点済みのため、提出し直せません');
      subs[me.email] = { text, link, submittedAt: new Date().toISOString(), late: Boolean(a.due && now() > Date.parse(a.due)) };
      await sj(ST.SUBS, key, subs); return json(200, { ok: true, late: subs[me.email].late });
    }
    if (action === 'submissions') {
      needTeacher(); const subs = (await gj(ST.SUBS, classId + ':' + p.assignmentId)) || {}, rows = [];
      for (const e of cls.students) { const s = subs[e]; rows.push({ email: e, name: await nameOf(e), submitted: Boolean(s), ...(s || {}) }); }
      return json(200, { ok: true, rows });
    }
    if (action === 'grade') {
      needTeacher(); const key = classId + ':' + p.assignmentId, subs = (await gj(ST.SUBS, key)) || {}, s = subs[String(p.student || '')];
      if (!s) return err(404, '提出が見つかりません');
      const sc = Number(p.score); s.score = Number.isFinite(sc) && sc >= 0 ? Math.min(1000, sc) : null; s.feedback = clip(p.feedback, 500); s.gradedAt = new Date().toISOString();
      await sj(ST.SUBS, key, subs); return json(200, { ok: true });
    }
    if (action === 'removeStudent') {
      needTeacher(); const e = String(p.student || ''); cls.students = cls.students.filter((x) => x !== e); await sj(ST.CLASSES, classId, cls); await memberDel(e, classId); return json(200, { ok: true });
    }
    if (action === 'rotateCode') {
      needTeacher(); const kind = p.kind === 't' ? 't' : 's', old = kind === 't' ? cls.tcode : cls.code, fresh = await uniqueCode(kind === 't' ? 8 : 6);
      await del(ST.CODES, old); await sj(ST.CODES, fresh, { id: classId, kind }); if (kind === 't') cls.tcode = fresh; else cls.code = fresh;
      await sj(ST.CLASSES, classId, cls); return json(200, { ok: true, code: fresh });
    }
    if (action === 'leaveClass') {
      if (cls.owner === me.email) return err(400, 'オーナーの先生は退出できません。クラスを削除してください');
      cls.teachers = cls.teachers.filter((x) => x !== me.email); cls.students = cls.students.filter((x) => x !== me.email);
      await sj(ST.CLASSES, classId, cls); await memberDel(me.email, classId); return json(200, { ok: true });
    }
    if (action === 'deleteClass') {
      if (cls.owner !== me.email) return err(403, 'クラスを削除できるのはオーナーの先生だけです');
      for (const a of (await gj(ST.ASSIGN, classId)) || []) await del(ST.SUBS, classId + ':' + a.id);
      await del(ST.ASSIGN, classId); await del(ST.POSTS, classId); await del(ST.CODES, cls.code); await del(ST.CODES, cls.tcode); await del(ST.CLASSES, classId);
      for (const e of [...cls.teachers, ...cls.students]) await memberDel(e, classId);
      return json(200, { ok: true });
    }
    return err(400, '不明な操作です');
  } catch (error) {
    if (error && error.status) return err(error.status, error.message);
    console.error('classroom error:', error && error.stack || error);
    return err(500, 'サーバーエラーが発生しました');
  }
}
