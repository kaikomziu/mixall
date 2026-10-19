(function () {
  if (window.self !== window.top) document.documentElement.classList.add('mixall-embedded');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const emergencyMonitor = document.createElement('script'); emergencyMonitor.src = '/js/emergency-monitor.js'; emergencyMonitor.defer = true; document.head.appendChild(emergencyMonitor);
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const normalizedPath = path.toLowerCase();
  const isLoginPage = ['/login', '/login/index.html', '/register', '/register/index.html'].includes(normalizedPath);
  const isPublicHome = path === '/';
  const publicToolShare = normalizedPath === '/tools' && ['anon','room','locker'].some((key) => new URLSearchParams(window.location.search).has(key));
  const session = window.Netrify && typeof window.Netrify.getSession === 'function' ? window.Netrify.getSession() : null;
  const next = window.location.pathname + window.location.search + window.location.hash;
  if (!session && !isLoginPage && !isPublicHome && !publicToolShare) { window.location.replace('/login/?next=' + encodeURIComponent(next)); return; }
  if (session && isLoginPage && !window.location.search.includes('next=')) { window.location.replace('/'); return; }
  if (!session || isLoginPage) return;

  const icons = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    chat: '<path d="M4 5h16v11H8l-4 3V5Z"/><path d="M8 9h8M8 12h5"/>',
    pocket: '<path d="M20 12a8 8 0 0 1-16 0V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 13h8"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 10h4a2 2 0 0 1 0 4H9"/>',
    uch: '<path d="M4 5h16v11H8l-4 3V5Z"/><path d="M8 9h8M8 12h5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
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
        { type: 'subgroup', label: 'ぽけっと', icon: icons.pocket, items: [
          link('/Pocket', 'ぽけっと', icons.pocket),
          link('/Coin', 'Coin', icons.coin)
        ] },
        link('/Uch', 'Uch', icons.uch),
        link('/Mail', 'Mail', icons.mail)
      ]
    },
    sns: { label: 'SNS', icon: icons.sns, items: [
      link('/Ghost', 'Ghost', icons.ghost),
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
    game: { label: 'ゲーム', icon: icons.game, items: [link('/Custom', 'カスタム', icons.custom)] },
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
      link('/Tools#wiki', 'みんなのWiki', icons.feed),
      link('/Tools#quick-chat', '一時チャットルーム', icons.chat),
      { type: 'subgroup', label: '画像・文章ツール', icon: icons.other, items: [
        link('/Tools#url-tools', 'Blob・Data URL生成', icons.link || icons.other), link('/Tools#image-convert', '一括画像変換', icons.creator), link('/Tools#qr', 'QRコードスタイラー', icons.other), link('/Tools#markdown', 'Markdownエディタ', icons.feed), link('/Tools#ocr', '画像文字コピー(OCR)', icons.search), link('/Tools#color-palette', '画像から色抽出', icons.other), link('/Tools#text-analysis', '文字数・頻度分析', icons.search), link('/Tools#json-yaml', 'JSON / YAML変換', icons.feed)
      ] },
      { type: 'subgroup', label: '暮らし・記録', icon: icons.calendar, items: [
        link('/Tools#pomodoro', 'ポモドーロ', icons.calendar), link('/Tools#clips', 'Webクリップ・メモ', icons.feed), link('/Tools#bookshelf', '読書本棚', icons.studio), link('/Tools#room-planner', '部屋コーディネート', icons.custom), link('/Tools#visited-map', '訪問地マップ', icons.site), link('/Tools#spots-map', 'お気に入りスポット', icons.site), link('/Tools#fridge', '冷蔵庫・献立', icons.calendar)
      ] },
      { type: 'subgroup', label: '共有・開発ツール', icon: icons.webhook, items: [
        link('/Tools#share-locker', '一時共有ロッカー', icons.mail), link('/Tools#link-checker', 'リンク切れチェック', icons.search), link('/Tools#split-view', '画面分割', icons.other), link('/Tools#fun-tools', '楽しいミニツール', icons.game)
      ] }
    ] },
    other: { label: 'その他', icon: icons.other, items: [
      link('/emergency.html', '緊急モード', icons.notification),
      link('/Language', '文字追加', icons.language),
      link('/Calendar', 'カレンダー', icons.calendar),
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
  const nav = document.createElement('nav');
  nav.className = 'mixall-bottom-nav';
  nav.setAttribute('aria-label', 'MixAll +メニュー');
  function renderNavigation() {
    nav.innerHTML = Object.entries(groups).map(([key, group]) => `<button type="button" class="mixall-nav-trigger${groupIsActive(group) ? ' active' : ''}" data-nav-group="${key}" aria-controls="mixall-nav-panel" aria-expanded="false" aria-label="${group.label}メニュー" title="${group.label}">${makeIcon(group.icon)}<span>${group.label}</span></button>`).join('');
    nav.style.setProperty('--mixall-nav-count', String(Object.keys(groups).length));
  }
  renderNavigation();

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
      return `<a class="mixall-nav-link${active ? ' active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>${makeIcon(item.icon)}<span>${item.label}</span></a>`;
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
      const response = await fetch('/.netlify/functions/auth', {
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
})();
