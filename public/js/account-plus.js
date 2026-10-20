// public/js/account-plus.js
// アカウント設定画面に MixAll+ の設定カードを追加する:
//   プッシュ通知 / 新しい端末への引き継ぎ（QR） / ミュート / プロフィールの装飾
(function () {
  'use strict';
  const BASE = String(window.MIXALL_BASE || '').replace(/\/$/, '');
  const SITE = String(window.MIXALL_SITE_URL || location.origin + BASE).replace(/\/$/, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const toast = (m, o) => window.MixAllUX && window.MixAllUX.toast(m, o);
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);

  function card(id, title, html) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'card'; el.id = id;
      const anchor = document.getElementById('deleteAccountCard') || null;
      const main = document.querySelector('main');
      if (anchor) anchor.insertAdjacentElement('beforebegin', el); else if (main) main.appendChild(el);
    }
    el.innerHTML = `<h3>${title}</h3>${html}`;
    return el;
  }

  // ---------------- プッシュ通知 ----------------
  async function renderPush() {
    const P = window.MixAllPlus.push;
    const status = await P.status().catch(() => 'unsupported');
    const ios = /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
    const el = card('mxPushCard', '🔔 プッシュ通知', `
      <p class="muted">返信・メンション・新着メッセージなどを、サイトを閉じていてもこの端末に通知します。チャットの本文は通知に含めません。</p>
      ${ios ? '<p class="muted">iPhone・iPadでは、Safariの共有ボタン →「ホーム画面に追加」から開いたときに使えます。</p>' : ''}
      <p>状態: <strong>${{ on: 'オン', off: 'オフ', denied: 'ブロック中（ブラウザの設定で通知を許可してください）', unsupported: 'この端末では使えません' }[status]}</strong></p>
      <div class="row">${status === 'on' ? '<button type="button" data-push="test" class="secondary">テスト通知を送る</button><button type="button" data-push="off" class="secondary">オフにする</button>' : (status === 'off' ? '<button type="button" data-push="on">通知をオンにする</button>' : '')}</div>`);
    el.querySelectorAll('[data-push]').forEach((b) => { b.onclick = async () => {
      try {
        if (b.dataset.push === 'on') { await P.enable(); toast('プッシュ通知をオンにしました'); }
        if (b.dataset.push === 'off') { await P.disable(); toast('プッシュ通知をオフにしました'); }
        if (b.dataset.push === 'test') { const r = await P.test(); toast(r.sent ? 'テスト通知を送りました' : '送信先の端末が見つかりませんでした', { kind: r.sent ? 'info' : 'error' }); }
      } catch (e) { toast(e.message, { kind: 'error' }); }
      renderPush();
    }; });
  }

  // ---------------- 端末の引き継ぎ（QR） ----------------
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const toB64 = (bytes) => { let s = ''; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const b64url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64url = (s) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  async function gzip(bytes) {
    if (!window.CompressionStream) return { bytes, gz: false };
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return { bytes: new Uint8Array(out), gz: true };
  }
  async function gunzip(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()); }
  function loadQrLib() {
    if (window.QRCode) return Promise.resolve();
    return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'; s.onload = resolve; s.onerror = () => reject(new Error('QRコードの部品を読み込めませんでした')); document.head.appendChild(s); });
  }
  let transferTimer = null;
  function renderTransfer(state) {
    const el = card('mxTransferCard', '📲 新しい端末への引き継ぎ', state || `
      <p class="muted">チャットの本文はこの端末にだけ保存されています。機種変更のときは、ここでQRコードを作り、新しい端末のカメラで読み取ってください（新しい端末でも同じアカウントにログインしておきます）。データは暗号化され、鍵はQRコードの中にだけあるので、サーバーからは中身を読めません。QRコードは10分間有効です。</p>
      <p class="muted">この端末の保存件数: <strong>${window.MixAllChatVault ? window.MixAllChatVault.count() : 0}</strong> 件</p>
      <div class="row"><button type="button" id="mxTransferMake">QRコードを作る</button></div>`);
    const make = el.querySelector('#mxTransferMake');
    if (make) make.onclick = makeTransfer;
  }
  async function makeTransfer() {
    const s = session();
    try {
      const data = await window.MixAllChatVault.exportAll(s.email);
      if (!data.items.length) { toast('この端末には引き継ぐチャットがありません', { kind: 'error' }); return; }
      const { bytes, gz } = await gzip(enc.encode(JSON.stringify(data)));
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
      const r = await plus('transferCreate', { data: toB64(cipher), iv: b64url(iv) });
      const url = `${SITE}/account/?transfer=${r.id}#k=${b64url(raw)}&z=${gz ? 1 : 0}`;
      await loadQrLib();
      renderTransfer(`<p class="muted">新しい端末のカメラでこのQRコードを読み取ってください。<strong>他の人には見せないでください。</strong></p>
        <div class="mx-qr"><div id="mxQr"></div><span id="mxQrLeft" class="muted" style="color:#555"></span></div>
        <div class="row" style="justify-content:center"><button type="button" class="secondary" id="mxCopyLink">リンクをコピー</button><button type="button" class="secondary" id="mxTransferCancel">取り消す</button></div>
        <p class="muted">${data.items.length}件のメッセージを暗号化して預けました。</p>`);
      new window.QRCode(document.getElementById('mxQr'), { text: url, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M });
      document.getElementById('mxCopyLink').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました（他の人に送らないでください）'); } catch (_) { toast('コピーできませんでした', { kind: 'error' }); } };
      const cancel = async () => { clearInterval(transferTimer); try { await plus('transferDone', { id: r.id }); } catch (_) { /* ignore */ } renderTransfer(); };
      document.getElementById('mxTransferCancel').onclick = cancel;
      clearInterval(transferTimer);
      transferTimer = setInterval(() => {
        const left = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
        const el = document.getElementById('mxQrLeft');
        if (el) el.textContent = `のこり ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (!left) cancel();
      }, 1000);
    } catch (e) { toast(e.message || '引き継ぎの準備に失敗しました', { kind: 'error' }); }
  }
  // 新しい端末側: ?transfer=ID#k=鍵 で開かれたら取り込む
  async function receiveTransfer() {
    const id = new URLSearchParams(location.search).get('transfer');
    const hash = new URLSearchParams(location.hash.slice(1));
    const k = hash.get('k');
    if (!id || !k) return;
    const s = session();
    if (!s) return;
    const ok = await window.MixAllDialog.confirm('チャットの引き継ぎ\n古い端末のチャット本文を、この端末に取り込みますか？', { okLabel: '取り込む', icon: '📲' });
    const clean = () => history.replaceState(null, '', location.pathname);
    if (!ok) { clean(); return; }
    try {
      const got = await plus('transferGet', { id }, 'GET');
      if (got.owner && got.owner !== s.email) throw new Error(`このQRコードは別のアカウント（${got.owner}）のものです。そのアカウントでログインしてから読み取ってください。`);
      const key = await crypto.subtle.importKey('raw', fromB64url(k), { name: 'AES-GCM' }, false, ['decrypt']);
      let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(got.iv) }, key, fromB64(got.data)));
      if (hash.get('z') === '1') bytes = await gunzip(bytes);
      const n = await window.MixAllChatVault.importAll(JSON.parse(dec.decode(bytes)), 'transfer');
      try { await plus('transferDone', { id }); } catch (_) { /* ignore */ }
      toast(`${n}件のメッセージを引き継ぎました`);
      renderTransfer();
    } catch (e) { toast(e.message || '引き継ぎに失敗しました', { kind: 'error' }); }
    clean();
  }

  // ---------------- ミュート ----------------
  async function renderMutes() {
    let m = window.MixAllPlus.getMutes();
    try { m = (await plus('getMutes', {}, 'GET')).mutes; } catch (_) { /* オフライン時は端末の設定 */ }
    const el = card('mxMuteCard', '🔇 ミュート（Ghost・Uch）', `
      <p class="muted">ミュートした人の投稿や、指定した言葉を含む投稿・コメントを、Ghost と Uch で表示しなくなります。相手には知らされません。</p>
      <label class="muted">人（メールアドレスまたは Ghost の @ID）</label>
      <div class="row"><input type="text" id="mxMuteUser" placeholder="例: someone@bix.3erver / @handle" style="flex:1;margin:0"><button type="button" class="secondary" id="mxMuteUserAdd">追加</button></div>
      <div class="mx-chip-list" id="mxMuteUsers"></div>
      <label class="muted">言葉</label>
      <div class="row"><input type="text" id="mxMuteWord" placeholder="例: ネタバレ" style="flex:1;margin:0"><button type="button" class="secondary" id="mxMuteWordAdd">追加</button></div>
      <div class="mx-chip-list" id="mxMuteWords"></div>`);
    const save = async () => {
      try { m = (await plus('saveMutes', { mutes: m })).mutes; window.MixAllPlus.setMutes(m); }
      catch (e) { toast(e.message, { kind: 'error' }); }
      draw();
    };
    const draw = () => {
      el.querySelector('#mxMuteUsers').innerHTML = m.users.map((u, i) => `<span class="mx-chip">${esc(u)}<button type="button" data-u="${i}" aria-label="${esc(u)}のミュートを解除">×</button></span>`).join('') || '<span class="muted">なし</span>';
      el.querySelector('#mxMuteWords').innerHTML = m.words.map((w, i) => `<span class="mx-chip">${esc(w)}<button type="button" data-w="${i}" aria-label="${esc(w)}のミュートを解除">×</button></span>`).join('') || '<span class="muted">なし</span>';
      el.querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => { m.users.splice(Number(b.dataset.u), 1); save(); }; });
      el.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => { m.words.splice(Number(b.dataset.w), 1); save(); }; });
    };
    const add = (inputId, list) => { const input = el.querySelector(inputId); const v = input.value.trim().toLowerCase(); if (!v) return; if (!m[list].includes(v)) m[list].push(v); input.value = ''; save(); };
    el.querySelector('#mxMuteUserAdd').onclick = () => add('#mxMuteUser', 'users');
    el.querySelector('#mxMuteWordAdd').onclick = () => add('#mxMuteWord', 'words');
    el.querySelector('#mxMuteUser').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add('#mxMuteUser', 'users'); } };
    el.querySelector('#mxMuteWord').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add('#mxMuteWord', 'words'); } };
    draw();
  }

  // ---------------- プロフィールの装飾 ----------------
  const COLORS = ['#8b6bff', '#3d7bff', '#4fdcff', '#3dffb8', '#ffcc4d', '#ff9f1a', '#ff4f8b', '#e5294b', '#9aa1ad'];
  function resizeImage(file, maxW, maxH) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85)); URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = URL.createObjectURL(file);
    });
  }
  async function renderProfile() {
    let x = { badges: [] };
    try { x = (await plus('getProfileExtras', {}, 'GET')).extras; } catch (_) { /* ignore */ }
    const el = card('mxProfileCard', '🎨 プロフィールの装飾（Ghost）', `
      <p class="muted">Ghost のプロフィールページに表示されます。</p>
      <div class="mx-profile-hero" style="--mx-profile-color:${esc(x.color || '#8b6bff')}"><div class="mx-profile-banner" id="mxHeaderPreview"${x.headerUrl ? ` style="background-image:url('${esc(x.headerUrl)}')"` : ''}></div>
        <div class="mx-profile-meta">${(x.badges || []).map((b) => `<span class="mx-profile-badge">${esc(b.icon)} ${esc(b.label)}</span>`).join('') || '<span class="muted">バッジは利用状況に応じて自動で付きます（新人・古参・連続ログイン・運営・公認など）</span>'}</div></div>
      <div class="row"><label class="button secondary" style="cursor:pointer">ヘッダー画像を選ぶ<input type="file" accept="image/*" id="mxHeaderFile" hidden></label>${x.headerUrl ? '<button type="button" class="secondary" id="mxHeaderClear">画像を外す</button>' : ''}</div>
      <p class="muted" style="margin-top:12px">テーマカラー</p>
      <div class="mx-swatches">${COLORS.map((c) => `<button type="button" data-color="${c}" style="background:${c}" aria-label="色 ${c}" aria-pressed="${(x.color || '#8b6bff') === c}"></button>`).join('')}</div>
      <p class="muted" style="margin-top:12px">リンク（任意）</p>
      <div class="row"><input type="url" id="mxProfileLink" value="${esc(x.link || '')}" placeholder="https://..." style="flex:1;margin:0"><button type="button" class="secondary" id="mxProfileLinkSave">保存</button></div>`);
    const save = async (patch, msg) => { try { await plus('saveProfileExtras', patch); toast(msg || '保存しました'); } catch (e) { toast(e.message, { kind: 'error' }); } renderProfile(); };
    el.querySelector('#mxHeaderFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { save({ headerDataUrl: await resizeImage(f, 1500, 600) }, 'ヘッダー画像を設定しました'); } catch (err) { toast(err.message, { kind: 'error' }); } };
    const clear = el.querySelector('#mxHeaderClear'); if (clear) clear.onclick = () => save({ headerDataUrl: '' }, 'ヘッダー画像を外しました');
    el.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => save({ color: b.dataset.color }, 'テーマカラーを変えました'); });
    el.querySelector('#mxProfileLinkSave').onclick = () => save({ link: el.querySelector('#mxProfileLink').value });
  }

  // ---------------- テーマ ----------------
  function renderTheme() {
    const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } return null; };
    const mode = ls('mixall.themeMode') || 'manual';
    const accent = ls('mixall.accent') || 'aurora';
    const ACC = [['aurora', 'オーロラ', 'linear-gradient(135deg,#3d7bff,#9a5bff,#ff4f8b)'], ['ocean', 'オーシャン', 'linear-gradient(135deg,#00c6ff,#3d7bff,#5b3dff)'], ['sakura', 'さくら', 'linear-gradient(135deg,#ff9ac8,#ff5c9a,#c13dff)'], ['mint', 'ミント', 'linear-gradient(135deg,#3dffb8,#0daa93,#2b7bff)'], ['sunset', 'サンセット', 'linear-gradient(135deg,#ffcc4d,#ff7a3d,#ff3d6e)'], ['mono', 'モノクロ', 'linear-gradient(135deg,#5a6275,#8a93a6,#c7ccd6)']];
    const el = card('mxThemeCard', '🎨 テーマ', `
      <p class="muted">ダーク／ライトの切り替え方と、ボタンなどに使うアクセントカラーを選べます（この端末に保存）。</p>
      <div class="row" role="radiogroup" aria-label="切り替え方">${[['manual', '手動（右上の⚙で切り替え）'], ['system', '端末の設定に合わせる'], ['time', '時間帯で自動（6時〜18時はライト）']].map(([v, l]) => `<button type="button" class="secondary" data-mode="${v}" aria-pressed="${mode === v}">${l}</button>`).join('')}</div>
      <p class="muted" style="margin-top:12px">アクセントカラー</p>
      <div class="mx-swatches">${ACC.map(([v, l, g]) => `<button type="button" data-accent="${v}" style="background:${g}" aria-label="${l}" title="${l}" aria-pressed="${accent === v}"></button>`).join('')}</div>`);
    el.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { ls('mixall.themeMode', b.dataset.mode); location.reload(); }; });
    el.querySelectorAll('[data-accent]').forEach((b) => { b.onclick = () => { ls('mixall.accent', b.dataset.accent); location.reload(); }; });
  }

  // ---------------- 返信リマインド ----------------
  async function renderReminder() {
    let on = true;
    try { on = (await plus('getProfileExtras', {}, 'GET')).extras && true; } catch (_) { /* ignore */ }
    const stored = (() => { try { return localStorage.getItem('mixall.replyReminder'); } catch (_) { return null; } })();
    on = stored !== 'off';
    const el = card('mxReminderCard', '⏰ 返信リマインド', `
      <p class="muted">ぽけっとの個人チャットで、相手からのメッセージに20時間以上返信していないとき、通知でお知らせします。</p>
      <div class="row"><button type="button" class="${on ? '' : 'secondary'}" data-rem="on" aria-pressed="${on}">オン</button><button type="button" class="${on ? 'secondary' : ''}" data-rem="off" aria-pressed="${!on}">オフ</button></div>`);
    el.querySelectorAll('[data-rem]').forEach((b) => { b.onclick = async () => {
      try { await plus('setReplyReminder', { on: b.dataset.rem === 'on' }); localStorage.setItem('mixall.replyReminder', b.dataset.rem); toast(b.dataset.rem === 'on' ? '返信リマインドをオンにしました' : '返信リマインドをオフにしました'); } catch (e) { toast(e.message, { kind: 'error' }); }
      renderReminder();
    }; });
  }

  function boot() {
    if (!session() || !window.MixAllPlus) return;
    renderTheme();
    renderReminder();
    renderProfile();
    renderPush();
    renderMutes();
    renderTransfer();
    receiveTransfer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300), { once: true });
  else setTimeout(boot, 300);
})();
