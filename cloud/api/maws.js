// MixAll Web Search (MAWS): URLを登録するだけで検索に載せられる簡易検索インデックス。
//  GET  /api/maws?q=...&token=...                 登録済みURLの検索(qが空なら新着)
//  POST /api/maws {action:'submit', token, url}   URLの登録(所有権確認なし・登録後の管理機能なし)
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getStore, setEnv, kvPage } from '../_lib/blobs.js';

const STORE = 'netrify-maws';
const ddgCache = new Map();
const SESSIONS = 'netrify-sessions';
const DAILY_LIMIT = 20;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_ENTRIES_SCANNED = 3000;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const getJSON = async (store, key) => { const value = await getStore({ name: store }).get(key, { type: 'text' }); if (!value) return null; try { return JSON.parse(value); } catch (_) { return null; } };
const setJSON = (store, key, value) => getStore({ name: store }).set(key, JSON.stringify(value));
const sha = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');

async function sessionEmail(token) {
  if (!token) return null;
  const session = await getJSON(SESSIONS, String(token));
  return session && session.expiresAt > Date.now() && session.email ? String(session.email) : null;
}

// ---- URLの正規化とSSRF対策 ----
function normalizeUrl(input) {
  const u = new URL(String(input || '').trim());
  if (!/^https?:$/.test(u.protocol)) throw new Error('http(s)のURLを入力してください');
  u.hash = '';
  u.username = ''; u.password = '';
  [...u.searchParams.keys()].forEach((k) => { if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k); });
  u.hostname = u.hostname.toLowerCase();
  return u;
}
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = String(ip).toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}
async function assertPublic(u) {
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('ポート80/443以外のURLは登録できません');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$|\.localhost$/i.test(host)) throw new Error('このURLは登録できません');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('ドメインを解決できませんでした');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('このURLは登録できません');
}

async function fetchHtml(startUrl) {
  let u = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const res = await fetch(u.href, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'MixAllWebSearchBot/1.0', Accept: 'text/html,application/xhtml+xml' } });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const next = res.headers.get('location');
      if (!next) throw new Error('リダイレクト先が不正です');
      u = normalizeUrl(new URL(next, u).href);
      continue;
    }
    if (!res.ok) throw new Error(`ページを取得できませんでした (${res.status})`);
    const type = String(res.headers.get('content-type') || '');
    if (!/html|xml/i.test(type)) throw new Error('HTMLページのみ登録できます');
    const reader = res.body.getReader();
    const chunks = []; let size = 0;
    while (size < MAX_HTML_BYTES) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
    try { await reader.cancel(); } catch (_) {}
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, MAX_HTML_BYTES);
    const charset = (/charset=([\w-]+)/i.exec(type) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buffer.subarray(0, 4096).toString('latin1')) || [])[1] || 'utf-8';
    let html; try { html = new TextDecoder(charset).decode(buffer); } catch (_) { html = buffer.toString('utf8'); }
    return { html, finalUrl: u };
  }
  throw new Error('リダイレクトが多すぎます');
}

const decodeEntities = (s) => String(s).replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  if (map[e.toLowerCase()]) return map[e.toLowerCase()];
  const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
});
function meta(html, ...names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
    const tag = re.exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return '';
}
function extract(html) {
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) throw new Error('このページはnoindexのため登録できません');
  const title = meta(html, 'og:title', 'twitter:title') || decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim();
  const description = meta(html, 'description', 'og:description', 'twitter:description');
  const text = decodeEntities(html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return { title: title.slice(0, 200), description: description.slice(0, 400), text: text.slice(0, 3000) };
}

// ---- 検索 ----
async function loadAll() {
  const entries = []; let after = '';
  while (entries.length < MAX_ENTRIES_SCANNED) {
    const { rows, done } = await kvPage(STORE, after, 2_000_000, 100);
    for (const row of rows) { after = row.key; if (row.key.startsWith('rl:')) continue; try { entries.push(JSON.parse(row.value)); } catch (_) {} }
    if (done || !rows.length) break;
  }
  return entries;
}
function score(entry, terms) {
  const fields = [[entry.title, 5], [entry.domain, 3], [entry.description, 2], [entry.text, 1]].map(([v, w]) => [String(v || '').toLowerCase(), w]);
  let total = 0;
  for (const term of terms) {
    let hit = 0;
    for (const [value, weight] of fields) if (value.includes(term)) hit += weight;
    if (!hit) return 0; // すべての語を含むものだけ
    total += hit;
  }
  return total;
}
const publicEntry = (e) => ({ id: e.id, url: e.url, domain: e.domain, title: e.title || e.domain, description: e.description || e.text?.slice(0, 160) || '', addedAt: e.addedAt });

export async function onRequest(context) {
  const env = context.env || {};
  setEnv(env);
  const request = context.request;
  const url = new URL(request.url);
  try {
    if (request.method === 'GET') {
      const viewerEmail = await sessionEmail(url.searchParams.get('token'));
      const guestOk = url.searchParams.has('ddg') || url.searchParams.has('google'); // 外部検索はアカウント無し(ゲスト)でも使える
      if (!viewerEmail && !guestOk) return json(401, { error: 'ログインが必要です' });
      const guestIp = String(request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
      if (url.searchParams.has('ddg')) { // DuckDuckGo(HTML版)の検索結果を取得して整形
        const email = viewerEmail || 'guest:' + guestIp;
        const q = String(url.searchParams.get('ddg') || '').trim().slice(0, 200);
        if (!q) return json(200, { items: [] });
        const rl = await getJSON(STORE, 'ddg-rl:' + sha(email)); if (rl && Date.now() - rl.at < 1500) return json(429, { error: '検索の間隔を空けてください' });
        await setJSON(STORE, 'ddg-rl:' + sha(email), { at: Date.now() });
        let safe = ['strict', 'moderate', 'off'].includes(url.searchParams.get('safe')) ? url.searchParams.get('safe') : 'moderate';
        if (safe === 'off') { // 安全検索オフは18歳以上(生年月日登録済み)のアカウントだけ
          const acc = viewerEmail ? (await getJSON('netrify-accounts', email) || {}) : {}; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(acc.birthDate || ''));
          let age = null; if (m) { const t = new Date(Date.now() + 9 * 3600e3); age = t.getUTCFullYear() - +m[1]; if (t.getUTCMonth() + 1 < +m[2] || (t.getUTCMonth() + 1 === +m[2] && t.getUTCDate() < +m[3])) age--; }
          if (age === null || age < 18) safe = 'moderate';
        }
        const ck = 'ddg:' + sha(q + safe + (url.searchParams.get('dr') || '') + (url.searchParams.get('lr') || ''));
        const cached = ddgCache.get(ck); if (cached && Date.now() - cached.t < 60000) return json(200, { items: cached.items, safe });
        const api = new URL('https://html.duckduckgo.com/html/'); api.searchParams.set('q', q); api.searchParams.set('kp', safe === 'off' ? '-2' : safe === 'strict' ? '1' : '-1');
        const dr = url.searchParams.get('dr'); if (/^[dwmy]/.test(dr || '')) api.searchParams.set('df', dr[0]);
        const lr = url.searchParams.get('lr'); if (lr === 'lang_ja') api.searchParams.set('kl', 'jp-jp'); else if (lr === 'lang_en') api.searchParams.set('kl', 'us-en');
        const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MixAllSearch/1.0)', 'Accept-Language': 'ja,en;q=0.8' }, signal: AbortSignal.timeout(10000) }).catch(() => null);
        if (!r || !r.ok) return json(200, { items: [], safe, error: 'DuckDuckGoから結果を取得できませんでした' + (r ? ' (' + r.status + ')' : '') });
        const html = await r.text();
        const dec = (x) => String(x || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
        const items = [];
        const starts = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
        for (let i = 0; i < starts.length && items.length < 20; i++) {
          const m = starts[i]; const seg = html.slice(m.index + m[0].length, i + 1 < starts.length ? starts[i + 1].index : html.length);
          const sn = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/.exec(seg);
          let href = m[1].replace(/&amp;/g, '&'); const u = /[?&]uddg=([^&]+)/.exec(href); if (u) { try { href = decodeURIComponent(u[1]); } catch (_) {} }
          if (href.startsWith('//')) href = 'https:' + href;
          if (!/^https?:\/\//i.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue; // 広告を除外
          let domain = ''; try { domain = new URL(href).hostname; } catch (_) { continue; }
          items.push({ title: dec(m[2]).slice(0, 160), url: href, domain, snippet: dec(sn ? sn[1] : '').slice(0, 260) });
        }
        ddgCache.set(ck, { t: Date.now(), items }); if (ddgCache.size > 200) ddgCache.clear();
        return json(200, { items, safe });
      }
      if (url.searchParams.has('google')) { // Google連携(Programmable Search / Custom Search JSON API)
        const saved = await getJSON('netrify-admin-secrets', 'google:cse') || {};
        const apiKey = saved.apiKey || env.GOOGLE_CSE_KEY || '', cx = saved.cx || env.GOOGLE_CSE_CX || '';
        if (!apiKey || !cx) return json(200, { configured: false, items: [] });
        const q = String(url.searchParams.get('google') || '').trim().slice(0, 200);
        if (!q) return json(200, { configured: true, items: [] });
        const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), counterKey = 'google-quota:' + day;
        const used = (await getJSON(STORE, counterKey)) || { n: 0 };
        if (used.n >= 95) return json(200, { configured: true, items: [], limited: true });
        used.n += 1; await setJSON(STORE, counterKey, used);
        const api = new URL('https://www.googleapis.com/customsearch/v1');
        api.searchParams.set('key', apiKey); api.searchParams.set('cx', cx); api.searchParams.set('q', q); api.searchParams.set('num', '10'); api.searchParams.set('safe', 'active');
        const dr = url.searchParams.get('dr'); if (/^[dwmy]\d{1,3}$/.test(dr || '')) api.searchParams.set('dateRestrict', dr);
        const lr = url.searchParams.get('lr'); if (/^lang_[a-z]{2}(-[A-Za-z]{2})?$/.test(lr || '')) api.searchParams.set('lr', lr);
        const ft = url.searchParams.get('ft'); if (/^[a-z0-9]{2,5}$/i.test(ft || '')) api.searchParams.set('fileType', ft);
        const start = Number(url.searchParams.get('start')); if (start >= 1 && start <= 91) api.searchParams.set('start', String(start));
        const r = await fetch(api, { signal: AbortSignal.timeout(10000) }).catch(() => null);
        const d = r ? await r.json().catch(() => null) : null;
        if (!r || !r.ok || !d) return json(200, { configured: true, items: [], error: (d && d.error && d.error.message) || 'Google\u304B\u3089\u7D50\u679C\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F' });
        return json(200, { configured: true, items: (d.items || []).map((x) => ({ title: String(x.title || '').slice(0, 160), url: x.link, domain: x.displayLink, snippet: String(x.snippet || '').replace(/\s+/g, ' ').slice(0, 260) })) });
      }
      const terms = String(url.searchParams.get('q') || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
      const entries = await loadAll();
      if (url.searchParams.get('all')) { // 絞り込み検索画面用: 新しい順に最大500件(本文は冒頭だけ)
        const recent = entries.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))).slice(0, 500);
        return json(200, { total: entries.length, entries: recent.map((e) => ({ ...publicEntry(e), snippet: String(e.text || '').slice(0, 500) })) });
      }
      const results = terms.length
        ? entries.map((e) => ({ e, s: score(e, terms) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || String(b.e.addedAt).localeCompare(String(a.e.addedAt))).map((x) => x.e)
        : entries.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
      return json(200, { total: results.length, results: results.slice(0, 30).map(publicEntry) });
    }
    if (request.method !== 'POST') return json(405, { error: '未対応のメソッドです' });
    let payload; try { payload = await request.json(); } catch (_) { return json(400, { error: '不正なリクエストです' }); }
    const email = await sessionEmail(payload.token);
    if (!email) return json(401, { error: 'ログインが必要です' });
    if (payload.action !== 'submit') return json(400, { error: '不明な操作です' });

    let target;
    try { target = normalizeUrl(payload.url); } catch (error) { return json(400, { error: error.message || 'URLが不正です' }); }
    const day = new Date().toISOString().slice(0, 10);
    const limitKey = `rl:${sha(email).slice(0, 16)}:${day}`;
    const used = Number(await getStore({ name: STORE }).get(limitKey, { type: 'text' }) || 0);
    if (used >= DAILY_LIMIT) return json(429, { error: `1日に登録できるのは${DAILY_LIMIT}件までです` });

    let page;
    try { page = await fetchHtml(target); } catch (error) { return json(422, { error: error.name === 'TimeoutError' ? 'ページの取得がタイムアウトしました' : error.message || 'ページを取得できませんでした' }); }
    let info; try { info = extract(page.html); } catch (error) { return json(422, { error: error.message }); }
    const finalUrl = page.finalUrl;
    const id = sha(finalUrl.href).slice(0, 24);
    const previous = await getJSON(STORE, id);
    const now = new Date().toISOString();
    const entry = { id, url: finalUrl.href, domain: finalUrl.hostname, ...info, addedAt: previous?.addedAt || now, updatedAt: now, by: sha(email).slice(0, 12) };
    await setJSON(STORE, id, entry);
    await getStore({ name: STORE }).set(limitKey, String(used + 1));
    return json(previous ? 200 : 201, { ok: true, updated: Boolean(previous), entry: publicEntry(entry) });
  } catch (error) {
    console.error('maws error:', error && error.stack || error);
    return json(500, { error: 'サーバーエラーが発生しました' });
  }
}
