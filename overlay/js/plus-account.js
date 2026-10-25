// js/plus-account.js（MixAll +（二世代）・アカウント設定）
// 以前の GitHub 版（js/account-plus.js）から移したもの:
//   QRコードで別の端末にログイン / ミュート / プロフィールの装飾（Ghost） / 返信リマインド
(function () {
  'use strict';
  if (!window.MixAllPlus) return;
  const { esc, session, toast } = window.MixAllPlus;
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);

  function card(id, title, html) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'card'; el.id = id;
      const anchor = document.getElementById('deleteAccountCard');
      const main = document.querySelector('main');
      if (anchor) anchor.insertAdjacentElement('beforebegin', el); else if (main) main.appendChild(el);
    }
    el.innerHTML = `<h3>${title}</h3>${html}`;
    return el;
  }

  // ---------------- QRコードで別の端末にログイン ----------------
  function loadQrLib() {
    if (window.QRCode) return Promise.resolve();
    return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'; s.onload = resolve; s.onerror = () => reject(new Error('QRコードの部品を読み込めませんでした')); document.head.appendChild(s); });
  }
  let transferTimer = null;
  function renderTransfer(state) {
    const el = card('mxTransferCard', '📲 別の端末でログイン（QR）', state || `
      <p class="muted">新しいスマホやパソコンで、パスワードを入れずにこのアカウントにログインできます。ここでQRコードを作り、新しい端末のカメラで読み取ってください。QRコードは10分間・1回だけ使えます。</p>
      <div class="row"><button type="button" id="mxTransferMake">QRコードを作る</button></div>`);
    const make = el.querySelector('#mxTransferMake');
    if (make) make.onclick = makeTransfer;
  }
  async function makeTransfer() {
    try {
      const r = await plus('transferCreate', {});
      const url = `${location.origin}/login/?transfer=${r.id}`;
      await loadQrLib();
      renderTransfer(`<p class="muted">新しい端末のカメラでこのQRコードを読み取ってください。<strong>読み取った端末でこのアカウントにログインできるので、他の人には見せないでください。</strong></p>
        <div class="mx-qr"><div id="mxQr"></div><span id="mxQrLeft" class="muted" style="color:#555"></span></div>
        <div class="row" style="justify-content:center"><button type="button" class="secondary" id="mxCopyLink">リンクをコピー</button><button type="button" class="secondary" id="mxTransferCancel">取り消す</button></div>`);
      new window.QRCode(document.getElementById('mxQr'), { text: url, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M });
      document.getElementById('mxCopyLink').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました（他の人に送らないでください）'); } catch (_) { toast('コピーできませんでした', { kind: 'error' }); } };
      const cancel = async () => { clearInterval(transferTimer); try { await plus('transferCancel', { id: r.id }); } catch (_) { /* ignore */ } renderTransfer(); };
      document.getElementById('mxTransferCancel').onclick = cancel;
      clearInterval(transferTimer);
      transferTimer = setInterval(() => {
        const left = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
        const el = document.getElementById('mxQrLeft');
        if (el) el.textContent = `のこり ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (!left) cancel();
      }, 1000);
    } catch (e) { toast(e.message || 'QRコードを作れませんでした', { kind: 'error' }); }
  }

  // ---------------- ミュート ----------------
  async function renderMutes() {
    let m = window.MixAllPlus.getMutes();
    try { m = (await plus('getMutes', {}, 'GET')).mutes; } catch (_) { /* オフライン時は端末の設定 */ }
    const el = card('mxMuteCard', '🔇 ミュート（Ghost・Uch）', `
      <p class="muted">ミュートした人の投稿や、指定した言葉を含む投稿・コメントを、Ghost と Uch で表示しなくなります。相手には知らされません。</p>
      <label class="muted">人（Ghost の @ID または表示名）</label>
      <div class="row"><input type="text" id="mxMuteUser" placeholder="例: @handle / 表示名" style="flex:1;margin:0"><button type="button" class="secondary" id="mxMuteUserAdd">追加</button></div>
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

  // ---------------- プロフィールの装飾・返信リマインド ----------------
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
    let x = { badges: [], replyReminder: true };
    try { x = (await plus('getProfileExtras', {}, 'GET')).extras; } catch (_) { /* ignore */ }
    const el = card('mxProfileCard', '🎨 プロフィールの装飾（Ghost）', `
      <p class="muted">Ghost のプロフィールページに表示されます。アイコンの枠・名前の色・称号は Coin ページの「Coinショップ」で交換できます。</p>
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

    const on = x.replyReminder !== false;
    const rem = card('mxReminderCard', '⏰ 返信リマインド', `
      <p class="muted">ぽけっとの個人チャットで、相手からのメッセージに20時間以上返信していないとき、通知でお知らせします。</p>
      <div class="row"><button type="button" class="${on ? '' : 'secondary'}" data-rem="on" aria-pressed="${on}">オン</button><button type="button" class="${on ? 'secondary' : ''}" data-rem="off" aria-pressed="${!on}">オフ</button></div>`);
    rem.querySelectorAll('[data-rem]').forEach((b) => { b.onclick = () => save({ replyReminder: b.dataset.rem === 'on' }, b.dataset.rem === 'on' ? '返信リマインドをオンにしました' : '返信リマインドをオフにしました'); });
  }

  function boot() {
    if (!session() || !/^\/account\/?(index\.html)?$/i.test(location.pathname)) return;
    renderProfile();
    renderMutes();
    renderTransfer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300), { once: true });
  else setTimeout(boot, 300);
})();
