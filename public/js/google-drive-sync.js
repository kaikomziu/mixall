// public/js/google-drive-sync.js
// 任意機能: Googleアカウントを連携した人だけ、端末に保存しているチャット本文（chat-vault）を
// Googleドライブの「アプリ専用フォルダ（appDataFolder）」にも保存し、別の端末でも読み戻せるようにする。
// - スコープは drive.appdata だけ（ユーザーのドライブの他のファイルは見えない・触れない）
// - Googleのトークンはこのブラウザの中だけで使い、MixAll +のサーバーへは送らない
// - 連携は MixAll + アカウントごと。ファイルも MixAll + アカウントごとに分ける
(function () {
  'use strict';
  if (window.MixAllDriveSync) return;

  const CLIENT_ID = String(window.MIXALL_GOOGLE_CLIENT_ID || '');
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  function safeGet(key, store) { try { return (store || localStorage).getItem(key); } catch (_) { return null; } }
  function safeSet(key, value, store) { try { (store || localStorage).setItem(key, value); } catch (_) { /* ignore */ } }
  function safeDel(key, store) { try { (store || localStorage).removeItem(key); } catch (_) { /* ignore */ } }

  function currentEmail() {
    try { return (JSON.parse(safeGet('netrify_session') || 'null') || {}).email || null; } catch (_) { return null; }
  }
  function stateKey(email) { return 'mixall.drive:' + email; }
  function getState(email) { try { return JSON.parse(safeGet(stateKey(email)) || 'null') || {}; } catch (_) { return {}; } }
  function setState(email, patch) { const next = { ...getState(email), ...patch }; safeSet(stateKey(email), JSON.stringify(next)); return next; }

  // アクセストークンは1時間ほどで切れる。タブを閉じるまでだけ sessionStorage に置く。
  function tokenKey(email) { return 'mixall.drive.token:' + email; }
  function getToken(email) {
    try {
      const t = JSON.parse(safeGet(tokenKey(email), sessionStorage) || 'null');
      return t && t.expiresAt > Date.now() + 60000 ? t.accessToken : null;
    } catch (_) { return null; }
  }

  async function sha16(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  async function fileName(email) { return `mixall-chat-${await sha16(String(email).toLowerCase())}.json`; }

  let gisPromise = null;
  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { gisPromise = null; reject(new Error('Googleのログイン部品を読み込めませんでした')); };
      document.head.appendChild(script);
    });
    return gisPromise;
  }

  // ボタン操作から呼ぶ（ポップアップが開くため）
  async function requestToken(email, { consent } = {}) {
    if (!CLIENT_ID) throw new Error('Google連携はまだ設定されていません（運営側でOAuthクライアントIDの設定が必要です）');
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (res) => {
          if (!res || res.error || !res.access_token) { reject(new Error(res && res.error_description ? res.error_description : 'Googleの許可が得られませんでした')); return; }
          if (window.google.accounts.oauth2.hasGrantedAllScopes && !window.google.accounts.oauth2.hasGrantedAllScopes(res, SCOPE)) { reject(new Error('ドライブのアプリ用フォルダへのアクセスが許可されませんでした')); return; }
          safeSet(tokenKey(email), JSON.stringify({ accessToken: res.access_token, expiresAt: Date.now() + Number(res.expires_in || 3600) * 1000 }), sessionStorage);
          resolve(res.access_token);
        },
        error_callback: (err) => reject(new Error(err && err.type === 'popup_closed' ? 'Googleの画面が閉じられました' : 'Googleの画面を開けませんでした（ポップアップを許可してください）'))
      });
      client.requestAccessToken({ prompt: consent ? 'consent' : '' });
    });
  }

  async function driveFetch(token, url, init) {
    const res = await fetch(url, { ...(init || {}), headers: { Authorization: `Bearer ${token}`, ...((init && init.headers) || {}) } });
    if (res.status === 401) { const e = new Error('Googleの接続が切れました。もう一度「今すぐ同期」を押してください'); e.code = 401; throw e; }
    if (!res.ok && res.status !== 204) throw new Error(`Googleドライブのエラー（${res.status}）`);
    return res;
  }

  async function findFile(token, name) {
    const q = encodeURIComponent(`name = '${name}' and trashed = false`);
    const res = await driveFetch(token, `${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size)&pageSize=10`);
    const data = await res.json();
    return (data.files || [])[0] || null;
  }

  async function upload(token, fileId, name, body) {
    if (fileId) {
      await driveFetch(token, `${UPLOAD}/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return fileId;
    }
    const boundary = 'mixall' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await driveFetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
    return (await res.json()).id;
  }

  let syncing = null;
  // ドライブ → 端末（新しい方を残してマージ）→ ドライブ の順で同期する
  async function sync({ interactive } = {}) {
    const email = currentEmail();
    if (!email || !window.MixAllChatVault) return { skipped: 'no-session' };
    if (!getState(email).linked) return { skipped: 'not-linked' };
    if (syncing) return syncing;
    syncing = (async () => {
      let token = getToken(email);
      if (!token) {
        if (!interactive) return { skipped: 'no-token' };
        token = await requestToken(email);
      }
      const name = await fileName(email);
      const file = await findFile(token, name);
      let imported = 0;
      if (file) {
        const remote = await (await driveFetch(token, `${DRIVE}/files/${file.id}?alt=media`)).json().catch(() => null);
        if (remote && remote.format === 'mixall-chat-vault') imported = await window.MixAllChatVault.importAll(remote, 'drive');
      }
      const local = await window.MixAllChatVault.exportAll(email);
      const body = JSON.stringify({ ...local, account: email, app: 'MixAll +' });
      const hash = await sha16(JSON.stringify(local.items));
      let fileId = file ? file.id : null;
      const state = getState(email);
      if (!file || state.lastHash !== hash || imported > 0) fileId = await upload(token, fileId, name, body);
      setState(email, { fileId, lastHash: hash, lastSyncAt: Date.now(), lastError: null });
      render();
      return { imported, uploaded: local.items.length };
    })().catch((error) => { setState(email, { lastError: error.message }); render(); throw error; }).finally(() => { syncing = null; });
    return syncing;
  }

  async function link() {
    const email = currentEmail();
    if (!email) throw new Error('先にMixAll +にログインしてください');
    await requestToken(email, { consent: true });
    setState(email, { linked: true, linkedAt: Date.now() });
    return sync({ interactive: true });
  }

  async function unlink({ deleteRemote } = {}) {
    const email = currentEmail();
    if (!email) return;
    if (deleteRemote) {
      const token = getToken(email) || await requestToken(email);
      const file = await findFile(token, await fileName(email));
      if (file) await driveFetch(token, `${DRIVE}/files/${file.id}`, { method: 'DELETE' });
    }
    const token = getToken(email);
    if (token && window.google && window.google.accounts && window.google.accounts.oauth2) { try { window.google.accounts.oauth2.revoke(token, () => {}); } catch (_) { /* ignore */ } }
    safeDel(tokenKey(email), sessionStorage);
    safeDel(stateKey(email));
    render();
  }

  // 新しい本文が端末に入ったら、少し待ってからドライブへ反映（トークンが有効な間だけ）
  let timer = null;
  window.addEventListener('mixall-vault-changed', (event) => {
    if (event.detail && event.detail.source === 'drive') return;
    const email = currentEmail();
    if (!email || !getState(email).linked || !getToken(email)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { sync().catch(() => {}); }, 4000);
  });

  // ---- アカウント設定画面のカード（#driveSyncCard があるページだけ） ----
  function fmt(ms) { return ms ? new Date(ms).toLocaleString('ja-JP') : '—'; }
  function render() {
    const card = document.getElementById('driveSyncCard');
    if (!card) return;
    const email = currentEmail();
    if (!email) { card.style.display = 'none'; return; }
    card.style.display = '';
    const state = getState(email);
    const connected = Boolean(getToken(email));
    const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    card.innerHTML = `<h3>Googleドライブにチャットを保存（任意）</h3>
      <p class="muted">Pocket・Ghostチャット・Mailの本文はこの端末にだけ保存されています。Googleアカウントを連携すると、あなたのGoogleドライブの「アプリ専用フォルダ」にも保存され、別の端末でログインしたときに読み戻せます。MixAll +はドライブの他のファイルを見ることはできず、Googleの許可情報もMixAll +のサーバーには送りません。連携しなくても今まで通り使えます。</p>
      ${CLIENT_ID ? '' : '<p class="muted"><strong>この機能は準備中です</strong>（運営側でGoogleの設定が終わると使えるようになります）。</p>'}
      ${state.linked ? `<p>状態: <strong>連携中</strong>${connected ? '' : '（同期するには「今すぐ同期」でGoogleに再接続）'}<br>最終同期: ${fmt(state.lastSyncAt)}　端末の保存件数: ${window.MixAllChatVault ? window.MixAllChatVault.count() : 0}件</p>` : '<p>状態: 未連携</p>'}
      ${state.lastError ? `<p style="color:#d92d20">${esc(state.lastError)}</p>` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${state.linked
          ? '<button type="button" data-drive="sync">今すぐ同期</button><button type="button" class="secondary" data-drive="unlink">連携を解除</button><button type="button" class="secondary" data-drive="purge" style="border-color:#b42318;color:#b42318">連携を解除してドライブの保存分も削除</button>'
          : `<button type="button" data-drive="link" ${CLIENT_ID ? '' : 'disabled'}>Googleアカウントを連携</button>`}
      </div><p class="muted" data-drive-status></p>`;
    card.querySelectorAll('[data-drive]').forEach((button) => {
      button.onclick = async () => {
        const status = card.querySelector('[data-drive-status]');
        const action = button.dataset.drive;
        if (action === 'purge' && !confirm('Googleドライブに保存したMixAll +のチャットを削除して、連携を解除します。この端末の保存分は残ります。よろしいですか？')) return;
        button.disabled = true; status.textContent = '処理中...';
        try {
          if (action === 'link') { const r = await link(); status.textContent = `連携しました（ドライブから${r.imported}件読み込み）`; }
          if (action === 'sync') { const r = await sync({ interactive: true }); status.textContent = `同期しました（ドライブから${r.imported}件読み込み）`; }
          if (action === 'unlink') { await unlink(); }
          if (action === 'purge') { await unlink({ deleteRemote: true }); }
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
      };
    });
  }

  window.MixAllDriveSync = { link, unlink, sync, render, isLinked: () => { const e = currentEmail(); return Boolean(e && getState(e).linked); } };

  function boot() {
    render();
    // 連携中でトークンが有効なら、ページを開いたときに別端末の分を取り込む
    setTimeout(() => { sync().catch(() => {}); }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
