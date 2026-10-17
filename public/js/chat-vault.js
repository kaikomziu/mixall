// public/js/chat-vault.js
// 端末保存チャット（Pocket / Ghostチャット / Mail / Ghostライブ）のクライアント側。
// サーバーにはメッセージIDなどのスタブ（vault:true）しか残らないため、
// 本文は API 応答に同梱される __vault から受け取って IndexedDB に保存し、
// 以後の応答のスタブへ端末の本文を差し込んでから各画面へ渡す。
// window.fetch を包むので、既存画面のコードはそのまま動く。
(function () {
  'use strict';
  if (window.MixAllChatVault) return;

  const VAULT_FUNCTIONS = ['pocket', 'ghost-chat', 'mail', 'chat'];
  const HYDRATE_FUNCTIONS = VAULT_FUNCTIONS.concat(['ghost', 'admin']);
  const MISSING_TEXT = '（この端末には本文が保存されていません）';
  const DB_NAME = 'mixall-chat-vault';
  const STORE = 'items';

  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* ignore */ } }

  function deviceId() {
    let id = safeGet('mixall.chatVault.deviceId');
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = 'd' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      safeSet('mixall.chatVault.deviceId', id);
    }
    return id;
  }

  // ---- IndexedDB（使えない環境ではメモリだけで動く） ----
  const cache = new Map(); // msgId -> record
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, { keyPath: 'msgId' });
            os.createIndex('convId', 'convId');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    return dbPromise;
  }

  const ready = (async () => {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => { for (const record of req.result || []) cache.set(record.msgId, record); resolve(); };
        req.onerror = () => resolve();
      } catch (_) { resolve(); }
    });
  })();

  async function putRecords(records) {
    for (const record of records) cache.set(record.msgId, record);
    const db = await openDb();
    if (!db || !records.length) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        for (const record of records) os.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  async function deleteRecords(ids) {
    for (const id of ids) cache.delete(id);
    const db = await openDb();
    if (!db || !ids.length) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        for (const id of ids) tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  // ---- サーバーから届いた本文を保存 ----
  // 受領済み番号はアカウント（トークン）ごとに持つ。複数アカウント切替時に他アカウントの未受信分を消さないため。
  function ackKey(token) { return 'mixall.chatVault.ack:' + String(token || '').slice(-24); }

  async function storeVault(vault, token) {
    if (!vault || !Array.isArray(vault.items)) return;
    const records = vault.items.filter((item) => item && item.msgId).map((item) => {
      const prev = cache.get(item.msgId);
      return {
        msgId: String(item.msgId),
        channel: item.channel,
        convId: item.convId,
        kind: item.kind || 'message',
        fields: { ...(prev && prev.fields), ...(item.fields || {}) },
        meta: item.meta || (prev && prev.meta) || {},
        updatedAt: Date.now()
      };
    });
    await putRecords(records);
    if (token && Number(vault.maxId) > Number(safeGet(ackKey(token)) || 0)) safeSet(ackKey(token), String(vault.maxId));
    if (vault.more) setTimeout(() => pull(), 200);
  }

  // ---- スタブへ本文を差し込む ----
  const deletedSeen = [];
  function hydrate(node, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) { for (const child of node) hydrate(child, depth + 1); return; }
    if (node.vault === true && node.id) {
      const record = cache.get(String(node.id));
      if (node.deleted) {
        if (record) deletedSeen.push(String(node.id));
      } else if (record) {
        Object.assign(node, record.fields);
        node.vaultLocal = true;
      } else if ('text' in node && !node.text && !node.attachment && !('subject' in node)) {
        node.text = MISSING_TEXT;
        node.vaultMissing = true;
      } else if ('subject' in node && !node.subject) {
        node.subject = '（件名はこの端末に保存されていません）';
        node.vaultMissing = true;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === '__vault') continue;
      const value = node[key];
      if (value && typeof value === 'object') hydrate(value, depth + 1);
    }
  }

  // Ghostライブのチャットは配信中だけサーバーにあるので、見えた時点で端末へ保存する
  async function rememberLiveComments(body) {
    const comments = Array.isArray(body && body.comments) ? body.comments : [];
    const records = comments.filter((c) => c && c.id && c.isLiveChat && c.text && !c.vault).map((c) => ({
      msgId: String(c.id), channel: 'ghost-live', convId: String(body.postId || ''), kind: 'message',
      fields: { text: c.text }, meta: { authorEmail: c.authorEmail, authorName: c.authorName, createdAt: c.createdAt }, updatedAt: Date.now()
    }));
    if (records.length) await putRecords(records);
  }

  function textOf(id) { const record = cache.get(String(id)); return record ? String(record.fields.text || '') : ''; }

  function parseTerms(parsed) { return Array.isArray(parsed && parsed.terms) ? parsed.terms.map((t) => String(t).toLowerCase()).filter(Boolean) : []; }

  function postProcess(fn, request, body) {
    // Pocket検索: 語句の絞り込みを端末の本文で行う
    if (body && body.vaultSearch && Array.isArray(body.messages)) {
      const terms = parseTerms(body.parsed);
      if (terms.length) body.messages = body.messages.filter((m) => {
        const hay = `${m.text || ''} ${m.authorName || ''} ${m.authorEmail || ''}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    // Pocket TXT出力: 端末の本文で組み立てる
    if (body && body.vaultExport && Array.isArray(body.messages)) {
      body.text = body.messages.map((m) => `[${m.createdAt}] ${m.authorName}: ${m.vaultMissing ? '[この端末に本文なし]' : (m.text || '[添付]')}`).join('\n');
    }
    // Mail一覧の検索: 件名・本文で端末側の絞り込み
    if (fn === 'mail' && request.method === 'GET' && Array.isArray(body && body.threads)) {
      const q = String(new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
      if (q) body.threads = body.threads.filter((t) => {
        const own = [t.subject, t.otherEmail, t.otherProfile && t.otherProfile.displayName, t.lastMessage && t.lastMessage.text].join(' ').toLowerCase();
        if (own.includes(q)) return true;
        for (const record of cache.values()) if (record.convId === t.id && String(record.fields.text || '').toLowerCase().includes(q)) return true;
        return false;
      });
    }
  }

  // ---- fetch を包む ----
  const nativeFetch = window.fetch.bind(window);
  function functionName(url) {
    const m = String(url).match(/(?:\/\.netlify\/functions\/|\/mixall-api\/)([A-Za-z0-9-]+)/);
    return m ? m[1] : '';
  }

  function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }

  async function localAnswer(fn, payload) {
    // 地雷フィルターの原文表示は端末に保存した原文から返す
    if (fn === 'pocket' && payload && payload.action === 'getOriginalMessage') {
      await ready;
      const record = cache.get(String(payload.messageId || ''));
      if (!record) return jsonResponse({ error: 'この端末には原文が保存されていません' }, 404);
      const text = String(record.fields.originalText || record.fields.text || '');
      return jsonResponse({ messageId: payload.messageId, text, textChars: [...text].length, textBytes: new TextEncoder().encode(text).length });
    }
    return null;
  }

  async function withEvidence(fn, payload) {
    // 通報時だけ、通報者の端末にある本文を証拠としてサーバーへ送る
    if ((fn === 'pocket' || fn === 'mail') && payload && payload.action === 'report' && payload.messageId) {
      await ready;
      const record = cache.get(String(payload.messageId));
      if (record) {
        const thread = fn === 'mail' && payload.threadId ? cache.get(String(payload.threadId)) : null;
        payload.evidence = { text: record.fields.text || '', attachment: record.fields.attachment || null, subject: thread ? thread.fields.subject || '' : undefined };
        return true;
      }
    }
    return false;
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const fn = functionName(url);
    if (!fn || HYDRATE_FUNCTIONS.indexOf(fn) < 0) return nativeFetch(input, init);

    init = init ? { ...init } : {};
    let payload = null;
    if (typeof init.body === 'string') { try { payload = JSON.parse(init.body); } catch (_) { payload = null; } }
    const local = await localAnswer(fn, payload);
    if (local) return local;
    if (payload && await withEvidence(fn, payload)) init.body = JSON.stringify(payload);

    let requestToken = payload && payload.token ? String(payload.token) : '';
    if (!requestToken) { try { requestToken = new URL(url, location.href).searchParams.get('token') || ''; } catch (_) { requestToken = ''; } }
    if (VAULT_FUNCTIONS.indexOf(fn) >= 0) {
      const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      headers.set('x-mixall-device', deviceId());
      const ack = requestToken ? safeGet(ackKey(requestToken)) : null;
      if (ack) headers.set('x-mixall-ack', ack);
      init.headers = headers;
    }
    const response = await nativeFetch(input, init);
    const type = response.headers.get('content-type') || '';
    if (!/json/i.test(type)) return response;
    let body;
    try { body = await response.clone().json(); } catch (_) { return response; }
    if (!body || typeof body !== 'object') return response;
    await ready;
    if (body.__vault) { await storeVault(body.__vault, requestToken); delete body.__vault; }
    if (fn === 'ghost' && /[?&]liveChat=/.test(url)) await rememberLiveComments(body);
    hydrate(body, 0);
    postProcess(fn, { url: new URL(url, location.href).toString(), method: (init.method || 'GET').toUpperCase() }, body);
    if (deletedSeen.length) deleteRecords(deletedSeen.splice(0));
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
  };

  // ログイン中なら、画面を開いた時点で受信待ちを取りに行く
  function currentToken() {
    try {
      const raw = safeGet('netrify_session');
      if (raw) { const parsed = JSON.parse(raw); if (parsed && parsed.token) return parsed.token; }
    } catch (_) { /* ignore */ }
    try { return window.Netrify && window.Netrify.getSession && (window.Netrify.getSession() || {}).token; } catch (_) { return null; }
  }

  async function pull() {
    const token = currentToken();
    if (!token) return;
    const base = (window.MIXALL_API_BASE || '/.netlify/functions').replace(/\/$/, '');
    try { await window.fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pull', token }) }); } catch (_) { /* オフライン等 */ }
  }

  // 端末の本文を書き出し／読み込み（機種変更時の引き継ぎ用）
  async function exportAll() {
    await ready;
    return { format: 'mixall-chat-vault', version: 1, exportedAt: new Date().toISOString(), items: Array.from(cache.values()) };
  }
  async function importAll(data) {
    if (!data || data.format !== 'mixall-chat-vault' || !Array.isArray(data.items)) throw new Error('MixAllのチャット書き出しファイルではありません');
    await ready;
    const records = data.items.filter((r) => r && r.msgId && r.fields).map((r) => ({ ...r, msgId: String(r.msgId) }));
    await putRecords(records);
    return records.length;
  }

  window.MixAllChatVault = { ready, pull, exportAll, importAll, deviceId, count: () => cache.size, text: textOf };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(pull, 300));
  else setTimeout(pull, 300);
})();
