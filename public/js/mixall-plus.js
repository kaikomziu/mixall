// public/js/mixall-plus.js
// MixAll+ の追加機能（全ページ共通）:
//   お知らせバナー / 下のバーの未読バッジ / プッシュ通知 / ログインボーナスの案内 /
//   画像の拡大表示 / サイト内検索 / ミュート（Ghost・Uch） / Ghostプロフィールの装飾
(function () {
  'use strict';
  if (window.MixAllPlus) return;
  const API = String(window.MIXALL_API_BASE || '/.netlify/functions').replace(/\/$/, '');
  const BASE = String(window.MIXALL_BASE || '').replace(/\/$/, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  function session() { try { return JSON.parse(lsGet('netrify_session') || 'null'); } catch (_) { return null; } }
  async function plus(action, body, method) {
    const s = session();
    if (method === 'GET') {
      const q = new URLSearchParams({ action, ...(s && s.token ? { token: s.token } : {}), ...(body || {}) });
      const r = await fetch(`${API}/plus?${q}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `エラー (${r.status})`);
      return d;
    }
    const r = await fetch(`${API}/plus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token: s && s.token, ...(body || {}) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `エラー (${r.status})`);
    return d;
  }
  const toast = (m, o) => (window.MixAllUX ? window.MixAllUX.toast(m, o) : null);
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());

  // =================================================================
  // 17. お知らせバナー
  // =================================================================
  async function showAnnouncement() {
    let a = null;
    try {
      const cached = JSON.parse(sessionStorage.getItem('mixall.announcement') || 'null');
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) a = cached.a;
      else { a = (await plus('announcement', {}, 'GET')).announcement; sessionStorage.setItem('mixall.announcement', JSON.stringify({ at: Date.now(), a })); }
    } catch (_) { return; }
    if (!a || lsGet('mixall.announcement.closed') === a.id) return;
    const bar = document.createElement('div');
    bar.className = `mx-announce mx-announce-${a.level}`;
    bar.setAttribute('role', 'status');
    bar.innerHTML = `<span class="mx-announce-icon" aria-hidden="true">${{ info: '📢', warning: '⚠️', danger: '🚨', success: '🎉' }[a.level] || '📢'}</span>
      <span class="mx-announce-text">${esc(a.text)}</span>
      ${a.link ? `<a class="mx-announce-link" href="${esc(a.link)}">くわしく</a>` : ''}
      <button type="button" class="mx-announce-close" aria-label="お知らせを閉じる">×</button>`;
    bar.querySelector('.mx-announce-close').onclick = () => { lsSet('mixall.announcement.closed', a.id); bar.classList.add('leaving'); setTimeout(() => bar.remove(), 200); };
    const header = document.querySelector('header.top');
    if (header) header.insertAdjacentElement('afterend', bar); else document.body.prepend(bar);
  }

  // =================================================================
  // 3. 未読バッジ（下のバーとアプリのアイコン）
  // =================================================================
  let badgeTimer = null;
  function setBadge(el, n) {
    if (!el) return;
    let b = el.querySelector('.mx-badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'mx-badge'; el.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', `未読${n}件`);
  }
  async function refreshBadges() {
    const s = session();
    if (!s || !s.token || document.hidden) return;
    try {
      const d = await plus('badges', {}, 'GET');
      lastBadges = d;
      updateBell(d.total);
      if (notifPanel) fillNotifPanel();
      setBadge(document.querySelector('.mixall-bottom-nav [data-nav-group="chat"]'), d.chat);
      setBadge(document.querySelector('.mixall-bottom-nav [data-nav-group="sns"]'), d.sns);
      setBadge(document.querySelector('.ghost-bottom-nav a[href*="notifications"]'), d.sns);
      decoratePanel();
      if (navigator.setAppBadge) { if (d.total) navigator.setAppBadge(d.total).catch(() => {}); else navigator.clearAppBadge().catch(() => {}); }
    } catch (_) { /* オフラインなど */ }
  }

  // =================================================================
  // 右上の通知ベル（どのページでも表示。未読の合計を数字で）
  // =================================================================
  const BELL_SVG = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>';
  const KIND_ICON = { ghostComment: '💬', ghostLike: '♥', pocket: '🗨️', mail: '✉️', uchPost: '📋', usageAlert: '⚠️', test: '🔔' };
  function addBell() {
    if (!session() || document.querySelector('.mx-bell')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mx-bell'; btn.setAttribute('aria-label', '通知'); btn.setAttribute('aria-haspopup', 'dialog'); btn.title = '通知';
    btn.innerHTML = BELL_SVG;
    btn.onclick = (e) => { e.stopPropagation(); toggleNotifPanel(); };
    const header = document.querySelector('header.top');
    if (header) {
      const anchor = header.querySelector('.settings-widget');
      if (anchor) anchor.insertAdjacentElement('beforebegin', btn); else header.appendChild(btn);
    } else {
      // ヘッダーのないページでも右上に浮かべて出す
      btn.classList.add('floating');
      document.body.appendChild(btn);
    }
  }
  function updateBell(total) {
    const btn = document.querySelector('.mx-bell');
    if (!btn) return;
    setBadge(btn, total);
    btn.classList.toggle('has-unread', Boolean(total));
    btn.setAttribute('aria-label', total ? `通知（未読${total}件）` : '通知');
  }
  function ago(iso) {
    const t = (Date.now() - new Date(iso)) / 1000;
    if (!Number.isFinite(t)) return '';
    return t < 60 ? 'たった今' : t < 3600 ? `${Math.floor(t / 60)}分前` : t < 86400 ? `${Math.floor(t / 3600)}時間前` : new Date(iso).toLocaleDateString('ja-JP');
  }
  let notifPanel = null;
  function closeNotifPanel() {
    if (!notifPanel) return;
    notifPanel.classList.add('leaving');
    const p = notifPanel; notifPanel = null;
    setTimeout(() => p.remove(), 160);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escKey, true);
  }
  function outside(e) { if (notifPanel && !notifPanel.contains(e.target) && !e.target.closest('.mx-bell')) closeNotifPanel(); }
  function escKey(e) { if (e.key === 'Escape') closeNotifPanel(); }
  async function toggleNotifPanel() {
    if (notifPanel) { closeNotifPanel(); return; }
    notifPanel = document.createElement('div');
    notifPanel.className = 'mx-notif-panel';
    notifPanel.setAttribute('role', 'dialog');
    notifPanel.setAttribute('aria-label', '通知');
    notifPanel.innerHTML = '<div class="mx-notif-head"><strong>通知</strong><button type="button" class="mx-notif-readall" disabled>すべて既読</button></div><div class="mx-notif-list"><p class="mx-notif-empty">読み込み中...</p></div>';
    document.body.appendChild(notifPanel);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escKey, true);
    await fillNotifPanel();
  }
  async function fillNotifPanel() {
    const panel = notifPanel;
    if (!panel) return;
    const list = panel.querySelector('.mx-notif-list');
    try {
      const d = await plus('notifCenter', {}, 'GET');
      if (panel !== notifPanel) return;
      lastBadges = d.counts; updateBell(d.counts.total);
      list.innerHTML = d.items.length ? d.items.map((it) => `<a class="mx-notif-item${it.unread ? ' unread' : ''}" href="${esc(BASE + it.url)}">
          <span class="mx-notif-icon k-${esc(it.kind)}">${KIND_ICON[it.kind] || '🔔'}</span>
          <span class="mx-notif-body"><span class="mx-notif-title">${esc(it.title)}</span>${it.body ? `<span class="mx-notif-text">${esc(it.body)}</span>` : ''}<span class="mx-notif-sub">${esc([it.sub, ago(it.at)].filter(Boolean).join(' ・ '))}</span></span>
          ${it.count ? `<b class="mx-item-badge">${it.count > 99 ? '99+' : it.count}</b>` : (it.unread ? '<i class="mx-notif-dot" aria-label="未読"></i>' : '')}</a>`).join('')
        : '<p class="mx-notif-empty">新しい通知はありません 🎉</p>';
      const readAll = panel.querySelector('.mx-notif-readall');
      readAll.disabled = !d.items.some((it) => it.unread && !['pocket', 'mail'].includes(it.kind));
      readAll.onclick = async () => {
        readAll.disabled = true;
        try { const r = await plus('markAllRead', {}); lastBadges = r.counts; updateBell(r.counts.total); refreshBadges(); fillNotifPanel(); }
        catch (e) { toast(e.message, { kind: 'error' }); readAll.disabled = false; }
      };
    } catch (e) { list.innerHTML = `<p class="mx-notif-empty">${esc(e.message)}</p>`; }
  }

  // 下のバーのメニューを開いたとき、どの項目に未読があるかも数字で出す
  let lastBadges = null;
  function itemCount(href) {
    if (!lastBadges) return 0;
    let p = '';
    try { p = new URL(href, location.href).pathname; } catch (_) { return 0; }
    if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
    p = p.replace(/\/index\.html$/i, '').replace(/\/+$/, '').toLowerCase();
    if (p === '/pocket') return lastBadges.pocket || 0;
    if (p === '/mail') return lastBadges.mail || 0;
    if (p === '/uch') return lastBadges.uch || 0;
    if (p === '/ghost/notifications.html') return lastBadges.sns || 0;
    return 0;
  }
  function decoratePanel() {
    const panel = document.getElementById('mixall-nav-panel');
    if (!panel || panel.hidden) return;
    panel.querySelectorAll('a.mixall-nav-link[href]').forEach((a) => {
      const n = itemCount(a.getAttribute('href'));
      let b = a.querySelector('.mx-item-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('b'); b.className = 'mx-item-badge'; a.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
      b.setAttribute('aria-label', `未読${n}件`);
    });
    // 折りたたみ（例: 「Ghost内メニュー」「ぽけっと」）にも中の合計を出す
    panel.querySelectorAll('.mixall-nav-subgroup').forEach((g) => {
      const total = [...g.querySelectorAll('a.mixall-nav-link[href]')].reduce((sum, a) => sum + itemCount(a.getAttribute('href')), 0);
      const trigger = g.querySelector('.mixall-nav-subgroup-trigger');
      if (!trigger) return;
      let b = trigger.querySelector('.mx-item-badge');
      if (!total) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('b'); b.className = 'mx-item-badge'; trigger.insertBefore(b, trigger.lastElementChild); }
      b.textContent = total > 99 ? '99+' : String(total);
    });
  }
  // メニューの中身はタップのたびに作り直されるので、変化を見て付け直す
  function watchPanel() {
    const panel = document.getElementById('mixall-nav-panel');
    if (!panel) { setTimeout(watchPanel, 800); return; }
    new MutationObserver(() => decoratePanel()).observe(panel, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  }

  // 開いたページの通知を既読にする（Uch のスレッド・Pocket のルーム）
  function markCurrentScopeRead() {
    if (!session()) return;
    let p = location.pathname; if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
    const q = new URLSearchParams(location.search);
    let scope = '';
    if (/^\/uch\/thread\.html$/i.test(p) && q.get('id')) scope = `uch:${q.get('id')}`;
    if (/^\/pocket\/(room|thread)\.html$/i.test(p) && (q.get('id') || q.get('roomId'))) scope = `pocket:${q.get('id') || q.get('roomId')}`;
    if (!scope || !/^(uch|pocket):[A-Za-z0-9_-]+$/.test(scope)) return;
    plus('markScopeRead', { scope }).then(() => setTimeout(refreshBadges, 1500)).catch(() => {});
  }
  function startBadges() {
    if (!session()) return;
    // 下のバーは mixall-nav.js が後から作るので少し待つ
    setTimeout(refreshBadges, 600);
    clearInterval(badgeTimer);
    badgeTimer = setInterval(refreshBadges, 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadges(); });
  }

  // =================================================================
  // 1. プッシュ通知
  // =================================================================
  function b64ToBytes(b64) {
    const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }
  async function swReg() {
    if (!('serviceWorker' in navigator)) return null;
    const existing = await navigator.serviceWorker.getRegistration(`${BASE}/`);
    return existing || navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` });
  }
  const Push = {
    supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    async status() {
      if (!Push.supported()) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      const reg = await swReg();
      const sub = reg && await reg.pushManager.getSubscription();
      return sub ? 'on' : 'off';
    },
    async enable() {
      if (!Push.supported()) throw new Error('このブラウザはプッシュ通知に対応していません（iPhoneはホーム画面に追加してから開いてください）');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('通知が許可されませんでした');
      const { publicKey } = await plus('pushKey', {}, 'GET');
      if (!publicKey) throw new Error('通知の準備ができていません');
      const reg = await swReg();
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await plus('pushSubscribe', { subscription: sub.toJSON(), device: navigator.userAgent.slice(0, 120) });
      return true;
    },
    async disable() {
      const reg = await swReg();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { try { await plus('pushUnsubscribe', { endpoint: sub.endpoint }); } catch (_) { /* ignore */ } await sub.unsubscribe(); }
    },
    test: () => plus('pushTest', {})
  };

  // =================================================================
  // 12. ログインボーナス（その日最初に開いたときに案内）
  // =================================================================
  async function dailyBonus() {
    const s = session();
    if (!s || !s.token || !window.MixAllDialog) return;
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const key = `mixall.daily.shown:${s.email}`;
    if (lsGet(key) === today) return;
    let d;
    try { d = await plus('daily', {}, 'GET'); } catch (_) { return; }
    lsSet(key, today);
    if (d.claimedToday) return;
    const ok = await window.MixAllDialog.confirm(`ログインボーナス\n連続${d.nextStreak}日目！ ${d.bonus} Coin を受け取れます。\n今日のミッション: ${d.missions.map((m) => m.label).join('・')}`, { okLabel: `${d.bonus} Coin 受け取る`, cancelLabel: 'あとで', danger: false, icon: '🎁' });
    if (!ok) return;
    try { const r = await plus('claimDaily', {}); toast(`${r.claimed} Coin を受け取りました（連続${r.streak}日）`); }
    catch (e) { toast(e.message, { kind: 'error' }); }
  }

  // =================================================================
  // 5. 画像の拡大表示
  // =================================================================
  const SKIP_IMG = /avatar|icon|logo|stamp|emoji|brand|mark/i;
  function isViewable(img) {
    if (!img || img.closest('.mx-lightbox, header, nav, .mixall-bottom-nav, .ghost-bottom-nav, .mixall-dialog-layer, .mx-story-viewer, .mx-stories, .mx-qr, button')) return false;
    if (SKIP_IMG.test(`${img.className} ${img.alt} ${img.id}`) || SKIP_IMG.test(img.parentElement ? img.parentElement.className : '')) return false;
    const r = img.getBoundingClientRect();
    if (r.width < 60 || r.height < 60) return false;
    const link = img.closest('a[href]');
    if (link && !/\.(png|jpe?g|gif|webp|avif)(\?|$)|^data:image|^blob:/i.test(link.getAttribute('href') || '')) return false;
    return true;
  }
  function openLightbox(images, index) {
    const box = document.createElement('div');
    box.className = 'mx-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `<div class="mx-lightbox-stage"><img alt=""></div>
      <button type="button" class="mx-lb-btn mx-lb-close" aria-label="閉じる">×</button>
      ${images.length > 1 ? '<button type="button" class="mx-lb-btn mx-lb-prev" aria-label="前の画像">‹</button><button type="button" class="mx-lb-btn mx-lb-next" aria-label="次の画像">›</button><div class="mx-lb-count"></div>' : ''}
      <a class="mx-lb-btn mx-lb-save" aria-label="画像を開く" target="_blank" rel="noopener">↗</a>`;
    const img = box.querySelector('img');
    let i = index; let zoom = false;
    const show = () => {
      img.src = images[i].currentSrc || images[i].src;
      img.alt = images[i].alt || '';
      box.querySelector('.mx-lb-save').href = img.src;
      const c = box.querySelector('.mx-lb-count'); if (c) c.textContent = `${i + 1} / ${images.length}`;
      zoom = false; img.classList.remove('zoomed');
    };
    const move = (d) => { if (images.length < 2) return; i = (i + d + images.length) % images.length; show(); };
    const close = () => { document.removeEventListener('keydown', key, true); box.classList.add('leaving'); setTimeout(() => box.remove(), 180); document.documentElement.classList.remove('mixall-dialog-open'); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowLeft') move(-1); else if (e.key === 'ArrowRight') move(1); };
    box.querySelector('.mx-lb-close').onclick = close;
    const prev = box.querySelector('.mx-lb-prev'); if (prev) prev.onclick = (e) => { e.stopPropagation(); move(-1); };
    const next = box.querySelector('.mx-lb-next'); if (next) next.onclick = (e) => { e.stopPropagation(); move(1); };
    box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('mx-lightbox-stage')) close(); });
    img.addEventListener('dblclick', () => { zoom = !zoom; img.classList.toggle('zoomed', zoom); });
    let sx = 0; let sy = 0;
    box.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    box.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx; const dy = e.changedTouches[0].clientY - sy;
      if (zoom) return;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
    });
    document.addEventListener('keydown', key, true);
    document.documentElement.classList.add('mixall-dialog-open');
    document.body.appendChild(box);
    show();
    box.querySelector('.mx-lb-close').focus();
  }
  document.addEventListener('click', (e) => {
    const img = e.target && e.target.tagName === 'IMG' ? e.target : null;
    if (!img || !isViewable(img) || e.defaultPrevented) return;
    e.preventDefault(); e.stopPropagation();
    const scope = img.closest('article, .card, .message, .post, li, section') || document.querySelector('main') || document.body;
    const images = [...scope.querySelectorAll('img')].filter(isViewable);
    openLightbox(images.length ? images : [img], Math.max(0, images.indexOf(img)));
  }, true);

  // =================================================================
  // 6. サイト内検索（ヘッダーの🔍 / Ctrl+K / 「/」キー）
  // =================================================================
  const PAGES = [
    ['ホーム', '/'], ['アカウント設定', '/account/'], ['ぽけっと（チャット）', '/Pocket/'], ['Coin', '/Coin/'], ['Uch（掲示板）', '/Uch/'], ['Mail', '/Mail/'],
    ['Ghost（SNS）', '/Ghost/'], ['Ghost 投稿する', '/Ghost/compose.html'], ['Ghost 動画', '/Ghost/watch.html'], ['Ghost 縦長動画', '/Ghost/videos.html'], ['Ghost 通知', '/Ghost/notifications.html'], ['Ghost 保存済み', '/Ghost/bookmarks.html'],
    ['カスタム（3Dワールド）', '/Custom/'], ['クリエイタースタジオ', '/Create/'], ['文字作成', '/Create/text.html'], ['サイト作成（貸し出しサーバー）', '/lending/'],
    ['ツールセンター', '/Tools/'], ['カレンダー', '/Calendar/'], ['特殊言語', '/Language/'], ['拡張機能', '/Extensions/'], ['Webhook', '/Webhook/'], ['緊急モード', '/emergency.html']
  ].map(([label, path]) => ({ label, href: BASE + path }));
  let searchBox = null;
  function openSearch() {
    if (searchBox) { searchBox.querySelector('input').focus(); return; }
    const s = session();
    searchBox = document.createElement('div');
    searchBox.className = 'mx-search-layer';
    searchBox.innerHTML = `<div class="mx-search" role="dialog" aria-modal="true" aria-label="サイト内検索">
      <div class="mx-search-bar"><span aria-hidden="true">🔍</span><input type="search" placeholder="ページ・Uch・Ghost・自分のチャットを検索" autocomplete="off"><kbd>Esc</kbd></div>
      <div class="mx-search-results" aria-live="polite"><p class="mx-search-hint">キーワードを入力してください${s ? '' : '（Uch・Ghost・チャットの検索はログインが必要です）'}</p></div></div>`;
    const input = searchBox.querySelector('input');
    const results = searchBox.querySelector('.mx-search-results');
    const close = () => { searchBox.remove(); searchBox = null; document.documentElement.classList.remove('mixall-dialog-open'); document.removeEventListener('keydown', key, true); };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...results.querySelectorAll('a')]; if (!items.length) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement);
        items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    searchBox.addEventListener('pointerdown', (e) => { if (e.target === searchBox) close(); });
    document.addEventListener('keydown', key, true);
    let timer = null; let seq = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => run(input.value.trim()), 250); });
    async function run(q) {
      const my = ++seq;
      if (!q) { results.innerHTML = '<p class="mx-search-hint">キーワードを入力してください</p>'; return; }
      const lower = q.toLowerCase();
      const groups = [];
      const pages = PAGES.filter((p) => p.label.toLowerCase().includes(lower));
      if (pages.length) groups.push(['ページ', pages.map((p) => ({ title: p.label, href: p.href }))]);
      // 自分のチャット（端末に保存されている本文だけを検索）
      if (window.MixAllChatVault && s) {
        try {
          const vault = await window.MixAllChatVault.exportAll(s.email);
          const hits = vault.items.filter((r) => !r.deleted && String(r.fields.text || r.fields.subject || '').toLowerCase().includes(lower)).slice(-8).reverse();
          const href = (r) => (r.channel === 'pocket' ? `${BASE}/Pocket/room.html?id=${encodeURIComponent(r.convId)}` : r.channel === 'mail' ? `${BASE}/Mail/thread.html?id=${encodeURIComponent(r.convId)}` : r.channel === 'ghost-chat' ? `${BASE}/Ghost/chat.html?roomId=${encodeURIComponent(r.convId)}` : `${BASE}/Ghost/`);
          if (hits.length) groups.push(['自分のチャット（この端末）', hits.map((r) => ({ title: String(r.fields.text || r.fields.subject).slice(0, 80), sub: `${{ pocket: 'ぽけっと', mail: 'Mail', 'ghost-chat': 'Ghostチャット', 'ghost-live': 'ライブ' }[r.channel] || ''}${r.meta && r.meta.authorName ? ' · ' + r.meta.authorName : ''}`, href: href(r) }))]);
        } catch (_) { /* ignore */ }
      }
      render(groups, true);
      if (s && s.token) {
        const [uch, ghost] = await Promise.all([
          fetch(`${API}/uch?q=${encodeURIComponent(q)}&token=${encodeURIComponent(s.token)}`).then((r) => r.json()).catch(() => ({})),
          fetch(`${API}/ghost?q=${encodeURIComponent(q)}&limit=8&token=${encodeURIComponent(s.token)}`).then((r) => r.json()).catch(() => ({}))
        ]);
        if (my !== seq) return;
        const threads = (uch.threads || []).slice(0, 8);
        if (threads.length) groups.push(['Uch のスレッド', threads.map((t) => ({ title: t.title || '（無題）', sub: `${t.postCount ?? (t.posts ? t.posts.length : '')}件`, href: `${BASE}/Uch/thread.html?id=${encodeURIComponent(t.id)}` }))]);
        const posts = (ghost.posts || []).slice(0, 8);
        if (posts.length) groups.push(['Ghost の投稿', posts.map((p) => ({ title: String(p.title || p.text || '').slice(0, 80) || '（画像・動画）', sub: p.authorName || p.author?.displayName || '', href: `${BASE}/Ghost/post.html?id=${encodeURIComponent(p.id)}` }))]);
      }
      if (my === seq) render(groups, false);
    }
    function render(groups, loading) {
      results.innerHTML = groups.length
        ? groups.map(([title, items]) => `<section><h3>${esc(title)}</h3>${items.map((it) => `<a href="${esc(it.href)}"><span class="t">${esc(it.title)}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}</a>`).join('')}</section>`).join('') + (loading ? '<p class="mx-search-hint">読み込み中...</p>' : '')
        : (loading ? '<p class="mx-search-hint">読み込み中...</p>' : '<p class="mx-search-hint">見つかりませんでした</p>');
    }
    document.documentElement.classList.add('mixall-dialog-open');
    document.body.appendChild(searchBox);
    input.focus();
  }
  function addSearchButton() {
    const header = document.querySelector('header.top');
    if (!header || header.querySelector('.mx-search-open')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mx-search-open'; btn.setAttribute('aria-label', 'サイト内検索（Ctrl+K）'); btn.title = 'サイト内検索（Ctrl+K）';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';
    btn.onclick = openSearch;
    const gear = header.querySelector('.settings-widget');
    if (gear) gear.insertAdjacentElement('beforebegin', btn); else header.appendChild(btn);
  }
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
  });

  // =================================================================
  // 10. ミュート（Ghost・Uch の応答から、ミュートした人・言葉を含む投稿を除く）
  // =================================================================
  let mutes = (() => { try { return JSON.parse(lsGet('mixall.mutes') || 'null') || { users: [], words: [] }; } catch (_) { return { users: [], words: [] }; } })();
  async function syncMutes() {
    if (!session()) return;
    try { const d = await plus('getMutes', {}, 'GET'); mutes = d.mutes; lsSet('mixall.mutes', JSON.stringify(mutes)); } catch (_) { /* ignore */ }
  }
  function isMuted(item) {
    if (!item || typeof item !== 'object') return false;
    const who = [item.authorEmail, item.email, item.authorHandle, item.handle, item.author && item.author.handle, item.author && item.author.email].filter(Boolean).map((x) => String(x).toLowerCase().replace(/^@/, ''));
    if (who.some((w) => mutes.users.includes(w) || mutes.users.includes('@' + w))) return true;
    if (mutes.words.length) {
      const text = `${item.text || ''} ${item.title || ''} ${item.body || ''}`.toLowerCase();
      if (mutes.words.some((w) => text.includes(w))) return true;
    }
    return false;
  }
  function filterMuted(node, depth) {
    if (!node || typeof node !== 'object' || depth > 6) return 0;
    let removed = 0;
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v) && v.length && typeof v[0] === 'object' && ['posts', 'comments', 'threads', 'replies', 'items'].includes(key)) {
        const kept = v.filter((x) => !isMuted(x));
        removed += v.length - kept.length;
        node[key] = kept;
        kept.forEach((x) => { removed += filterMuted(x, depth + 1); });
      } else if (v && typeof v === 'object') removed += filterMuted(v, depth + 1);
    }
    return removed;
  }
  const baseFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const res = await baseFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const fn = (url.match(/(?:\/mixall-api\/|\/\.netlify\/functions\/)([A-Za-z0-9-]+)/) || [])[1];
      if ((fn === 'ghost' || fn === 'uch') && (mutes.users.length || mutes.words.length) && /json/.test(res.headers.get('content-type') || '')) {
        const body = await res.clone().json();
        const before = JSON.stringify(body).length;
        if (filterMuted(body, 0) || JSON.stringify(body).length !== before) {
          const headers = new Headers(res.headers); headers.delete('content-length');
          return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers });
        }
      }
      // 11. Ghostプロフィール: ヘッダー画像・色・バッジを表示
      if (fn === 'ghost' && /[?&]profile=/.test(url) && /json/.test(res.headers.get('content-type') || '')) {
        res.clone().json().then((d) => { if (d && d.profile) decorateGhostProfile(d.profile); }).catch(() => {});
      }
    } catch (_) { /* 加工に失敗したら元の応答をそのまま返す */ }
    return res;
  };

  // =================================================================
  // 11. Ghostプロフィールの装飾
  // =================================================================
  function decorateGhostProfile(profile) {
    const plusInfo = profile.plus;
    if (!plusInfo) return;
    const apply = () => {
      const main = document.querySelector('main');
      if (!main) return;
      let hero = document.getElementById('mx-profile-hero');
      if (!hero) { hero = document.createElement('section'); hero.id = 'mx-profile-hero'; hero.className = 'mx-profile-hero'; main.prepend(hero); }
      const color = plusInfo.color || '#8b6bff';
      hero.style.setProperty('--mx-profile-color', color);
      hero.innerHTML = `<div class="mx-profile-banner"${plusInfo.headerUrl ? ` style="background-image:url('${esc(plusInfo.headerUrl)}')"` : ''}></div>
        <div class="mx-profile-meta">
          ${(plusInfo.badges || []).map((b) => `<span class="mx-profile-badge" title="${esc(b.label)}">${esc(b.icon)} ${esc(b.label)}</span>`).join('')}
          ${plusInfo.link ? `<a class="mx-profile-link" href="${esc(plusInfo.link)}" target="_blank" rel="noopener nofollow">🔗 ${esc(plusInfo.link.replace(/^https?:\/\//, '').slice(0, 40))}</a>` : ''}
        </div>`;
    };
    ready(apply);
  }

  // =================================================================
  // ログイン中は「ログイン」「新規登録」ボタンを「ログアウト」ボタンにする
  // =================================================================
  function authTarget(a) {
    try {
      let p = new URL(a.getAttribute('href'), location.href).pathname;
      if (BASE && (p === BASE || p.startsWith(BASE + '/'))) p = p.slice(BASE.length) || '/';
      p = p.replace(/\/index\.html$/i, '').replace(/\/+$/, '').toLowerCase();
      return p === '/login' ? 'login' : p === '/register' ? 'register' : '';
    } catch (_) { return ''; }
  }
  async function logout() {
    const ok = window.MixAllDialog ? await window.MixAllDialog.confirm('ログアウトしますか？\nこの端末に保存したチャットはそのまま残ります。', { okLabel: 'ログアウト', icon: '👋' }) : true;
    if (!ok) return;
    try {
      if (window.Netrify && window.Netrify.logout) await window.Netrify.logout();
      else {
        const s = session();
        if (s && s.token) await fetch(`${API}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout', token: s.token }) }).catch(() => {});
        localStorage.removeItem('netrify_session');
      }
    } catch (_) { try { localStorage.removeItem('netrify_session'); } catch (__) { /* ignore */ } }
    location.href = `${BASE}/`;
  }
  function swapAuthButtons() {
    if (!session()) return;
    // ログイン・新規登録ページ自体は、別アカウントの追加ログインにも使うので変えない
    let here = location.pathname; if (BASE && here.startsWith(BASE)) here = here.slice(BASE.length);
    if (/^\/(login|register)(\/|$)/i.test(here)) return;
    const links = [...document.querySelectorAll('a[href]')].filter((a) => authTarget(a) && !a.hasAttribute('data-auth-mode') && !a.closest('header.top nav.services, .mixall-nav-panel'));
    if (!links.length) return;
    const done = new Set();
    for (const a of links) {
      const parent = a.parentElement;
      if (done.has(parent)) { a.remove(); continue; }
      done.add(parent);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `${a.className.replace(/\bsecondary\b/, '').trim()} secondary mx-logout-btn`.trim();
      btn.textContent = 'ログアウト';
      btn.onclick = logout;
      a.replaceWith(btn);
      // 同じ並びにある、もう片方（ログイン／新規登録）は消す
      parent.querySelectorAll('a[href]').forEach((other) => { if (authTarget(other)) other.remove(); });
    }
  }

  window.MixAllPlus = { api: plus, push: Push, openSearch, refreshBadges, syncMutes, getMutes: () => mutes, setMutes: (m) => { mutes = m; lsSet('mixall.mutes', JSON.stringify(m)); } };

  ready(() => {
    swapAuthButtons();
    addSearchButton();
    addBell();
    watchPanel();
    markCurrentScopeRead();
    showAnnouncement();
    startBadges();
    syncMutes();
    setTimeout(dailyBonus, 2200);
  });
})();
