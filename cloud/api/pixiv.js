// MAWS用pixivデータAPI。サーバーがpixivのJSONを取得して返すので、ブラウザ側がbot判定されても閲覧できる。
//  GET /api/pixiv?a=ranking&mode=daily&p=1
//  GET /api/pixiv?a=search&q=...&p=1&order=date_d|popular_d&smode=tag|title
//  GET /api/pixiv?a=work&id=123
//  GET /api/pixiv?a=user&id=123
// 既定は年齢制限(R-18/R-18G)の作品を返さない匿名閲覧。
// 個人のpixivアカウント連携(PHPSESSIDを暗号化して本人分だけ保存)+成人確認クイズに合格した人だけ、本人のCookieでR-18/R-18Gを閲覧できる。
//  POST /api/pixiv {action:'status'|'link'|'unlink'|'quizStart'|'quizSubmit', token, ...}
import crypto from 'node:crypto';
import { getStore, setEnv } from '../_lib/blobs.js';
import { SUPABASE_SECRET_KEY } from '../_lib/config.js';
const json = (status, body, cache = 'no-store') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' } });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HEAD = { 'User-Agent': UA, Referer: 'https://www.pixiv.net/', 'Accept-Language': 'ja,en;q=0.8', Accept: 'application/json' };
const RANK_MODES = ['daily', 'weekly', 'monthly', 'rookie', 'original', 'daily_ai', 'male', 'female'];
const RANK_R18 = ['daily_r18', 'weekly_r18', 'male_r18', 'female_r18'];

const hits = new Map();
function limited(ip) { const now = Date.now(); const a = (hits.get(ip) || []).filter((t) => now - t < 10000); a.push(now); hits.set(ip, a); if (hits.size > 3000) hits.clear(); return a.length > 20; }
const cache = new Map();
async function getJson(url, cookie) {
  const hit = !cookie && cache.get(url); if (hit && Date.now() - hit.t < 60000) return hit.v;
  const r = await fetch(url, { headers: cookie ? { ...HEAD, Cookie: 'PHPSESSID=' + cookie } : HEAD, signal: AbortSignal.timeout(12000) }).catch(() => null);
  if (!r) throw Object.assign(new Error('pixivに接続できませんでした'), { status: 502 });
  if (!r.ok) throw Object.assign(new Error(`pixivから取得できませんでした(${r.status})`), { status: r.status === 404 ? 404 : r.status === 401 || r.status === 403 ? 403 : 502 });
  const v = await r.json().catch(() => null);
  if (!v || v.error) throw Object.assign(new Error(v?.message || 'pixivの応答が不正です'), { status: 502 });
  if (!cookie) { cache.set(url, { t: Date.now(), v }); if (cache.size > 300) cache.clear(); }
  return v;
}
const prox = (u) => /^https:\/\/i\.pximg\.net\//.test(String(u || '')) ? `/api/tools?action=pximg&u=${encodeURIComponent(u)}` : '';
const clean = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').slice(0, n);
const card = (x) => ({ id: String(x.id || x.illust_id), title: clean(x.title, 120), author: clean(x.userName || x.user_name, 60), userId: String(x.userId || x.user_id || ''), pages: Number(x.pageCount || x.illust_page_count) || 1, tags: (x.tags || []).filter((t) => typeof t === 'string').slice(0, 8), thumb: prox(x.url), avatar: prox(x.profileImageUrl), r18: Number(x.xRestrict || 0) >= 1 || (x.tags || []).some((t) => typeof t === 'string' && /R-?18/i.test(t)) });
const safe = (x) => x && Number(x.xRestrict || 0) === 0 && !/R-?18/i.test((x.tags || []).filter((t) => typeof t === 'string').join(' ')) && Number(x.sl ?? 0) <= 4;
// R-18/R-18G閲覧が許可された本人(18歳以上+連携+成人確認)だけ
const safeR = (x) => x && Number(x.xRestrict || 0) <= 2;

async function action(a, q, ctx) {
  const ok = ctx && ctx.r18 ? safeR : safe; const ck = ctx && ctx.r18 ? ctx.cookie : undefined;
  if (a === 'ranking') {
    const mode = RANK_MODES.includes(q.get('mode')) || (ck && RANK_R18.includes(q.get('mode'))) ? q.get('mode') : 'daily';
    const p = Math.min(Math.max(parseInt(q.get('p'), 10) || 1, 1), 10);
    let d;
    if (/^(male|female)/.test(mode)) { // 男子/女子ランキングは content 指定なしが正式なURL。だめなら指定ありも試す
      let lastError = null;
      for (const url of [`https://www.pixiv.net/ranking.php?mode=${mode}&p=${p}&format=json`, `https://www.pixiv.net/ranking.php?mode=${mode}&content=illust&p=${p}&format=json`]) {
        try { const r = await getJson(url, ck); if (r && Array.isArray(r.contents)) { d = r; break; } } catch (error) { lastError = error; }
      }
      if (!d) throw lastError || new Error('ランキングを取得できませんでした');
    } else d = await getJson(`https://www.pixiv.net/ranking.php?mode=${mode}&content=illust&p=${p}&format=json`, ck);
    const items = (d.contents || []).filter((x) => ck ? !(x.tags || []).some((t) => /R-?18G/i.test(t)) : Number(x.illust_content_type?.sexual ?? 0) < 2 && !(x.tags || []).some((t) => /R-?18/i.test(t))).map((x, i) => ({ ...card(x), rank: x.rank || i + 1 }));
    return { mode, page: p, items, next: Boolean(d.next) };
  }
  if (a === 'search') {
    const word = String(q.get('q') || '').trim().slice(0, 100);
    if (!word) throw Object.assign(new Error('検索キーワードを入力してください'), { status: 400 });
    const p = Math.min(Math.max(parseInt(q.get('p'), 10) || 1, 1), 20);
    const order = q.get('order') === 'popular_d' ? 'popular_d' : 'date_d';
    const sm = q.get('smode') === 'title' ? 's_tc' : 's_tag';
    const ex = String(q.get('ex') || '').split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 10); // 除外タグ(NOT)
    const wordQ = [word, ...ex.map((t) => '-' + t)].join(' ');
    const exHit = (x) => ex.length && (x.tags || []).some((g) => typeof g === 'string' && ex.some((t) => g.toLowerCase() === t.toLowerCase()));
    const d = await getJson(`https://www.pixiv.net/ajax/search/artworks/${encodeURIComponent(wordQ)}?word=${encodeURIComponent(wordQ)}&order=${order}&mode=${ck ? 'all' : 'safe'}&p=${p}&s_mode=${sm}&type=all&lang=ja`, ck);
    const list = d.body?.illustManga?.data || [];
    return { q: word, ex: ex.join(' '), page: p, total: ex.length ? null : (d.body?.illustManga?.total ?? null), items: list.filter((x) => x && x.id && !x.isAdContainer && ok(x) && !exHit(x)).map(card) };
  }
  if (a === 'work') {
    const id = String(q.get('id') || '');
    if (!/^\d{3,12}$/.test(id)) throw Object.assign(new Error('作品IDが不正です'), { status: 400 });
    const d = await getJson(`https://www.pixiv.net/ajax/illust/${id}?lang=ja`, ck);
    const b = d.body || {};
    if (!ok({ xRestrict: b.xRestrict, tags: (b.tags?.tags || []).map((t) => t.tag), sl: b.sl })) throw Object.assign(new Error(ck ? 'この作品は表示できません。' : '年齢制限のある作品を見るには、pixivアカウントを連携してR-18表示をオンにしてください。'), { status: 403 });
    const pg = await getJson(`https://www.pixiv.net/ajax/illust/${id}/pages?lang=ja`, ck).catch(() => null);
    const pages = (pg?.body || []).slice(0, 40).map((x, i) => ({ page: i + 1, image: prox(x.urls?.regular), original: prox(x.urls?.original), width: x.width, height: x.height }));
    let ugoira = null; // うごイラ(GIFのように動く投稿): フレームのZIPとフレームごとの表示時間を返す
    if (Number(b.illustType) === 2) {
      try {
        const um = (await getJson(`https://www.pixiv.net/ajax/illust/${id}/ugoira_meta?lang=ja`, ck)).body || {};
        const zip = prox(um.src || um.originalSrc);
        if (zip && Array.isArray(um.frames) && um.frames.length) ugoira = { zip, mime: String(um.mime_type || 'image/jpeg'), frames: um.frames.slice(0, 600).map((f) => ({ file: String(f.file), delay: Math.max(10, Math.min(Number(f.delay) || 100, 10000)) })) };
      } catch (_) {}
    }
    let related = [];
    try { const rr = await getJson(`https://www.pixiv.net/ajax/illust/${id}/recommend/init?limit=18&lang=ja`, ck); related = (rr.body?.illusts || []).filter((x) => x && x.id && !x.isAdContainer && ok(x)).slice(0, 18).map(card); } catch (_) {}
    let av = prox(Object.values(b.userIllusts || {}).find((x) => x && x.profileImageUrl)?.profileImageUrl);
    if (!av && b.userId) { try { const u = await getJson(`https://www.pixiv.net/ajax/user/${b.userId}?full=0&lang=ja`, ck); av = prox(u.body?.imageBig || u.body?.image); } catch (_) {} }
    return {
      id, title: clean(b.illustTitle || b.title, 200), description: clean(String(b.illustComment || b.description || '').replace(/<br\s*\/?>/gi, '\n'), 3000),
      author: clean(b.userName, 60), userId: String(b.userId || ''), avatar: av || '', tags: (b.tags?.tags || []).map((t) => t.tag).slice(0, 30),
      like: b.likeCount ?? null, bookmark: b.bookmarkCount ?? null, view: b.viewCount ?? null, date: b.createDate || '',
      pages: pages.length ? pages : [{ page: 1, image: prox(b.urls?.regular), original: prox(b.urls?.original) }], ugoira, related, artworkUrl: `https://www.pixiv.net/artworks/${id}`
    };
  }
  if (a === 'user') {
    const id = String(q.get('id') || '');
    if (!/^\d{1,12}$/.test(id)) throw Object.assign(new Error('ユーザーIDが不正です'), { status: 400 });
    const prof = await getJson(`https://www.pixiv.net/ajax/user/${id}?full=1&lang=ja`);
    const all = await getJson(`https://www.pixiv.net/ajax/user/${id}/profile/all?lang=ja`, ck).catch(() => null);
    const ids = Object.keys(all?.body?.illusts || {}).sort((x, y) => Number(y) - Number(x));
    const p = Math.min(Math.max(parseInt(q.get('p'), 10) || 1, 1), 50);
    const tagWords = String(q.get('tags') || '').split(/\s+/).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean).slice(0, 8);
    const fetchWorks = async (list) => { // 最大48件ずつ作品情報を取得
      if (!list.length) return [];
      const d = await getJson(`https://www.pixiv.net/ajax/user/${id}/profile/illusts?${list.map((i) => 'ids[]=' + i).join('&')}&work_category=illust&is_first_page=0&lang=ja`, ck).catch(() => null);
      return Object.values(d?.body?.works || {}).filter(ok).sort((x, y) => Number(y.id) - Number(x.id));
    };
    let items = [], total = ids.length, scanned = null;
    if (tagWords.length) { // 投稿者を指定したタグ絞り込み: 新しい順に最大240作品を調べ、すべてのタグを含むものを返す
      const scan = ids.slice(0, 240); scanned = scan.length;
      const groups = []; for (let i = 0; i < scan.length; i += 48) groups.push(scan.slice(i, i + 48));
      const works = (await Promise.all(groups.map(fetchWorks))).flat().sort((x, y) => Number(y.id) - Number(x.id));
      const hit = works.filter((x) => tagWords.every((w) => (x.tags || []).some((t) => String(t).toLowerCase().includes(w)) || String(x.title || '').toLowerCase().includes(w)));
      total = hit.length; items = hit.slice((p - 1) * 30, p * 30).map(card);
    } else items = (await fetchWorks(ids.slice((p - 1) * 30, p * 30))).map(card);
    const b = prof.body || {};
    return { id, name: clean(b.name, 60), comment: clean(b.comment, 1000), avatar: prox(b.imageBig || b.image), cover: prox(b.background?.url), total, page: p, tags: tagWords, scanned, items };
  }
  if (a === 'userSearch') { // 投稿者名で探す: pixivのユーザー検索 → だめなら作品検索の結果から同名の投稿者を集める
    const nick = String(q.get('q') || '').trim().slice(0, 60);
    if (!nick) throw Object.assign(new Error('投稿者名を入力してください'), { status: 400 });
    const found = new Map();
    const collect = (node, depth = 0) => { if (!node || depth > 6) return; if (Array.isArray(node)) { node.forEach((n) => collect(n, depth + 1)); return; } if (typeof node !== 'object') return; if ((node.userId || node.user_id) && (node.userName || node.name || node.user_name) && !node.illustId && !node.id) { const uid = String(node.userId || node.user_id); if (/^\d{1,12}$/.test(uid) && !found.has(uid)) found.set(uid, { id: uid, name: clean(node.userName || node.name || node.user_name, 60), avatar: prox(node.profileImageUrl || node.profile_img || node.imageBig || node.image) }); } Object.values(node).forEach((n) => collect(n, depth + 1)); };
    for (const url of [`https://www.pixiv.net/ajax/search/users?nick=${encodeURIComponent(nick)}&s_mode=s_usr&p=1&lang=ja`, `https://www.pixiv.net/ajax/search/users/${encodeURIComponent(nick)}?nick=${encodeURIComponent(nick)}&s_mode=s_usr&p=1&lang=ja`]) {
      try { collect((await getJson(url, ck)).body); } catch (_) {}
      if (found.size) break;
    }
    if (!found.size) { // 作品検索の結果に出てくる投稿者名で絞る
      const lower = nick.toLowerCase();
      for (const sm of ['s_tag', 's_tc']) {
        try { const d = await getJson(`https://www.pixiv.net/ajax/search/artworks/${encodeURIComponent(nick)}?word=${encodeURIComponent(nick)}&order=date_d&mode=${ck ? 'all' : 'safe'}&p=1&s_mode=${sm}&type=all&lang=ja`, ck); for (const x of d.body?.illustManga?.data || []) if (x && x.userId && String(x.userName || '').toLowerCase().includes(lower) && !found.has(String(x.userId))) found.set(String(x.userId), { id: String(x.userId), name: clean(x.userName, 60), avatar: prox(x.profileImageUrl) }); } catch (_) {}
      }
    }
    return { q: nick, users: [...found.values()].slice(0, 30) };
  }
  throw Object.assign(new Error('不明な操作です'), { status: 400 });
}


// ---------- 個人アカウント連携・成人確認 ----------
const LINKS = 'netrify-pixiv-links', SESSIONS = 'netrify-sessions', ACCOUNTS = 'netrify-accounts';
const getJSON2 = async (store, key) => { const v = await getStore({ name: store }).get(key, { type: 'text' }); if (!v) return null; try { return JSON.parse(v); } catch (_) { return null; } };
const setJSON2 = (store, key, value) => getStore({ name: store }).set(key, JSON.stringify(value));
let SECRET = '';
// 主運営(isAdmin)のアカウントが、自分でpixivを連携していないときに使う既定のセッション(サーバー内のみ。画面には送らない)。連携し直すと上書き、解除するとオフ。
const DEFAULT_SESSION = ((typeof process !== "undefined" && process.env && process.env.PIXIV_DEFAULT_SESSION) || "");
// 全員用の共用(回覧用)アカウント。pixivアカウントを登録できない人向け。自分のアカウントを連携すればそちらが優先される。
// ※R-18の表示は、これまでどおり18歳以上の登録＋年齢確認(運営・副運営・公認はクイズなし)が必要。
const SHARED_SESSION = ((typeof process !== "undefined" && process.env && process.env.PIXIV_SHARED_SESSION) || "");
const aesKey = () => crypto.createHash('sha256').update('pixiv-link|' + SECRET).digest();
const seal = (text) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', aesKey(), iv); const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64'); };
const unseal = (b64) => { try { const b = Buffer.from(b64, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', aesKey(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); } catch (_) { return ''; } };
async function sessionEmail(token) {
  if (!token) return null;
  const s = await getJSON2(SESSIONS, String(token));
  return s && s.expiresAt > Date.now() && s.email ? String(s.email) : null;
}
function ageOf(birth) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || '')); if (!m) return null; const t = new Date(Date.now() + 9 * 3600e3); let a = t.getUTCFullYear() - +m[1]; if (t.getUTCMonth() + 1 < +m[2] || (t.getUTCMonth() + 1 === +m[2] && t.getUTCDate() < +m[3])) a--; return a; }
// 運営・副運営・公認はクイズなし
async function whoIs(email) {
  const a = await getJSON2(ACCOUNTS, email) || {};
  const age = ageOf(a.birthDate);
  return { main: a.isAdmin === true, staff: a.isAdmin === true || a.isDeputyAdmin === true || a.isOfficial === true, minor: age !== null && age < 18 };
}
// [正解の番号, 問題, 選択肢...]  ADULT=成人でないと分かりにくい問題 / TEEN=未成年でも分かる問題(合否に使わない、混ぜるだけ)
const ADULT = [
  [1, '会社員の「源泉徴収票」を発行するのはどこ?', '市役所', '勤務先(会社)', '銀行', '学校'],
  [2, '国民年金に加入する義務が生じる年齢は?', '15歳', '18歳', '20歳', '25歳'],
  [0, '確定申告の受付が始まるのは例年何月ごろ?', '2月中旬', '5月', '8月', '11月'],
  [3, '賃貸住宅の契約で、退去時の原状回復に充てられることがある、入居時に預けるお金は?', '祝儀', '年貢', '手数料のみ', '敷金'],
  [1, '住民税は、おもにいつの所得をもとに計算される?', '今年の所得(その年のうち)', '前年の所得', '来年の予定所得', '所得に関係なく一律'],
  [2, '会社員が毎月の給与から天引きされるものとして正しいのは?', '映画料金', '給食費', '厚生年金保険料', '図書館利用料'],
  [0, '労働基準法で、労働時間が6時間を超えるとき、最低限必要な休憩は?', '45分', '5分', '3時間', '休憩は不要'],
  [3, '「クーリング・オフ」とは?', '部活動の休憩', 'ゲームの連続プレイ制限', '電気代の節約術', '一定期間内なら契約を無条件で解除できる制度'],
  [1, 'ローンの返済で「元金」に対して上乗せされるものは?', '賞与', '利息', '年賀', '配当金なし'],
  [2, '健康保険証の保険料を、会社と本人で折半する保険は?', '学資保険', '自動車保険', '社会保険(健康保険)', '火災保険']
];
const TEEN = [
  [0, '九九で 7 × 8 は?', '56', '54', '48', '63'],
  [2, '日本の都道府県の数は?', '37', '43', '47', '52'],
  [1, '体育の授業で行う準備運動のあとにする、整列の掛け声は?', 'ごちそうさま', '好きな掛け声でよい', '番号!', '解散!'],
  [3, '学校で、夏休みや冬休みの前後に提出することが多い、宿題の一種は?', '定期預金', '住民票', '源泉徴収票', '自由研究や課題プリント'],
  [0, '三角形の内角の和は?', '180度', '90度', '270度', '360度'],
  [1, '「いただきます」を言うのは?', '寝る前', '食事の前', '登校のとき', '雨が降ったとき']
];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function shuffleQ(q, kind) { const idx = shuffle([0, 1, 2, 3]); return { kind, text: q[1], options: idx.map((i) => q[2 + i]), correct: idx.indexOf(q[0]) }; }

async function accountApi(payload, context) {
  const email = await sessionEmail(payload.token);
  if (!email) return json(401, { error: 'ログインが必要です' });
  const link = await getJSON2(LINKS, email) || {};
  const who = await whoIs(email);
  const adultOk = !who.minor && (who.staff || Boolean(link.adultAt));
  const useDefault = !link.cookieEnc && who.main && !link.noDefault;
  const useShared = !link.cookieEnc && !useDefault;
  const pub = () => ({ linked: Boolean(link.cookieEnc) || useDefault || useShared, usingDefault: useDefault, usingShared: useShared, pixivUserId: link.pixivUserId || (useDefault ? DEFAULT_SESSION.split('_')[0] : (useShared ? '共用アカウント' : '')), adult: adultOk, staff: who.staff, minor: who.minor, lockUntil: link.lockUntil || 0 });
  switch (payload.action) {
    case 'adultPass': {
      // 成人向けサイト用の通行証(3時間)。18歳以上(生年月日が確認でき、成人確認済みor運営)のログインユーザーだけ。
      const acc = await getJSON2(ACCOUNTS, email) || {};
      const age = ageOf(acc.birthDate);
      const adultByAge = age !== null ? age >= 18 : who.staff;
      if (!adultByAge || who.minor) return json(403, { error: '18歳以上の方だけ開けます(生年月日の登録が必要です)' });
      if (!adultOk) return json(403, { needQuiz: true, error: '成人確認が必要です' });
      const exp = Date.now() + 3 * 3600e3;
      return json(200, { pass: exp + '.' + crypto.createHmac('sha256', 'maws-adult|' + SUPABASE_SECRET_KEY).update(String(exp)).digest('hex').slice(0, 32), expires: exp });
    }
    case 'status': return json(200, pub());
    case 'link': {
      const v = String(payload.phpsessid || '').trim().replace(/^PHPSESSID=/i, '');
      const m = /^(\d{1,12})_[A-Za-z0-9]{20,64}$/.exec(v);
      if (!m) return json(400, { error: 'PHPSESSIDの形式が違います(「数字_英数字」の値です)' });
      link.cookieEnc = seal(v); link.pixivUserId = m[1]; link.linkedAt = Date.now(); delete link.noDefault;
      await setJSON2(LINKS, email, link);
      return json(200, pub());
    }
    case 'unlink': { delete link.cookieEnc; delete link.pixivUserId; link.noDefault = true; await setJSON2(LINKS, email, link); return json(200, { ...pub(), linked: false }); }
    case 'quizStart': {
      if (who.minor) return json(403, { error: '18歳未満の方はR-18を表示できません' });
      if (adultOk) return json(200, { already: true });
      if ((link.lockUntil || 0) > Date.now()) return json(429, { error: 'しばらく待ってから、もう一度お試しください', lockUntil: link.lockUntil });
      const qs = shuffle([...shuffle(ADULT).slice(0, 5).map((q) => shuffleQ(q, 'a')), ...shuffle(TEEN).slice(0, 3).map((q) => shuffleQ(q, 't'))]);
      const quizId = crypto.randomBytes(8).toString('hex');
      await setJSON2(LINKS, 'quiz:' + email, { quizId, at: Date.now(), kinds: qs.map((q) => q.kind), answers: qs.map((q) => q.correct) });
      return json(200, { quizId, questions: qs.map((q) => ({ text: q.text, options: q.options })) });
    }
    case 'quizSubmit': {
      if (who.minor) return json(403, { error: '18歳未満の方はR-18を表示できません' });
      if (adultOk) return json(200, pub());
      if ((link.lockUntil || 0) > Date.now()) return json(429, { error: 'しばらく待ってから、もう一度お試しください', lockUntil: link.lockUntil });
      const quiz = await getJSON2(LINKS, 'quiz:' + email);
      if (!quiz || quiz.quizId !== payload.quizId || Date.now() - quiz.at > 15 * 60e3) return json(400, { error: 'クイズの有効期限が切れました。もう一度始めてください' });
      await getStore({ name: LINKS }).delete('quiz:' + email).catch(() => {});
      const ans = Array.isArray(payload.answers) ? payload.answers : [];
      const pass = quiz.kinds.every((k, i) => k !== 'a' || Number(ans[i]) === quiz.answers[i]);
      if (!pass || payload.confirm !== true) {
        if (!pass) { link.lockUntil = Date.now() + 30 * 60e3; await setJSON2(LINKS, email, link); }
        return json(403, { error: pass ? '最終確認がされていません' : '確認できませんでした。30分後にもう一度お試しください', passed: false });
      }
      link.adultAt = Date.now(); await setJSON2(LINKS, email, link);
      return json(200, { ...pub(), adult: true });
    }
    default: return json(400, { error: '不明な操作です' });
  }
}
async function r18Context(req) {
  const token = req.headers.get('x-mixall-token');
  if (!token) return null;
  const email = await sessionEmail(token);
  if (!email) return null;
  const link = await getJSON2(LINKS, email) || {};
  const who = await whoIs(email);
  if (who.minor || !(who.staff || link.adultAt)) return null;
  const cookie = link.cookieEnc ? unseal(link.cookieEnc) : (who.main && !link.noDefault ? DEFAULT_SESSION : SHARED_SESSION); if (!cookie) return null;
  return { r18: true, cookie };
}

export async function onRequest(context) {
  const req = context.request;
  const env = context.env || {}; setEnv(env); SECRET = String(env.PIXIV_LINK_SECRET || SUPABASE_SECRET_KEY || 'mixall-pixiv-link');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type,x-mixall-token' } });
  if (req.method === 'POST') { const payload = await req.json().catch(() => ({})); try { return await accountApi(payload, context); } catch (e) { return json(500, { error: e.message || 'エラーが発生しました' }); } }
  if (req.method !== 'GET') return json(405, { error: 'GET/POSTのみ対応しています' });
  const ip = context.clientIp || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (limited(ip)) return json(429, { error: 'アクセスが多すぎます。少し待ってください' });
  const url = new URL(req.url);
  try { const ctx = url.searchParams.get('r18') === '1' ? await r18Context(req) : null; return json(200, await action(url.searchParams.get('a'), url.searchParams, ctx), ctx ? 'private, no-store' : 'public, max-age=60'); }
  catch (e) { return json(e.status || 500, { error: e.message || 'エラーが発生しました' }); }
}
