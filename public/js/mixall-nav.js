(function () {
  try { if (!window.__mxFb) { const sf = document.createElement('script'); sf.src = '/js/feedback.js'; sf.defer = true; document.head.appendChild(sf); } } catch (_) {} // たまに出るフィードバック欄
  try { if (!window.__mxIcons) { const sc = document.createElement('script'); sc.src = '/js/ui-icons.js'; sc.defer = true; document.head.appendChild(sc); } } catch (_) {} // 絵文字→UIアイコン画像
  if (window.self !== window.top) document.documentElement.classList.add('mixall-embedded');

  // ---- MixAll ローディング(サイトアイコンのアニメーション) ----
  const loadingSvg = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ml-ring" cx="50" cy="50" r="47" pathLength="1"/><circle cx="50" cy="50" r="42" fill="#0b1230"/><g class="ml-bubble"><path d="M38 20H62A16 16 0 0 1 78 36V56A16 16 0 0 1 62 72H46L34 84V71A16 16 0 0 1 22 56V36A16 16 0 0 1 38 20Z" fill="#fff"/><path class="ml-mail" pathLength="1" d="M38 36H62A4 4 0 0 1 66 40V54A4 4 0 0 1 62 58H38A4 4 0 0 1 34 54V40A4 4 0 0 1 38 36Z"/><path class="ml-flap" pathLength="1" d="M35 41L50 52L65 41"/></g></svg>';
  let loadingEl = null, loadingCount = 0;
  function ensureLoading() {
    if (loadingEl || !document.body) return loadingEl;
    loadingEl = document.createElement('div');
    loadingEl.className = 'mixall-loading';
    loadingEl.setAttribute('role', 'status');
    loadingEl.setAttribute('aria-live', 'polite');
    loadingEl.innerHTML = '<div class="mixall-loading-card">' + loadingSvg + '<span>読み込み中…</span></div>';
    document.body.appendChild(loadingEl);
    return loadingEl;
  }
  function renderLoading(label) {
    const el = ensureLoading();
    if (!el) { document.addEventListener('DOMContentLoaded', () => renderLoading(label), { once: true }); return; }
    el.querySelector('span').textContent = label || '読み込み中…';
    requestAnimationFrame(() => { if (loadingCount > 0) el.classList.add('show'); });
  }
  function showLoading(label) { loadingCount++; renderLoading(label); }
  function hideLoading(force) { loadingCount = force ? 0 : Math.max(0, loadingCount - 1); if (!loadingCount && loadingEl) loadingEl.classList.remove('show'); }
  window.MixAllLoading = { show: showLoading, hide: () => hideLoading(false), reset: () => hideLoading(true) };
  // ① 重い処理(バックアップ・書き出し等)だけ全画面で表示。チャット/Ghost/Mailの通信やサイト内移動では出さない。
  //    個別に除外したいときは fetch(url, { quiet: true })。
  (function () {
    const origFetch = window.fetch.bind(window);
    const heavyUrl = /\/api\/(backup|archive)\b/;
    window.fetch = function (input, init) {
      const url = String(typeof input === 'string' ? input : (input && input.url) || '');
      if (init && init.quiet) return origFetch(input, init);
      const heavy = heavyUrl.test(url);
      const chat = /^\/(pocket|uch|ghost|fomasu|mail)(\/|$)/.test(window.location.pathname.toLowerCase());
      if (!heavy) return origFetch(input, init); // 通常の通信(バックグラウンド圧縮などで遅くなっても)全画面の「処理中…」は出さない。バックアップ/書き出しだけ表示。
      if (false && (chat || /\/api\/(notifications|health|auto-compact|ai-sweep|push|site-state|calls|kodomiru|rt|presence|device-lock|feedback|fomasu|languages|school|classroom|tools)\b/.test(url))) return origFetch(input, init);
      let shown = false;
      const timer = setTimeout(() => { shown = true; showLoading(heavy ? '重い処理を実行中…' : '処理中…'); }, heavy ? 150 : 9000); // 通常の通信は9秒以上かかったときだけ表示(圧縮などでたまに遅くなっても、画面を塞がない)
      const done = () => { clearTimeout(timer); if (shown) hideLoading(false); };
      return origFetch(input, init).then((res) => { done(); return res; }, (err) => { done(); throw err; });
    };
  })();
  // ② サイトを開き始めたとき(URL直接・検索などの外部から)だけ表示。サイト内移動・再読み込みでは出さない。
  (function () {
    if (window.self !== window.top) return;
    let navType = 'navigate';
    try { navType = performance.getEntriesByType('navigation')[0].type; } catch (_) {}
    let external = navType === 'navigate';
    try { if (document.referrer && new URL(document.referrer).origin === window.location.origin) external = false; } catch (_) {}
    if (!external || document.readyState === 'complete') return;
    const startedAt = Date.now();
    showLoading('MixAllを開いています…');
    window.addEventListener('load', () => setTimeout(() => hideLoading(true), Math.max(0, 600 - (Date.now() - startedAt))), { once: true });
    setTimeout(() => hideLoading(true), 10000);
  })();
  // ③ AI(Gemini)の返答待ち: 返答が出るはずの場所(メッセージ一覧の末尾)に小さく表示。
  window.MixAllLoading.thinking = function (listEl, label) {
    if (!listEl) { const noop = () => {}; noop.setLabel = () => {}; return noop; }
    const el = document.createElement('div');
    el.className = 'mixall-thinking';
    el.setAttribute('role', 'status');
    el.innerHTML = loadingSvg + '<span></span><i></i><i></i><i></i>';
    el.querySelector('span').textContent = label || '考え中';
    listEl.after(el);
    const timer = setTimeout(() => el.remove(), 15 * 60 * 1000); // 念のための自動撤去
    const stop = () => { clearTimeout(timer); el.remove(); };
    stop.setLabel = (text) => { const span = el.querySelector('span'); if (span && span.textContent !== text) span.textContent = text; };
    return stop;
  };
  // ④ AI返答の見守り+肩代わり: 画面を開いている人が、未完了のAI処理があれば引き継いで実行する。
  //    (送った本人が閉じても、同じ画面にいる他の人が続きを処理。誰もいなければ、次に誰かが開いたときに再開)
  window.MixAllLoading.watchAi = function ({ scope, targetId, listEl, label }) {
    let stopIndicator = null, timer = null, busy = false, fastUntil = 0, quiet = 0;
    const getSession = () => { try { return window.Netrify && window.Netrify.getSession(); } catch (_) { return null; } };
    const showIndicator = (text) => {
      if (!stopIndicator) stopIndicator = window.MixAllLoading.thinking(listEl, text);
      else stopIndicator.setLabel(text);
    };
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(tick, (Date.now() < fastUntil ? 4000 : 20000) + Math.random() * 3000);
    }
    async function tick() {
      clearTimeout(timer);
      const session = getSession();
      if (!session || busy || document.hidden) { schedule(); return; }
      busy = true;
      try {
        const res = await window.fetch('/api/ai-sweep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: session.token, scope, targetId }), quiet: true });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (data.pending > 0) { quiet = 0; showIndicator(data.waiting > 0 ? (data.lastError ? 'AIの返答に失敗(再試行します): ' + String(data.lastError).slice(0, 90) : 'AIの返答を再開しています') : (label || 'AIが考え中')); }
          else if (stopIndicator && ++quiet >= 1) { stopIndicator(); stopIndicator = null; }
        }
      } catch (_) { /* 通信失敗時は次回に再試行 */ }
      finally { busy = false; schedule(); }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); }); // 戻ってきたら即確認
    tick();
    return {
      kick(text) { fastUntil = Date.now() + 90000; quiet = -1; showIndicator(text || label || 'AIが考え中'); setTimeout(tick, 1500); }
    };
  };
  window.addEventListener('pageshow', () => hideLoading(true));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  (window.mxIdle || ((f) => f()))(() => { const emergencyMonitor = document.createElement('script'); emergencyMonitor.src = '/js/emergency-monitor.js'; emergencyMonitor.defer = true; document.head.appendChild(emergencyMonitor); });
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const normalizedPath = path.toLowerCase();
  const isLoginPage = ['/login', '/login/index.html', '/register', '/register/index.html'].includes(normalizedPath);
  const isPublicAuthPage = ['/reset-password', '/reset-password/index.html', '/unlock', '/unlock/index.html'].includes(normalizedPath); // ログイン前に開くパスワード再設定ページ
  const isPublicHome = path === '/' || /^\/app(\/|\/index\.html)?$/i.test(path); // /app/ はログインなしでも開けるインストール案内
  const publicToolShare = normalizedPath === '/tools' && ['anon','room','locker'].some((key) => new URLSearchParams(window.location.search).has(key));
  const session = window.Netrify && typeof window.Netrify.getSession === 'function' ? window.Netrify.getSession() : null;
  const next = window.location.pathname + window.location.search + window.location.hash;
  if (!session && !isLoginPage && !isPublicAuthPage && !isPublicHome && !publicToolShare) { let locked = false; try { locked = Boolean(JSON.parse(localStorage.getItem('mixall_device_lock') || 'null')?.d); } catch (_) {} window.location.replace((locked ? '/unlock/?next=' : '/login/?next=') + encodeURIComponent(next)); return; }
  // ログイン中でもログイン・新規登録ページは開ける（アカウント切り替え・掛け持ち用）
  if (!session || isLoginPage) return;

  const icons = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    chat: '<path d="M4 5h16v11H8l-4 3V5Z"/><path d="M8 9h8M8 12h5"/>',
    pocket: '<path d="M20 12a8 8 0 0 1-16 0V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 13h8"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 10h4a2 2 0 0 1 0 4H9"/>',
    uch: '<path d="M4 5h16v11H8l-4 3V5Z"/><path d="M8 9h8M8 12h5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    fomasu: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
    sns: '<path d="M4 5h16v12H8l-4 3V5Z"/><path d="M8 9h8M8 12h5"/><circle cx="18" cy="18" r="3"/>',
    ghost: '<path d="M12 3a7 7 0 0 0-7 7v10l3-2 4 2 4-2 3 2V10a7 7 0 0 0-7-7Z"/><path d="M9 10h.01M15 10h.01"/>',
    game: '<path d="m6 8 2-3h8l2 3 3 2-2 8h-3l-4-3-4 3H5l-2-8 3-2Z"/><path d="M7 10v4M5 12h4M16 11h.01M18 13h.01"/>',
    custom: '<path d="m12 3 2.1 5.3L20 10l-4.5 3.2L16.5 19 12 15.8 7.5 19l1-5.8L4 10l5.9-1.7Z"/>',
    creator: '<path d="m14 6 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15Z"/><path d="M12 20h8"/>',
    studio: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="m9 11 2 2 4-4"/>',
    site: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    other: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    tools: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/>',
    language: '<path d="M4 5h16v12H4z"/><path d="M8 9h8M8 12h5M7 21l2-4M17 21l-2-4"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h5"/>',
    webhook: '<path d="M8 8a4 4 0 1 1 4 4H8"/><path d="M16 16a4 4 0 1 1-4-4h4"/><path d="M8 12h8"/>',
    admin: '<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    stamp: '<path d="m7 3 10 10-4 4L3 7z"/><path d="M13 17h7M5 21h14"/>',
    profile: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    compose: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    feed: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    verticalVideo: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="m10 8 4 3-4 3z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    notification: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>'
  };
  const link = (href, label, icon) => ({ href, label, icon });
  const groups = {
    home: { label: 'ホーム', icon: icons.home, items: [link('/', '↳ ホーム', icons.home), link('/account/', '↳ アカウント設定', icons.profile)] },
    chat: {
      label: 'チャット', icon: icons.chat,
      items: [
        link('/Pocket', 'ぽけっと', icons.pocket),
        link('/Uch', 'Uch', icons.uch),
        link('/Mail', 'Mail', icons.mail)
      ]
    },
    sns: { label: 'SNS', icon: icons.sns, items: [
      link('/Ghost', 'Ghost', icons.ghost),
      link('/Fomasu', 'ふぉます', icons.fomasu),
      { type: 'subgroup', label: 'Ghost内メニュー', icon: icons.ghost, items: [
        link('/Ghost/profile.html?me=1', 'マイページ', icons.profile),
        link('/Ghost/compose.html', '投稿', icons.compose),
        link('/Ghost#feed', 'フィード', icons.feed),
        link('/Ghost/watch.html', '動画', icons.video),
        link('/Ghost/videos.html', '縦長動画', icons.verticalVideo),
        link('/Ghost/search.html', '検索', icons.search),
        link('/Ghost/notifications.html', '通知', icons.notification),
        link('/Ghost/bookmarks.html', '保存済み', icons.bookmark)
      ] }
    ] },
    game: { label: 'ゲーム', icon: icons.game, items: [link('/Custom', 'カスタム', icons.custom), link('/Custom/games.html', 'HTMLゲーム', icons.game)] },
    creator: { label: 'クリエイター', icon: icons.creator, items: [
      link('/Create', 'スタジオ', icons.studio),
      link('/lending', 'サイト作成', icons.site)
    ] },
    tools: { label: 'ツール', icon: icons.tools, items: [
      link('/Tools', 'ツールセンター', icons.tools),
      link('/Tools#anime-search', 'アニメ画像検索', icons.search),
      link('/Tools#anonymous', '匿名メッセージ箱', icons.mail),
      link('/Tools#counsel', 'AIお悩み相談', icons.chat),
      link('/Tools#recommend', 'レコメンドAI', icons.studio),
      link('/Wiki', 'みんなのWiki', icons.feed),
      link('/MAWS', 'MixAll Web Search (MAWS)', icons.search),
      link('/Store', 'MixAllアプリストア', icons.other),
      link('/Tools#quick-chat', '一時チャットルーム', icons.chat),
      { type: 'subgroup', label: '画像・文章ツール', icon: icons.other, items: [
        link('/Tools#url-tools', 'Blob・Data URL生成', icons.link || icons.other), link('/Tools#image-convert', '一括画像変換', icons.creator), link('/Tools#qr', 'QRコードスタイラー', icons.other), link('/Tools#markdown', 'Markdownエディタ', icons.feed), link('/Tools#ocr', '画像文字コピー(OCR)', icons.search), link('/Tools#color-palette', '画像から色抽出', icons.other), link('/Tools#text-analysis', '文字数・頻度分析', icons.search), link('/Tools#json-yaml', 'JSON / YAML変換', icons.feed)
      ] },
      { type: 'subgroup', label: '暮らし・記録', icon: icons.calendar, items: [
        link('/Tools#pomodoro', 'ポモドーロ', icons.calendar), link('/Tools#clips', 'Webクリップ・メモ', icons.feed), link('/Tools#bookshelf', '読書本棚', icons.studio), link('/Tools#room-planner', '部屋コーディネート', icons.custom), link('/Tools#visited-map', '訪問地マップ', icons.site), link('/Tools#spots-map', 'お気に入りスポット', icons.site), link('/Tools#fridge', '冷蔵庫・献立', icons.calendar)
      ] },
      { type: 'subgroup', label: '共有・開発ツール', icon: icons.webhook, items: [
        link('/Tools#share-locker', '一時共有ロッカー', icons.mail), link('/Tools#link-checker', 'リンク切れチェック', icons.search), link('/Tools#floating-windows', 'フローティングウィンドウ', icons.other), link('/Tools#fun-tools', '楽しいミニツール', icons.game)
      ] }
    ] },
    other: { label: 'その他', icon: icons.other, items: [
      link('/emergency.html', '緊急モード', icons.notification),
      link('/Language', '文字追加', icons.language),
      link('/Calendar', 'カレンダー', icons.calendar),
      { type: 'subgroup', label: 'Mcコイン', icon: icons.coin, items: [
        link('/Coin', 'Mcコイン(残高)', icons.coin),
        link('/Coin/jobs.html', 'みつばち(発注・受注)', icons.studio)
      ] },
      link('/Extensions', '拡張機能', icons.other),
      link('/Webhook', 'Webhook', icons.webhook)
    ] }
  };
  const isOperator = session.isAdmin === true || session.isDeputyAdmin === true || session.isOperator === true;
  const canManageStamps = isOperator || session.isOfficial === true;
  if (isOperator || session.isOfficial === true) {
    const items = [];
    if (isOperator) items.push(link('/admin', '運営画面', icons.admin));
    if (canManageStamps) items.push(link('/Pocket/stamps.html', 'スタンプ', icons.stamp));
    groups.admin = { label: '運営等', icon: icons.admin, items };
  }

  function makeIcon(paths) {
    return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }
  function hrefIsActive(href) {
    const target = new URL(href, window.location.origin).pathname.replace(/\/+$/, '').toLowerCase() || '/';
    if (target === '/') return normalizedPath === '/';
    return normalizedPath === target || normalizedPath.startsWith(target + '/');
  }
  function itemIsActive(item) {
    if (item.href) return hrefIsActive(item.href);
    return (item.items || []).some(itemIsActive);
  }
  function groupIsActive(group) { return (group.items || []).some(itemIsActive); }
  // ---- 未読バッジ(ぽけっと / Uch / Ghost) ----
  const unreadCounts = { pocket: 0, uch: 0, ghost: 0 };
  const badgeGroups = { chat: ['pocket', 'uch'], sns: ['ghost'] };
  const badgePaths = { '/pocket': 'pocket', '/uch': 'uch', '/ghost': 'ghost' };
  const seenKey = (k) => `mixall-seen-${k}`;
  const groupCount = (key) => (badgeGroups[key] || []).reduce((sum, k) => sum + (unreadCounts[k] || 0), 0);
  const badgeHtml = (n, cls = '') => n > 0 ? `<em class="mixall-nav-badge ${cls}" aria-label="未読${n}件">${n > 99 ? '99+' : n}</em>` : '';
  const hrefKey = (href) => badgePaths[new URL(href, window.location.origin).pathname.replace(/\/+$/, '').toLowerCase()] || '';
  const nav = document.createElement('nav');
  nav.className = 'mixall-bottom-nav';
  nav.setAttribute('aria-label', 'MixAllメニュー');
  // ⚙で設定した並び順(mixall_nav_order)を反映。未設定の項目は末尾へ。
  function orderedGroups() {
    let order = []; try { order = JSON.parse(localStorage.getItem('mixall_nav_order') || '[]'); } catch (_) {}
    const rank = (key) => { const i = order.indexOf(key); return i < 0 ? 999 : i; };
    return Object.entries(groups).sort((a, b) => rank(a[0]) - rank(b[0]));
  }
  function renderNavigation() {
    nav.innerHTML = orderedGroups().map(([key, group]) => `<button type="button" class="mixall-nav-trigger${groupIsActive(group) ? ' active' : ''}" data-nav-group="${key}" aria-controls="mixall-nav-panel" aria-expanded="false" aria-label="${group.label}メニュー" title="${group.label}">${makeIcon(group.icon)}<span>${group.label}</span>${badgeHtml(groupCount(key))}</button>`).join('');
    nav.style.setProperty('--mixall-nav-count', String(Object.keys(groups).length));
  }
  renderNavigation();
  window.MixAllNav = { list: () => orderedGroups().map(([key, group]) => ({ key, label: group.label })), rerender: renderNavigation };

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'mixall-nav-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-label', 'メニューを閉じる');
  const panel = document.createElement('section');
  panel.id = 'mixall-nav-panel';
  panel.className = 'mixall-nav-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'メニュー項目');
  document.body.append(backdrop, panel, nav);

  function renderItems(items) {
    return items.map((item, index) => {
      if (item.type === 'subgroup') {
        const isOpen = item.items.some(itemIsActive);
        const children = renderItems(item.items);
        return `<div class="mixall-nav-subgroup"><button type="button" class="mixall-nav-subgroup-trigger" data-nav-subgroup="${index}" aria-expanded="${isOpen}">${makeIcon(item.icon)}<span>${item.label}</span>${makeIcon(icons.chevron)}</button><div class="mixall-nav-subgroup-items"${isOpen ? '' : ' hidden'}>${children}</div></div>`;
      }
      const active = itemIsActive(item);
      return `<a class="mixall-nav-link${active ? ' active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>${makeIcon(item.icon)}<span>${item.label}</span>${badgeHtml(unreadCounts[hrefKey(item.href)] || 0, 'inline')}</a>`;
    }).join('');
  }
  function closeMenu() {
    panel.hidden = true;
    backdrop.hidden = true;
    nav.querySelectorAll('[data-nav-group]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }
  function openMenu(key) {
    const group = groups[key];
    if (!group) return;
    const trigger = nav.querySelector(`[data-nav-group="${key}"]`);
    if (!panel.hidden && trigger.getAttribute('aria-expanded') === 'true') { closeMenu(); return; }
    nav.querySelectorAll('[data-nav-group]').forEach((button) => button.setAttribute('aria-expanded', String(button === trigger)));
    panel.innerHTML = `<div class="mixall-nav-panel-heading"><h2>${group.label}</h2><button type="button" class="mixall-nav-close" aria-label="閉じる">×</button></div><div class="mixall-nav-items">${renderItems(group.items)}</div>`;
    panel.hidden = false;
    backdrop.hidden = false;
    panel.querySelector('.mixall-nav-close').addEventListener('click', closeMenu);
    panel.querySelectorAll('[data-nav-subgroup]').forEach((button) => button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.nextElementSibling.hidden = expanded;
    }));
  }
  nav.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-nav-group]');
    if (trigger && nav.contains(trigger)) openMenu(trigger.dataset.navGroup);
  });
  backdrop.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) closeMenu(); });

  // Refresh cached role flags: permissions changed by operators must update without a new login.
  async function refreshOperatorAccess() {
    if (!session?.token) return;
    try {
      const response = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: session.token })
      });
      if (!response.ok) return;
      const profile = await response.json();
      Object.assign(session, {
        isAdmin: profile.isAdmin === true,
        isDeputyAdmin: profile.isDeputyAdmin === true,
        isOfficial: profile.isOfficial === true,
        isOperator: false
      });
      window.Netrify?.setSession?.(session);
      const operator = session.isAdmin || session.isDeputyAdmin;
      if (operator || session.isOfficial) {
        const items = [];
        if (operator) items.push(link('/admin', '運営画面', icons.admin));
        items.push(link('/Pocket/stamps.html', 'スタンプ', icons.stamp));
        groups.admin = { label: '運営等', icon: icons.admin, items };
      } else {
        delete groups.admin;
      }
      closeMenu();
      renderNavigation();
    } catch (_) { /* 通信失敗時はログイン時の保存済み権限を維持 */ }
  }
  refreshOperatorAccess();

  async function refreshBadges() {
    try {
      const res = await fetch('/api/notifications?token=' + encodeURIComponent(session.token));
      if (!res.ok) return;
      const list = (await res.json()).notifications || [];
      const here = Object.entries(badgePaths).find(([p]) => normalizedPath === p || normalizedPath.startsWith(p + '/'));
      if (here) localStorage.setItem(seenKey(here[1]), String(Date.now())); // いま開いているサービスは既読扱い
      const next = { pocket: 0, uch: 0, ghost: 0 };
      for (const n of list) {
        if (n.read) continue;
        const key = String(n.scope || '').split(':')[0].toLowerCase();
        if (!(key in next)) continue;
        if (new Date(n.createdAt).getTime() > Number(localStorage.getItem(seenKey(key)) || 0)) next[key]++;
      }
      const changed = Object.keys(next).some((k) => next[k] !== unreadCounts[k]);
      Object.assign(unreadCounts, next);
      if (changed && panel.hidden) renderNavigation();
    } catch (_) { /* 通信失敗時はバッジを変えない */ }
  }
  (window.mxIdle || ((f) => f()))(refreshBadges);
  setInterval(() => { if (!document.hidden) refreshBadges(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadges(); });
})();

// フローティングウィンドウ(開いている窓の復元にも使うため、全ページで読み込む)
(function () { if (window.self !== window.top) return; (window.mxIdle || ((f) => f()))(() => { const s = document.createElement('script'); s.src = '/js/float-windows.js'; s.defer = true; document.head.appendChild(s); }); })();
