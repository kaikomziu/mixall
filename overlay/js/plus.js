// js/plus.js（MixAll +（二世代）・全ページ共通）
// 以前の GitHub 版（js/mixall-plus.js）から、EdgeOne 版（v27c）に無い機能を移したもの:
//   お知らせバナー / 運営からの警告 / ログインボーナスの案内 / デイリーミッションの記録 / 画像の拡大表示 /
//   サイト内検索（ヘッダーの🔍・Ctrl+K・「/」） / ミュート（Ghost・Uch） / Ghostプロフィールの装飾 / QRでログイン（/login/?transfer=）
// API は /api/plus（server/plus.js）。
(function () {
  'use strict';
  if (window.MixAllPlus) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  function session() { try { return JSON.parse(lsGet('netrify_session') || 'null'); } catch (_) { return null; } }
  async function plus(action, body, method) {
    const s = session();
    let r;
    if (method === 'GET') r = await fetch(`/api/plus?${new URLSearchParams({ action, ...(s && s.token ? { token: s.token } : {}), ...(body || {}) })}`);
    else r = await fetch('/api/plus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token: s && s.token, ...(body || {}) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `エラー (${r.status})`);
    return d;
  }
  const toast = (m, o) => (window.MixAllUX ? window.MixAllUX.toast(m, o) : null);
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());
  const path = () => location.pathname.toLowerCase();

  // =================================================================
  // お知らせバナー
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
    bar.querySelector('.mx-announce-text').onclick = () => bar.classList.toggle('mx-expanded');
    bar.querySelector('.mx-announce-close').onclick = () => { lsSet('mixall.announcement.closed', a.id); bar.classList.add('leaving'); setTimeout(() => bar.remove(), 200); };
    const header = document.querySelector('header.top');
    if (header) header.insertAdjacentElement('afterend', bar); else document.body.prepend(bar);
  }

  // =================================================================
  // 運営からの警告: 確認ボタンを押すまで閉じられない表示で出す（10分に1回まで確認）
  // =================================================================
  async function showWarnings() {
    const s = session();
    if (!s || !s.token || !window.MixAllDialog) return;
    const key = `mixall.warnings.checked:${s.email}`;
    if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 10 * 60 * 1000) return;
    try {
      const d = await plus('myWarnings', {}, 'GET');
      sessionStorage.setItem(key, String(Date.now()));
      for (const w of d.items) {
        const head = { notice: '運営からのお知らせ', warning: '運営からの警告', final: '運営からの最終警告' }[w.level] || '運営からのお知らせ';
        await window.MixAllDialog.confirm(`${head}：${w.title}\n${w.body}\n\n（${new Date(w.createdAt).toLocaleString('ja-JP')}）`, { okLabel: '確認しました', noCancel: true, danger: w.level === 'final', icon: w.level === 'notice' ? '📢' : '⚠️' });
        await plus('ackWarning', { id: w.id });
      }
    } catch (_) { /* 次回もう一度 */ }
  }

  // =================================================================
  // ログインボーナス（その日最初に開いたときに案内）
  // =================================================================
  async function dailyBonus() {
    const s = session();
    if (!s || !s.token || !window.MixAllDialog || /^\/(login|register|unlock|reset-password)\//.test(path())) return;
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const key = `mixall.daily.shown:${s.email}`;
    if (lsGet(key) === today) return;
    let d;
    try { d = await plus('daily', {}, 'GET'); } catch (_) { return; }
    lsSet(key, today);
    if (d.claimedToday) return;
    const ok = await window.MixAllDialog.confirm(`ログインボーナス\n連続${d.nextStreak}日目！ ${d.bonus} Coin を受け取れます。\n今日のミッション: ${d.missions.map((m) => m.label).join('・')}（Coin ページで受け取れます）`, { okLabel: `${d.bonus} Coin 受け取る`, cancelLabel: 'あとで', danger: false, icon: '🎁' });
    if (!ok) return;
    try { const r = await plus('claimDaily', {}); toast(`${r.claimed} Coin を受け取りました（連続${r.streak}日）`); }
    catch (e) { toast(e.message, { kind: 'error' }); }
  }

  // =================================================================
  // 画像の拡大表示
  // =================================================================
  const SKIP_IMG = /avatar|icon|logo|stamp|emoji|brand|mark|sticker/i;
  function isViewable(img) {
    if (!img || img.closest('.mx-lightbox, header, nav, .mixall-dialog-layer, .mx-story-viewer, .mx-stories, .mx-qr, button, .identity, .presence-dot')) return false;
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
  // サイト内検索（ヘッダーの🔍 / Ctrl+K / 「/」キー）
  // =================================================================
  const PAGES = [
    ['ホーム', '/'], ['アカウント設定', '/account/'], ['ぽけっと（チャット）', '/Pocket/'], ['Coin・みつばち', '/Coin/'], ['Uch（掲示板）', '/Uch/'], ['Mail', '/Mail/'],
    ['Ghost（SNS）', '/Ghost/'], ['Ghost 投稿する', '/Ghost/compose.html'], ['Ghost 動画', '/Ghost/watch.html'], ['Ghost 縦長動画', '/Ghost/videos.html'], ['Ghost 通知', '/Ghost/notifications.html'], ['Ghost 保存済み', '/Ghost/bookmarks.html'],
    ['通知', '/Notifications/'], ['カスタム（3Dワールド）', '/Custom/'], ['クリエイタースタジオ', '/Create/'], ['サイト作成（貸し出しサーバー）', '/lending/'], ['ツールセンター', '/Tools/'],
    ['カレンダー', '/Calendar/'], ['特殊言語', '/Language/'], ['拡張機能', '/Extensions/'], ['Webhook', '/Webhook/'], ['ふぉます', '/Fomasu/'], ['コドミル', '/Kodomiru/'],
    ['学校モード', '/school/'], ['Wiki', '/Wiki/'], ['MAWS（Web検索）', '/MAWS/'], ['アプリストア', '/Store/'], ['緊急モード', '/emergency.html']
  ].map(([label, href]) => ({ label, href }));
  let searchBox = null;
  function openSearch() {
    if (searchBox) { searchBox.querySelector('input').focus(); return; }
    const s = session();
    searchBox = document.createElement('div');
    searchBox.className = 'mx-search-layer';
    searchBox.innerHTML = `<div class="mx-search" role="dialog" aria-modal="true" aria-label="サイト内検索">
      <div class="mx-search-bar"><span aria-hidden="true">🔍</span><input type="search" placeholder="ページ・Uch・Ghostを検索" autocomplete="off"><kbd>Esc</kbd></div>
      <div class="mx-search-results" aria-live="polite"><p class="mx-search-hint">キーワードを入力してください${s ? '' : '（Uch・Ghostの検索はログインが必要です）'}</p></div></div>`;
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
      render(groups, Boolean(s && s.token));
      if (s && s.token) {
        const [uch, ghost] = await Promise.all([
          fetch(`/api/uch?q=${encodeURIComponent(q)}&token=${encodeURIComponent(s.token)}`).then((r) => r.json()).catch(() => ({})),
          fetch(`/api/ghost?channel=main&limit=8&q=${encodeURIComponent(q)}&token=${encodeURIComponent(s.token)}`).then((r) => r.json()).catch(() => ({}))
        ]);
        if (my !== seq) return;
        const threads = (uch.threads || []).slice(0, 8);
        if (threads.length) groups.push(['Uch のスレッド', threads.map((t) => ({ title: t.title || '（無題）', sub: `${t.postCount ?? (t.posts ? t.posts.length : '')}件`, href: `/Uch/thread.html?id=${encodeURIComponent(t.id)}` }))]);
        const posts = (ghost.posts || []).slice(0, 8);
        if (posts.length) groups.push(['Ghost の投稿', posts.map((p) => ({ title: String(p.title || p.text || '').slice(0, 80) || '（画像・動画）', sub: (p.authorProfile && p.authorProfile.displayName) || p.authorName || '', href: `/Ghost/post.html?id=${encodeURIComponent(p.id)}` }))]);
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
  // ミュート（Ghost・Uch の応答から、ミュートした人・言葉を含む投稿を除く）
  // =================================================================
  let mutes = (() => { try { return JSON.parse(lsGet('mixall.mutes') || 'null') || { users: [], words: [] }; } catch (_) { return { users: [], words: [] }; } })();
  async function syncMutes() {
    if (!session()) return;
    try { const d = await plus('getMutes', {}, 'GET'); mutes = d.mutes; lsSet('mixall.mutes', JSON.stringify(mutes)); } catch (_) { /* ignore */ }
  }
  function isMuted(item) {
    if (!item || typeof item !== 'object') return false;
    const prof = item.authorProfile || {};
    const who = [item.authorEmail, item.email, item.authorHandle, item.handle, prof.handle, prof.displayName, typeof item.author === 'string' ? item.author : null, item.authorName]
      .filter(Boolean).map((x) => String(x).toLowerCase().replace(/^@/, ''));
    if (who.some((w) => mutes.users.includes(w) || mutes.users.includes('@' + w))) return true;
    if (mutes.words.length) {
      const text = `${item.text || ''} ${item.title || ''} ${item.body || ''} ${item.description || ''}`.toLowerCase();
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

  // =================================================================
  // デイリーミッション: 投稿・送信に成功したら記録する
  // =================================================================
  const MISSION_OF = [
    [/\/api\/pocket\b/, /"action"\s*:\s*"sendMessage"/, 'pocket'],
    [/\/api\/ghost\b/, /"action"\s*:\s*"createPost"/, 'ghost'],
    [/\/api\/uch\b/, /"action"\s*:\s*"(addPost|createThread)"/, 'uch']
  ];
  function recordMission(url, init, res) {
    if (!res.ok || !init || typeof init.body !== 'string') return;
    const s = session();
    if (!s || !s.token) return;
    const hit = MISSION_OF.find(([u, b]) => u.test(url) && b.test(init.body));
    if (!hit) return;
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const key = `mixall.mission:${s.email}:${hit[2]}`;
    if (lsGet(key) === today) return;
    lsSet(key, today);
    plus('missionDone', { id: hit[2] }).catch(() => {});
  }

  const baseFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const res = await baseFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      recordMission(url, init, res);
      const fn = (url.match(/\/api\/([A-Za-z0-9-]+)/) || [])[1];
      if ((fn === 'ghost' || fn === 'uch') && (mutes.users.length || mutes.words.length) && /json/.test(res.headers.get('content-type') || '')) {
        const body = await res.clone().json();
        if (filterMuted(body, 0)) {
          const headers = new Headers(res.headers); headers.delete('content-length');
          return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers });
        }
      }
    } catch (_) { /* 加工に失敗したら元の応答をそのまま返す */ }
    return res;
  };

  // =================================================================
  // Ghostプロフィールの装飾（ヘッダー画像・色・バッジ・リンク・Coinショップの枠と名前の色）
  // =================================================================
  async function decorateGhostProfile() {
    if (!/^\/ghost\/profile\.html$/.test(path())) return;
    const q = new URLSearchParams(location.search);
    const handle = q.get('handle') || q.get('') || location.search.replace(/^\?@?/, '');
    if (!handle) return;
    let x;
    try { x = (await plus('publicProfile', { handle }, 'GET')).extras; } catch (_) { return; }
    if (!x) return;
    const main = document.querySelector('main');
    if (!main) return;
    const hero = document.createElement('section');
    hero.id = 'mx-profile-hero'; hero.className = 'mx-profile-hero';
    hero.style.setProperty('--mx-profile-color', x.color || '#8b6bff');
    hero.classList.toggle('mx-framed-hero', Boolean(x.frame));
    if (x.frame) hero.style.setProperty('--mx-frame', x.frame);
    hero.innerHTML = `<div class="mx-profile-banner"${x.headerUrl ? ` style="background-image:url('${esc(x.headerUrl)}')"` : ''}></div>
      <div class="mx-profile-meta">
        ${(x.badges || []).map((b) => `<span class="mx-profile-badge" title="${esc(b.label)}">${esc(b.icon)} ${esc(b.label)}</span>`).join('')}
        ${x.link ? `<a class="mx-profile-link" href="${esc(x.link)}" target="_blank" rel="noopener nofollow">🔗 ${esc(x.link.replace(/^https?:\/\//, '').slice(0, 40))}</a>` : ''}
      </div>`;
    main.prepend(hero);
  }

  // =================================================================
  // QRで別の端末にログイン（新しい端末側。元の端末はアカウント設定でQRを作る）
  // =================================================================
  async function transferLogin() {
    const id = new URLSearchParams(location.search).get('transfer');
    if (!id || !/^\/login\//.test(path()) || !window.MixAllDialog) return;
    let who;
    try { who = await plus('transferPeek', { id }, 'GET'); } catch (e) { toast(e.message, { kind: 'error' }); return; }
    const ok = await window.MixAllDialog.confirm(`この端末でログインしますか？\n${who.displayName}（${who.email}）としてログインします。心当たりがないときは「やめる」を押してください。`, { okLabel: 'ログインする', cancelLabel: 'やめる', icon: '📱', danger: false });
    if (!ok) return;
    try {
      const d = await plus('transferClaim', { id, device: navigator.platform || '', userAgent: navigator.userAgent });
      const session = { email: d.email, token: d.token, age: d.age, hasBirthDate: d.hasBirthDate, displayName: d.displayName, isAdmin: d.isAdmin, isDeputyAdmin: d.isDeputyAdmin, isOfficial: d.isOfficial };
      localStorage.setItem('netrify_session', JSON.stringify(session));
      try { const list = JSON.parse(localStorage.getItem('netrify_accounts') || '[]').filter((a) => a.email !== d.email); list.unshift(session); localStorage.setItem('netrify_accounts', JSON.stringify(list.slice(0, 8))); } catch (_) { /* ignore */ }
      toast('ログインしました');
      location.replace('/');
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }

  window.MixAllPlus = { api: plus, session, toast, esc, openSearch, syncMutes, getMutes: () => mutes, setMutes: (m) => { mutes = m; lsSet('mixall.mutes', JSON.stringify(m)); } };

  ready(() => {
    addSearchButton();
    showAnnouncement();
    syncMutes();
    decorateGhostProfile();
    transferLogin();
    setTimeout(showWarnings, 1500);
    setTimeout(dailyBonus, 2500);
  });
})();
