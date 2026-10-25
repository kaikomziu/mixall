// MixAllアプリストア: ユーザーが自分のアプリ(Chrome拡張・Android・iPhone・Windowsなど)を無料で共有する。
//  GET  /api/store?token=...&q=...&platform=...    一覧
//  POST /api/store {action:'publish'|'delete'|'download'|'report', token, ...}
// ファイル本体は既存のファイル保存(/api/files)を使い、ここには公開情報(名前・説明・fileIdなど)だけを保存する。
import crypto from 'node:crypto';
import { getStore, setEnv, kvPage } from '../_lib/blobs.js';

const STORE = 'netrify-app-store';
const SESSIONS = 'netrify-sessions';
const ACCOUNTS = 'netrify-accounts';
const MANIFESTS = 'netrify-file-manifests';
const PLATFORMS = ['android', 'ios', 'windows', 'mac', 'linux', 'chrome', 'firefox', 'web', 'other'];
const MAX_APPS_PER_USER = 30;
const HIDE_AT_REPORTS = 5;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const getJSON = async (store, key) => { const v = await getStore({ name: store }).get(key, { type: 'text' }); if (!v) return null; try { return JSON.parse(v); } catch (_) { return null; } };
const setJSON = (store, key, value) => getStore({ name: store }).set(key, JSON.stringify(value));
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

async function who(token) {
  if (!token) return null;
  const s = await getJSON(SESSIONS, String(token));
  if (!s || !(s.expiresAt > Date.now()) || !s.email) return null;
  const account = await getJSON(ACCOUNTS, String(s.email).toLowerCase()) || {};
  return { email: String(s.email), name: clip(account.displayName || s.displayName || String(s.email).split('@')[0], 40), admin: account.isAdmin === true || account.isDeputyAdmin === true };
}
const publicApp = (a, me) => ({ id: a.id, name: a.name, description: a.description, version: a.version, platforms: a.platforms, icon: a.icon || '', files: a.files, links: a.links, authorName: a.authorName, downloads: a.downloads || 0, createdAt: a.createdAt, updatedAt: a.updatedAt, mine: Boolean(me && (a.authorHash === sha(me.email))) , canDelete: Boolean(me && (me.admin || a.authorHash === sha(me.email))) });

async function loadApps() {
  const apps = []; let after = '';
  for (let i = 0; i < 20; i++) {
    const { rows, done } = await kvPage(STORE, after, 2_000_000, 100);
    for (const row of rows) { after = row.key; try { const a = JSON.parse(row.value); if (a && a.id) apps.push(a); } catch (_) {} }
    if (done || !rows.length) break;
  }
  return apps;
}

export async function onRequest(context) {
  setEnv(context.env || {});
  const request = context.request;
  const url = new URL(request.url);
  try {
    if (request.method === 'GET') {
      const me = await who(url.searchParams.get('token'));
      if (!me) return json(401, { error: 'ログインが必要です' });
      const q = clip(url.searchParams.get('q'), 80).toLowerCase();
      const platform = url.searchParams.get('platform');
      let apps = (await loadApps()).filter((a) => (a.reports || []).length < HIDE_AT_REPORTS || me.admin);
      if (PLATFORMS.includes(platform)) apps = apps.filter((a) => a.platforms.includes(platform));
      if (q) apps = apps.filter((a) => `${a.name} ${a.description} ${a.authorName}`.toLowerCase().includes(q));
      apps.sort((a, b) => (url.searchParams.get('sort') === 'popular' ? (b.downloads || 0) - (a.downloads || 0) : 0) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return json(200, { total: apps.length, apps: apps.slice(0, 100).map((a) => publicApp(a, me)) });
    }
    if (request.method !== 'POST') return json(405, { error: '未対応のメソッドです' });
    let p; try { p = await request.json(); } catch (_) { return json(400, { error: '不正なリクエストです' }); }
    const me = await who(p.token);
    if (!me) return json(401, { error: 'ログインが必要です' });

    if (p.action === 'publish') {
      const name = clip(p.name, 60);
      if (!name) return json(400, { error: 'アプリ名を入力してください' });
      const platforms = [...new Set((Array.isArray(p.platforms) ? p.platforms : []).filter((x) => PLATFORMS.includes(x)))];
      const files = [];
      for (const f of (Array.isArray(p.files) ? p.files : []).slice(0, 8)) {
        const fileId = String(f.fileId || '');
        if (!/^[a-z0-9]{8,64}$/i.test(fileId) || !PLATFORMS.includes(f.platform)) continue;
        const manifest = await getJSON(MANIFESTS, `${fileId}:manifest`);
        if (!manifest) return json(400, { error: 'アップロードされていないファイルが含まれています' });
        files.push({ fileId, platform: f.platform, fileName: clip(manifest.fileName || f.fileName, 120), size: Number(manifest.totalBytes) || 0 });
      }
      const links = (Array.isArray(p.links) ? p.links : []).slice(0, 8).map((l) => { try { const u = new URL(String(l.url)); return /^https?:$/.test(u.protocol) && PLATFORMS.includes(l.platform) ? { platform: l.platform, url: u.href.slice(0, 500) } : null; } catch (_) { return null; } }).filter(Boolean);
      if (!files.length && !links.length) return json(400, { error: 'ファイルをアップロードするか、配布ページのリンクを入れてください' });
      const icon = typeof p.icon === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(p.icon) && p.icon.length < 60000 ? p.icon : '';
      const authorHash = sha(me.email);
      const now = new Date().toISOString();
      let app = null;
      if (p.appId) {
        app = await getJSON(STORE, String(p.appId));
        if (!app) return json(404, { error: 'アプリが見つかりません' });
        if (app.authorHash !== authorHash && !me.admin) return json(403, { error: '更新できるのは投稿者だけです' });
      } else {
        const mine = (await loadApps()).filter((a) => a.authorHash === authorHash).length;
        if (mine >= MAX_APPS_PER_USER) return json(429, { error: `投稿できるのは${MAX_APPS_PER_USER}件までです` });
        app = { id: crypto.randomBytes(9).toString('hex'), authorHash, authorName: me.name, createdAt: now, downloads: 0, reports: [] };
      }
      Object.assign(app, { name, description: clip(p.description, 1500), version: clip(p.version, 30), platforms: platforms.length ? platforms : [...new Set([...files, ...links].map((x) => x.platform))], icon: icon || (p.appId ? app.icon : ''), files, links, updatedAt: now });
      await setJSON(STORE, app.id, app);
      return json(p.appId ? 200 : 201, { ok: true, app: publicApp(app, me) });
    }
    const app = await getJSON(STORE, String(p.appId || ''));
    if (!app) return json(404, { error: 'アプリが見つかりません' });
    if (p.action === 'delete') {
      if (!me.admin && app.authorHash !== sha(me.email)) return json(403, { error: '削除できるのは投稿者か運営だけです' });
      await getStore({ name: STORE }).delete(app.id);
      return json(200, { ok: true });
    }
    if (p.action === 'download') { app.downloads = (app.downloads || 0) + 1; await setJSON(STORE, app.id, app); return json(200, { ok: true }); }
    if (p.action === 'report') {
      const h = sha(me.email).slice(0, 16);
      app.reports = app.reports || [];
      if (!app.reports.includes(h)) { app.reports.push(h); await setJSON(STORE, app.id, app); }
      return json(200, { ok: true });
    }
    return json(400, { error: '不明な操作です' });
  } catch (error) {
    console.error('store error:', error && error.stack || error);
    return json(500, { error: 'サーバーエラーが発生しました' });
  }
}
