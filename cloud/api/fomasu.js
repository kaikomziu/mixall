// ふぉます(マッチングサービス)API。Ghostと同じく、本名・メールではなく「ふぉます名」と「ID」でマッチングする。
// ゲーム・恋愛・友達・雑談など、目的を選んで「いつでも」マッチング(いますぐマッチング / さがして申請)。
//  POST /api/fomasu {action, token, ...}
//  安全面: 18歳未満と18歳以上は完全に分けてマッチング。恋愛は18歳以上のみ。生年月日が未登録の人は使えない。
import { getStore, setEnv } from '../_lib/blobs.js';
import { pushToEmail } from '../_lib/push.js';

const PURPOSES = { game: 'ゲーム', love: '恋愛', friend: '友達づくり', chat: '話し相手・雑談', hobby: '趣味', study: '勉強・作業', other: 'その他' };
const ADULT_ONLY = new Set(['love']);
const STORE = 'mixall-fomasu', ACCOUNTS = 'netrify-accounts', SESSIONS = 'netrify-sessions';
const QUEUE_MS = 10 * 60 * 1000, OPEN_MS = 2 * 3600 * 1000;
const H = (status, body) => ({ status, body });
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

function ageOf(birth) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || '')); if (!m) return null; const t = new Date(Date.now() + 9 * 3600e3); let a = t.getUTCFullYear() - +m[1]; if (t.getUTCMonth() + 1 < +m[2] || (t.getUTCMonth() + 1 === +m[2] && t.getUTCDate() < +m[3])) a--; return a; }

export function makeDeps() {
  const st = () => getStore({ name: STORE });
  const get = async (store, key) => { const v = await getStore({ name: store }).get(key, { type: 'text' }).catch(() => null); if (!v) return null; try { return JSON.parse(v); } catch (_) { return null; } };
  return {
    get: (k) => get(STORE, k),
    set: (k, v) => st().set(k, JSON.stringify(v)),
    del: (k) => st().delete(k).catch(() => {}),
    session: async (token) => { if (!token) return null; const s = await get(SESSIONS, String(token)); return s && s.expiresAt > Date.now() && s.email ? String(s.email).toLowerCase() : null; },
    account: (email) => get(ACCOUNTS, email),
    push: (email, payload) => pushToEmail(email, payload).catch(() => 0)
  };
}

const sendHits = new Map();
const limited = (e) => { const now = Date.now(); const a = (sendHits.get(e) || []).filter((t) => now - t < 60000); a.push(now); sendHits.set(e, a); if (sendHits.size > 3000) sendHits.clear(); return a.length > 30; };

export async function fomasuApi(p, d) {
  const email = await d.session(p.token);
  if (!email) return H(401, { error: 'ログインが必要です' });
  const acc = await d.account(email) || {};
  const age = ageOf(acc.birthDate);
  const staff = acc.isAdmin === true || acc.isDeputyAdmin === true || acc.isOfficial === true;
  const group = age === null ? (staff ? 'adult' : null) : age >= 18 ? 'adult' : 'minor';
  if (!group) return H(403, { error: 'ふぉますを使うには、アカウントに生年月日の登録が必要です(年齢で相手を分けるため)。', needBirth: true });
  const allowed = Object.keys(PURPOSES).filter((k) => group === 'adult' || !ADULT_ONLY.has(k));
  const U = async (e) => (await d.get('u:' + e)) || { likes: {}, blocked: [], matches: [] };
  const profileOf = (e) => d.get('p:' + e);
  const dirKey = 'dir:' + group;
  const me = await profileOf(email);
  const pub = (pr, extra = {}) => ({ handle: pr.handle, name: pr.name, bio: pr.bio, purposes: pr.purposes, tags: pr.tags, open: Boolean(pr.openUntil && pr.openUntil > Date.now()), openPurpose: pr.openUntil > Date.now() ? pr.openPurpose || '' : '', ...extra });
  const syncDir = async (pr) => {
    const dir = ((await d.get(dirKey)) || []).filter((x) => x.h !== pr.handle);
    dir.push({ h: pr.handle, e: pr.email, at: Date.now() });
    await d.set(dirKey, dir.slice(-3000));
  };
  const needProfile = () => (me ? null : H(400, { error: '先にプロフィールを作ってください', needProfile: true }));
  const roomView = async (m) => {
    const otherEmail = m.a === email ? m.b : m.a; const o = await profileOf(otherEmail);
    return { id: m.id, purpose: m.purpose, purposeLabel: PURPOSES[m.purpose] || '', other: o ? { handle: o.handle, name: o.name } : { handle: '', name: '(退会)' }, lastText: m.lastText || '', lastAt: m.lastAt || m.createdAt, unread: (m.lastFrom && m.lastFrom !== (m.a === email ? 'a' : 'b') && (m.readAt?.[m.a === email ? 'a' : 'b'] || 0) < (m.lastAt || 0)) ? 1 : 0, createdAt: m.createdAt };
  };
  const makeMatch = async (otherEmail, purpose, via) => {
    const id = rid(); const m = { id, a: email, b: otherEmail, purpose, via, createdAt: Date.now(), lastAt: Date.now(), lastText: '', lastFrom: '', readAt: {} };
    await d.set('m:' + id, m); await d.set('msg:' + id, []);
    for (const e of [email, otherEmail]) { const u = await U(e); u.matches = [...(u.matches || []), id].slice(-300); await d.set('u:' + e, u); }
    const o = await profileOf(otherEmail);
    d.push(otherEmail, { title: 'ふぉます', body: `${me.name} さんとマッチしました！メッセージを送ってみましょう`, url: '/Fomasu/#room=' + id, tag: 'fomasu-match-' + id });
    return { match: await roomView(m), otherName: o?.name };
  };
  const blockedEither = async (otherEmail) => { const mine = await U(email); if ((mine.blocked || []).includes(otherEmail)) return true; const theirs = await U(otherEmail); return (theirs.blocked || []).includes(email); };
  const myRoom = async (id) => { const m = await d.get('m:' + String(id).replace(/[^a-z0-9]/g, '')); return m && (m.a === email || m.b === email) && !m.closed ? m : null; };

  switch (p.action) {
    case 'me': {
      const u = await U(email); const q = ((await d.get('queue:' + group)) || []).find((x) => x.e === email && Date.now() - x.at < QUEUE_MS);
      return H(200, { profile: me ? { ...pub(me), purposes: me.purposes } : null, group, purposes: allowed.map((k) => ({ id: k, label: PURPOSES[k] })), searching: q ? { purpose: q.purpose, tag: q.tag, at: q.at } : null, matches: (u.matches || []).length });
    }
    case 'saveProfile': {
      const handle = clean(p.handle || me?.handle, 20).toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(handle)) return H(400, { error: 'IDは半角英数字とアンダースコアの3〜20文字です' });
      const owner = await d.get('h:' + handle);
      if (owner && owner !== email) return H(409, { error: 'そのIDはすでに使われています' });
      const name = clean(p.name, 20); if (!name) return H(400, { error: 'ふぉます名を入力してください' });
      const purposes = (Array.isArray(p.purposes) ? p.purposes : []).filter((k) => allowed.includes(k)).slice(0, 7);
      if (!purposes.length) return H(400, { error: '目的を1つ以上選んでください' });
      const tags = (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(/[,、\s]+/)).map((t) => clean(t, 24).replace(/^#/, '')).filter(Boolean).slice(0, 10);
      const pr = { ...(me || {}), email, handle, name, bio: clean(p.bio, 300), purposes, tags, group, createdAt: me?.createdAt || Date.now(), updatedAt: Date.now() };
      if (me && me.handle !== handle) await d.del('h:' + me.handle);
      await d.set('h:' + handle, email); await d.set('p:' + email, pr); await syncDir(pr);
      return H(200, { ok: true, profile: pub(pr) });
    }
    case 'setOpen': { // 「いま募集中」: さがす一覧に出て、申請を受けやすくなる(2時間)
      const np = needProfile(); if (np) return np;
      const open = Boolean(p.open); const purpose = allowed.includes(p.purpose) ? p.purpose : '';
      me.openUntil = open ? Date.now() + OPEN_MS : 0; me.openPurpose = open ? purpose : '';
      await d.set('p:' + email, me); return H(200, { ok: true, open });
    }
    case 'quick': { // いますぐマッチング
      const np = needProfile(); if (np) return np;
      const purpose = allowed.includes(p.purpose) ? p.purpose : ''; if (!purpose) return H(400, { error: '目的を選んでください' });
      const tag = clean(p.tag, 24).toLowerCase();
      const qk = 'queue:' + group; let q = ((await d.get(qk)) || []).filter((x) => Date.now() - x.at < QUEUE_MS && x.e !== email);
      for (const cand of q) {
        if (cand.purpose !== purpose) continue;
        if (cand.tag && tag && cand.tag !== tag) continue;
        if (await blockedEither(cand.e)) continue;
        const act = await d.get('p:' + cand.e); if (!act) continue;
        q = q.filter((x) => x.e !== cand.e); await d.set(qk, q);
        const r = await makeMatch(cand.e, purpose, 'quick');
        return H(200, { matched: r.match });
      }
      q.push({ e: email, purpose, tag, at: Date.now() }); await d.set(qk, q);
      return H(200, { searching: true });
    }
    case 'quickPoll': {
      const q = ((await d.get('queue:' + group)) || []);
      const mine = q.find((x) => x.e === email && Date.now() - x.at < QUEUE_MS);
      if (mine) return H(200, { searching: true });
      const u = await U(email); const last = await d.get('m:' + (u.matches || []).slice(-1)[0]);
      if (last && Date.now() - last.createdAt < 60 * 1000 && last.via === 'quick' && !last.closed) return H(200, { matched: await roomView(last) });
      return H(200, { searching: false });
    }
    case 'quickCancel': { const qk = 'queue:' + group; await d.set(qk, ((await d.get(qk)) || []).filter((x) => x.e !== email)); return H(200, { ok: true }); }
    case 'browse': {
      const np = needProfile(); if (np) return np;
      const u = await U(email); const dir = ((await d.get(dirKey)) || []).filter((x) => x.e !== email && !(u.blocked || []).includes(x.e));
      const q = clean(p.q, 40).toLowerCase(), purpose = allowed.includes(p.purpose) ? p.purpose : '', tag = clean(p.tag, 24).toLowerCase();
      const rows = [];
      for (const x of dir.slice().reverse()) {
        if (rows.length >= 40) break;
        const pr = await d.get('p:' + x.e); if (!pr) continue;
        if (purpose && !pr.purposes.includes(purpose)) continue;
        if (tag && !pr.tags.some((t) => t.toLowerCase() === tag)) continue;
        if (q && !(pr.name + ' ' + pr.handle + ' ' + pr.bio + ' ' + pr.tags.join(' ')).toLowerCase().includes(q)) continue;
        if (await blockedEither(x.e)) continue;
        const theirs = await U(x.e);
        rows.push(pub(pr, { liked: Boolean(u.likes?.[x.e]), likesMe: Boolean(theirs.likes?.[email]) }));
      }
      rows.sort((a, b) => Number(b.open) - Number(a.open));
      return H(200, { items: rows });
    }
    case 'like': { // マッチ申請。相手もこちらを申請済みならマッチ成立
      const np = needProfile(); if (np) return np;
      const hh = clean(p.handle, 20).toLowerCase(); const oe = await d.get('h:' + hh); if (!oe || oe === email) return H(404, { error: '相手が見つかりません' });
      const op = await profileOf(oe); if (!op || op.group !== group) return H(404, { error: '相手が見つかりません' });
      if (await blockedEither(oe)) return H(403, { error: '申請できません' });
      const u = await U(email); u.likes = { ...(u.likes || {}), [oe]: Date.now() }; await d.set('u:' + email, u);
      const theirs = await U(oe);
      for (const id of (u.matches || [])) { const m0 = await d.get('m:' + id); if (m0 && !m0.closed && ((m0.a === email && m0.b === oe) || (m0.b === email && m0.a === oe))) return H(200, { matched: await roomView(m0) }); }
      if (theirs.likes?.[email]) {
        const purpose = op.purposes.find((x) => me.purposes.includes(x)) || me.purposes[0];
        const r = await makeMatch(oe, purpose, 'like'); return H(200, { matched: r.match });
      }
      d.push(oe, { title: 'ふぉます', body: `${me.name} さんからマッチ申請が届きました`, url: '/Fomasu/#tab=inbox', tag: 'fomasu-like-' + me.handle });
      return H(200, { liked: true });
    }
    case 'unlike': { const hh = clean(p.handle, 20).toLowerCase(); const oe = await d.get('h:' + hh); const u = await U(email); if (oe) { delete u.likes[oe]; await d.set('u:' + email, u); } return H(200, { ok: true }); }
    case 'inbox': { // 自分に申請してきた人
      const np = needProfile(); if (np) return np;
      const u = await U(email); const dir = (await d.get(dirKey)) || []; const items = [];
      for (const x of dir) { if (x.e === email || (u.blocked || []).includes(x.e)) continue; const t = await U(x.e); if (t.likes?.[email] && !u.likes?.[x.e]) { const pr = await d.get('p:' + x.e); if (pr) items.push(pub(pr, { at: t.likes[email], likesMe: true })); } }
      items.sort((a, b) => b.at - a.at); return H(200, { items: items.slice(0, 50) });
    }
    case 'matches': {
      const u = await U(email); const out = [];
      for (const id of (u.matches || []).slice().reverse()) { const m = await d.get('m:' + id); if (m && !m.closed) out.push(await roomView(m)); }
      out.sort((a, b) => b.lastAt - a.lastAt); return H(200, { items: out });
    }
    case 'messages': {
      const m = await myRoom(p.matchId); if (!m) return H(404, { error: 'ルームが見つかりません' });
      const side = m.a === email ? 'a' : 'b'; const msgs = (await d.get('msg:' + m.id)) || [];
      m.readAt = { ...(m.readAt || {}), [side]: Date.now() }; await d.set('m:' + m.id, m);
      const since = Number(p.since) || 0; return H(200, { room: await roomView(m), items: msgs.filter((x) => x.at > since).map((x) => ({ mine: x.f === side, text: x.t, at: x.at })) });
    }
    case 'send': {
      const m = await myRoom(p.matchId); if (!m) return H(404, { error: 'ルームが見つかりません' });
      const text = clean(p.text, 500); if (!text) return H(400, { error: '文章を入力してください' });
      if (limited(email)) return H(429, { error: '送信が多すぎます。少し待ってください' });
      const side = m.a === email ? 'a' : 'b'; const other = side === 'a' ? m.b : m.a;
      if (await blockedEither(other)) return H(403, { error: '送信できません' });
      const msgs = (await d.get('msg:' + m.id)) || []; const at = Date.now(); msgs.push({ f: side, t: text, at });
      await d.set('msg:' + m.id, msgs.slice(-300));
      m.lastAt = at; m.lastText = text.slice(0, 60); m.lastFrom = side; m.readAt = { ...(m.readAt || {}), [side]: at }; await d.set('m:' + m.id, m);
      d.push(other, { title: 'ふぉます · ' + (me?.name || ''), body: text.slice(0, 100), url: '/Fomasu/#room=' + m.id, tag: 'fomasu-msg-' + m.id });
      return H(200, { ok: true, at });
    }
    case 'unmatch': { const m = await myRoom(p.matchId); if (!m) return H(404, { error: 'ルームが見つかりません' }); m.closed = true; await d.set('m:' + m.id, m); return H(200, { ok: true }); }
    case 'block': {
      const hh = clean(p.handle, 20).toLowerCase(); const oe = await d.get('h:' + hh); if (!oe) return H(404, { error: '相手が見つかりません' });
      const u = await U(email); u.blocked = Array.from(new Set([...(u.blocked || []), oe])).slice(-500); delete u.likes[oe]; await d.set('u:' + email, u);
      for (const id of u.matches || []) { const m = await d.get('m:' + id); if (m && !m.closed && ((m.a === email && m.b === oe) || (m.b === email && m.a === oe))) { m.closed = true; await d.set('m:' + id, m); } }
      return H(200, { ok: true });
    }
    case 'report': {
      const id = rid(); await d.set('r:' + id, { id, from: email, handle: clean(p.handle, 20), matchId: clean(p.matchId, 20), reason: clean(p.reason, 300), at: Date.now() });
      return H(200, { ok: true });
    }
  }
  return H(400, { error: '不明な操作です' });
}

const CORS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
export async function onRequest(context) {
  const req = context.request; setEnv(context.env || {});
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POSTのみ対応しています' }), { status: 405, headers: CORS });
  const p = await req.json().catch(() => ({}));
  try { const r = await fomasuApi(p, makeDeps()); return new Response(JSON.stringify(r.body), { status: r.status, headers: CORS }); }
  catch (e) { return new Response(JSON.stringify({ error: e.message || '失敗しました' }), { status: 500, headers: CORS }); }
}
