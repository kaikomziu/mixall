// server/plus2.js
// MixAll+ 第2弾の機能（mixall-api/plus の追加アクション）:
//   3 Ghostの投票 / 4 リアクション / 5 フォロー中 / 6 おすすめユーザー / 9 Coinショップ /
//   13 予約投稿 / 14 ブックマークのメモ / 15 返信リマインド / 17 音声の文字起こし / 20 運営からの警告
const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../netlify/lib/store');

const S = {
  POLLS: 'mixall-polls',
  REACTIONS: 'mixall-reactions',
  SHOP: 'mixall-shop',
  SCHEDULED: 'mixall-scheduled-posts',
  NOTES: 'mixall-bookmark-notes',
  REMIND: 'mixall-reply-reminders',
  WARNINGS: 'mixall-warnings',
  PROFILE: 'mixall-profile-extras'
};
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const newId = (n = 8) => crypto.randomBytes(n).toString('hex');
// 投票・リアクションは「誰が押したか」を保存せず、アカウントごとの短いハッシュだけを持つ
const voterHash = (email) => crypto.createHmac('sha256', process.env.UCH_ID_SECRET || 'mixall-plus-voter').update(String(email)).digest('hex').slice(0, 16);
const isOperator = (info) => Boolean(info && (info.isAdmin || info.isDeputyAdmin || info.isOperator));

// =====================================================================
// 3. 投票
// =====================================================================
async function pollView(postId, email) {
  const poll = await getJSON(S.POLLS, postId);
  if (!poll) return null;
  const me = voterHash(email);
  const counts = poll.options.map((o) => Object.values(poll.votes || {}).filter((v) => v === o.id).length);
  const ended = poll.endsAt && Date.now() > poll.endsAt;
  return { question: poll.question || '', options: poll.options.map((o, i) => ({ id: o.id, label: o.label, count: counts[i] })), total: counts.reduce((a, b) => a + b, 0), myVote: (poll.votes || {})[me] || null, endsAt: poll.endsAt || null, ended: Boolean(ended) };
}
function cleanPoll(input) {
  const options = Array.from(new Set((Array.isArray(input?.options) ? input.options : []).map((x) => String(x || '').trim().slice(0, 60)).filter(Boolean))).slice(0, 4);
  if (options.length < 2) return null;
  const hours = Math.max(1, Math.min(24 * 14, Number(input?.hours) || 24));
  return { question: String(input?.question || '').trim().slice(0, 120), options: options.map((label, i) => ({ id: `o${i}`, label })), votes: {}, endsAt: Date.now() + hours * 3600000 };
}

// =====================================================================
// 4. リアクション
// =====================================================================
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];
async function reactionView(target, me) {
  const r = (await getJSON(S.REACTIONS, target)) || {};
  const counts = {}; const mine = [];
  for (const e of EMOJIS) { const list = r[e] || []; if (list.length) counts[e] = list.length; if (list.includes(me)) mine.push(e); }
  return { counts, mine };
}

// =====================================================================
// 9. Coinショップ
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
  const p = (await getJSON(S.PROFILE, email)) || {};
  const eq = p.equipped || {};
  const pick = (id) => (id && SHOP_BY_ID[id] ? SHOP_BY_ID[id] : null);
  return { frame: pick(eq.frame)?.preview || null, nameColor: pick(eq.nameColor)?.preview || null, title: pick(eq.title)?.label || null };
}

// =====================================================================
// 13. 予約投稿（1分ごとの定期処理から公開する）
// =====================================================================
// いちばん早い予約投稿の公開時刻（定期実行を眠らせる目安）
async function nextScheduledAt() {
  let best = null;
  for (const k of await listKeys(S.SCHEDULED)) { const job = await getJSON(S.SCHEDULED, k); if (job && Number(job.at) && (!best || job.at < best)) best = Number(job.at); }
  return best;
}

async function publishScheduled() {
  const now = Date.now();
  const keys = await listKeys(S.SCHEDULED);
  let published = 0;
  for (const key of keys) {
    const job = await getJSON(S.SCHEDULED, key);
    if (!job || job.at > now) continue;
    await deleteKey(S.SCHEDULED, key); // 二重公開を防ぐため先に消す
    // その人の権限で投稿するため、短時間だけ使える内部用のログインを作る
    const token = crypto.randomBytes(32).toString('hex');
    await setJSON(STORE_NAMES.SESSIONS, token, { email: job.email, sessionId: `scheduled-${newId(4)}`, createdAt: now, lastSeenAt: now, presenceAt: now, expiresAt: now + 5 * 60 * 1000, device: { label: '予約投稿' } });
    try {
      const ghost = require('../netlify/functions/ghost');
      const res = await ghost.handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {}, body: JSON.stringify({ ...job.payload, action: 'createPost', token }) });
      const data = JSON.parse(res.body || '{}');
      if (res.statusCode < 300 && data.post) {
        published += 1;
        if (job.poll) { const poll = cleanPoll(job.poll); if (poll) await setJSON(S.POLLS, data.post.id, { ...poll, ownerEmail: job.email }); }
        const { addNotification } = require('../netlify/lib/notifications');
        await addNotification(job.email, { type: 'scheduledPublished', title: '予約投稿を公開しました', body: String(job.payload.title || job.payload.text || '').slice(0, 80), url: `/Ghost/post.html?id=${encodeURIComponent(data.post.id)}` });
      } else {
        const { addNotification } = require('../netlify/lib/notifications');
        await addNotification(job.email, { type: 'scheduledFailed', title: '予約投稿を公開できませんでした', body: data.error || '不明なエラー', url: '/Ghost/compose.html' });
      }
    } finally { await deleteKey(STORE_NAMES.SESSIONS, token); }
  }
  return published;
}

// =====================================================================
// 15. 返信していないチャットのリマインド（1時間ごと）
// =====================================================================
async function replyReminders() {
  const now = Date.now();
  let sent = 0;
  const { addNotification } = require('../netlify/lib/notifications');
  for (const key of await listKeys(STORE_NAMES.POCKET_ROOMS)) {
    const room = await getJSON(STORE_NAMES.POCKET_ROOMS, key);
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
      const setting = (await getJSON(S.PROFILE, email)) || {};
      if (setting.replyReminder === false) continue;
      const acc = await getJSON(STORE_NAMES.ACCOUNTS, last.authorEmail);
      await addNotification(email, { type: 'chatReminder', title: `${room.nicknames?.[last.authorEmail] || acc?.displayName || 'だれか'} さんへの返信を忘れていませんか？`, body: 'ぽけっとのメッセージにまだ返信していません', url: `/Pocket/room.html?id=${encodeURIComponent(room.id)}`, scope: `pocket:${room.id}` });
      await setJSON(S.REMIND, rk, { messageId: last.id, at: now });
      sent += 1;
    }
  }
  return sent;
}

// =====================================================================
// 17. 音声メッセージの文字起こし（Gemini。結果はサーバーに保存しない）
// =====================================================================
async function transcribe(fileId, info) {
  const manifest = await getJSON(STORE_NAMES.FILE_MANIFESTS, `${fileId}:manifest`);
  if (!manifest || !manifest.finalized) throw Object.assign(new Error('音声ファイルが見つかりません'), { status: 404 });
  const mime = String(manifest.mimeType || 'audio/webm');
  if (!/^audio\/|^video\/webm/.test(mime)) throw Object.assign(new Error('音声ファイルではありません'), { status: 400 });
  // 自分が参加しているルームの添付だけ許す
  let allowed = manifest.ownerEmail === info.email || isOperator(info);
  if (!allowed) {
    for (const key of await listKeys(STORE_NAMES.POCKET_ROOMS)) {
      const room = await getJSON(STORE_NAMES.POCKET_ROOMS, key);
      if (room && (room.memberEmails || []).includes(info.email) && (room.messages || []).some((m) => m.attachmentFileId === fileId || m.fileId === fileId)) { allowed = true; break; }
      if (room && (room.memberEmails || []).includes(info.email) && (room.memberEmails || []).includes(manifest.ownerEmail)) { allowed = true; break; }
    }
  }
  if (!allowed) throw Object.assign(new Error('この音声は文字起こしできません'), { status: 403 });
  const parts = [];
  let size = 0;
  for (let i = 0; i < Number(manifest.totalChunks || 0); i += 1) {
    const c = await getJSON(STORE_NAMES.FILE_CHUNKS, `${fileId}:chunk:${i}`);
    if (!c) throw Object.assign(new Error('音声データが欠けています'), { status: 404 });
    const buf = Buffer.from(String(c.data).replace(/^data:[^,]*,/, ''), 'base64');
    size += buf.length; parts.push(buf);
    if (size > 15 * 1024 * 1024) throw Object.assign(new Error('音声が長すぎます（15MBまで）'), { status: 400 });
  }
  const { callGemini } = require('../netlify/lib/gemini');
  const result = await callGemini({
    model: 'gemini-2.5-flash',
    timeoutMs: 60000,
    body: { contents: [{ role: 'user', parts: [
      { inline_data: { mime_type: mime.split(';')[0], data: Buffer.concat(parts).toString('base64') } },
      { text: 'この音声を日本語で文字起こししてください。話し言葉のまま、句読点を付けて、本文だけを返してください。聞き取れない部分は（聞き取れず）としてください。' }
    ] }], generationConfig: { temperature: 0.1 } }
  });
  if (!result.ok) throw Object.assign(new Error(result.error || '文字起こしに失敗しました'), { status: 502 });
  const text = (result.data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return text || '（文字起こしできる音声がありませんでした）';
}

// =====================================================================
// アクション
// =====================================================================
async function handle(action, payload, info) {
  const email = info.email;
  const me = voterHash(email);

  // ---- 3. 投票 ----
  if (action === 'createPoll') {
    const post = await getJSON(STORE_NAMES.GHOST_POSTS, String(payload.postId || ''));
    if (!post || post.authorEmail !== email) return json(403, { error: '自分の投稿にだけ投票を付けられます' });
    const poll = cleanPoll(payload.poll);
    if (!poll) return json(400, { error: '選択肢を2〜4個入れてください' });
    await setJSON(S.POLLS, post.id, { ...poll, ownerEmail: email });
    return json(200, { poll: await pollView(post.id, email) });
  }
  if (action === 'votePoll') {
    const poll = await getJSON(S.POLLS, String(payload.postId || ''));
    if (!poll) return json(404, { error: '投票が見つかりません' });
    if (poll.endsAt && Date.now() > poll.endsAt) return json(400, { error: 'この投票は終了しました' });
    const opt = poll.options.find((o) => o.id === payload.optionId);
    if (!opt) return json(400, { error: '選択肢が見つかりません' });
    poll.votes = poll.votes || {};
    if (poll.votes[me] === opt.id) delete poll.votes[me]; else poll.votes[me] = opt.id; // 同じものを押すと取り消し
    await setJSON(S.POLLS, String(payload.postId), poll);
    return json(200, { poll: await pollView(String(payload.postId), email) });
  }

  // ---- 3+4. 投稿の追加情報をまとめて取得（投票・リアクション・装飾） ----
  if (action === 'postExtras') {
    const ids = (Array.isArray(payload.postIds) ? payload.postIds : String(payload.postIds || '').split(',')).map(String).filter((x) => /^[A-Za-z0-9_-]{4,40}$/.test(x)).slice(0, 60);
    const comments = (Array.isArray(payload.commentTargets) ? payload.commentTargets : String(payload.commentTargets || '').split(',')).map(String).filter((x) => /^[A-Za-z0-9_:-]{4,90}$/.test(x)).slice(0, 120);
    const handles = (Array.isArray(payload.handles) ? payload.handles : String(payload.handles || '').split(',')).map((x) => String(x).toLowerCase()).filter((x) => /^[a-z0-9_.-]{1,40}$/.test(x)).slice(0, 60);
    const out = { polls: {}, reactions: {}, cosmetics: {} };
    for (const id of ids) {
      const p = await pollView(id, email); if (p) out.polls[id] = p;
      out.reactions[`post:${id}`] = await reactionView(`post:${id}`, me);
    }
    for (const t of comments) out.reactions[`comment:${t}`] = await reactionView(`comment:${t}`, me);
    if (handles.length) {
      const wanted = new Set(handles);
      for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) {
        const a = await getJSON(STORE_NAMES.ACCOUNTS, key);
        if (a?.ghostHandle && wanted.has(a.ghostHandle)) out.cosmetics[a.ghostHandle] = await cosmeticsOf(key);
      }
    }
    return json(200, { ...out, emojis: EMOJIS });
  }
  if (action === 'react') {
    const target = String(payload.target || '');
    if (!/^(post:[A-Za-z0-9_-]{4,40}|comment:[A-Za-z0-9_:-]{4,90})$/.test(target)) return json(400, { error: '不正な対象です' });
    const emoji = String(payload.emoji || '');
    if (!EMOJIS.includes(emoji)) return json(400, { error: '使えないリアクションです' });
    const r = (await getJSON(S.REACTIONS, target)) || {};
    const list = r[emoji] || [];
    r[emoji] = list.includes(me) ? list.filter((x) => x !== me) : [...list, me];
    await setJSON(S.REACTIONS, target, r);
    return json(200, { target, ...(await reactionView(target, me)) });
  }

  // ---- 5. フォロー中 / 6. おすすめユーザー ----
  if (action === 'following') {
    const account = await getJSON(STORE_NAMES.ACCOUNTS, email);
    const followEmails = Array.isArray(account?.ghostFollowing) ? account.ghostFollowing : [];
    const handles = [];
    for (const f of followEmails) { const a = await getJSON(STORE_NAMES.ACCOUNTS, f); if (a?.ghostHandle) handles.push(a.ghostHandle); }
    return json(200, { handles, hasGhostHandle: Boolean(account?.ghostHandle) });
  }
  if (action === 'recommendUsers') {
    const account = await getJSON(STORE_NAMES.ACCOUNTS, email);
    const following = new Set(Array.isArray(account?.ghostFollowing) ? account.ghostFollowing : []);
    const accounts = {};
    for (const key of await listKeys(STORE_NAMES.ACCOUNTS)) { const a = await getJSON(STORE_NAMES.ACCOUNTS, key); if (a) accounts[key] = a; }
    // 自分のタグ・投稿者ごとの最新投稿日時
    const myTags = new Set(); const tagsBy = {}; const lastPost = {};
    for (const key of await listKeys(STORE_NAMES.GHOST_POSTS)) {
      if (key.includes(':')) continue;
      const p = await getJSON(STORE_NAMES.GHOST_POSTS, key);
      if (!p || p.deleted) continue;
      const t = (p.tags || []).map((x) => String(x).toLowerCase());
      if (p.authorEmail === email) t.forEach((x) => myTags.add(x));
      tagsBy[p.authorEmail] = tagsBy[p.authorEmail] || new Set(); t.forEach((x) => tagsBy[p.authorEmail].add(x));
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
      if (score > 0) scored.push({ handle: a.ghostHandle, name: a.ghostName || a.displayName || a.ghostHandle, avatarUrl: a.ghostAvatarUrl || null, reason: reasons[0], score });
    }
    scored.sort((x, y) => y.score - x.score);
    return json(200, { users: scored.slice(0, 8) });
  }

  // ---- 9. Coinショップ ----
  if (action === 'shop') {
    const p = (await getJSON(S.PROFILE, email)) || {};
    const balance = Number(await getJSON(STORE_NAMES.COINS, email)) || 0;
    return json(200, { items: SHOP, owned: p.owned || [], equipped: p.equipped || {}, balance });
  }
  if (action === 'buy') {
    const item = SHOP_BY_ID[String(payload.id || '')];
    if (!item) return json(404, { error: '商品が見つかりません' });
    const p = (await getJSON(S.PROFILE, email)) || {};
    p.owned = p.owned || [];
    if (p.owned.includes(item.id)) return json(400, { error: 'すでに持っています' });
    const balance = Number(await getJSON(STORE_NAMES.COINS, email)) || 0;
    if (balance < item.price) return json(400, { error: `Coinが足りません（あと ${item.price - balance} Coin）` });
    await setJSON(STORE_NAMES.COINS, email, balance - item.price);
    p.owned.push(item.id);
    p.equipped = { ...(p.equipped || {}), [item.type]: item.id };
    await setJSON(S.PROFILE, email, p);
    return json(200, { owned: p.owned, equipped: p.equipped, balance: balance - item.price });
  }
  if (action === 'equip') {
    const p = (await getJSON(S.PROFILE, email)) || {};
    const type = String(payload.type || '');
    if (!['frame', 'nameColor', 'title', 'storyBg'].includes(type)) return json(400, { error: '不正な種類です' });
    const id = payload.id ? String(payload.id) : null;
    if (id && (!(p.owned || []).includes(id) || SHOP_BY_ID[id]?.type !== type)) return json(400, { error: '持っていないアイテムです' });
    p.equipped = { ...(p.equipped || {}), [type]: id };
    await setJSON(S.PROFILE, email, p);
    return json(200, { equipped: p.equipped });
  }

  // ---- 13. 予約投稿 ----
  if (action === 'schedulePost') {
    const at = Number(payload.at);
    if (!Number.isFinite(at) || at < Date.now() + 60 * 1000 || at > Date.now() + 30 * 86400000) return json(400, { error: '予約日時は1分後〜30日後で指定してください' });
    const body = payload.post && typeof payload.post === 'object' ? payload.post : {};
    const size = JSON.stringify(body).length;
    if (size > 12 * 1024 * 1024) return json(400, { error: '添付が大きすぎます' });
    const mine = (await listKeys(S.SCHEDULED, `${email}:`)).length;
    if (mine >= 20) return json(400, { error: '予約は20件までです' });
    const id = newId(6);
    delete body.token; delete body.action;
    await setJSON(S.SCHEDULED, `${email}:${id}`, { id, email, at, payload: body, poll: payload.poll || null, createdAt: Date.now() });
    await require('./cron-gate').wake('scheduled-tokibou-background');
    return json(200, { id, at });
  }
  if (action === 'scheduledPosts') {
    const items = [];
    for (const key of await listKeys(S.SCHEDULED, `${email}:`)) { const j = await getJSON(S.SCHEDULED, key); if (j) items.push({ id: j.id, at: j.at, title: j.payload.title || '', text: String(j.payload.text || '').slice(0, 80), media: (j.payload.media || []).length, poll: Boolean(j.poll) }); }
    items.sort((a, b) => a.at - b.at);
    return json(200, { items });
  }
  if (action === 'cancelScheduled') {
    await deleteKey(S.SCHEDULED, `${email}:${String(payload.id || '').replace(/[^a-f0-9]/g, '')}`);
    return json(200, { ok: true });
  }

  // ---- 14. ブックマークのメモ（本人だけ） ----
  if (action === 'notes') return json(200, { notes: (await getJSON(S.NOTES, email)) || {} });
  if (action === 'saveNote') {
    const notes = (await getJSON(S.NOTES, email)) || {};
    const id = String(payload.postId || '');
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return json(400, { error: '不正な投稿です' });
    const text = String(payload.note || '').trim().slice(0, 500);
    if (text) notes[id] = { text, at: Date.now() }; else delete notes[id];
    await setJSON(S.NOTES, email, notes);
    return json(200, { notes });
  }

  // ---- 15. 返信リマインドの設定 ----
  if (action === 'setReplyReminder') {
    const p = (await getJSON(S.PROFILE, email)) || {};
    p.replyReminder = payload.on !== false;
    await setJSON(S.PROFILE, email, p);
    return json(200, { on: p.replyReminder });
  }

  // ---- 17. 文字起こし ----
  if (action === 'transcribe') {
    try { return json(200, { text: await transcribe(String(payload.fileId || '').replace(/[^A-Za-z0-9_-]/g, ''), info) }); }
    catch (e) { return json(e.status || 500, { error: e.message }); }
  }

  // ---- 20. 運営からの警告 ----
  if (action === 'sendWarning') {
    if (!isOperator(info)) return json(403, { error: '運営のみ送れます' });
    const target = String(payload.email || '').trim().toLowerCase();
    if (!(await getJSON(STORE_NAMES.ACCOUNTS, target))) return json(404, { error: 'アカウントが見つかりません' });
    const w = { id: newId(6), to: target, from: email, level: ['notice', 'warning', 'final'].includes(payload.level) ? payload.level : 'warning', title: String(payload.title || '運営からのお知らせ').slice(0, 80), body: String(payload.body || '').trim().slice(0, 2000), createdAt: new Date().toISOString(), ackAt: null };
    if (!w.body) return json(400, { error: '本文を入れてください' });
    await setJSON(S.WARNINGS, `${target}:${w.id}`, w);
    const { addNotification } = require('../netlify/lib/notifications');
    await addNotification(target, { type: 'adminWarning', title: `運営より: ${w.title}`, body: '内容を確認してください', url: '/' });
    return json(200, { ok: true, warning: w });
  }
  if (action === 'warningsSent') {
    if (!isOperator(info)) return json(403, { error: '運営のみ閲覧できます' });
    const items = [];
    for (const key of await listKeys(S.WARNINGS)) { const w = await getJSON(S.WARNINGS, key); if (w) items.push(w); }
    items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return json(200, { items: items.slice(0, 50) });
  }
  if (action === 'myWarnings') {
    const items = [];
    for (const key of await listKeys(S.WARNINGS, `${email}:`)) { const w = await getJSON(S.WARNINGS, key); if (w && !w.ackAt) items.push({ id: w.id, level: w.level, title: w.title, body: w.body, createdAt: w.createdAt }); }
    return json(200, { items });
  }
  if (action === 'ackWarning') {
    const key = `${email}:${String(payload.id || '').replace(/[^a-f0-9]/g, '')}`;
    const w = await getJSON(S.WARNINGS, key);
    if (w && !w.ackAt) { w.ackAt = new Date().toISOString(); await setJSON(S.WARNINGS, key, w); }
    return json(200, { ok: true });
  }
  return null;
}

async function unackedWarnings(email) {
  let n = 0;
  for (const key of await listKeys(S.WARNINGS, `${email}:`)) { const w = await getJSON(S.WARNINGS, key); if (w && !w.ackAt) n += 1; }
  return n;
}

module.exports = { handle, publishScheduled, nextScheduledAt, replyReminders, unackedWarnings, cosmeticsOf, STORES: S, SHOP_ITEMS: SHOP };
