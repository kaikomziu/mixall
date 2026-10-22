// server/plus.js
// MixAll+ で追加した機能のAPI（mixall-api/plus）と、既存の処理から呼ばれる共通処理。
//   お知らせバナー / 利用量の記録と警告 / 運営向け統計 / プッシュ通知 / 未読バッジ /
//   端末の引き継ぎ（QR） / ミュート / プロフィールの追加設定・バッジ / ログインボーナス・デイリーミッション /
//   Ghostストーリー
const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys, getManyJSON, db } = require('../netlify/lib/store');
const { getSessionInfo } = require('../netlify/lib/session');

const S = {
  PROFILE: 'mixall-profile-extras',
  DAILY: 'mixall-daily',
  PUSH: 'mixall-push-subscriptions',
  TRANSFER: 'mixall-transfers',
  MUTES: 'mixall-mutes',
  STORIES: 'mixall-stories',
  ALERTS: 'mixall-usage-alerts',
  SEEN: 'mixall-seen'
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
const newId = (n = 10) => crypto.randomBytes(n).toString('hex');
// 日本時間の日付（ログインボーナスの「1日」の区切り）
function jstDay(ms = Date.now()) { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function isOperator(info) { return Boolean(info && (info.isAdmin || info.isDeputyAdmin || info.isOperator)); }
function later(promise) {
  const work = Promise.resolve(promise).catch((error) => console.error('[plus later]', error));
  if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(work);
  return work;
}

// =====================================================================
// 17. お知らせバナー
// =====================================================================
async function getAnnouncement() {
  const a = await getJSON(STORE_NAMES.SITE_STATE, 'announcement');
  if (!a || !a.text) return null;
  if (a.expiresAt && Date.parse(a.expiresAt) < Date.now()) return null;
  return { id: a.id, text: a.text, level: a.level || 'info', link: a.link || '', createdAt: a.createdAt, expiresAt: a.expiresAt || null };
}

// =====================================================================
// 18. 利用量（API呼び出し回数）の記録と警告
// =====================================================================
let usagePending = 0;
let usageFlushAt = 0;
function countRequest() {
  usagePending += 1;
  const now = Date.now();
  // 1リクエストごとに書かず、まとめて30秒に1回だけ書く
  if (now - usageFlushAt < 30 * 1000) return;
  usageFlushAt = now;
  const count = usagePending; usagePending = 0;
  const hour = new Date(Math.floor(now / 3600000) * 3600000).toISOString();
  later((async () => {
    if (process.env.MIXALL_STORE === 'memory') return;
    await db().sql`select public.mixall_usage_add(${hour}::timestamptz, ${count}::int)`;
  })());
}

const LIMIT_REQUESTS = () => Number(process.env.MIXALL_USAGE_LIMIT_REQUESTS || 500000);
const LIMIT_DB_MB = () => Number(process.env.MIXALL_USAGE_LIMIT_DB_MB || 500);

async function usageSummary() {
  if (process.env.MIXALL_STORE === 'memory') return { monthRequests: usagePending, limitRequests: LIMIT_REQUESTS(), dbMB: 0, limitDbMB: LIMIT_DB_MB(), daily: [] };
  const sql = db().sql;
  const month = await sql`select coalesce(sum(requests), 0)::bigint as n from public.mixall_usage where hour >= date_trunc('month', now())`;
  const size = await sql`select pg_database_size(current_database())::bigint as b`;
  const daily = await sql`select to_char(date_trunc('day', hour at time zone 'Asia/Tokyo'), 'YYYY-MM-DD') as day, sum(requests)::int as n
    from public.mixall_usage where hour >= now() - interval '30 days' group by 1 order by 1`;
  return { monthRequests: Number(month[0].n), limitRequests: LIMIT_REQUESTS(), dbMB: Math.round(Number(size[0].b) / 1048576), limitDbMB: LIMIT_DB_MB(), daily };
}

async function adminEmails() {
  const keys = await listKeys(STORE_NAMES.ACCOUNTS);
  const out = [];
  for (const key of keys) {
    const a = await getJSON(STORE_NAMES.ACCOUNTS, key);
    if (a && (a.isAdmin || a.isDeputyAdmin)) out.push(key);
  }
  return out;
}

// 1時間ごとの定期処理から呼ぶ。8割を超えたら運営に通知（同じ月・同じ段階では1回だけ）
async function checkUsage() {
  const u = await usageSummary();
  const alerts = [];
  const reqRate = u.monthRequests / u.limitRequests;
  const dbRate = u.dbMB / u.limitDbMB;
  const monthKey = jstDay().slice(0, 7);
  for (const [kind, rate, label] of [['requests', reqRate, `今月のAPI呼び出しが ${u.monthRequests.toLocaleString()} 回（上限の目安 ${u.limitRequests.toLocaleString()} 回の ${Math.round(reqRate * 100)}%）`], ['db', dbRate, `データベースの使用量が ${u.dbMB}MB（上限 ${u.limitDbMB}MB の ${Math.round(dbRate * 100)}%）`]]) {
    const level = rate >= 0.95 ? 95 : rate >= 0.8 ? 80 : 0;
    if (!level) continue;
    const key = `${monthKey}:${kind}:${level}`;
    if (await getJSON(S.ALERTS, key)) continue;
    await setJSON(S.ALERTS, key, { at: new Date().toISOString(), rate });
    alerts.push(label);
  }
  if (alerts.length) {
    const { addNotification } = require('../netlify/lib/notifications');
    for (const email of await adminEmails()) {
      await addNotification(email, { type: 'usageAlert', title: 'Supabase無料枠の使用量に注意', body: alerts.join('\n'), url: '/admin/' });
    }
  }
  return { ...u, alerts };
}

// =====================================================================
// 16. 運営向けの統計
// =====================================================================
async function adminStats() {
  const days = [];
  for (let i = 29; i >= 0; i -= 1) days.push(jstDay(Date.now() - i * 86400000));
  const byDay = () => Object.fromEntries(days.map((d) => [d, 0]));
  const signups = byDay(); const ghost = byDay(); const uch = byDay(); const reports = byDay();
  const day = (iso) => (iso ? jstDay(Date.parse(iso)) : null);
  const bump = (map, iso) => { const d = day(iso); if (d && d in map) map[d] += 1; };

  const accountKeys = await listKeys(STORE_NAMES.ACCOUNTS);
  let totalUsers = 0;
  for (const key of accountKeys) { const a = await getJSON(STORE_NAMES.ACCOUNTS, key); if (!a) continue; totalUsers += 1; bump(signups, a.createdAt); }

  let totalGhost = 0;
  for (const key of await listKeys(STORE_NAMES.GHOST_POSTS)) {
    if (key.includes(':')) continue; // メディア片・ライブ用のキーは除く
    const p = await getJSON(STORE_NAMES.GHOST_POSTS, key);
    if (!p || p.deleted) continue; totalGhost += 1; bump(ghost, p.createdAt);
  }
  let totalUch = 0;
  for (const key of await listKeys(STORE_NAMES.UCH_THREADS)) {
    const t = await getJSON(STORE_NAMES.UCH_THREADS, key);
    for (const post of (t && t.posts) || []) { if (post.deleted) continue; totalUch += 1; bump(uch, post.createdAt); }
  }
  let openReports = 0;
  for (const key of await listKeys(STORE_NAMES.ADMIN_AUDIT, 'report:')) {
    const r = await getJSON(STORE_NAMES.ADMIN_AUDIT, key);
    if (!r) continue; bump(reports, r.createdAt); if (r.status === 'open') openReports += 1;
  }
  const now = Date.now();
  let active24 = 0; let active7 = 0;
  for (const key of await listKeys(STORE_NAMES.PRESENCE)) {
    const p = await getJSON(STORE_NAMES.PRESENCE, key);
    const t = Number(p && p.lastSeenAt) || 0;
    if (now - t < 86400000) active24 += 1;
    if (now - t < 7 * 86400000) active7 += 1;
  }
  const series = (map) => days.map((d) => ({ day: d, n: map[d] }));
  return {
    totals: { users: totalUsers, ghostPosts: totalGhost, uchPosts: totalUch, openReports, active24, active7 },
    series: { signups: series(signups), ghost: series(ghost), uch: series(uch), reports: series(reports) },
    usage: await usageSummary()
  };
}

// =====================================================================
// 1. プッシュ通知
// =====================================================================
function webpush() {
  const lib = globalThis.__mixallWebPush || require('web-push');
  if (!process.env.MIXALL_VAPID_PUBLIC || !process.env.MIXALL_VAPID_PRIVATE) return null;
  lib.setVapidDetails(process.env.MIXALL_VAPID_SUBJECT || 'mailto:admin@example.com', process.env.MIXALL_VAPID_PUBLIC, process.env.MIXALL_VAPID_PRIVATE);
  return lib;
}
function subKey(email, endpoint) { return `${email}:${crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 24)}`; }

// チャットの通知に本文は入れない（本文は端末にだけある）
function pushPayload(email, record) {
  const isChat = ['pocketMessage', 'mail', 'mailMessage', 'ghostChat'].includes(record.type);
  const site = String(process.env.MIXALL_SITE_URL || '').replace(/\/$/, '');
  const path = String(record.url || '/');
  return JSON.stringify({
    title: String(record.title || 'MixAll+').slice(0, 60),
    body: isChat ? '新しいメッセージがあります' : String(record.body || '新しいお知らせがあります').slice(0, 120),
    url: /^https?:/.test(path) ? path : `${site}${path.startsWith('/') ? path : `/${path}`}`,
    tag: String(record.scope || record.type || 'mixall').slice(0, 60)
  });
}

async function sendPush(email, record) {
  const lib = webpush();
  if (!lib) return 0;
  const keys = await listKeys(S.PUSH, `${email}:`);
  if (!keys.length) return 0;
  const payload = pushPayload(email, record);
  let sent = 0;
  for (const key of keys) {
    const sub = await getJSON(S.PUSH, key);
    if (!sub || !sub.endpoint) continue;
    try {
      await lib.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 3600, urgency: 'normal' });
      sent += 1;
    } catch (error) {
      // 端末側で通知をやめた・期限切れの購読は消す
      if (error && (error.statusCode === 404 || error.statusCode === 410)) await deleteKey(S.PUSH, key);
      else console.error('push failed:', error && (error.statusCode || error.message));
    }
  }
  return sent;
}
// netlify/lib/notifications.js の addNotification から呼ばれる（応答を待たせない）
function onNotificationAdded(email, record) { later(sendPush(email, record)); }

// =====================================================================
// 3. 未読バッジ
// =====================================================================
async function badges(email) {
  let chat = 0;
  for (const key of await listKeys(STORE_NAMES.POCKET_ROOMS)) {
    const room = await getJSON(STORE_NAMES.POCKET_ROOMS, key);
    if (!room || !Array.isArray(room.memberEmails) || !room.memberEmails.includes(email)) continue;
    for (const m of room.messages || []) if (!m.deleted && m.authorEmail !== email && !(m.readBy || []).includes(email)) chat += 1;
  }
  let mail = 0;
  for (const key of await listKeys(STORE_NAMES.MAIL_THREADS)) {
    const t = await getJSON(STORE_NAMES.MAIL_THREADS, key);
    if (!t || !Array.isArray(t.memberEmails) || !t.memberEmails.includes(email)) continue;
    const last = (t.messages || [])[t.messages.length - 1];
    const readAt = t.readBy && t.readBy[email] ? Date.parse(t.readBy[email]) : 0;
    if (last && last.authorEmail !== email && Date.parse(last.createdAt) > readAt) mail += 1;
  }
  // Uch の返信・メンション通知（Pocket の通知は上の未読数と重なるので数えない）
  let uch = 0; let other = 0;
  for (const key of await listKeys(STORE_NAMES.NOTIFICATIONS, `${email}:`)) {
    const n = await getJSON(STORE_NAMES.NOTIFICATIONS, key);
    if (!n || n.read || n.type === 'pocketMessage') continue;
    if (n.type === 'uchPost') uch += 1; else other += 1;
  }
  const ghost = await ghostActivity(email);
  return { chat: chat + mail + uch, pocket: chat, mail, uch, sns: ghost.unread, ghostComments: ghost.unreadComments, ghostLikes: ghost.unreadLikes, other, warnings: await require('./plus2').unackedWarnings(email), total: chat + mail + uch + ghost.unread + other };
}

// Ghost の通知: 自分の投稿についた、他の人のコメントといいね。
// 「最後に通知ページを見た時刻」より後のコメントと、そのとき以降に増えたいいねを未読とする。
async function ghostActivity(email) {
  const seen = (await getJSON(S.SEEN, email)) || {};
  // まだ一度も通知ページを開いていない人は、直近7日のコメントだけを未読にする
  const seenAt = Number(seen.ghostAt) || (Date.now() - 7 * 86400000);
  const items = [];
  let likesTotal = 0;
  const likesByPost = [];
  for (const key of await listKeys(STORE_NAMES.GHOST_POSTS)) {
    if (key.includes(':')) continue;
    const p = await getJSON(STORE_NAMES.GHOST_POSTS, key);
    if (!p || p.deleted || p.authorEmail !== email) continue;
    const title = String(p.title || p.text || '（画像・動画の投稿）').slice(0, 60);
    const likes = (Array.isArray(p.likes) ? p.likes : []).filter((x) => x !== email).length;
    likesTotal += likes;
    if (likes) likesByPost.push({ postId: p.id, title, likes, previous: Number(seen.likes?.[p.id]) || 0 });
    for (const c of p.comments || []) {
      if (!c || c.deleted || c.authorEmail === email || c.isLiveChat) continue;
      const at = Date.parse(c.createdAt) || 0;
      items.push({ type: 'comment', postId: p.id, postTitle: title, author: c.authorName || '誰か', text: String(c.text || '').slice(0, 120), createdAt: c.createdAt, unread: at > seenAt });
    }
  }
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const unreadComments = items.filter((x) => x.unread).length;
  const unreadLikes = seen.likesTotal === undefined ? 0 : Math.max(0, likesTotal - Number(seen.likesTotal));
  return { items: items.slice(0, 100), likesByPost: likesByPost.sort((a, b) => (b.likes - b.previous) - (a.likes - a.previous)), likesTotal, unreadComments, unreadLikes, unread: unreadComments + unreadLikes, seenAt };
}

// =====================================================================
// 8. 端末の引き継ぎ（暗号化済みのデータを10分だけ預かる。鍵はQRのURLの#以降にあり、サーバーには来ない）
// =====================================================================
const TRANSFER_TTL = 10 * 60 * 1000;
const TRANSFER_MAX = 8 * 1024 * 1024;

// =====================================================================
// 12. ログインボーナス・デイリーミッション
// =====================================================================
const MISSIONS = [
  { id: 'pocket', label: 'ぽけっとでメッセージを送る', reward: 5 },
  { id: 'ghost', label: 'Ghostに投稿する', reward: 5 },
  { id: 'uch', label: 'Uchに書き込む', reward: 5 }
];
const ALL_MISSIONS_BONUS = 10;
async function getDaily(email) {
  const rec = (await getJSON(S.DAILY, email)) || { streak: 0, lastClaimDay: null, totalDays: 0, missions: {} };
  const today = jstDay();
  if (!rec.missions || rec.missions.day !== today) rec.missions = { day: today, done: {}, claimed: {}, allClaimed: false };
  return rec;
}
function bonusFor(streak) { return 10 + Math.min(streak, 7) * 2; }
function dailyView(rec) {
  const today = jstDay();
  const yesterday = jstDay(Date.now() - 86400000);
  const claimedToday = rec.lastClaimDay === today;
  const nextStreak = claimedToday ? rec.streak : (rec.lastClaimDay === yesterday ? rec.streak + 1 : 1);
  return {
    today, claimedToday, streak: claimedToday ? rec.streak : (rec.lastClaimDay === yesterday ? rec.streak : 0),
    nextStreak, bonus: bonusFor(nextStreak), totalDays: rec.totalDays || 0,
    missions: MISSIONS.map((m) => ({ ...m, done: Boolean(rec.missions.done[m.id]), claimed: Boolean(rec.missions.claimed[m.id]) })),
    allBonus: ALL_MISSIONS_BONUS, allClaimed: Boolean(rec.missions.allClaimed)
  };
}
async function addCoins(email, amount) {
  const current = Number(await getJSON(STORE_NAMES.COINS, email)) || 0;
  const next = current + amount;
  await setJSON(STORE_NAMES.COINS, email, next);
  return next;
}
// 既存の投稿処理から呼ぶ（失敗しても投稿自体は止めない）
function recordMission(email, id) {
  if (!email || !MISSIONS.some((m) => m.id === id)) return;
  later((async () => {
    const rec = await getDaily(email);
    if (rec.missions.done[id]) return;
    rec.missions.done[id] = true;
    await setJSON(S.DAILY, email, rec);
  })());
}

// =====================================================================
// 11. プロフィールの追加設定とバッジ
// =====================================================================
const COLOR_RE = /^#[0-9a-f]{6}$/i;
async function profileExtras(email) {
  const extras = (await getJSON(S.PROFILE, email)) || {};
  const account = await getJSON(STORE_NAMES.ACCOUNTS, email);
  const daily = await getJSON(S.DAILY, email);
  const badgesList = [];
  if (account?.isAdmin || account?.isDeputyAdmin) badgesList.push({ id: 'staff', label: '運営', icon: '🛡️' });
  if (account?.isOfficial) badgesList.push({ id: 'official', label: '公認', icon: '✔️' });
  const created = Date.parse(account?.createdAt || '') || 0;
  if (created && Date.now() - created < 14 * 86400000) badgesList.push({ id: 'new', label: '新人', icon: '🌱' });
  if (created && created < Date.parse('2026-10-18T00:00:00Z')) badgesList.push({ id: 'pioneer', label: '古参', icon: '🏛️' });
  const streak = Number(daily?.streak) || 0;
  if (streak >= 30) badgesList.push({ id: 'streak30', label: `連続ログイン${streak}日`, icon: '🔥' });
  else if (streak >= 7) badgesList.push({ id: 'streak7', label: `連続ログイン${streak}日`, icon: '🔥' });
  if ((Number(daily?.totalDays) || 0) >= 100) badgesList.push({ id: 'days100', label: 'ログイン100日', icon: '💯' });
  const cosmetics = await require('./plus2').cosmeticsOf(email);
  if (cosmetics.title) badgesList.unshift({ id: 'title', label: cosmetics.title.split(' ').slice(1).join(' '), icon: cosmetics.title.split(' ')[0] });
  return { headerUrl: extras.headerDataUrl || null, color: COLOR_RE.test(extras.color || '') ? extras.color : null, link: extras.link || '', badges: badgesList, frame: cosmetics.frame, nameColor: cosmetics.nameColor };
}

// =====================================================================
// 10. ミュート（端末をまたいで同じ設定にするためサーバーに保存。絞り込みは端末側）
// =====================================================================
function cleanMutes(input) {
  const list = (v, max, len) => Array.from(new Set((Array.isArray(v) ? v : []).map((x) => String(x || '').trim().toLowerCase().slice(0, len)).filter(Boolean))).slice(0, max);
  return { users: list(input?.users, 300, 120), words: list(input?.words, 200, 60), hideReplies: Boolean(input?.hideReplies) };
}

// =====================================================================
// 15. Ghostストーリー（24時間で消える）
// =====================================================================
const STORY_TTL = 24 * 3600 * 1000;
async function listStories(viewer) {
  const keys = await listKeys(S.STORIES);
  const now = Date.now();
  const byAuthor = new Map();
  for (const key of keys) {
    const s = await getJSON(S.STORIES, key);
    if (!s || s.expiresAt < now) continue;
    if (!byAuthor.has(s.authorEmail)) byAuthor.set(s.authorEmail, []);
    byAuthor.get(s.authorEmail).push(s);
  }
  const authors = [];
  for (const [email, items] of byAuthor) {
    const account = await getJSON(STORE_NAMES.ACCOUNTS, email);
    items.sort((a, b) => a.createdAt - b.createdAt);
    authors.push({
      email: email === viewer.email ? email : undefined,
      mine: email === viewer.email,
      name: account?.ghostName || account?.displayName || email.split('@')[0],
      handle: account?.ghostHandle || null,
      avatarUrl: account?.ghostAvatarUrl || account?.avatarDataUrl || null,
      latestAt: items[items.length - 1].createdAt,
      stories: items.map((s) => ({ id: s.id, text: s.text, bg: s.bg, imageUrl: s.imageDataUrl || null, createdAt: s.createdAt, expiresAt: s.expiresAt, seen: (s.viewers || []).includes(viewer.email), views: email === viewer.email ? (s.viewers || []).length : undefined }))
    });
  }
  authors.sort((a, b) => (b.mine - a.mine) || (a.stories.every((s) => s.seen) - b.stories.every((s) => s.seen)) || (b.latestAt - a.latestAt));
  return authors;
}

// ストーリーの背景: 色、またはCoinショップで買った背景
async function storyBackground(email, payload) {
  const item = String(payload.bgItem || '');
  if (item) {
    const owned = ((await getJSON(S.PROFILE, email)) || {}).owned || [];
    const shop = require('./plus2').SHOP_ITEMS;
    const found = shop.find((x) => x.id === item && x.type === 'storyBg');
    if (found && owned.includes(item)) return found.preview;
  }
  return COLOR_RE.test(String(payload.bg || '')) ? payload.bg : '#5b3dff';
}

// 定期処理（1時間ごと）: 期限切れのストーリー・引き継ぎデータを消す
async function cleanup() {
  const now = Date.now();
  for (const key of await listKeys(S.STORIES)) { const s = await getJSON(S.STORIES, key); if (!s || s.expiresAt < now) await deleteKey(S.STORIES, key); }
  for (const key of await listKeys(S.TRANSFER, 'meta:')) {
    const t = await getJSON(S.TRANSFER, key);
    if (!t || t.expiresAt < now) {
      const id = key.slice(5);
      for (let i = 0; i < Number(t?.chunks || 0); i += 1) await deleteKey(S.TRANSFER, `chunk:${id}:${i}`);
      await deleteKey(S.TRANSFER, key);
    }
  }
}

// =====================================================================
// API本体
// =====================================================================
exports.handler = async (event) => {
  let payload = {};
  if (event.httpMethod === 'POST') { try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '不正なリクエストです' }); } }
  else payload = event.queryStringParameters || {};
  const action = String(payload.action || '');

  // ---- ログイン不要 ----
  if (action === 'announcement') return json(200, { announcement: await getAnnouncement() });
  if (action === 'pushKey') return json(200, { publicKey: process.env.MIXALL_VAPID_PUBLIC || null });
  if (action === 'transferGet') {
    const id = String(payload.id || '').replace(/[^a-f0-9]/g, '');
    const meta = id ? await getJSON(S.TRANSFER, `meta:${id}`) : null;
    if (!meta || meta.expiresAt < Date.now()) return json(404, { error: '引き継ぎコードの有効期限が切れたか、見つかりません。古い端末でもう一度QRコードを作ってください。' });
    const parts = [];
    for (let i = 0; i < meta.chunks; i += 1) parts.push((await getJSON(S.TRANSFER, `chunk:${id}:${i}`))?.data || '');
    return json(200, { owner: meta.owner, iv: meta.iv, data: parts.join(''), createdAt: meta.createdAt });
  }

  const info = await getSessionInfo(payload.token);
  if (!info) return json(401, { error: 'ログインが必要です' });
  const email = info.email;

  // ---- お知らせ・運営 ----
  if (action === 'setAnnouncement') {
    if (!isOperator(info)) return json(403, { error: '運営のみ操作できます' });
    const text = String(payload.text || '').trim().slice(0, 300);
    if (!text) { await deleteKey(STORE_NAMES.SITE_STATE, 'announcement'); return json(200, { announcement: null }); }
    const hours = Math.max(0, Math.min(24 * 60, Number(payload.hours) || 0));
    const rec = { id: newId(6), text, level: ['info', 'warning', 'danger', 'success'].includes(payload.level) ? payload.level : 'info', link: String(payload.link || '').slice(0, 300), createdAt: new Date().toISOString(), createdBy: email, expiresAt: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null };
    await setJSON(STORE_NAMES.SITE_STATE, 'announcement', rec);
    return json(200, { announcement: await getAnnouncement() });
  }
  if (action === 'adminStats') {
    if (!isOperator(info)) return json(403, { error: '運営のみ閲覧できます' });
    return json(200, await adminStats());
  }
  // ---- GitHub のデータ置き場（重いファイル類の退避先） ----
  if (action === 'archiveStatus') {
    if (!isOperator(info)) return json(403, { error: '運営のみ閲覧できます' });
    const gha = require('../netlify/lib/github-archive');
    const stores = [...require('../netlify/lib/store').ARCHIVE_STORES];
    let r = { archived: 0, archived_bytes: 0, pending: 0, pending_bytes: 0 };
    try { [r] = await db().sql`select count(*) filter (where value ? '__archived')::int as archived,
        coalesce(sum((value->'__archived'->>'bytes')::bigint) filter (where value ? '__archived'), 0)::bigint as archived_bytes,
        count(*) filter (where not (value ? '__archived') and bytes >= 16384)::int as pending,
        coalesce(sum(bytes) filter (where not (value ? '__archived') and bytes >= 16384), 0)::bigint as pending_bytes
      from public.mixall_kv where store = any(${stores})`; } catch (error) { console.error('[archiveStatus]', error.message); }
    const cfg = gha.config();
    const token = cfg.token ? `${cfg.token.slice(0, 11)}••••${cfg.token.slice(-4)}` : '';
    return json(200, { configured: cfg.enabled, repo: cfg.repo, token, archived: r.archived, archivedBytes: Number(r.archived_bytes), pending: r.pending, pendingBytes: Number(r.pending_bytes) });
  }
  if (action === 'saveArchiveSettings') {
    if (!info.isAdmin) return json(403, { error: '管理者のみ設定できます' });
    const repo = String(payload.repo || '').trim();
    const token = String(payload.ghToken || '').trim() || String(process.env.MIXALL_GH_DATA_TOKEN || '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return json(400, { error: 'リポジトリ名（例: kaikomziu/mixall-data）とトークンを入れてください' });
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mixall-api' } });
    const meta = await res.json().catch(() => ({}));
    if (!res.ok) return json(400, { error: `リポジトリを確認できませんでした（${res.status}）。リポジトリ名とトークンの対象リポジトリを確かめてください` });
    if (!meta.private) return json(400, { error: 'このリポジトリは公開されています。添付ファイルを置くので、非公開リポジトリにしてください' });
    if (meta.permissions && meta.permissions.push === false) return json(400, { error: 'トークンに書き込み権限（Contents: Read and write）がありません' });
    const env = (await db().get('mixall-config', 'env')) || {};
    env.MIXALL_GH_DATA_REPO = repo; env.MIXALL_GH_DATA_TOKEN = token;
    await db().set('mixall-config', 'env', env);
    process.env.MIXALL_GH_DATA_REPO = repo; process.env.MIXALL_GH_DATA_TOKEN = token;
    return json(200, { ok: true });
  }
  if (action === 'runArchive') {
    if (!isOperator(info)) return json(403, { error: '運営のみ操作できます' });
    return json(200, await require('./archive-job').archiveColdFiles({ limit: 15, timeBudgetMs: 50 * 1000 }));
  }
  if (action === 'checkUsage') {
    if (!isOperator(info)) return json(403, { error: '運営のみ操作できます' });
    return json(200, await checkUsage());
  }

  // ---- プッシュ通知 ----
  if (action === 'pushSubscribe') {
    const sub = payload.subscription || {};
    if (!/^https:\/\//.test(String(sub.endpoint || '')) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json(400, { error: '通知の登録情報が不正です' });
    await setJSON(S.PUSH, subKey(email, sub.endpoint), { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, device: String(payload.device || '').slice(0, 120), createdAt: new Date().toISOString() });
    return json(200, { ok: true });
  }
  if (action === 'pushUnsubscribe') {
    if (payload.endpoint) await deleteKey(S.PUSH, subKey(email, payload.endpoint));
    return json(200, { ok: true });
  }
  if (action === 'pushTest') {
    const sent = await sendPush(email, { type: 'test', title: 'MixAll+', body: 'プッシュ通知はこのように届きます', url: '/account/' });
    return json(200, { sent });
  }

  // ---- 未読バッジ ----
  if (action === 'badges') return json(200, await badges(email));
  if (action === 'ghostActivity') return json(200, await ghostActivity(email));
  // 右上の通知パネル用: すべての未読をまとめて返す（チャット本文は含めない）
  if (action === 'notifCenter') {
    const counts = await badges(email);
    const ghost = await ghostActivity(email);
    const items = [];
    for (const c of ghost.items.slice(0, 15)) items.push({ kind: 'ghostComment', title: `${c.author} さんがコメントしました`, body: c.text, sub: `「${c.postTitle}」`, url: `/Ghost/post.html?id=${encodeURIComponent(c.postId)}`, at: c.createdAt, unread: c.unread });
    if (ghost.unreadLikes) items.push({ kind: 'ghostLike', title: `いいねが ${ghost.unreadLikes} 件増えました`, body: '', sub: 'Ghost の通知を開く', url: '/Ghost/notifications.html', at: new Date().toISOString(), unread: true });
    for (const key of await listKeys(STORE_NAMES.NOTIFICATIONS, `${email}:`)) {
      const n = await getJSON(STORE_NAMES.NOTIFICATIONS, key);
      if (!n || n.type === 'pocketMessage') continue;
      items.push({ kind: n.type || 'other', id: n.id, title: String(n.title || 'お知らせ').slice(0, 80), body: n.type === 'uchPost' ? 'スレッドに新しい書き込みがあります' : String(n.body || '').slice(0, 120), sub: n.type === 'uchPost' ? 'Uch' : '', url: n.url || '/', at: n.createdAt, unread: !n.read });
    }
    // Pocket・Mail はルーム／スレッドごとの未読数だけ（本文は端末にしかない）
    for (const key of await listKeys(STORE_NAMES.POCKET_ROOMS)) {
      const room = await getJSON(STORE_NAMES.POCKET_ROOMS, key);
      if (!room || !Array.isArray(room.memberEmails) || !room.memberEmails.includes(email)) continue;
      const unread = (room.messages || []).filter((m) => !m.deleted && m.authorEmail !== email && !(m.readBy || []).includes(email));
      if (!unread.length) continue;
      const last = unread[unread.length - 1];
      let name = room.title;
      if (!name) { const other = room.memberEmails.find((x) => x !== email); const acc = other ? await getJSON(STORE_NAMES.ACCOUNTS, other) : null; name = (room.nicknames && room.nicknames[other]) || acc?.displayName || (other || '').split('@')[0] || 'チャット'; }
      items.push({ kind: 'pocket', title: `${name}`, body: `新しいメッセージが ${unread.length} 件`, sub: 'ぽけっと', url: `/Pocket/room.html?id=${encodeURIComponent(room.id)}`, at: last.createdAt, unread: true, count: unread.length });
    }
    for (const key of await listKeys(STORE_NAMES.MAIL_THREADS)) {
      const t = await getJSON(STORE_NAMES.MAIL_THREADS, key);
      if (!t || !Array.isArray(t.memberEmails) || !t.memberEmails.includes(email)) continue;
      const last = (t.messages || [])[t.messages.length - 1];
      const readAt = t.readBy && t.readBy[email] ? Date.parse(t.readBy[email]) : 0;
      if (!last || last.authorEmail === email || Date.parse(last.createdAt) <= readAt) continue;
      const acc = await getJSON(STORE_NAMES.ACCOUNTS, last.authorEmail);
      items.push({ kind: 'mail', title: `${acc?.displayName || String(last.authorEmail || '').split('@')[0]} さんからのメール`, body: '新しいメールが届いています', sub: 'Mail', url: `/Mail/thread.html?id=${encodeURIComponent(t.id)}`, at: last.createdAt, unread: true });
    }
    items.sort((a, b) => (b.unread - a.unread) || (Date.parse(b.at) - Date.parse(a.at)));
    return json(200, { counts, items: items.slice(0, 40) });
  }
  // 右上の「すべて既読」: Ghost の通知とお知らせ類を既読にする（チャット・メールは開いたときに既読になる）
  if (action === 'markAllRead') {
    const g = await ghostActivity(email);
    await setJSON(S.SEEN, email, { ...((await getJSON(S.SEEN, email)) || {}), ghostAt: Date.now(), likesTotal: g.likesTotal, likes: Object.fromEntries(g.likesByPost.map((x) => [x.postId, x.likes])) });
    for (const key of await listKeys(STORE_NAMES.NOTIFICATIONS, `${email}:`)) {
      const n = await getJSON(STORE_NAMES.NOTIFICATIONS, key);
      if (n && !n.read && n.type !== 'pocketMessage') { n.read = true; await setJSON(STORE_NAMES.NOTIFICATIONS, key, n); }
    }
    return json(200, { ok: true, counts: await badges(email) });
  }
  // 通知ページを開いた: ここまでを既読にする
  if (action === 'markGhostSeen') {
    const g = await ghostActivity(email);
    const likes = Object.fromEntries(g.likesByPost.map((x) => [x.postId, x.likes]));
    await setJSON(S.SEEN, email, { ...((await getJSON(S.SEEN, email)) || {}), ghostAt: Date.now(), likesTotal: g.likesTotal, likes });
    return json(200, { ok: true });
  }
  // Uch のスレッドや Pocket のルームを開いた: その場所の通知を既読にする
  if (action === 'markScopeRead') {
    const scope = String(payload.scope || '').slice(0, 200);
    if (!/^(uch|pocket):[A-Za-z0-9_-]+$/.test(scope)) return json(400, { error: '不正な指定です' });
    let n = 0;
    for (const key of await listKeys(STORE_NAMES.NOTIFICATIONS, `${email}:`)) {
      const item = await getJSON(STORE_NAMES.NOTIFICATIONS, key);
      if (item && !item.read && item.scope === scope) { item.read = true; await setJSON(STORE_NAMES.NOTIFICATIONS, key, item); n += 1; }
    }
    return json(200, { ok: true, marked: n });
  }

  // ---- 端末の引き継ぎ ----
  if (action === 'transferCreate') {
    const data = String(payload.data || '');
    const iv = String(payload.iv || '');
    if (!data || data.length > TRANSFER_MAX || !/^[A-Za-z0-9+/=_-]+$/.test(data) || !/^[A-Za-z0-9+/=_-]{8,40}$/.test(iv)) return json(400, { error: '引き継ぎデータが大きすぎるか、不正です' });
    const id = newId(12);
    const size = 500 * 1024;
    let chunks = 0;
    for (let i = 0; i < data.length; i += size) { await setJSON(S.TRANSFER, `chunk:${id}:${chunks}`, { data: data.slice(i, i + size) }); chunks += 1; }
    const expiresAt = Date.now() + TRANSFER_TTL;
    await setJSON(S.TRANSFER, `meta:${id}`, { owner: email, iv, chunks, createdAt: new Date().toISOString(), expiresAt });
    return json(200, { id, expiresAt });
  }
  if (action === 'transferDone') {
    const id = String(payload.id || '').replace(/[^a-f0-9]/g, '');
    const meta = id ? await getJSON(S.TRANSFER, `meta:${id}`) : null;
    if (meta && meta.owner === email) {
      for (let i = 0; i < meta.chunks; i += 1) await deleteKey(S.TRANSFER, `chunk:${id}:${i}`);
      await deleteKey(S.TRANSFER, `meta:${id}`);
    }
    return json(200, { ok: true });
  }

  // ---- ミュート ----
  if (action === 'getMutes') return json(200, { mutes: cleanMutes(await getJSON(S.MUTES, email)) });
  if (action === 'saveMutes') { const mutes = cleanMutes(payload.mutes); await setJSON(S.MUTES, email, mutes); return json(200, { mutes }); }

  // ---- プロフィール ----
  if (action === 'getProfileExtras') return json(200, { extras: await profileExtras(email) });
  if (action === 'saveProfileExtras') {
    const current = (await getJSON(S.PROFILE, email)) || {};
    if (payload.headerDataUrl !== undefined) {
      const h = payload.headerDataUrl ? String(payload.headerDataUrl) : '';
      if (h && (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(h) || h.length > 1600000)) return json(400, { error: 'ヘッダー画像はPNG/JPEG/WebP/GIFで、約1.2MB以下にしてください' });
      current.headerDataUrl = h || null;
    }
    if (payload.color !== undefined) current.color = COLOR_RE.test(String(payload.color)) ? String(payload.color) : null;
    if (payload.link !== undefined) { const l = String(payload.link || '').trim().slice(0, 200); current.link = /^https?:\/\//.test(l) ? l : ''; }
    current.updatedAt = new Date().toISOString();
    await setJSON(S.PROFILE, email, current);
    return json(200, { extras: await profileExtras(email) });
  }

  // ---- ログインボーナス・デイリーミッション ----
  if (action === 'daily') return json(200, dailyView(await getDaily(email)));
  if (action === 'claimDaily') {
    const rec = await getDaily(email);
    const view = dailyView(rec);
    if (view.claimedToday) return json(200, { ...view, already: true });
    rec.streak = view.nextStreak;
    rec.lastClaimDay = view.today;
    rec.totalDays = (rec.totalDays || 0) + 1;
    await setJSON(S.DAILY, email, rec);
    const balance = await addCoins(email, view.bonus);
    return json(200, { ...dailyView(rec), claimed: view.bonus, balance });
  }
  if (action === 'claimMission') {
    const rec = await getDaily(email);
    const id = String(payload.id || '');
    let reward = 0;
    if (id === 'all') {
      if (MISSIONS.every((m) => rec.missions.done[m.id]) && !rec.missions.allClaimed) { rec.missions.allClaimed = true; reward = ALL_MISSIONS_BONUS; }
    } else {
      const m = MISSIONS.find((x) => x.id === id);
      if (m && rec.missions.done[id] && !rec.missions.claimed[id]) { rec.missions.claimed[id] = true; reward = m.reward; }
    }
    if (!reward) return json(400, { error: 'まだ受け取れません' });
    await setJSON(S.DAILY, email, rec);
    const balance = await addCoins(email, reward);
    return json(200, { ...dailyView(rec), claimed: reward, balance });
  }

  // ---- Ghostストーリー ----
  if (action === 'stories') {
    if (!(info.age >= 13)) return json(200, { authors: [], ageLimited: true });
    return json(200, { authors: await listStories(info) });
  }
  if (action === 'createStory') {
    if (!(info.age >= 13)) return json(403, { error: 'ストーリーは13歳以上で利用できます' });
    const text = String(payload.text || '').trim().slice(0, 200);
    const image = payload.imageDataUrl ? String(payload.imageDataUrl) : '';
    if (image && (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image) || image.length > 2400000)) return json(400, { error: '画像はPNG/JPEG/WebP/GIFで、約1.8MB以下にしてください' });
    if (!text && !image) return json(400, { error: '文字か画像を入れてください' });
    const mine = (await listKeys(S.STORIES, `${email}:`)).length;
    if (mine >= 20) return json(400, { error: 'ストーリーは同時に20件までです' });
    const now = Date.now();
    const story = { id: newId(8), authorEmail: email, text, imageDataUrl: image || null, bg: await storyBackground(email, payload), createdAt: now, expiresAt: now + STORY_TTL, viewers: [] };
    await setJSON(S.STORIES, `${email}:${story.id}`, story);
    return json(201, { ok: true, id: story.id });
  }
  if (action === 'viewStory' || action === 'deleteStory') {
    const id = String(payload.id || '').replace(/[^a-f0-9]/g, '');
    const key = (await listKeys(S.STORIES)).find((k) => k.endsWith(`:${id}`));
    const story = key ? await getJSON(S.STORIES, key) : null;
    if (!story) return json(404, { error: 'ストーリーが見つかりません' });
    if (action === 'deleteStory') {
      if (story.authorEmail !== email && !isOperator(info)) return json(403, { error: '削除できません' });
      await deleteKey(S.STORIES, key);
      return json(200, { ok: true });
    }
    if (story.authorEmail !== email && !(story.viewers || []).includes(email)) { story.viewers = [...(story.viewers || []), email].slice(-2000); await setJSON(S.STORIES, key, story); }
    return json(200, { ok: true });
  }

  // 第2弾の機能（server/plus2.js）
  const second = await require('./plus2').handle(action, payload, info);
  if (second) return second;

  return json(400, { error: '不明な操作です' });
};

module.exports.countRequest = countRequest;
module.exports.checkUsage = checkUsage;
module.exports.cleanup = cleanup;
module.exports.onNotificationAdded = onNotificationAdded;
module.exports.recordMission = recordMission;
module.exports.profileExtras = profileExtras;
module.exports.getAnnouncement = getAnnouncement;
module.exports.STORES = S;
