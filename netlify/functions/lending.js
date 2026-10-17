// netlify/functions/lending.js
// 貸し出しサーバー: ユーザーが自分の識別子で簡易サイト(HTML)を公開できる機能。
// 実際の配信は site-view.js が担当し、こちらは管理(作成・編集・削除)用API。

const { STORE_NAMES, getJSON, setJSON, deleteKey, listKeys } = require('../lib/store');
const { requireSession, requireAdmin, getAccountProfile } = require('../lib/session');
const { fingerprint, getTargetContent } = require('../lib/program-review');

const MAX_HTML_BYTES = 200 * 1024; // 200KBまで
const RESERVED = ['uch', 'pocket', 'custom', 'ghost', 'mail', 'css', 'js', 'api', 'lending', 'admin', 'site-view', ''];

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function normalizeSlug(input) {
  const slug = String(input || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  if (!slug || slug.length < 2 || slug.length > 40) return null;
  if (RESERVED.includes(slug)) return null;
  return slug;
}

function parseMailBindings(html) {
  const bindings = {};
  const pattern = /mail\?=\/let\s+([A-Za-z0-9._-]{1,80})/g;
  let match;
  while ((match = pattern.exec(html)) !== null) bindings[match[1]] = true;
  return bindings;
}

function parseCoinPrograms(html) {
  const programs = [];
  const fixed = /Coin\+([0-9]{1,9})\{([^{}‹›\s]+)‹BoxMedia›\}/g;
  let match;
  while ((match = fixed.exec(html)) !== null) {
    const amount = Math.min(100000000, Number(match[1]));
    const target = match[2].trim().toLowerCase();
    if (amount > 0 && target) programs.push({ kind:'fixed', command: match[0], amount, target });
  }
  const variable = /Coin\+let\s+(\$\{[A-Za-z0-9._-]{1,80}\}|[A-Za-z0-9._-]{1,80})\{\/\[([A-Za-z0-9._-]{1,80})\]‹BoxMedia›\}/g;
  while ((match = variable.exec(html)) !== null) {
    const rawName = match[1];
    const runtimeVariable = rawName.startsWith('${') && rawName.endsWith('}') ? rawName.slice(2, -1) : null;
    programs.push({ kind:'variable', command:match[0], variableName:runtimeVariable || rawName, referenceName:match[2], runtime: Boolean(runtimeVariable) });
  }
  return programs;
}

async function resolveCoinVariable(slug, program, mailBindings, ownerEmail) {
  if (mailBindings[program.referenceName]) {
    const literalAmount = /^\d+$/.test(program.variableName) ? Number(program.variableName) : null;
    const amountRecord = literalAmount === null ? await getJSON(STORE_NAMES.LENDING_DATA, `${slug}:${program.variableName}`) : null;
    const amountValue = amountRecord?.value;
    const amount = literalAmount !== null ? literalAmount : (typeof amountValue === 'object' ? Number(amountValue.amount ?? amountValue.coins ?? amountValue.value) : Number(amountValue));
    if (!Number.isFinite(amount) || amount <= 0) return { error:`増加量変数「${program.variableName}」が見つからないか不正です` };
    return { amount:Math.min(100000000, Math.floor(amount)), target:ownerEmail };
  }
  const record = await getJSON(STORE_NAMES.LENDING_DATA, `${slug}:${program.referenceName}`);
  if (!record) return { error:'参照変数が見つかりません' };
  const value = record.value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const amount = Number(value.amount ?? value.coins ?? value.value);
    let target = String(value.email ?? value.target ?? value.recipient ?? '').trim().toLowerCase();
    if (target.startsWith('$')) target = mailBindings[target.slice(1)] ? ownerEmail : target.slice(1).toLowerCase();
    if (!target) target = ownerEmail;
    if (!Number.isFinite(amount) || amount <= 0 || !target) return { error:'変数値は {amount, email} または {coins, target} の形式が必要です' };
    return { amount:Math.min(100000000, Math.floor(amount)), target };
  }
  if (typeof value === 'number' && value > 0) return { amount:Math.min(100000000, Math.floor(value)), target:ownerEmail };
  if (typeof value === 'string' && value.trim()) {
    const target = value.trim().startsWith('$') && mailBindings[value.trim().slice(1)] ? ownerEmail : value.trim().toLowerCase();
    return { amount:null, target };
  }
  return { error:'参照変数の値が空です' };
}

exports.handler = async (event) => {

  try {
    return await handle(event);
  } catch (err) {
    console.error('lending function error:', err);
    return json(500, { error: `内部エラー: ${err.message}` });
  }
};

async function handle(event) {
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};

  if (method === 'GET') {
    const token = qs.token;
    const email = await requireSession(token);
    if (!email) return json(401, { error: 'ログインが必要です' });

    const keys = await listKeys(STORE_NAMES.LENDING_SITES);
    const mySites = [];
    for (const key of keys) {
      const s = await getJSON(STORE_NAMES.LENDING_SITES, key);
      if (s && s.ownerEmail === email) {
        mySites.push({ slug: s.slug, title: s.title, updatedAt: s.updatedAt });
      }
    }
    return json(200, { sites: mySites });
  }

  if (method !== 'POST') return json(405, { error: '未対応のメソッドです' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: '不正なリクエストです' });
  }

  const email = await requireSession(payload.token);
  if (!email) return json(401, { error: 'ログインが必要です' });

  const { action } = payload;

  if (action === 'claimCoin') {
    const slug = normalizeSlug(payload.slug);
    const site = await getJSON(STORE_NAMES.LENDING_SITES, slug);
    if (!site) return json(404, { error: 'サイトが見つかりません' });
    const ownerProfile = await getAccountProfile(site.ownerEmail);
    const ownerIsAdmin = Boolean(await requireAdmin(site.ownerEmail === email ? payload.token : null));
    if (!ownerIsAdmin && !ownerProfile?.isOfficial) return json(403, { error: 'Coin配布サイトの作者が運営または公認ではありません' });
    const amount = Math.floor(Number(payload.amount));
    const binding = String(payload.binding || '').trim();
    const programs = Array.isArray(site.coinPrograms) ? site.coinPrograms : parseCoinPrograms(site.html || '');
    const mailBindings = parseMailBindings(site.html || '');
    if (!binding || !mailBindings[binding] || !programs.some((program) => program.kind === 'variable' && program.runtime && program.referenceName === binding)) return json(400, { error: '`${score}`形式の有効なCoin命令が見つかりません' });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return json(400, { error: 'スコアは1〜100000の整数で指定してください' });
    const nonce = String(payload.nonce || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
    if (!nonce) return json(400, { error: '重複防止用nonceが必要です' });
    const claimKey = `coin-claim:${slug}:${email}:${nonce}`;
    if (await getJSON(STORE_NAMES.LENDING_DATA, claimKey)) return json(200, { ok:true, duplicate:true, amount:0, balance:Number(await getJSON(STORE_NAMES.COINS, email)) || 0 });
    const current = Number(await getJSON(STORE_NAMES.COINS, email)) || 0;
    const next = current + amount;
    await setJSON(STORE_NAMES.COINS, email, next);
    await setJSON(STORE_NAMES.LENDING_DATA, claimKey, { value: { amount, createdAt: new Date().toISOString() } });
    return json(200, { ok:true, amount, balance:next });
  }

  if (action === 'runCoinProgram') {
    const slug = normalizeSlug(payload.slug);
    const site = await getJSON(STORE_NAMES.LENDING_SITES, slug);
    if (!site || site.ownerEmail !== email) return json(404, { error: 'サイトが見つかりません' });
    const ownerProfile = await getAccountProfile(email);
    const isAdmin = Boolean(await requireAdmin(payload.token));
    if (!isAdmin && !ownerProfile?.isOfficial) return json(403, { error: 'Coinプログラムは運営または公認アカウントのサイトのみ実行できます' });
    const programs = Array.isArray(site.coinPrograms) ? site.coinPrograms : parseCoinPrograms(site.html || '');
    const mailBindings = parseMailBindings(site.html || '');
    if (!programs.length) return json(400, { error: '有効なCoin命令がありません。例: Coin+100{user@example.com‹BoxMedia›} または Coin+let amount{/[amount]‹BoxMedia›}' });
    const results = [];
    for (const program of programs) {
      const resolved = program.kind === 'variable' ? await resolveCoinVariable(slug, program, mailBindings, email) : { amount:program.amount, target:program.target };
      const target = String(resolved.target || (Object.keys(mailBindings).length ? email : email)).toLowerCase();
      const amount = Number(resolved.amount);
      if (resolved.error || !Number.isFinite(amount) || amount <= 0) { results.push({ ...program, ok:false, error:resolved.error || 'Coin増加量が不正です' }); continue; }
      if (!await getJSON(STORE_NAMES.ACCOUNTS, target)) { results.push({ ...program, ok:false, error:'対象アカウントが見つかりません' }); continue; }
      const current = Number(await getJSON(STORE_NAMES.COINS, target)) || 0;
      const next = current + Math.min(100000000, Math.floor(amount));
      await setJSON(STORE_NAMES.COINS, target, next);
      results.push({ ...program, target, amount:Math.floor(amount), ok:true, balance:next });
    }
    return json(200, { ok: results.every((item) => item.ok), results });
  }

  if (action === 'saveSite') {
    const slug = normalizeSlug(payload.slug);
    if (!slug) return json(400, { error: '識別子(スラッグ)が不正です(英数字とハイフン、2〜40文字)' });

    const html = String(payload.html || '');
    if (html.length > MAX_HTML_BYTES) return json(400, { error: 'HTMLが大きすぎます(200KBまで)' });

    const existing = await getJSON(STORE_NAMES.LENDING_SITES, slug);
    if (existing && existing.ownerEmail !== email) {
      return json(409, { error: 'この識別子は他のユーザーが使用中です' });
    }

    const ownerProfile = await getAccountProfile(email);
    const isAdmin = Boolean(await requireAdmin(payload.token));
    const coinPrograms = parseCoinPrograms(html);
    if (coinPrograms.length && !isAdmin && !ownerProfile?.isOfficial) return json(403, { error: 'Coin命令を含むサイトは運営または公認アカウントのみ作成できます' });
    const site = {
      slug, ownerEmail: email, title:String(payload.title || slug).slice(0,120), html, coinPrograms,
      updatedAt:new Date().toISOString(), createdAt:existing?existing.createdAt:new Date().toISOString()
    };
    site.reviewFingerprint=fingerprint(getTargetContent('site',site));
    const reviewChanged=!existing||existing.reviewFingerprint!==site.reviewFingerprint;
    site.ageReview=reviewChanged?{status:'pending',categories:[]}:(existing.ageReview||{status:'pending',categories:[]});
    site.programReview=reviewChanged?{status:'pending',human:null,ai:existing?.programReview?.ai||null}:{...(existing.programReview||{status:'pending'}),fingerprint:site.reviewFingerprint};
    await setJSON(STORE_NAMES.LENDING_SITES, slug, site);
    return json(200, { site: { slug: site.slug, title: site.title, updatedAt: site.updatedAt } });
  }

  if (action === 'getSite') {
    const slug = normalizeSlug(payload.slug);
    const site = await getJSON(STORE_NAMES.LENDING_SITES, slug);
    if (!site || site.ownerEmail !== email) return json(404, { error: 'サイトが見つかりません' });
    return json(200, { site });
  }

  if (action === 'deleteSite') {
    const slug = normalizeSlug(payload.slug);
    const site = await getJSON(STORE_NAMES.LENDING_SITES, slug);
    if (!site || site.ownerEmail !== email) return json(404, { error: 'サイトが見つかりません' });
    await deleteKey(STORE_NAMES.LENDING_SITES, slug);
    return json(200, { ok: true });
  }

  return json(400, { error: '不明なactionです' });
}
