// scripts/build-redirect.mjs
// サイトを EdgeOne（https://mixall-plus.edgeone.dev）へ移したあとの GitHub Pages（/mixall/）を build/ に書き出す。
// - どのページを開いても、同じパスの EdgeOne のページへ移る（/mixall/Ghost/ → /Ghost/）
// - 移る前に、この端末（github.io）にだけ残っている以前の版のチャット本文をサーバーへ戻す（overlay/js/vault-restore.js と同じ処理）
// - サービスワーカーは、保存したページを消して、通知（Web Push）だけ受け取る形に置き換える（既存の購読を生かす）
//   node scripts/build-redirect.mjs [--site https://mixall-plus.edgeone.dev]
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAME } from './lib/site-meta.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const SITE = String(args.site || 'https://mixall-plus.edgeone.dev').replace(/\/$/, '');
// 以前の版の本文を戻す API（GitHub Pages から呼べるよう CORS を返す Supabase 版）
const API = 'https://kifnzvktwbomxthzvvgy.supabase.co/functions/v1/mixall-api';
const BASE = '/mixall';
const OUT = args.out || 'build';

mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) rmSync(join(OUT, name), { recursive: true, force: true });

const page = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${NAME}</title><link rel="canonical" href="${SITE}/">
<meta name="description" content="${NAME} は ${SITE.replace(/^https:\/\//, '')} に移転しました。掲示板・チャット・SNS・メールがひとつになった無料のWebサービスです。">
<meta property="og:title" content="${NAME}"><meta property="og:site_name" content="${NAME}"><meta property="og:url" content="${SITE}/"><meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/ogp/00-mixall.jpg"><meta name="twitter:card" content="summary_large_image">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;color:#e8e8ef;font-family:system-ui,sans-serif;text-align:center;padding:16px}a{color:#7cc4ff}</style>
</head><body><main><h1 style="font-size:1.3rem">${NAME} は新しいアドレスに移りました</h1>
<p id="msg">移動しています…</p><p><a id="go" href="${SITE}/">${SITE.replace(/^https:\/\//, '')}</a></p>
<p style="opacity:.7;font-size:.85rem">新しいアドレスでは、もう一度ログインしてください。</p></main>
<script>
(function () {
  var SITE = ${JSON.stringify(SITE)}, API = ${JSON.stringify(API)}, BASE = ${JSON.stringify(BASE)};
  var p = location.pathname; if (p.indexOf(BASE) === 0) p = p.slice(BASE.length);
  var target = SITE + (p || '/') + location.search + location.hash;
  document.getElementById('go').href = target;
  var moved = false;
  function go() { if (!moved) { moved = true; location.replace(target); } }

  // 以前の版でこの端末にだけ保存されたチャットのうち、自分が書いた本文をサーバーへ戻してから移る（アカウントごとに一度）
  async function restore() {
    var s = null; try { s = JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) {}
    if (!s || !s.token || !s.email || !window.indexedDB) return;
    var done = 'mixall.vaultRestored:' + s.email;
    if (localStorage.getItem(done)) return;
    if (indexedDB.databases && !(await indexedDB.databases()).some(function (d) { return d && d.name === 'mixall-chat-vault'; })) return;
    document.getElementById('msg').textContent = 'この端末に残っているメッセージをサーバーへ戻しています…';
    var rows = await new Promise(function (resolve) {
      var req = indexedDB.open('mixall-chat-vault');
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('items')) { db.close(); resolve([]); return; }
        var all = db.transaction('items', 'readonly').objectStore('items').getAll();
        all.onsuccess = function () { db.close(); resolve(all.result || []); };
        all.onerror = function () { db.close(); resolve([]); };
      };
      req.onerror = function () { resolve([]); };
    });
    var email = String(s.email).toLowerCase();
    var items = rows.filter(function (r) {
      return r && !r.deleted && r.kind === 'message' && (r.channel === 'pocket' || r.channel === 'mail') && r.fields && Object.keys(r.fields).length
        && String((r.meta && r.meta.authorEmail) || '').toLowerCase() === email;
    }).map(function (r) { return { channel: r.channel, convId: r.convId, msgId: r.msgId, kind: 'message', fields: r.fields }; });
    for (var i = 0; i < items.length; i += 100) {
      var res = await fetch(API + '/vault-restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: s.token, items: items.slice(i, i + 100) }) });
      if (!res.ok) return;
    }
    localStorage.setItem(done, String(Date.now()));
  }
  // 戻す処理が長引いても 20 秒で移る
  setTimeout(go, 20000);
  restore().catch(function () {}).then(function () { setTimeout(go, 300); });
})();
</script></body></html>`;
writeFileSync(join(OUT, 'index.html'), page);
writeFileSync(join(OUT, '404.html'), page);

// 通知だけ受け取るサービスワーカー（保存したページは消す）。通知を押したら EdgeOne のページを開く
writeFileSync(join(OUT, 'sw.js'), `// ${NAME} は ${SITE} に移転しました。保存したページは消して、通知だけ受け取ります
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { try { data = { body: event.data.text() }; } catch (__) {} }
  event.waitUntil(self.registration.showNotification(data.title || 'MixAll', {
    body: data.body || '新しいお知らせがあります',
    icon: '${SITE}/icons/icon-192.png',
    badge: '${SITE}/icons/icon-192.png',
    tag: data.tag || 'mixall',
    renotify: true,
    data: { url: data.url || '/Notifications/' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = String((event.notification.data && event.notification.data.url) || '/Notifications/');
  const path = raw.startsWith('/') ? raw.replace(/^${BASE.replace('/', '\\/')}(?=\\/)/, '') : new URL(raw).pathname + new URL(raw).search;
  event.waitUntil(self.clients.openWindow(${JSON.stringify(SITE)} + path));
});
`);
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`built ${OUT}/ (redirect to ${SITE})`);
