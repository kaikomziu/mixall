// server/plus.js
// MixAll +（二世代）で足している機能の API（/api/plus）と、1時間ごとの定期処理（/api/plus-cron）。
// 以前の GitHub 版（a874d0e の server/plus.js・plus2.js）から、EdgeOne 版（v27c）に無いものを移した:
//   お知らせバナー / 運営からの警告 / 運営向け統計 / QRで別の端末にログイン / ミュート / プロフィールの装飾・バッジ /
//   ログインボーナス・デイリーミッション / Coinショップ / Ghostストーリー / Ghostの投票・リアクション /
//   おすすめユーザー / ブックマークのメモ / 返信リマインド / 音声の文字起こし
// データは v27c と同じ kv テーブル（getStore）。v27c のデータ（アカウント・セッション・Coin・Ghost投稿・通知）は v27c と同じ形で読み書きする。
// EdgeOne 版は cloud-functions/api/plus.js、Supabase 版は server/edge-router.js から呼ぶ。
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { getStore, kvConfig } from './cloud/_lib/blobs.js';
import { pushNotificationRecord } from './cloud/_lib/push.js';

// v27c のストア
const V = {
  ACCOUNTS: 'netrify-accounts', SESSIONS: 'netrify-sessions', COINS: 'netrify-coins', GHOST_POSTS: 'netrify-ghost-posts',
  UCH_THREADS: 'netrify-uch-threads', POCKET_ROOMS: 'netrify-pocket-rooms', NOTIFICATIONS: 'netrify-notifications',
  PRESENCE: 'netrify-presence', SITE_STATE: 'netrify-site-state', ADMIN_AUDIT: 'netrify-admin-audit',
  ADMIN_SECRETS: 'netrify-admin-secrets', FILE_MANIFESTS: 'netrify-file-manifests', FILE_CHUNKS: 'netrify-file-chunks'
};
// MixAll + で足したストア（以前の GitHub 版と同じ名前）
const S = {
  PROFILE: 'mixall-profile-extras', DAILY: 'mixall-daily', TRANSFER: 'mixall-transfers', MUTES: 'mixall-mutes',
  STORIES: 'mixall-stories', POLLS: 'mixall-polls', REACTIONS: 'mixall-reactions', NOTES: 'mixall-bookmark-notes',
  REMIND: 'mixall-reply-reminders', WARNINGS: 'mixall-warnings'
};

// ---- 保存（v27c の getJSON / setJSON と同じ使い方） ----
async function getJSON(store, key) {
  try { return await getStore(store).get(String(key), { type: 'json' }); } catch (_) { return null; }
}
async function setJSON(store, key, value) { await getStore(store).setJSON(String(key), value); }
async function deleteKey(store, key) { await getStore(store).delete(String(key)); }
async function listKeys(store, prefix = '') { return (await getStore(store).list(prefix ? { prefix } : {})).blobs.map((b) => b.key); }

const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const newId = (n = 8) => crypto.randomBytes(n).toString('hex');
// 日本時間の日付（ログインボーナスの「1日」の区切り）
const jstDay = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const isOperator = (info) => Boolean(info && info.isOperator);
const COLOR_RE = /^#[0-9a-f]{6}$/i;
// 投票・リアクションは「誰が押したか」を保存せず、アカウントごとの短いハッシュだけを持つ
const voterHash = (email) => crypto.createHmac('sha256', process.env.UCH_ID_SECRET || 'mixall-plus-voter').update(String(email)).digest('hex').slice(0, 16);

// ---- ログイン（v27c の getSessionInfo と同じ判定。最終アクセスの更新はしない） ----
function ageOf(birthDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate || ''));
  if (!m) return null;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  let age = now.getUTCFullYear() - Number(m[1]);
  if (now.getUTCMonth() + 1 < Number(m[2]) || (now.getUTCMonth() + 1 === Number(m[2]) && now.getUTCDate() < Number(m[3]))) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}
async function sessionInfo(token) {
  if (!token) return null;
  const session = await getJSON(V.SESSIONS, token);
  if (!session || session.expiresAt < Date.now()) return null;
  const account = await getJSON(V.ACCOUNTS, session.email);
  if (!account) return null;
  const age = ageOf(account.birthDate) ?? account.age ?? null;
  return {
    email: session.email, account, age,
    displayName: account.displayName || session.email.split('@')[0],
    isAdmin: account.isAdmin === true,
    isOperator: account.isAdmin === true || account.isDeputyAdmin === true
  };
}

// v27c の通知（右上のベル・通知ページ）に入れ、プッシュ通知も送る
async function addNotification(email, data) {
  const record = { id: newId(10), recipientEmail: String(email).toLowerCase(), read: false, createdAt: new Date().toISOString(), ...data };
  await setJSON(V.NOTIFICATIONS, `${record.recipientEmail}:${record.id}`, record);
  try { await pushNotificationRecord(record.recipientEmail, record); } catch (_) {}
  return record;
}

async function addCoins(email, amount) {
  const next = (Number(await getJSON(V.COINS, email)) || 0) + amount;
  await setJSON(V.COINS, email, next);
  return next;
}

// =====================================================================
// お知らせバナー
// =====================================================================
async function getAnnouncement() {
  const a = await getJSON(V.SITE_STATE, 'plus-announcement');
  if (!a || !a.text) return null;
  if (a.expiresAt && Date.parse(a.expiresAt) < Date.now()) return null;
  return { id: a.id, text: a.text, level: a.level || 'info', link: a.link || '', createdAt: a.createdAt, expiresAt: a.expiresAt || null };
}

// =====================================================================
// 運営向けの統計（直近30日）
// =====================================================================
async function dbUsage() {
  try {
    const { url, key } = kvConfig();
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const r = await fetch(`${url}/rest/v1/rpc/mixall_db_usage`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(8000) });
    const d = r.ok ? await r.json() : {};
    return { dbMB: Math.round((Number(d.db_bytes) || 0) / 1048576), limitDbMB: Number(process.env.SUPABASE_DB_LIMIT_MB || 500) };
  } catch (_) { return { dbMB: 0, limitDbMB: 500 }; }
}
async function adminStats() {
  const days = [];
  for (let i = 29; i >= 0; i -= 1) days.push(jstDay(Date.now() - i * 86400000));
  const byDay = () => Object.fromEntries(days.map((d) => [d, 0]));
  const signups = byDay(); const ghost = byDay(); const uch = byDay(); const reports = byDay();
  const bump = (map, iso) => { const d = iso ? jstDay(Date.parse(iso)) : null; if (d && d in map) map[d] += 1; };
  let users = 0;
  for (const key of await listKeys(V.ACCOUNTS)) { const a = await getJSON(V.ACCOUNTS, key); if (a) { users += 1; bump(signups, a.createdAt); } }
  let ghostPosts = 0;
  for (const key of await listKeys(V.GHOST_POSTS)) {
    if (key.includes(':')) continue;
    const p = await getJSON(V.GHOST_POSTS, key);
    if (p && !p.deleted) { ghostPosts += 1; bump(ghost, p.createdAt); }
  }
  let uchPosts = 0;
  for (const key of await listKeys(V.UCH_THREADS)) {
    const t = await getJSON(V.UCH_THREADS, key);
    for (const post of (t && t.posts) || []) if (!post.deleted) { uchPosts += 1; bump(uch, post.createdAt); }
  }
  let openReports = 0;
  for (const key of await listKeys(V.ADMIN_AUDIT, 'report:')) {
    const r = await getJSON(V.ADMIN_AUDIT, key);
    if (r) { bump(reports, r.createdAt); if (r.status === 'open') openReports += 1; }
  }
  let active24 = 0; let active7 = 0;
  for (const key of await listKeys(V.PRESENCE)) {
    const t = Number((await getJSON(V.PRESENCE, key))?.lastSeenAt) || 0;
    if (Date.now() - t < 86400000) active24 += 1;
    if (Date.now() - t < 7 * 86400000) active7 += 1;
  }
  const series = (map) => days.map((d) => ({ day: d, n: map[d] }));
  return { totals: { users, ghostPosts, uchPosts, openReports, active24, active7 }, series: { signups: series(signups), ghost: series(ghost), uch: series(uch), reports: series(reports) }, usage: await dbUsage() };
}

// =====================================================================
// ログインボーナス・デイリーミッション
// =====================================================================
const MISSIONS = [
  { id: 'pocket', label: 'ぽけっとでメッセージを送る', reward: 5 },
  { id: 'ghost', label: 'Ghostに投稿する', reward: 5 },
  { id: 'uch', label: 'Uchに書き込む', reward: 5 }
];
const ALL_MISSIONS_BONUS = 10;
const bonusFor = (streak) => 10 + Math.min(streak, 7) * 2;
async function getDaily(email) {
  const rec = (await getJSON(S.DAILY, email)) || { streak: 0, lastClaimDay: null, totalDays: 0, missions: {} };
  const today = jstDay();
  if (!rec.missions || rec.missions.day !== today) rec.missions = { day: today, done: {}, claimed: {}, allClaimed: false };
  return rec;
}
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

// =====================================================================
// Coinショップ・プロフィールの装飾とバッジ
// =====================================================================
const SHOP = [
  { id: 'frame-aurora', type: 'frame', name: 'オーロラ枠', price: 60, preview: 'linear-gradient(135deg,#4fdcff,#8b6bff,#ff5c9a)' },
  { id: 'frame-gold', type: 'frame', name: 'ゴールド枠', price: 120, preview: 'linear-gradient(135deg,#fff3b0,#ffcc4d,#c98a00)' },
  { id: 'frame-neon', type: 'frame', name: 'ネオン枠', price: 90, preview: 'linear-gradient(135deg,#3dffb8,#00e1ff)' },
  { id: 'frame-sakura', type: 'frame', name: 'さくら枠', price: 80, preview: 'linear-gradient(135deg,#ffd1e6,#ff7ab6)' },
  { id: 'name-sunset', type: 'nameColor', name: '名前の色: サンセット', price: 50, preview: 'linear-gradient(90deg,#ff9f1a,#ff4f8b)' },
  { id: 'name-ocean', type: 'nameColor', name: '名前の色: オーシャン', price: 50, preview: 'linear-gradient(90deg,#4fdcff,#3d7bff)' },
  { id: 'name-mint', type: 'nameColor', name: '名前の色: ミント', price: 50, preview: 'linear-gradient(90deg,#3dffb8,#0daa93)' },
  { id: 'name-rainbow', type: 'nameColor', name: '名前の色: レインボー', price: 150, preview: 'linear-gradient(90deg,#ff5c5c,#ffcc4d,#3dffb8,#4fdcff,#8b6bff)' },
  { id: 'title-hero', type: 'title', name: '称号「ヒーロー」', price: 40, label: '🦸 ヒーロー' },
  { id: 'title-artist', type: 'title', name: '称号「アーティスト」', price: 40, label: '🎨 アーティスト' },
  { id: 'title-gamer', type: 'title', name: '称号「ゲーマー」', price: 40, label: '🎮 ゲーマー' },
  { id: 'title-night', type: 'title', name: '称号「夜ふかし」', price: 30, label: '🌙 夜ふかし' },
  { id: 'title-legend', type: 'title', name: '称号「レジェンド」', price: 300, label: '👑 レジェンド' },
  { id: 'story-galaxy', type: 'storyBg', name: 'ストーリー背景: ギャラクシー', price: 40, preview: 'linear-gradient(160deg,#0b0d2e,#5b3dff,#ff4f8b)' },
  { id: 'story-sunrise', type: 'storyBg', name: 'ストーリー背景: 朝焼け', price: 40, preview: 'linear-gradient(160deg,#ffcc4d,#ff7a59,#8b6bff)' }
];
const SHOP_BY_ID = Object.fromEntries(SHOP.map((x) => [x.id, x]));
async function cosmeticsOf(email) {
  const eq = ((await getJSON(S.PROFILE, email)) || {}).equipped || {};
  const pick = (id) => (id && SHOP_BY_ID[id] ? SHOP_BY_ID[id] : null);
  return { frame: pick(eq.frame)?.preview || null, nameColor: pick(eq.nameColor)?.preview || null, title: pick(eq.title)?.label || null };
}
async function profileExtras(email) {
  const extras = (await getJSON(S.PROFILE, email)) || {};
  const account = await getJSON(V.ACCOUNTS, email);
  const daily = await getJSON(S.DAILY, email);
  const badges = [];
  if (account?.isAdmin || account?.isDeputyAdmin) badges.push({ id: 'staff', label: '運営', icon: '🛡️' });
  if (account?.isOfficial) badges.push({ id: 'official', label: '公認', icon: '✔️' });
  const created = Date.parse(account?.createdAt || '') || 0;
  if (created && Date.now() - created < 14 * 86400000) badges.push({ id: 'new', label: '新人', icon: '🌱' });
  if (created && created < Date.parse('2026-10-18T00:00:00Z')) badges.push({ id: 'pioneer', label: '古参', icon: '🏛️' });
  const streak = Number(daily?.streak) || 0;
  if (streak >= 7) badges.push({ id: streak >= 30 ? 'streak30' : 'streak7', label: `連続ログイン${streak}日`, icon: '🔥' });
  if ((Number(daily?.totalDays) || 0) >= 100) badges.push({ id: 'days100', label: 'ログイン100日', icon: '💯' });
  const cos = await cosmeticsOf(email);
  if (cos.title) badges.unshift({ id: 'title', label: cos.title.split(' ').slice(1).join(' '), icon: cos.title.split(' ')[0] });
  return { headerUrl: extras.headerDataUrl || null, color: COLOR_RE.test(extras.color || '') ? extras.color : null, link: extras.link || '', badges, frame: cos.frame, nameColor: cos.nameColor, replyReminder: extras.replyReminder !== false };
}
// Ghost のハンドル → アカウント（装飾の一括取得用。10分覚えておく）
let handleCache = { at: 0, map: new Map() };
async function accountsByHandle() {
  if (Date.now() - handleCache.at < 10 * 60 * 1000) return handleCache.map;
  const map = new Map();
  for (const key of await listKeys(V.ACCOUNTS)) {
    const a = await getJSON(V.ACCOUNTS, key);
    if (a?.ghostHandle) map.set(String(a.ghostHandle).toLowerCase(), { email: key, account: a });
  }
  handleCache = { at: Date.now(), map };
  return map;
}

// =====================================================================
// ミュート（端末をまたいで同じ設定にするためサーバーに保存。絞り込みは端末側）
// =====================================================================
function cleanMutes(input) {
  const list = (v, max, len) => Array.from(new Set((Array.isArray(v) ? v : []).map((x) => String(x || '').trim().toLowerCase().slice(0, len)).filter(Boolean))).slice(0, max);
  return { users: list(input?.users, 300, 120), words: list(input?.words, 200, 60) };
}

// =====================================================================
// Ghostストーリー（24時間で消える）
// =====================================================================
const STORY_TTL = 24 * 3600 * 1000;
async function listStories(viewer) {
  const now = Date.now();
  const byAuthor = new Map();
  for (const key of await listKeys(S.STORIES)) {
    const s = await getJSON(S.STORIES, key);
    if (!s || s.expiresAt < now) continue;
    if (!byAuthor.has(s.authorEmail)) byAuthor.set(s.authorEmail, []);
    byAuthor.get(s.authorEmail).push(s);
  }
  const authors = [];
  for (const [email, items] of byAuthor) {
    const account = await getJSON(V.ACCOUNTS, email);
    items.sort((a, b) => a.createdAt - b.createdAt);
    // 大きすぎるアイコン・動画のアイコンは送らない（転送量の節約）
    let avatar = account?.ghostAvatarUrl || account?.avatarDataUrl || null;
    if (avatar && (avatar.length > 200000 || /^data:video/.test(avatar))) avatar = null;
    authors.push({
      mine: email === viewer.email,
      name: account?.ghostName || account?.displayName || email.split('@')[0],
      handle: account?.ghostHandle || null,
      avatarUrl: avatar,
      latestAt: items[items.length - 1].createdAt,
      stories: items.map((s) => ({ id: s.id, text: s.text, bg: s.bg, imageUrl: s.imageDataUrl || null, createdAt: s.createdAt, expiresAt: s.expiresAt, seen: (s.viewers || []).includes(viewer.email), views: email === viewer.email ? (s.viewers || []).length : undefined }))
    });
  }
  authors.sort((a, b) => (b.mine - a.mine) || (a.stories.every((s) => s.seen) - b.stories.every((s) => s.seen)) || (b.latestAt - a.latestAt));
  return authors;
}
async function storyBackground(email, payload) {
  const item = String(payload.bgItem || '');
  if (item) {
    const owned = ((await getJSON(S.PROFILE, email)) || {}).owned || [];
    const found = SHOP_BY_ID[item];
    if (found && found.type === 'storyBg' && owned.includes(item)) return found.preview;
  }
  return COLOR_RE.test(String(payload.bg || '')) ? payload.bg : '#5b3dff';
}

// =====================================================================
// Ghostの投票・リアクション
// =====================================================================
async function pollView(postId, email) {
  const poll = await getJSON(S.POLLS, postId);
  if (!poll) return null;
  const me = voterHash(email);
  const counts = poll.options.map((o) => Object.values(poll.votes || {}).filter((v) => v === o.id).length);
  return { question: poll.question || '', options: poll.options.map((o, i) => ({ id: o.id, label: o.label, count: counts[i] })), total: counts.reduce((a, b) => a + b, 0), myVote: (poll.votes || {})[me] || null, endsAt: poll.endsAt || null, ended: Boolean(poll.endsAt && Date.now() > poll.endsAt), mine: poll.ownerEmail === email };
}
function cleanPoll(input) {
  const options = Array.from(new Set((Array.isArray(input?.options) ? input.options : []).map((x) => String(x || '').trim().slice(0, 60)).filter(Boolean))).slice(0, 4);
  if (options.length < 2) return null;
  const hours = Math.max(1, Math.min(24 * 14, Number(input?.hours) || 24));
  return { question: String(input?.question || '').trim().slice(0, 120), options: options.map((label, i) => ({ id: `o${i}`, label })), votes: {}, endsAt: Date.now() + hours * 3600000 };
}
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];
async function reactionView(target, me) {
  const r = (await getJSON(S.REACTIONS, target)) || {};
  const counts = {}; const mine = [];
  for (const e of EMOJIS) { const list = r[e] || []; if (list.length) counts[e] = list.length; if (list.includes(me)) mine.push(e); }
  return { counts, mine };
}

// =====================================================================
// おすすめユーザー（10分覚えておく）
// =====================================================================
const recommendCache = new Map();
async function recommendUsers(email) {
  const cached = recommendCache.get(email);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.users;
  const accounts = {};
  for (const key of await listKeys(V.ACCOUNTS)) { const a = await getJSON(V.ACCOUNTS, key); if (a) accounts[key] = a; }
  const following = new Set(Array.isArray(accounts[email]?.ghostFollowing) ? accounts[email].ghostFollowing : []);
  const myTags = new Set(); const tagsBy = {}; const lastPost = {};
  for (const key of await listKeys(V.GHOST_POSTS)) {
    if (key.includes(':')) continue;
    const p = await getJSON(V.GHOST_POSTS, key);
    if (!p || p.deleted) continue;
    const t = (p.tags || []).map((x) => String(x).toLowerCase());
    if (p.authorEmail === email) t.forEach((x) => myTags.add(x));
    (tagsBy[p.authorEmail] ||= new Set()); t.forEach((x) => tagsBy[p.authorEmail].add(x));
    lastPost[p.authorEmail] = Math.max(lastPost[p.authorEmail] || 0, Date.parse(p.createdAt) || 0);
  }
  const scored = [];
  for (const [key, a] of Object.entries(accounts)) {
    if (key === email || following.has(key) || !a.ghostHandle) continue;
    let score = 0; const reasons = [];
    const mutual = [...following].filter((f) => Array.isArray(accounts[f]?.ghostFollowing) && accounts[f].ghostFollowing.includes(key)).length;
    if (mutual) { score += mutual * 3; reasons.push(`フォロー中の${mutual}人がフォロー`); }
    const shared = [...(tagsBy[key] || [])].filter((t) => myTags.has(t));
    if (shared.length) { score += shared.length * 2; reasons.push(`#${shared[0]} などの共通タグ`); }
    if (Array.isArray(a.ghostFollowing) && a.ghostFollowing.includes(email)) { score += 4; reasons.push('あなたをフォローしています'); }
    if (lastPost[key] && Date.now() - lastPost[key] < 14 * 86400000) { score += 1; if (!reasons.length) reasons.push('最近よく投稿しています'); }
    let avatar = a.ghostAvatarUrl || null;
    if (avatar && avatar.length > 200000) avatar = null;
    if (score > 0) scored.push({ handle: a.ghostHandle, name: a.ghostName || a.displayName || a.ghostHandle, avatarUrl: avatar, reason: reasons[0], score });
  }
  scored.sort((x, y) => y.score - x.score);
  const users = scored.slice(0, 8);
  recommendCache.set(email, { at: Date.now(), users });
  return users;
}

// =====================================================================
// 音声メッセージの文字起こし（Gemini。結果はサーバーに保存しない）
// =====================================================================
async function geminiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  const configured = await getJSON(V.ADMIN_SECRETS, 'gemini:apiKeys');
  const rows = Array.isArray(configured) ? configured : Array.isArray(configured?.keys) ? configured.keys : configured?.apiKey ? [configured] : [];
  for (const row of rows.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))) if (row?.apiKey && row.enabled !== false) keys.push(String(row.apiKey).trim());
  const legacy = await getJSON(V.ADMIN_SECRETS, 'gemini:apiKey');
  if (!rows.length && legacy?.apiKey) keys.push(String(legacy.apiKey));
  return keys;
}
async function transcribe(fileId, info) {
  const manifest = await getJSON(V.FILE_MANIFESTS, `${fileId}:manifest`) || await getJSON(V.FILE_MANIFESTS, fileId);
  if (!manifest) throw Object.assign(new Error('音声ファイルが見つかりません'), { status: 404 });
  const mime = String(manifest.mimeType || manifest.type || 'audio/webm');
  if (!/^audio\/|^video\/webm/.test(mime)) throw Object.assign(new Error('音声ファイルではありません'), { status: 400 });
  // 自分が送ったもの、または送った人と同じルームにいるときだけ
  let allowed = manifest.ownerEmail === info.email || isOperator(info);
  if (!allowed) {
    for (const key of await listKeys(V.POCKET_ROOMS)) {
      const room = await getJSON(V.POCKET_ROOMS, key);
      const members = (room && room.memberEmails) || [];
      if (members.includes(info.email) && members.includes(manifest.ownerEmail)) { allowed = true; break; }
    }
  }
  if (!allowed) throw Object.assign(new Error('この音声は文字起こしできません'), { status: 403 });
  const parts = []; let size = 0;
  for (let i = 0; i < Number(manifest.totalChunks || 0); i += 1) {
    const c = await getJSON(V.FILE_CHUNKS, `${fileId}:chunk:${i}`);
    if (!c) throw Object.assign(new Error('音声データが欠けています'), { status: 404 });
    const buf = Buffer.from(String(c.data || c).replace(/^data:[^,]*,/, ''), 'base64');
    size += buf.length; parts.push(buf);
    if (size > 15 * 1024 * 1024) throw Object.assign(new Error('音声が長すぎます（15MBまで）'), { status: 400 });
  }
  const body = { contents: [{ role: 'user', parts: [
    { inline_data: { mime_type: mime.split(';')[0], data: Buffer.concat(parts).toString('base64') } },
    { text: 'この音声を日本語で文字起こししてください。話し言葉のまま、句読点を付けて、本文だけを返してください。聞き取れない部分は（聞き取れず）としてください。' }
  ] }], generationConfig: { temperature: 0.1 } };
  let lastError = 'Gemini の APIキーが設定されていません';
  for (const key of await geminiKeys()) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { lastError = data?.error?.message || `Gemini ${r.status}`; continue; }
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      return text || '（文字起こしできる音声がありませんでした）';
    } catch (e) { lastError = e.message; }
  }
  throw Object.assign(new Error(lastError), { status: 502 });
}

// =====================================================================
// 1時間ごとの定期処理: 期限切れのストーリー・引き継ぎを消す / 返信リマインド
// =====================================================================
async function cleanup() {
  const now = Date.now();
  for (const key of await listKeys(S.STORIES)) { const s = await getJSON(S.STORIES, key); if (!s || s.expiresAt < now) await deleteKey(S.STORIES, key); }
  for (const key of await listKeys(S.TRANSFER)) { const t = await getJSON(S.TRANSFER, key); if (!t || t.expiresAt < now) await deleteKey(S.TRANSFER, key); }
}
async function replyReminders() {
  const now = Date.now();
  let sent = 0;
  for (const key of await listKeys(V.POCKET_ROOMS)) {
    const room = await getJSON(V.POCKET_ROOMS, key);
    if (!room || room.type !== 'dm' || !Array.isArray(room.messages) || !room.messages.length) continue;
    const last = room.messages.filter((m) => !m.deleted && !m.isBot).slice(-1)[0];
    if (!last) continue;
    const age = now - Date.parse(last.createdAt);
    if (age < 20 * 3600000 || age > 72 * 3600000) continue; // 20時間〜3日のあいだだけ
    for (const email of room.memberEmails || []) {
      if (email === last.authorEmail) continue;
      const rk = `${email}:${room.id}`;
      const done = await getJSON(S.REMIND, rk);
      if (done && done.messageId === last.id) continue;
      if (((await getJSON(S.PROFILE, email)) || {}).replyReminder === false) continue;
      const acc = await getJSON(V.ACCOUNTS, last.authorEmail);
      await addNotification(email, { type: 'chatReminder', title: `${room.nicknames?.[last.authorEmail] || acc?.displayName || 'だれか'} さんへの返信を忘れていませんか？`, body: 'ぽけっとのメッセージにまだ返信していません', url: `/Pocket/room.html?id=${encodeURIComponent(room.id)}` });
      await setJSON(S.REMIND, rk, { messageId: last.id, at: now });
      sent += 1;
    }
  }
  return sent;
}

export async function plusCron(request, env) {
  if (!env.CRON_SECRET || request.headers.get('x-cron-secret') !== env.CRON_SECRET) return reply(403, { error: 'forbidden' });
  await cleanup();
  return reply(200, { ok: true, reminders: await replyReminders() });
}

// =====================================================================
// API本体（POST {action, token, ...} / GET ?action=announcement）
// =====================================================================
export async function plusApi(request) {
  let p = {};
  if (request.method === 'POST') { try { p = await request.json(); } catch (_) { return reply(400, { error: '不正なリクエストです' }); } }
  else p = Object.fromEntries(new URL(request.url).searchParams);
  const action = String(p.action || '');
  try {
    return await handle(action, p);
  } catch (e) {
    console.error('[plus]', action, e?.stack || e);
    return reply(e.status || 500, { error: String(e?.message || e).slice(0, 300) });
  }
}

async function handle(action, p) {
  // ---- ログイン不要 ----
  if (action === 'announcement') return reply(200, { announcement: await getAnnouncement() });
  if (action === 'publicProfile') {
    // Ghost のプロフィールに出すヘッダー画像・色・リンク・バッジ・装飾
    const hit = (await accountsByHandle()).get(String(p.handle || '').trim().toLowerCase().replace(/^@/, ''));
    if (!hit) return reply(200, { extras: null });
    const { replyReminder, ...extras } = await profileExtras(hit.email);
    return reply(200, { extras });
  }
  if (action === 'transferPeek' || action === 'transferClaim') {
    // QRで別の端末にログイン: 新しい端末がQRのコードを使う（1回だけ・10分以内）
    const id = String(p.id || '').replace(/[^a-f0-9]/g, '');
    const t = id ? await getJSON(S.TRANSFER, id) : null;
    if (!t || t.expiresAt < Date.now()) return reply(404, { error: 'QRコードの有効期限が切れたか、見つかりません。元の端末でもう一度QRコードを作ってください。' });
    const account = await getJSON(V.ACCOUNTS, t.email);
    if (!account) return reply(404, { error: 'アカウントが見つかりません' });
    const who = { displayName: account.displayName || t.email.split('@')[0], email: t.email.replace(/^(.).*(@.*)$/, '$1***$2') };
    if (action === 'transferPeek') return reply(200, who);
    await deleteKey(S.TRANSFER, id);
    const token = crypto.randomBytes(32).toString('hex');
    await setJSON(V.SESSIONS, token, {
      email: t.email, sessionId: newId(12), deviceLabel: `${String(p.device || 'QRでログインした端末').slice(0, 100)}（QR）`,
      userAgent: String(p.userAgent || '').slice(0, 300), createdAt: new Date().toISOString(), lastSeenAt: Date.now(),
      expiresAt: Date.now() + 14 * 24 * 3600 * 1000
    });
    return reply(200, {
      email: t.email, token, age: ageOf(account.birthDate) ?? account.age ?? null, hasBirthDate: Boolean(account.birthDate),
      displayName: account.displayName || t.email.split('@')[0], isAdmin: account.isAdmin === true, isDeputyAdmin: account.isDeputyAdmin === true, isOfficial: account.isOfficial === true
    });
  }

  const info = await sessionInfo(p.token);
  if (!info) return reply(401, { error: 'ログインが必要です' });
  const email = info.email;
  const me = voterHash(email);

  // ---- お知らせ・運営 ----
  if (action === 'setAnnouncement') {
    if (!isOperator(info)) return reply(403, { error: '運営のみ操作できます' });
    const text = String(p.text || '').trim().slice(0, 300);
    if (!text) { await deleteKey(V.SITE_STATE, 'plus-announcement'); return reply(200, { announcement: null }); }
    const hours = Math.max(0, Math.min(24 * 60, Number(p.hours) || 0));
    await setJSON(V.SITE_STATE, 'plus-announcement', {
      id: newId(6), text, level: ['info', 'warning', 'danger', 'success'].includes(p.level) ? p.level : 'info', link: /^(https?:\/\/|\/)/.test(String(p.link || '')) ? String(p.link).slice(0, 300) : '',
      createdAt: new Date().toISOString(), createdBy: email, expiresAt: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null
    });
    return reply(200, { announcement: await getAnnouncement() });
  }
  if (action === 'adminStats') {
    if (!isOperator(info)) return reply(403, { error: '運営のみ閲覧できます' });
    return reply(200, await adminStats());
  }
  if (action === 'sendWarning') {
    if (!isOperator(info)) return reply(403, { error: '運営のみ送れます' });
    const target = String(p.email || '').trim().toLowerCase();
    if (!(await getJSON(V.ACCOUNTS, target))) return reply(404, { error: 'アカウントが見つかりません' });
    const w = { id: newId(6), to: target, from: email, level: ['notice', 'warning', 'final'].includes(p.level) ? p.level : 'warning', title: String(p.title || '運営からのお知らせ').slice(0, 80), body: String(p.body || '').trim().slice(0, 2000), createdAt: new Date().toISOString(), ackAt: null };
    if (!w.body) return reply(400, { error: '本文を入れてください' });
    await setJSON(S.WARNINGS, `${target}:${w.id}`, w);
    await addNotification(target, { type: 'adminWarning', title: `運営より: ${w.title}`, body: '内容を確認してください', url: '/' });
    return reply(200, { ok: true, warning: w });
  }
  if (action === 'warningsSent') {
    if (!isOperator(info)) return reply(403, { error: '運営のみ閲覧できます' });
    const items = [];
    for (const key of await listKeys(S.WARNINGS)) { const w = await getJSON(S.WARNINGS, key); if (w) items.push(w); }
    items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return reply(200, { items: items.slice(0, 50) });
  }
  if (action === 'myWarnings') {
    const items = [];
    for (const key of await listKeys(S.WARNINGS, `${email}:`)) { const w = await getJSON(S.WARNINGS, key); if (w && !w.ackAt) items.push({ id: w.id, level: w.level, title: w.title, body: w.body, createdAt: w.createdAt }); }
    return reply(200, { items });
  }
  if (action === 'ackWarning') {
    const key = `${email}:${String(p.id || '').replace(/[^a-f0-9]/g, '')}`;
    const w = await getJSON(S.WARNINGS, key);
    if (w && !w.ackAt) { w.ackAt = new Date().toISOString(); await setJSON(S.WARNINGS, key, w); }
    return reply(200, { ok: true });
  }

  // ---- QRで別の端末にログイン（元の端末がコードを作る） ----
  if (action === 'transferCreate') {
    const id = newId(16);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await setJSON(S.TRANSFER, id, { email, createdAt: new Date().toISOString(), expiresAt });
    return reply(200, { id, expiresAt });
  }
  if (action === 'transferCancel') {
    const id = String(p.id || '').replace(/[^a-f0-9]/g, '');
    const t = id ? await getJSON(S.TRANSFER, id) : null;
    if (t && t.email === email) await deleteKey(S.TRANSFER, id);
    return reply(200, { ok: true });
  }

  // ---- ミュート ----
  if (action === 'getMutes') return reply(200, { mutes: cleanMutes(await getJSON(S.MUTES, email)) });
  if (action === 'saveMutes') { const mutes = cleanMutes(p.mutes); await setJSON(S.MUTES, email, mutes); return reply(200, { mutes }); }

  // ---- プロフィールの装飾 ----
  if (action === 'getProfileExtras') return reply(200, { extras: await profileExtras(email) });
  if (action === 'saveProfileExtras') {
    const current = (await getJSON(S.PROFILE, email)) || {};
    if (p.headerDataUrl !== undefined) {
      const h = p.headerDataUrl ? String(p.headerDataUrl) : '';
      if (h && (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(h) || h.length > 1600000)) return reply(400, { error: 'ヘッダー画像はPNG/JPEG/WebP/GIFで、約1.2MB以下にしてください' });
      current.headerDataUrl = h || null;
    }
    if (p.color !== undefined) current.color = COLOR_RE.test(String(p.color)) ? String(p.color) : null;
    if (p.link !== undefined) { const l = String(p.link || '').trim().slice(0, 200); current.link = /^https?:\/\//.test(l) ? l : ''; }
    if (p.replyReminder !== undefined) current.replyReminder = p.replyReminder !== false;
    current.updatedAt = new Date().toISOString();
    await setJSON(S.PROFILE, email, current);
    return reply(200, { extras: await profileExtras(email) });
  }
  // Ghost のハンドルごとの装飾（枠・名前の色・称号）とバッジ
  if (action === 'cosmetics') {
    const handles = String(p.handles || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9_.-]{1,40}$/.test(x)).slice(0, 60);
    const map = await accountsByHandle();
    const out = {};
    for (const h of handles) { const hit = map.get(h); if (hit) out[h] = await cosmeticsOf(hit.email); }
    return reply(200, { cosmetics: out });
  }

  // ---- ログインボーナス・デイリーミッション ----
  if (action === 'daily') return reply(200, dailyView(await getDaily(email)));
  if (action === 'missionDone') {
    // 投稿したときに画面から呼ぶ（その日のうちに受け取れる報酬は決まっているので、確認はゆるくてよい）
    const id = String(p.id || '');
    if (!MISSIONS.some((m) => m.id === id)) return reply(400, { error: '不明なミッションです' });
    const rec = await getDaily(email);
    if (!rec.missions.done[id]) { rec.missions.done[id] = true; await setJSON(S.DAILY, email, rec); }
    return reply(200, dailyView(rec));
  }
  if (action === 'claimDaily') {
    const rec = await getDaily(email);
    const view = dailyView(rec);
    if (view.claimedToday) return reply(200, { ...view, already: true });
    rec.streak = view.nextStreak; rec.lastClaimDay = view.today; rec.totalDays = (rec.totalDays || 0) + 1;
    await setJSON(S.DAILY, email, rec);
    const balance = await addCoins(email, view.bonus);
    return reply(200, { ...dailyView(rec), claimed: view.bonus, balance });
  }
  if (action === 'claimMission') {
    const rec = await getDaily(email);
    const id = String(p.id || '');
    let reward = 0;
    if (id === 'all') {
      if (MISSIONS.every((m) => rec.missions.claimed[m.id]) && !rec.missions.allClaimed) { rec.missions.allClaimed = true; reward = ALL_MISSIONS_BONUS; }
    } else {
      const m = MISSIONS.find((x) => x.id === id);
      if (m && rec.missions.done[id] && !rec.missions.claimed[id]) { rec.missions.claimed[id] = true; reward = m.reward; }
    }
    if (!reward) return reply(400, { error: 'まだ受け取れません' });
    await setJSON(S.DAILY, email, rec);
    const balance = await addCoins(email, reward);
    return reply(200, { ...dailyView(rec), claimed: reward, balance });
  }

  // ---- Coinショップ ----
  if (action === 'shop') {
    const prof = (await getJSON(S.PROFILE, email)) || {};
    return reply(200, { items: SHOP, owned: prof.owned || [], equipped: prof.equipped || {}, balance: Number(await getJSON(V.COINS, email)) || 0 });
  }
  if (action === 'buy') {
    const item = SHOP_BY_ID[String(p.id || '')];
    if (!item) return reply(404, { error: '商品が見つかりません' });
    const prof = (await getJSON(S.PROFILE, email)) || {};
    prof.owned = prof.owned || [];
    if (prof.owned.includes(item.id)) return reply(400, { error: 'すでに持っています' });
    const balance = Number(await getJSON(V.COINS, email)) || 0;
    if (balance < item.price) return reply(400, { error: `Coinが足りません（あと ${item.price - balance} Coin）` });
    await setJSON(V.COINS, email, balance - item.price);
    prof.owned.push(item.id);
    prof.equipped = { ...(prof.equipped || {}), [item.type]: item.id };
    await setJSON(S.PROFILE, email, prof);
    return reply(200, { owned: prof.owned, equipped: prof.equipped, balance: balance - item.price });
  }
  if (action === 'equip') {
    const prof = (await getJSON(S.PROFILE, email)) || {};
    const type = String(p.type || '');
    if (!['frame', 'nameColor', 'title', 'storyBg'].includes(type)) return reply(400, { error: '不正な種類です' });
    const id = p.id ? String(p.id) : null;
    if (id && (!(prof.owned || []).includes(id) || SHOP_BY_ID[id]?.type !== type)) return reply(400, { error: '持っていないアイテムです' });
    prof.equipped = { ...(prof.equipped || {}), [type]: id };
    await setJSON(S.PROFILE, email, prof);
    return reply(200, { equipped: prof.equipped });
  }

  // ---- Ghostストーリー（13歳以上） ----
  if (action === 'stories') {
    if (!(info.age >= 13)) return reply(200, { authors: [], ageLimited: true });
    return reply(200, { authors: await listStories(info) });
  }
  if (action === 'createStory') {
    if (!(info.age >= 13)) return reply(403, { error: 'ストーリーは13歳以上で利用できます' });
    const text = String(p.text || '').trim().slice(0, 200);
    const image = p.imageDataUrl ? String(p.imageDataUrl) : '';
    if (image && (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image) || image.length > 2400000)) return reply(400, { error: '画像はPNG/JPEG/WebP/GIFで、約1.8MB以下にしてください' });
    if (!text && !image) return reply(400, { error: '文字か画像を入れてください' });
    if ((await listKeys(S.STORIES, `${email}:`)).length >= 20) return reply(400, { error: 'ストーリーは同時に20件までです' });
    const now = Date.now();
    const story = { id: newId(8), authorEmail: email, text, imageDataUrl: image || null, bg: await storyBackground(email, p), createdAt: now, expiresAt: now + STORY_TTL, viewers: [] };
    await setJSON(S.STORIES, `${email}:${story.id}`, story);
    return reply(201, { ok: true, id: story.id });
  }
  if (action === 'viewStory' || action === 'deleteStory') {
    const id = String(p.id || '').replace(/[^a-f0-9]/g, '');
    const key = id ? (await listKeys(S.STORIES)).find((k) => k.endsWith(`:${id}`)) : null;
    const story = key ? await getJSON(S.STORIES, key) : null;
    if (!story) return reply(404, { error: 'ストーリーが見つかりません' });
    if (action === 'deleteStory') {
      if (story.authorEmail !== email && !isOperator(info)) return reply(403, { error: '削除できません' });
      await deleteKey(S.STORIES, key);
      return reply(200, { ok: true });
    }
    if (story.authorEmail !== email && !(story.viewers || []).includes(email)) { story.viewers = [...(story.viewers || []), email].slice(-2000); await setJSON(S.STORIES, key, story); }
    return reply(200, { ok: true });
  }

  // ---- Ghostの投票・リアクション ----
  if (action === 'createPoll') {
    const post = await getJSON(V.GHOST_POSTS, String(p.postId || ''));
    if (!post || post.authorEmail !== email) return reply(403, { error: '自分の投稿にだけ投票を付けられます' });
    const poll = cleanPoll(p.poll);
    if (!poll) return reply(400, { error: '選択肢を2〜4個入れてください' });
    await setJSON(S.POLLS, post.id, { ...poll, ownerEmail: email });
    return reply(200, { poll: await pollView(post.id, email) });
  }
  if (action === 'deletePoll') {
    const poll = await getJSON(S.POLLS, String(p.postId || ''));
    if (poll && (poll.ownerEmail === email || isOperator(info))) await deleteKey(S.POLLS, String(p.postId));
    return reply(200, { ok: true });
  }
  if (action === 'votePoll') {
    const poll = await getJSON(S.POLLS, String(p.postId || ''));
    if (!poll) return reply(404, { error: '投票が見つかりません' });
    if (poll.endsAt && Date.now() > poll.endsAt) return reply(400, { error: 'この投票は終了しました' });
    const opt = poll.options.find((o) => o.id === p.optionId);
    if (!opt) return reply(400, { error: '選択肢が見つかりません' });
    poll.votes = poll.votes || {};
    if (poll.votes[me] === opt.id) delete poll.votes[me]; else poll.votes[me] = opt.id; // 同じものを押すと取り消し
    await setJSON(S.POLLS, String(p.postId), poll);
    return reply(200, { poll: await pollView(String(p.postId), email) });
  }
  if (action === 'postExtras') {
    const ids = String(p.postIds || '').split(',').filter((x) => /^[A-Za-z0-9_-]{4,40}$/.test(x)).slice(0, 60);
    const out = { polls: {}, reactions: {} };
    await Promise.all(ids.map(async (id) => {
      const poll = await pollView(id, email); if (poll) out.polls[id] = poll;
      out.reactions[id] = await reactionView(`post:${id}`, me);
    }));
    return reply(200, { ...out, emojis: EMOJIS });
  }
  if (action === 'react') {
    const id = String(p.postId || '');
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return reply(400, { error: '不正な対象です' });
    const emoji = String(p.emoji || '');
    if (!EMOJIS.includes(emoji)) return reply(400, { error: '使えないリアクションです' });
    const target = `post:${id}`;
    const r = (await getJSON(S.REACTIONS, target)) || {};
    const list = r[emoji] || [];
    r[emoji] = list.includes(me) ? list.filter((x) => x !== me) : [...list, me];
    await setJSON(S.REACTIONS, target, r);
    return reply(200, { postId: id, ...(await reactionView(target, me)) });
  }
  if (action === 'recommendUsers') return reply(200, { users: await recommendUsers(email) });

  // ---- ブックマークのメモ（本人だけ） ----
  if (action === 'notes') return reply(200, { notes: (await getJSON(S.NOTES, email)) || {} });
  if (action === 'saveNote') {
    const notes = (await getJSON(S.NOTES, email)) || {};
    const id = String(p.postId || '');
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return reply(400, { error: '不正な投稿です' });
    const text = String(p.note || '').trim().slice(0, 500);
    if (text) notes[id] = { text, at: Date.now() }; else delete notes[id];
    await setJSON(S.NOTES, email, notes);
    return reply(200, { notes });
  }

  // ---- 音声の文字起こし ----
  if (action === 'transcribe') return reply(200, { text: await transcribe(String(p.fileId || '').replace(/[^A-Za-z0-9_-]/g, ''), info) });

  return reply(400, { error: '不明な操作です' });
}
