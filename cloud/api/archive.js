// 運営用: Supabaseのデータを、データ置き場サイト(mixall-data.edgeone.dev の /data)へ書き出すためのAPI。
// 主運営(isAdmin)のみ。ブラウザ側(admin/index.html + js/archive-export.js)が呼び出す。
import { SUPABASE2_URL, SUPABASE2_KEY, SUPABASE3_URL, SUPABASE3_KEY, SUPABASE4_URL, SUPABASE4_KEY, SUPABASE5_URL, SUPABASE5_KEY } from '../_lib/config2.js';
import { getStore, setEnv, archiveName, archiveSeal, archiveOpen, kvCount, kvPage, kvGetRow, kvDeleteKey, kvKeysAfter, kvKeysPrefix, kvConfig, kvCompressBatch } from '../_lib/blobs.js';

const STORES = {
  'netrify-uch-threads': 'Uchスレッド', 'netrify-uch-bots': 'Uch bot', 'netrify-pocket-rooms': 'ぽけっとルーム',
  'netrify-mail-threads': 'Mail', 'netrify-ghost-posts': 'Ghost投稿', 'netrify-ghost-chats': 'Ghostチャット', 'netrify-stamps': 'スタンプ',
  'netrify-attachments': '添付ファイル', 'netrify-file-chunks': 'ファイル本体(分割)', 'netrify-file-manifests': 'ファイル情報', 'netrify-lending-sites': '貸し出しサイト',
  'netrify-lending-data': '貸し出しサイトのデータ', 'netrify-custom-rooms': 'Customルーム', 'netrify-custom-projects': 'Customプロジェクト', 'netrify-custom-data': 'Customデータ',
  'netrify-calendars': 'カレンダー', 'netrify-languages': '特殊言語', 'netrify-tools-data': 'ツールのデータ', 'netrify-wiki-pages': 'Wiki',
  'netrify-extensions': '拡張機能', 'netrify-extension-data': '拡張機能のデータ', 'netrify-webhooks': 'Webhook', 'netrify-coins': 'Coin',
  'netrify-gemini-memories': 'Geminiの記憶', 'netrify-search-history': '検索履歴', 'netrify-admin-files': '運営ファイル', 'netrify-admin-audit': '運営の監査ログ',
  'netrify-notifications': '通知', 'netrify-ghost-tags': 'Ghostタグ', 'netrify-official-accounts': '公式アカウント',
};
// 頻繁に更新される/書き出しに向かないもの(画面には「更新が多い」と表示する)
const HEAVY = new Set(['netrify-file-chunks', 'netrify-attachments', 'netrify-admin-files', 'netrify-stamps', 'netrify-lending-sites']);
const HOT = new Set(['netrify-pocket-rooms', 'netrify-uch-threads', 'netrify-notifications', 'netrify-coins', 'netrify-ghost-chats']);

// 運営向けの重い処理: 余裕のあるサーバー側で並列に実行する
const pmap = async (items, limit, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function requireMainAdmin(token) {
  if (!token) return false;
  const session = await getStore('netrify-sessions').get(String(token), { type: 'json' });
  if (!session || session.expiresAt < Date.now()) return false;
  const account = await getStore('netrify-accounts').get(session.email, { type: 'json' });
  return Boolean(account && account.isAdmin === true);
}
// 書き出したデータの置き場(別サイト)。環境変数 MIXALL_DATA_URL で変更できる。
function origin(context) {
  const env = context.env || {};
  return String(env.MIXALL_DATA_URL || (typeof process !== 'undefined' && process.env.MIXALL_DATA_URL) || 'https://mixall-data.edgeone.dev').replace(/\/+$/, '');
}
async function staticJson(base, path) {
  try { const r = await fetch(base + path, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
async function staticIndexKeys(base, store) {
  const j = await archiveOpen(await staticJson(base, `/data/${encodeURIComponent(store)}/_index.json`));
  return Array.isArray(j && j.keys) ? j.keys : null;
}

export async function onRequestPost(context) {
  setEnv(context.env);
  let p = {};
  try { p = await context.request.json(); } catch (_) { return json({ error: '不正なリクエストです' }, 400); }
  try {
    if (!(await requireMainAdmin(p.token))) return json({ error: '主運営のみ実行できます' }, 403);
    const store = String(p.store || '');
    if (p.action === 'usage') {
      const env = context.env || {};
      const limitMb = Number(env.SUPABASE_DB_LIMIT_MB || (typeof process !== 'undefined' && process.env.SUPABASE_DB_LIMIT_MB) || 500) || 500;
      const { url, key } = kvConfig();
      const h = { apikey: key, 'Content-Type': 'application/json' };
      if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
      const r = await fetch(url + '/rest/v1/rpc/mixall_db_usage', { method: 'POST', headers: h, body: '{}', signal: AbortSignal.timeout(15000) });
      if (!r.ok) return json({ ok: false, needSetup: r.status === 404 || r.status === 400, limitMb, error: `Supabase ${r.status}` });
      const d = await r.json();
      const subUsage = async (n, url0, key0) => {
        try {
          const u2 = String(env['SUPABASE' + n + '_URL'] || url0 || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), k2 = String(env['SUPABASE' + n + '_KEY'] || (typeof process !== 'undefined' && process.env['SUPABASE' + n + '_KEY']) || key0 || '');
          if (!u2 || !k2) return null;
          const h2 = { apikey: k2, 'Content-Type': 'application/json' }; if (k2.startsWith('eyJ')) h2.Authorization = 'Bearer ' + k2;
          const r2 = await fetch(u2 + '/rest/v1/rpc/mixall_db_usage', { method: 'POST', headers: h2, body: '{}', signal: AbortSignal.timeout(8000) });
          return r2.ok ? { ok: true, dbBytes: Number((await r2.json()).db_bytes) || 0 } : { ok: false, error: 'Supabase' + n + ' ' + r2.status };
        } catch (e) { return { ok: false, error: String(e.message || e) }; }
      };
      const sub = await subUsage(2, SUPABASE2_URL, SUPABASE2_KEY), sub3 = await subUsage(3, SUPABASE3_URL, SUPABASE3_KEY), sub4 = await subUsage(4, SUPABASE4_URL, SUPABASE4_KEY), sub5 = await subUsage(5, SUPABASE5_URL, SUPABASE5_KEY);
      return json({ ok: true, sub, sub3, sub4, sub5, limitBytes: limitMb * 1048576, limitMb, dbBytes: Number(d.db_bytes) || 0, kvBytes: Number(d.kv_bytes) || 0, kvRows: Number(d.kv_rows) || 0 });
    }
    if (p.action === 'info') {
      const base = origin(context);
      const rows = await Promise.all(Object.entries(STORES).map(async ([name, label]) => {
        const keys = await staticIndexKeys(base, name);
        return { store: name, label, count: await kvCount(name), archived: keys ? keys.length : 0, hot: HOT.has(name) };
      }));
      return json({ stores: rows, site: base });
    }
    if (!STORES[store]) return json({ error: '対象外のストアです' }, 400);
    if (p.action === 'compress') {
      // Supabase内のテキストをgzipに置き直して容量を減らす(読む側は自動で展開)
      return json(await kvCompressBatch(store, String(p.after || ''), 60));
    }
    if (p.action === 'export') {
      const page = await kvPage(store, String(p.after || ''), 2_000_000, HEAVY.has(store) ? 16 : 200);
      const rows = await pmap(page.rows, 16, async (r) => ({ key: r.key, name: await archiveName(store, r.key), box: await archiveSeal({ key: r.key, value: r.value, encoding: r.encoding, metadata: r.metadata || null }) }));
      return json({ rows, next: rows.length ? rows[rows.length - 1].key : null, done: page.done });
    }
    if (p.action === 'index') {
      // 既存の暗号化インデックス(あれば)と今回のキーを合わせて、新しい暗号化インデックスを返す
      const old = p.existing ? await archiveOpen(p.existing) : null;
      const keys = Array.from(new Set([...(Array.isArray(old && old.keys) ? old.keys : []), ...(Array.isArray(p.keys) ? p.keys.map(String) : [])])).sort();
      return json({ box: await archiveSeal({ keys, updatedAt: new Date().toISOString() }), count: keys.length });
    }
    if (p.action === 'existing') {
      // データ置き場(mixall-data)にいま入っているキー一覧と、そのファイル名(ページ送り)
      const keys = await staticIndexKeys(origin(context), store);
      if (!keys) return json({ total: 0, keys: [], names: [] });
      const sorted = [...keys].sort();
      const offset = Math.max(0, Number(p.offset) || 0), limit = Math.min(2000, Math.max(1, Number(p.limit) || 1500));
      const slice = sorted.slice(offset, offset + limit);
      const names = await pmap(slice, 32, (k) => archiveName(store, k));
      return json({ total: sorted.length, keys: slice, names });
    }
    if (p.action === 'copy') {
      // データ置き場にある既存ファイルを、中身そのまま(暗号化したまま)返す。取得に失敗したらエラーにする(欠けたZIPを作らないため)
      const base = origin(context);
      const names = (Array.isArray(p.names) ? p.names : []).map(String).slice(0, 200);
      const files = {}; let processed = 0, bytes = 0;
      for (let i = 0; i < names.length;) {
        const batch = names.slice(i, i + 16);
        const got = await Promise.all(batch.map(async (name) => {
          if (!/^[0-9a-f]{48}$/.test(name)) throw new Error('不正なファイル名です');
          const r = await fetch(`${base}/data/${encodeURIComponent(store)}/${name}.json`, { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error(`データ置き場から取得できません: ${store}/${name} (${r.status})`);
          return [name, await r.text()];
        }));
        for (const [name, text] of got) { files[name] = text; bytes += text.length; processed += 1; }
        i += batch.length;
        if (bytes > 4_000_000) break;
      }
      return json({ files, processed });
    }
    if (p.action === 'tombs') {
      // 書き出し後に削除されたキー(Supabaseの _deleted に記録されている)
      const out = []; let after = '';
      for (let i = 0; i < 40; i += 1) {
        const ks = await kvKeysPrefix('_deleted', store + '/', after, 500);
        const named = await pmap(ks, 32, async (k) => { const key = k.slice(store.length + 1); return { key, name: await archiveName(store, key) }; }); out.push(...named);
        if (ks.length < 500) break;
        after = ks[ks.length - 1];
      }
      return json({ tombs: out });
    }
    if (p.action === 'sealIndex') {
      const keys = Array.from(new Set((Array.isArray(p.keys) ? p.keys : []).map(String))).sort();
      return json({ box: await archiveSeal({ keys, updatedAt: new Date().toISOString() }), count: keys.length });
    }
    if (p.action === 'purgeTombs') {
      // データ置き場の新しい索引にもう無いキーの削除記録(_deleted)だけを片付ける。索引が読めないときは何もしない
      const keys = await staticIndexKeys(origin(context), store);
      if (!keys) return json({ removed: 0, skipped: true });
      const set = new Set(keys); let removed = 0, after = '';
      for (let i = 0; i < 40; i += 1) {
        const ks = await kvKeysPrefix('_deleted', store + '/', after, 200);
        for (const k of ks) { if (!set.has(k.slice(store.length + 1))) { await kvDeleteKey('_deleted', k); removed += 1; } }
        if (ks.length < 200) break;
        after = ks[ks.length - 1];
      }
      return json({ removed });
    }
    if (p.action === 'purge') {
      // サイト本体に同じ内容があることを確認できたものだけ、Supabaseから削除する
      const base = origin(context);
      const indexed = new Set((await staticIndexKeys(base, store)) || []);
      const keys = await kvKeysAfter(store, String(p.after || ''), 60);
      let deleted = 0; const failed = [];
      await pmap(keys, 8, async (key) => {
        const row = await kvGetRow(store, key);
        if (!row) return;
        const file = indexed.has(key) ? await archiveOpen(await staticJson(base, `/data/${encodeURIComponent(store)}/${await archiveName(store, key)}.json`)) : null;
        if (file && file.key === key && file.value === row.value && file.encoding === row.encoding) { await kvDeleteKey(store, key); deleted += 1; }
        else failed.push(key);
      });
      return json({ deleted, failed, next: keys.length ? keys[keys.length - 1] : null, done: keys.length < 60 });
    }
    return json({ error: '不明なactionです' }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e).slice(0, 300) }, 500);
  }
}
