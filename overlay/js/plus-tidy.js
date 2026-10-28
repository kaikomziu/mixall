// js/plus-tidy.js（MixAll +（二世代）・画面の整理）
// 機能は減らさずに、同じものが何度も並んでいる所や縦に長すぎる所をまとめる。見た目は css/plus-tidy.css。
// - ヘッダーに「メニュー」ボタン: 下部メニューと同じ項目を1枚の一覧で出す（PCでは下部メニューを隠し、スマホではヘッダーのリンク列を隠す）
// - 設定（⚙）のパネルを「見た目 / 背景・色 / 編集・ロック」のタブに分ける
// - ホーム（ログイン中）: ログイン・新規登録などのボタンと「アカウント設定」のカードを1行のあいさつにまとめ、サービス一覧を小さなタイルにする
// - アカウント設定: カードを内容ごとのタブに分ける
// - Uch・ぽけっと: たまにしか使わない入力欄（新規スレッド作成・友達追加など）を折りたたみ、一覧を上に出す
(function () {
  'use strict';
  if (window.MixAllTidy) return;
  window.MixAllTidy = {};
  const path = location.pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } };
  const session = () => { try { return window.Netrify && window.Netrify.getSession(); } catch (_) { return null; } };
  const titleOf = (el) => { const h = el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > summary'); return h ? h.textContent.replace(/\s+/g, ' ').trim() : ''; };
  // 描き直しが続いても1フレームに1回だけ動かす
  const throttle = (fn) => { let on = false; return () => { if (!on) { on = true; requestAnimationFrame(() => { on = false; fn(); }); } }; };

  // ---------------- ヘッダーの「メニュー」 ----------------
  const MENU_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  function setupMenu() {
    const header = document.querySelector('header.top');
    const nav = window.MixAllNav;
    if (!header || header.querySelector('.mx-menu-open') || !nav || typeof nav.groups !== 'function') return;
    document.documentElement.classList.add('mx-has-menu');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mx-menu-open';
    btn.title = 'すべてのメニュー（M）';
    btn.setAttribute('aria-label', 'すべてのメニュー');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `${MENU_ICON}<span>メニュー</span>`;
    const services = header.querySelector('nav.services');
    (services || header.querySelector('.brand') || header.firstElementChild).insertAdjacentElement('afterend', btn);

    const panel = document.createElement('div');
    panel.className = 'mx-menu';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'すべてのメニュー');
    document.body.appendChild(panel);

    const linkHtml = (href, label, icon, on) => `<a href="${esc(href)}"${on ? ' class="on" aria-current="page"' : ''}>${icon || ''}<span>${esc(label)}</span></a>`;
    const itemsHtml = (list, mk) => list.map((it) => (it.type === 'subgroup'
      ? `<div class="mx-menu-sub"><p>${esc(it.label)}</p>${itemsHtml(it.items || [], mk)}</div>`
      : linkHtml(it.href, String(it.label).replace(/^↳\s*/, ''), mk(it.icon), nav.isActive && nav.isActive(it)))).join('');
    // そのページのヘッダーにだけある案内（例: Uch の「特殊言語辞書」）も、スマホでヘッダーのリンク列を隠しても届くように載せる
    function pageLinks() {
      if (!services) return '';
      const known = new Set();
      const walk = (list) => list.forEach((it) => { if (it.items) walk(it.items); if (it.href) known.add(new URL(it.href, location.origin).pathname.replace(/\/+$/, '').toLowerCase() || '/'); });
      nav.groups().forEach((g) => walk(g.items || []));
      const own = [...services.querySelectorAll('a[href]')].filter((a) => {
        const u = new URL(a.href, location.origin);
        return u.origin !== location.origin || u.hash || !known.has(u.pathname.replace(/\/+$/, '').toLowerCase() || '/');
      });
      return own.length ? `<section class="mx-menu-page"><h3>${MENU_ICON}<span>このページ</span></h3>${own.map((a) => linkHtml(a.getAttribute('href'), a.textContent.trim(), '', a.classList.contains('active'))).join('')}</section>` : '';
    }
    function render() {
      panel.innerHTML = `<div class="mx-menu-inner"><div class="mx-menu-head"><b>メニュー</b><button type="button" class="mx-menu-close" aria-label="閉じる">×</button></div>
        <div class="mx-menu-grid">${pageLinks()}${nav.groups().map((g) => `<section><h3>${g.icon}<span>${esc(g.label)}</span></h3>${itemsHtml(g.items || [], g.makeIcon)}</section>`).join('')}</div></div>`;
      panel.querySelector('.mx-menu-close').onclick = close;
    }
    function open() {
      render();
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('mx-menu-shown');
      const first = panel.querySelector('a.on') || panel.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    }
    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('mx-menu-shown');
    }
    btn.onclick = () => (panel.hidden ? open() : close());
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); if (panel.hidden) open(); else close(); }
    });
    window.MixAllTidy.menu = { open, close };
  }

  // ---------------- 設定（⚙）のパネルをタブに ----------------
  const SET_TABS = [
    { id: 'look', label: '見た目', match: /デザイン|テーマ|文字サイズ/ },
    { id: 'color', label: '背景・色', match: /背景|色の個別/ },
    { id: 'more', label: '編集・ロック', match: /./ }
  ];
  function setupSettingsTabs() {
    const p = document.querySelector('.settings-widget .settings-panel');
    if (!p || p.querySelector(':scope > .mx-set-tabs')) return;
    const kids = [...p.children];
    if (kids.filter((k) => k.tagName === 'H4').length < 3) return;
    const panes = {};
    const bar = document.createElement('div');
    bar.className = 'mx-set-tabs';
    bar.setAttribute('role', 'tablist');
    for (const t of SET_TABS) {
      bar.insertAdjacentHTML('beforeend', `<button type="button" role="tab" data-set-tab="${t.id}">${t.label}</button>`);
      panes[t.id] = document.createElement('div');
      panes[t.id].className = 'mx-set-pane';
      panes[t.id].dataset.setPane = t.id;
    }
    // 見出し（h4）ごとに、次の見出しまでをひとまとまりとしてタブへ移す（要素を動かすだけなので、設定の動きはそのまま）
    let target = null;
    for (const k of kids) {
      if (k.tagName === 'H4') target = panes[(SET_TABS.find((t) => t.match.test(k.textContent)) || SET_TABS[SET_TABS.length - 1]).id];
      if (target) target.appendChild(k);
    }
    p.prepend(bar);
    SET_TABS.forEach((t) => p.appendChild(panes[t.id]));
    const select = (id) => {
      bar.querySelectorAll('[data-set-tab]').forEach((b) => { const on = b.dataset.setTab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      Object.values(panes).forEach((x) => { x.hidden = x.dataset.setPane !== id; });
      save('mixall.setTab', id);
    };
    bar.onclick = (e) => { const b = e.target.closest('[data-set-tab]'); if (b) select(b.dataset.setTab); };
    select(SET_TABS.some((t) => t.id === load('mixall.setTab', '')) ? load('mixall.setTab', '') : 'look');
  }

  // ---------------- ホーム（ログイン中） ----------------
  function tidyHome() {
    if (path !== '/' && path !== '/index.html') return;
    const s = session();
    if (!s) return;
    document.documentElement.classList.add('mx-signed');
    const hero = document.querySelector('.home-hero');
    if (hero && !hero.querySelector('.mx-hello')) {
      const name = s.displayName || s.email || '';
      const hello = document.createElement('div');
      hello.className = 'mx-hello';
      hello.innerHTML = `<p><b>${esc(name)}</b> さん、こんにちは</p>
        <div class="mx-hello-links"><a href="/account/">アカウント設定</a><a href="/emergency.html">緊急モード</a><a href="/app/">アプリ版</a></div>`;
      hero.appendChild(hello);
    }
    const grid = document.querySelector('#services.feature-grid');
    if (grid && !grid.previousElementSibling?.classList.contains('mx-services-title')) {
      grid.insertAdjacentHTML('beforebegin', '<h2 class="mx-services-title">サービス</h2>');
      // 説明文はタイルを指したときの吹き出しに回す（読み上げでは今までどおり読まれる）
      grid.querySelectorAll('a').forEach((a) => { const d = a.querySelector('p'); if (d && !a.title) a.title = d.textContent.trim(); });
    }
  }

  // ---------------- カードをタブに分ける（アカウント設定） ----------------
  function cardTabs({ key, tabs, pinned }) {
    const main = document.querySelector('main');
    if (!main || main.classList.contains('mx-ctabs-on')) return;
    main.classList.add('mx-ctabs-on');
    const bar = document.createElement('div');
    bar.className = 'mx-ctabs';
    bar.setAttribute('role', 'tablist');
    bar.innerHTML = tabs.map((t) => `<button type="button" role="tab" data-ctab="${t.id}">${t.label}</button>`).join('');
    let current = load(key, tabs[0].id);
    if (!tabs.some((t) => t.id === current)) current = tabs[0].id;
    const cards = () => [...main.querySelectorAll(':scope > .card')];
    const shown = (c) => c.style.display !== 'none' && !c.hidden;
    const apply = throttle(() => {
      const list = cards();
      const pin = list.find((c) => pinned.test(titleOf(c)) && shown(c));
      // ログイン前（ログイン画面のカードしか無いとき）はタブを出さない
      if (!pin) { bar.hidden = true; list.forEach((c) => c.classList.remove('mx-ctab-off')); return; }
      if (pin.nextElementSibling !== bar) pin.insertAdjacentElement('afterend', bar);
      const counts = {};
      for (const c of list) {
        if (c === pin) { c.classList.remove('mx-ctab-off'); continue; }
        const title = titleOf(c);
        const tab = (tabs.find((t) => t.match.test(title)) || tabs[tabs.length - 1]).id;
        c.classList.toggle('mx-ctab-off', tab !== current);
        if (shown(c)) counts[tab] = (counts[tab] || 0) + 1;
      }
      bar.hidden = false;
      bar.querySelectorAll('[data-ctab]').forEach((b) => {
        const on = b.dataset.ctab === current;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.hidden = !counts[b.dataset.ctab];
      });
    });
    bar.onclick = (e) => { const b = e.target.closest('[data-ctab]'); if (!b) return; current = b.dataset.ctab; save(key, current); apply(); };
    new MutationObserver(apply).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
    apply();
  }

  // ---------------- たまにしか使わないカードを折りたたむ ----------------
  // 見出しを押すと開く・閉じる。開いたかどうかはカードごとに覚える。
  function folds(rules, firstTitle) {
    const main = document.querySelector('main');
    if (!main) return;
    const state = load('mixall.folds', {});
    const run = throttle(() => {
      for (const c of main.querySelectorAll(':scope > .card, :scope > section')) {
        if (c.dataset.mxFold) continue;
        const title = titleOf(c);
        if (firstTitle && firstTitle.test(title) && !c.dataset.mxFirst) { c.dataset.mxFirst = '1'; main.prepend(c); }
        if (!rules.test(title)) continue;
        const head = c.querySelector(':scope > h1, :scope > h2, :scope > h3');
        if (!head) continue;
        c.dataset.mxFold = title;
        c.classList.add('mx-fold');
        head.classList.add('mx-fold-head');
        head.setAttribute('role', 'button');
        head.tabIndex = 0;
        const set = (open) => { c.classList.toggle('open', open); head.setAttribute('aria-expanded', open ? 'true' : 'false'); };
        set(Boolean(state[`${path}|${title}`]));
        const toggle = () => { const open = !c.classList.contains('open'); set(open); state[`${path}|${title}`] = open; save('mixall.folds', state); };
        head.addEventListener('click', toggle);
        head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      }
    });
    new MutationObserver(run).observe(main, { childList: true });
    run();
  }

  function boot() {
    setupMenu();
    const header = document.querySelector('header.top');
    if (header) {
      const watch = throttle(() => { setupMenu(); setupSettingsTabs(); });
      new MutationObserver(watch).observe(header, { childList: true, subtree: true });
      setupSettingsTabs();
    }
    tidyHome();
    if (path === '/account' || path === '/account/index.html') {
      cardTabs({
        key: 'mixall.accountTab',
        pinned: /^アカウント設定$/,
        tabs: [
          { id: 'profile', label: 'プロフィール', match: /プロフィール|表示言語|装飾/ },
          { id: 'login', label: 'ログイン・安全', match: /ログイン|パスワード|回復用|別の端末|アカウント削除/ },
          { id: 'privacy', label: 'ミュート・通知', match: /ミュート|リマインド|通知/ },
          { id: 'more', label: '連携・その他', match: /./ }
        ]
      });
    }
    if (path === '/uch' || path === '/uch/index.html') folds(/Uchの名前とID|新規スレッド作成/);
    if (path === '/pocket' || path === '/pocket/index.html') folds(/^友達追加$|^グループを作る$/, /^チャット一覧$/);
  }
  // 下部メニュー（mixall-nav.js）が後から作られるページもあるので、読み込み完了時にもう一度試す
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.addEventListener('load', setupMenu, { once: true });
})();
