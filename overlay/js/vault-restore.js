// js/vault-restore.js（GitHub Pages 版だけで使う）
// 以前の版では、ぽけっと・メールの本文をサーバーに残さず端末（IndexedDB: mixall-chat-vault）にだけ保存していた。
// 今の版はサーバーの本文を表示するので、この端末に残っている「自分が書いたメッセージ」の本文をサーバーへ戻す。
// アカウントごとに一度だけ行う（戻せるのは自分が書いたメッセージだけ。サーバー側でも確認する）。
(function () {
  'use strict';
  const DB_NAME = 'mixall-chat-vault';
  const STORE = 'items';

  function session() { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } }
  function doneKey(email) { return 'mixall.vaultRestored:' + email; }

  async function hasOldVault() {
    if (!window.indexedDB) return false;
    // 無いデータベースを open すると空のものが作られるので、先に一覧で確認する
    if (indexedDB.databases) {
      try { return (await indexedDB.databases()).some((d) => d && d.name === DB_NAME); } catch (_) { return false; }
    }
    return true;
  }

  function readAll() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve([]); return; }
          const all = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
          all.onsuccess = () => { db.close(); resolve(all.result || []); };
          all.onerror = () => { db.close(); resolve([]); };
        };
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  async function run() {
    const s = session();
    if (!s || !s.token || !s.email) return;
    try { if (localStorage.getItem(doneKey(s.email))) return; } catch (_) { return; }
    if (!(await hasOldVault())) { try { localStorage.setItem(doneKey(s.email), 'none'); } catch (_) {} return; }
    const email = String(s.email).toLowerCase();
    const items = (await readAll()).filter((r) => r && !r.deleted && r.kind === 'message' && (r.channel === 'pocket' || r.channel === 'mail')
      && String((r.meta && r.meta.authorEmail) || '').toLowerCase() === email && r.fields && Object.keys(r.fields).length)
      .map((r) => ({ channel: r.channel, convId: r.convId, msgId: r.msgId, kind: 'message', fields: r.fields }));
    let restored = 0;
    for (let i = 0; i < items.length; i += 100) {
      const res = await fetch((window.MixAllBase ? MixAllBase.api : '/api') + '/vault-restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: s.token, items: items.slice(i, i + 100) })
      });
      if (!res.ok) return; // 失敗したら次に開いたときにもう一度
      restored += Number((await res.json()).restored || 0);
    }
    try { localStorage.setItem(doneKey(s.email), String(Date.now())); } catch (_) {}
    if (restored) console.info(`以前の版で端末に保存されていたメッセージを ${restored} 件戻しました`);
  }

  const start = () => setTimeout(() => { run().catch(() => {}); }, 2500);
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
})();
