// コドミル(親子の見守りモード)API。MixAllの中での利用時間(スクリーンタイム)・就寝時間・使えるサービスを、保護者が子どものアカウントに設定できる。
// 見られるのは「どのサービスをどれだけ使ったか」だけ。メッセージや投稿の中身は見られない。子どもにも見守りが有効であることを常に表示する。
// 保護者=18歳以上、子ども=18歳未満(生年月日の登録が必要)。メールアドレスは相手に見せず、表示名と家族コードでつなぐ。
//  POST /api/kodomiru {action, token, ...}
import crypto from 'node:crypto';
import { getStore, setEnv } from '../_lib/blobs.js';
import { pushToEmail } from '../_lib/push.js';

const STORE = 'mixall-kodomiru', ACCOUNTS = 'netrify-accounts', SESSIONS = 'netrify-sessions';
const SERVICES = { uch: 'Uch', pocket: 'ぽけっと', ghost: 'Ghost', fomasu: 'ふぉます', mail: 'Mail', maws: 'MAWS(Web検索・閲覧)', create: 'スタジオ', store: 'ストア', other: 'その他' };
const H = (status, body) => ({ status, body });
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const ageOf = (b) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(b || '')); if (!m) return null; const t = new Date(Date.now() + 9 * 3600e3); let a = t.getUTCFullYear() - +m[1]; if (t.getUTCMonth() + 1 < +m[2] || (t.getUTCMonth() + 1 === +m[2] && t.getUTCDate() < +m[3])) a--; return a; };
export const jstNow = (ms = Date.now()) => new Date(ms + 9 * 3600e3);
export const dayKey = (ms = Date.now()) => jstNow(ms).toISOString().slice(0, 10).replace(/-/g, '');
const hm = (s, d) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : d; };
const DEFAULT_RULES = { dailyMin: 0, quiet: { on: false, from: '22:00', to: '06:00' }, blocked: [], lockNow: false, extra: { day: '', min: 0 } };

export function normRules(r) {
  const x = { ...DEFAULT_RULES, ...(r || {}) };
  x.dailyMin = Math.max(0, Math.min(1440, Math.round(Number(x.dailyMin) || 0)));
  x.quiet = { on: Boolean(x.quiet?.on), from: /^\d\d:\d\d$/.test(x.quiet?.from) ? x.quiet.from : '22:00', to: /^\d\d:\d\d$/.test(x.quiet?.to) ? x.quiet.to : '06:00' };
  x.blocked = (Array.isArray(x.blocked) ? x.blocked : []).filter((k) => k in SERVICES).slice(0, 12);
  x.lockNow = Boolean(x.lockNow);
  x.extra = { day: String(x.extra?.day || ''), min: Math.max(0, Math.min(600, Math.round(Number(x.extra?.min) || 0))) };
  return x;
}
// 今ロック中か。{locked, reason: 'lockNow'|'quiet'|'limit'|'', remainSec(null=無制限), quietUntil}
export function lockState(rules, usedSec, ms = Date.now()) {
  const r = normRules(rules), now = jstNow(ms), min = now.getUTCHours() * 60 + now.getUTCMinutes(), today = dayKey(ms);
  if (r.lockNow) return { locked: true, reason: 'lockNow', remainSec: 0 };
  if (r.quiet.on) {
    const a = hm(r.quiet.from, 1320), b = hm(r.quiet.to, 360);
    const inQuiet = a <= b ? (min >= a && min < b) : (min >= a || min < b);
    if (inQuiet) return { locked: true, reason: 'quiet', remainSec: 0, quietUntil: r.quiet.to };
  }
  if (r.dailyMin > 0) {
    const cap = (r.dailyMin + (r.extra.day === today ? r.extra.min : 0)) * 60;
    const remain = Math.max(0, cap - usedSec);
    return { locked: remain <= 0, reason: remain <= 0 ? 'limit' : '', remainSec: remain };
  }
  return { locked: false, reason: '', remainSec: null };
}

export function makeDeps() {
  const st = () => getStore({ name: STORE });
  const get = async (store, key) => { const v = await getStore({ name: store }).get(key, { type: 'text' }).catch(() => null); if (!v) return null; try { return JSON.parse(v); } catch (_) { return null; } };
  return {
    get: (k) => get(STORE, k), set: (k, v) => st().set(k, JSON.stringify(v)), del: (k) => st().delete(k).catch(() => {}),
    session: async (t) => { if (!t) return null; const s = await get(SESSIONS, String(t)); return s && s.expiresAt > Date.now() && s.email ? String(s.email).toLowerCase() : null; },
    account: (e) => get(ACCOUNTS, e), push: (e, p) => pushToEmail(e, p).catch(() => 0), now: () => Date.now()
  };
}
const newCode = () => crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);

export async function kodomiruApi(p, d) {
  const email = await d.session(p.token);
  if (!email) return H(401, { error: 'ログインが必要です' });
  const acc = (await d.account(email)) || {}; const age = ageOf(acc.birthDate);
  const nameOf = async (e) => { const a = (await d.account(e)) || {}; return clean(a.displayName || a.name || a.username || String(e).split('@')[0].slice(0, 2) + '***', 30); };
  const kid = await d.get('kid:' + email), par = await d.get('par:' + email);
  const now = d.now ? d.now() : Date.now();
  const usage = async (child, day) => (await d.get(`use:${child}:${day}`)) || { sec: 0, by: {} };
  const famOf = async (code) => (code ? d.get('fam:' + code) : null);
  const myKids = async () => { const f = par && await famOf(par.code); return f ? f.children : []; };
  const needMyChild = async () => { const id = clean(p.child, 20); for (const e of await myKids()) { if (crypto.createHash('sha1').update(e).digest('hex').slice(0, 10) === id) return e; } return null; };
  const kidId = (e) => crypto.createHash('sha1').update(e).digest('hex').slice(0, 10);

  switch (p.action) {
    case 'me': {
      if (kid) return H(200, { role: 'child', services: SERVICES });
      if (par) return H(200, { role: 'parent', services: SERVICES });
      return H(200, { role: null, canParent: age !== null && age >= 18, canChild: age !== null && age < 18, needBirth: age === null, services: SERVICES });
    }
    // ---- 保護者 ----
    case 'createFamily': {
      if (par || kid) return H(400, { error: 'すでにコドミルを使っています' });
      if (age === null || age < 18) return H(403, { error: '保護者になれるのは18歳以上です(生年月日の登録が必要です)' });
      const code = newCode(); await d.set('fam:' + code, { code, parents: [email], children: [], createdAt: now }); await d.set('par:' + email, { code });
      return H(200, { ok: true, code });
    }
    case 'children': {
      if (!par) return H(403, { error: '保護者のみ使えます' });
      const f = await famOf(par.code); const today = dayKey(now), out = [];
      for (const e of f.children) { const k = await d.get('kid:' + e); const u = await usage(e, today); const ls = lockState(k.rules, u.sec, now); out.push({ id: kidId(e), name: await nameOf(e), rules: normRules(k.rules), usedSec: u.sec, by: u.by, lock: ls, leaveRequest: Boolean(k.leaveRequest), lastSeen: k.lastSeen || 0 }); }
      return H(200, { code: f.code, children: out, services: SERVICES });
    }
    case 'newCode': {
      if (!par) return H(403, { error: '保護者のみ使えます' });
      const f = await famOf(par.code); await d.del('fam:' + f.code); const code = newCode(); f.code = code; await d.set('fam:' + code, f); await d.set('par:' + email, { code });
      for (const e of f.children) { const k = await d.get('kid:' + e); k.code = code; await d.set('kid:' + e, k); }
      return H(200, { ok: true, code });
    }
    case 'saveRules': { const c = await needMyChild(); if (!c) return H(404, { error: '子どもが見つかりません' }); const k = await d.get('kid:' + c); const keepExtra = k.rules?.extra; k.rules = normRules({ ...p.rules, extra: keepExtra }); await d.set('kid:' + c, k); return H(200, { ok: true, rules: k.rules }); }
    case 'addTime': { const c = await needMyChild(); if (!c) return H(404, { error: '子どもが見つかりません' }); const k = await d.get('kid:' + c); const r = normRules(k.rules), today = dayKey(now); r.extra = { day: today, min: Math.min(600, (r.extra.day === today ? r.extra.min : 0) + Math.max(1, Math.min(180, Math.round(Number(p.min) || 0)))) }; k.rules = r; k.extendRequest = false; await d.set('kid:' + c, k); d.push(c, { title: 'コドミル', body: `保護者が今日の利用時間を${p.min}分延ばしました`, url: '/Kodomiru/', tag: 'kodomiru-extra' }); return H(200, { ok: true, rules: r }); }
    case 'lockNow': { const c = await needMyChild(); if (!c) return H(404, { error: '子どもが見つかりません' }); const k = await d.get('kid:' + c); k.rules = normRules({ ...k.rules, lockNow: Boolean(p.on) }); await d.set('kid:' + c, k); return H(200, { ok: true, rules: k.rules }); }
    case 'report': {
      const c = await needMyChild(); if (!c) return H(404, { error: '子どもが見つかりません' });
      const days = []; for (let i = 6; i >= 0; i--) { const key = dayKey(now - i * 86400e3); const u = await usage(c, key); days.push({ day: key, sec: u.sec, by: u.by }); }
      return H(200, { days });
    }
    case 'unlink': {
      const c = await needMyChild(); if (!c) return H(404, { error: '子どもが見つかりません' });
      const f = await famOf(par.code); f.children = f.children.filter((e) => e !== c); await d.set('fam:' + f.code, f); await d.del('kid:' + c);
      d.push(c, { title: 'コドミル', body: '見守りが解除されました', url: '/Kodomiru/', tag: 'kodomiru-unlink' }); return H(200, { ok: true });
    }
    // ---- 子ども ----
    case 'join': {
      if (par || kid) return H(400, { error: 'すでにコドミルを使っています' });
      if (age === null || age >= 18) return H(403, { error: '子どもとして参加できるのは18歳未満です(生年月日の登録が必要です)' });
      const f = await famOf(clean(p.code, 8).toUpperCase()); if (!f) return H(404, { error: '家族コードが見つかりません' });
      if (f.children.length >= 8) return H(400, { error: 'これ以上追加できません' });
      f.children.push(email); await d.set('fam:' + f.code, f); await d.set('kid:' + email, { code: f.code, rules: normRules({}), joinedAt: now });
      for (const pe of f.parents) d.push(pe, { title: 'コドミル', body: `${await nameOf(email)} さんが家族に参加しました`, url: '/Kodomiru/', tag: 'kodomiru-join' });
      return H(200, { ok: true });
    }
    case 'status': {
      if (!kid) return H(200, { role: par ? 'parent' : null });
      const k = await d.get('kid:' + email); const u = await usage(email, dayKey(now)); const r = normRules(k.rules);
      return H(200, { role: 'child', rules: r, usedSec: u.sec, by: u.by, lock: lockState(r, u.sec, now), leaveRequest: Boolean(k.leaveRequest), extendRequest: Boolean(k.extendRequest), services: SERVICES });
    }
    case 'heartbeat': { // 見ている間、30秒ごとに送られる。時間を数えて、いまの状態を返す
      if (!kid) return H(200, { role: par ? 'parent' : null });
      const k = await d.get('kid:' + email); const key = dayKey(now), u = await usage(email, key);
      const svc = p.svc in SERVICES ? p.svc : 'other', sec = Math.max(0, Math.min(90, Math.round(Number(p.sec) || 0)));
      const r = normRules(k.rules); const before = lockState(r, u.sec, now);
      if (!before.locked && sec) { u.sec += sec; u.by[svc] = (u.by[svc] || 0) + sec; await d.set(`use:${email}:${key}`, u); }
      const ls = lockState(r, u.sec, now);
      if (ls.locked && !before.locked && ls.reason === 'limit') for (const pe of (await famOf(k.code))?.parents || []) d.push(pe, { title: 'コドミル', body: `${await nameOf(email)} さんが今日の利用時間に達しました`, url: '/Kodomiru/', tag: 'kodomiru-limit' });
      k.lastSeen = now; await d.set('kid:' + email, k);
      return H(200, { role: 'child', rules: r, usedSec: u.sec, lock: ls });
    }
    case 'requestExtend': { if (!kid) return H(403, { error: '子どものみ使えます' }); const k = await d.get('kid:' + email); k.extendRequest = true; await d.set('kid:' + email, k); for (const pe of (await famOf(k.code))?.parents || []) d.push(pe, { title: 'コドミル', body: `${await nameOf(email)} さんが利用時間の延長をお願いしています`, url: '/Kodomiru/', tag: 'kodomiru-ask' }); return H(200, { ok: true }); }
    case 'requestLeave': { if (!kid) return H(403, { error: '子どものみ使えます' }); const k = await d.get('kid:' + email); k.leaveRequest = true; await d.set('kid:' + email, k); for (const pe of (await famOf(k.code))?.parents || []) d.push(pe, { title: 'コドミル', body: `${await nameOf(email)} さんが見守りの解除をお願いしています`, url: '/Kodomiru/', tag: 'kodomiru-leave' }); return H(200, { ok: true }); }
  }
  return H(400, { error: '不明な操作です' });
}
const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
export async function onRequest(context) {
  const req = context.request; setEnv(context.env || {});
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POSTのみ対応しています' }), { status: 405, headers: CORS });
  const p = await req.json().catch(() => ({}));
  try { const r = await kodomiruApi(p, makeDeps()); return new Response(JSON.stringify(r.body), { status: r.status, headers: CORS }); }
  catch (e) { return new Response(JSON.stringify({ error: e.message || '失敗しました' }), { status: 500, headers: CORS }); }
}
