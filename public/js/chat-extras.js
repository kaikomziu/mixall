/* チャット共通: 右上メニュー(下部カードをポップアップ表示) と 右下「⇊」最下部ボタン */
(function () {
  if (window.__chatExtras) return;
  window.__chatExtras = true;
  const style = document.createElement('style');
  style.textContent = `
  .chat-popup-card{display:none!important}
  .chat-popup-card.chat-popup-open{display:block!important;position:fixed!important;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,94vw);max-height:84vh;overflow:auto;z-index:2100;margin:0!important;box-shadow:0 12px 48px rgba(0,0,0,.45)}
  .chat-popup-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2090;display:none}
  .chat-popup-backdrop.on{display:block}
  .chat-popup-close{position:sticky;top:0;float:right;z-index:2}
  .chat-menu-wrap{position:relative;display:inline-block}
  .chat-menu-panel{position:absolute;right:0;top:calc(100% + 6px);min-width:210px;max-width:86vw;z-index:2000;background:var(--card,var(--panel,#fff));color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:6px;display:none;flex-direction:column;gap:2px}
  .chat-menu-panel.on{display:flex}
  .chat-menu-panel button{text-align:left;border:0;background:transparent;color:inherit;padding:10px 12px;border-radius:10px;font-size:.95rem;cursor:pointer;white-space:nowrap}
  .chat-menu-panel button:hover{background:var(--panel-2,rgba(127,127,127,.15))}
  .chat-scroll-bottom{position:fixed;right:14px;bottom:96px;z-index:1500;display:none;width:46px;height:46px;border-radius:50%;border:0;padding:0;font-size:1.5rem;line-height:1;background:var(--accent,#3b82f6);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer}
  .chat-scroll-bottom.on{display:block}`;
  document.head.appendChild(style);

  const $ = (id) => document.getElementById(id);
  const backdrop = document.createElement('div');
  backdrop.className = 'chat-popup-backdrop';
  let openCard = null;
  function closePopup() { if (openCard) openCard.classList.remove('chat-popup-open'); openCard = null; backdrop.classList.remove('on'); }
  function showPopup(card) {
    closePopup();
    card.classList.add('chat-popup-open');
    openCard = card;
    backdrop.classList.add('on');
    card.scrollTop = 0;
  }
  backdrop.addEventListener('click', closePopup);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });

  function setupMenu(anchor, items) {
    const wrap = document.createElement('span');
    wrap.className = 'chat-menu-wrap';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'secondary'; btn.id = 'chatMenuButton';
    btn.textContent = '☰ メニュー'; btn.setAttribute('aria-haspopup', 'true');
    const panel = document.createElement('div');
    panel.className = 'chat-menu-panel'; panel.setAttribute('role', 'menu');
    wrap.append(btn, panel);
    anchor.appendChild(wrap);
    document.body.appendChild(backdrop);
    for (const item of items) {
      const card = $(item.id);
      if (!card) continue;
      card.classList.add('chat-popup-card');
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'secondary chat-popup-close'; close.textContent = '閉じる';
      close.onclick = closePopup;
      card.insertBefore(close, card.firstChild);
    }
    function render() {
      panel.innerHTML = '';
      for (const item of items) {
        const card = $(item.id);
        if (!card) continue;
        if (item.visible && !item.visible(card)) continue;
        const b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = item.label;
        b.onclick = () => { panel.classList.remove('on'); showPopup(card); };
        panel.appendChild(b);
      }
    }
    btn.onclick = (e) => { e.stopPropagation(); render(); panel.classList.toggle('on'); };
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) panel.classList.remove('on'); });
  }

  function setupScrollButton() {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chat-scroll-bottom'; btn.id = 'scrollBottomButton';
    btn.textContent = '⇊'; btn.title = '一番下へ'; btn.setAttribute('aria-label', '一番下へ移動');
    document.body.appendChild(btn);
    const composer = () => { const t = $('msgBody') || $('postBody'); const c = t && t.closest('.card'); return c && getComputedStyle(c).position === 'fixed' ? c : null; };
    const nav = () => document.querySelector('.mixall-bottom-nav,.ghost-bottom-nav');
    function place() {
      const c = composer();
      let offset = 0;
      if (c) offset = Math.max(offset, c.getBoundingClientRect().height);
      const n = nav();
      if (n && getComputedStyle(n).position === 'fixed') offset = Math.max(offset, n.getBoundingClientRect().height);
      btn.style.bottom = (offset + 14) + 'px';
    }
    function update() {
      const doc = document.scrollingElement || document.documentElement;
      const distance = doc.scrollHeight - (doc.scrollTop + window.innerHeight);
      btn.classList.toggle('on', distance > 320);
      place();
    }
    btn.onclick = () => { const doc = document.scrollingElement || document.documentElement; window.scrollTo({ top: doc.scrollHeight, behavior: 'smooth' }); };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    setInterval(update, 1500);
    update();
  }

  function boot() {
    setupScrollButton();
    if ($('roomTitle') && $('messageList')) { // Pocket ルーム
      const anchor = $('searchChatButton') && $('searchChatButton').parentElement;
      if (anchor) setupMenu(anchor, [
        { label: '📝 ノート', id: 'roomNoteCard' },
        { label: '🖼 アルバム', id: 'roomAlbumCard' },
        { label: '📞 メンバーへ通話', id: 'roomCallCard' },
        { label: '🤖 メンバー・ロール・bot・招待', id: 'manageCard', visible: (c) => c.style.display !== 'none' },
        { label: '🛡 地雷フィルター', id: 'roomMinefieldCard' },
        { label: '🏷 このルームでの表示名', id: 'roomNicknameCard' }
      ]);
    } else if ($('threadTitle') && $('postList')) { // Uch スレッド
      const anchor = $('participantsBtn') && $('participantsBtn').parentElement;
      if (anchor) setupMenu(anchor, [
        { label: '⚙ スレ設定（タグ・入室設定）', id: 'uchSettingsCard', visible: (c) => c.dataset.canEdit === '1' },
        { label: '📝 ノート', id: 'uchNoteCard' },
        { label: '🤖 bot設定', id: 'uchBotCard' }
      ]);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
