// js/plus-dash.js（MixAll +（二世代）・ホームのマイダッシュボード）
// ログインしているときだけ、ホーム（/ と /index.html）の .home-hero の直後に #mxDash を差し込む。
// ウィジェット（カード）は「編集」モードでドラッグ＆ドロップ（スマホは ↑↓ ボタン）で並べ替え、表示/非表示を切り替えられる。
// 並び順と表示設定はこの端末の localStorage `mixall.dash:<email>` に保存する。
(function () {
  'use strict';
  if (!window.MixAllPlus) return;
  const { esc, session, toast } = window.MixAllPlus;
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  const path = location.pathname.toLowerCase();
  if (path !== '/' && path !== '/index.html') return;

  // ---------- localStorage（失敗しても画面は壊さない） ----------
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  const lsJson = (k, d) => { try { const v = JSON.parse(lsGet(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } };

  // ---------- 共通 ----------
  const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');
  const openTool = (t, name) => {
    const url = `/Plus/tool.html?t=${t}`;
    if (window.MixAllFloat && typeof window.MixAllFloat.open === 'function') window.MixAllFloat.open(url, name);
    else location.href = url;
  };
  const odaiPostUrl = () => `/Ghost/?text=${encodeURIComponent('#今日のお題 ')}`;
  const failHtml = '<p class="muted mx-dash-fail">読み込めませんでした</p>';
  const loadingHtml = '<p class="muted">読み込み中…</p>';

  // dashboard API は1回だけ呼んで、各ウィジェットで使い回す
  let dashPromise = null;
  const dashboard = (force) => {
    if (!dashPromise || force) dashPromise = plus('dashboard', {}).catch((e) => { dashPromise = null; throw e; });
    return dashPromise;
  };

  // ---------- ウィジェット ----------
  const WIDGETS = [
    { id: 'daily', icon: '🎁', title: 'ログインボーナス・ミッション', render: renderDaily },
    { id: 'coins', icon: '🪙', title: 'Coin残高', render: renderCoins },
    { id: 'notif', icon: '🔔', title: '未読通知', render: renderNotif },
    { id: 'odai', icon: '💡', title: '今日のお題', render: renderOdai },
    { id: 'rank', icon: '🏆', title: '週間ランキング', render: renderRank },
    { id: 'bookmarks', icon: '🔖', title: 'ブックマーク', render: renderBookmarks },
    { id: 'weather', icon: '⛅', title: '天気', render: renderWeather },
    { id: 'tools', icon: '🧰', title: 'クイックツール', render: renderTools },
    { id: 'shortcuts', icon: '🚀', title: 'ショートカット', render: renderShortcuts },
  ];
  const byId = (id) => WIDGETS.find((w) => w.id === id);

  async function renderDaily(body) {
    body.innerHTML = loadingHtml;
    let d;
    try { d = (await dashboard()).daily; if (!d) throw new Error('no daily'); } catch (_) { body.innerHTML = failHtml; return; }
    const missions = (d.missions || []).map((m) => `<li class="${m.done ? 'done' : ''}"><span class="mx-dash-check">${m.claimed ? '✅' : m.done ? '☑️' : '⬜'}</span><span class="mx-dash-mlabel">${esc(m.label || '')}</span><span class="mx-dash-reward">+${fmt(m.reward)}</span></li>`).join('');
    body.innerHTML = `
      <div class="mx-dash-daily-top">
        <div><div class="mx-dash-big">${fmt(d.streak)}<small>日連続</small></div>
          <div class="muted">累計 ${fmt(d.totalDays)}日・明日は ${fmt(d.nextStreak)}日目</div></div>
        ${d.claimedToday ? '<span class="mx-dash-pill">受け取り済み</span>' : `<button type="button" class="mx-dash-claim">受け取る（+${fmt(d.bonus)}）</button>`}
      </div>
      ${missions ? `<ul class="mx-dash-missions">${missions}</ul>` : ''}
      ${d.allBonus ? `<p class="muted mx-dash-small">全部達成で +${fmt(d.allBonus)} ${d.allClaimed ? '（受け取り済み）' : ''}</p>` : ''}`;
    const btn = body.querySelector('.mx-dash-claim');
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await plus('claimDaily', {});
        toast(r && r.claimed != null ? `${fmt(r.claimed)} Coin を受け取りました` : '受け取りました');
        await dashboard(true).catch(() => null);
        refreshWidgets(['daily', 'coins']);
      } catch (e) { toast(e.message, { kind: 'error' }); btn.disabled = false; }
    };
  }

  async function renderCoins(body) {
    body.innerHTML = loadingHtml;
    try {
      const d = await dashboard();
      body.innerHTML = `<a class="mx-dash-coins" href="/Coin/"><span class="mx-dash-big">${fmt(d.coins)}</span><small>Coin</small><span class="mx-dash-more">Coin へ ›</span></a>`;
    } catch (_) { body.innerHTML = failHtml; }
  }

  async function renderNotif(body) {
    body.innerHTML = loadingHtml;
    const s = session();
    try {
      const res = await fetch(`/api/notifications?token=${encodeURIComponent(s.token)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const unread = (data.notifications || []).filter((n) => n && n.read === false).length;
      body.innerHTML = `<a class="mx-dash-coins" href="/Notifications/"><span class="mx-dash-big">${fmt(unread)}</span><small>件の未読</small><span class="mx-dash-more">通知へ ›</span></a>`;
    } catch (_) { body.innerHTML = failHtml; }
  }

  async function renderOdai(body) {
    body.innerHTML = loadingHtml;
    let text = '';
    try { const o = (await dashboard()).odai || {}; text = o.text || ''; } catch (_) { body.innerHTML = failHtml; return; }
    body.innerHTML = `<p class="mx-dash-odai">${esc(text || 'お題はまだありません')}</p>
      <div class="mx-dash-row"><a class="button" href="${odaiPostUrl()}">投稿する</a><a class="button secondary" href="/Plus/#odai">みんなの投稿</a></div>`;
  }

  async function renderRank(body) {
    body.innerHTML = loadingHtml;
    let r;
    try { r = (await dashboard()).rank || {}; } catch (_) { body.innerHTML = failHtml; return; }
    const list = (rows, unit) => (rows || []).slice(0, 3).map((x, i) => `<li><span class="mx-dash-medal">${['🥇', '🥈', '🥉'][i]}</span><span class="mx-dash-name">${esc(x.name || x.handle || '名無し')}</span><span class="mx-dash-val">${fmt(x.value)}${unit}</span></li>`).join('') || '<li class="muted">まだありません</li>';
    body.innerHTML = `<div class="mx-dash-rank">
        <div><h4>Ghost投稿数</h4><ol>${list(r.posts, '件')}</ol></div>
        <div><h4>もらったリアクション</h4><ol>${list(r.likes, '')}</ol></div>
      </div><a class="mx-dash-more" href="/Plus/#ranking">ランキングをすべて見る ›</a>`;
  }

  function renderBookmarks(body) {
    if (!window.MixAllBookmarks) { body.innerHTML = '<p class="muted">ブックマーク機能が使えません</p>'; return; }
    const items = lsJson(`mixall.bookmarks:${(session() || {}).email || ''}`, []);
    const list = (Array.isArray(items) ? items : []).slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5);
    body.innerHTML = list.length
      ? `<ul class="mx-dash-links">${list.map((b) => `<li><a href="${esc(b.url)}">${esc(b.title || b.url)}</a></li>`).join('')}</ul>`
      : '<p class="muted">まだありません。ヘッダーの☆で保存できます。</p>';
  }

  // 天気（Open-Meteo）
  const CITIES = [
    ['tokyo', '東京', 35.6895, 139.6917], ['osaka', '大阪', 34.6937, 135.5023], ['nagoya', '名古屋', 35.1815, 136.9066],
    ['sapporo', '札幌', 43.0618, 141.3545], ['sendai', '仙台', 38.2682, 140.8694], ['yokohama', '横浜', 35.4437, 139.638],
    ['kyoto', '京都', 35.0116, 135.7681], ['hiroshima', '広島', 34.3853, 132.4553], ['fukuoka', '福岡', 33.5904, 130.4017],
    ['naha', '那覇', 26.2124, 127.6809],
  ];
  const WEATHER_CODES = [[0, '☀️', '快晴'], [1, '🌤️', '晴れ'], [2, '⛅', '晴れ時々くもり'], [3, '☁️', 'くもり'], [48, '🌫️', '霧'],
    [57, '🌦️', '霧雨'], [67, '🌧️', '雨'], [77, '🌨️', '雪'], [82, '🌧️', 'にわか雨'], [86, '🌨️', 'にわか雪'], [99, '⛈️', '雷雨']];
  const weatherOf = (code) => { const c = Number(code); return (WEATHER_CODES.find(([max]) => c <= max) || [0, '❓', '不明']).slice(1); };
  async function renderWeather(body) {
    const cityId = lsGet('mixall.dash.city') || 'tokyo';
    const city = CITIES.find((c) => c[0] === cityId) || CITIES[0];
    body.innerHTML = `<select class="mx-dash-city" aria-label="都市">${CITIES.map((c) => `<option value="${c[0]}"${c[0] === city[0] ? ' selected' : ''}>${c[1]}</option>`).join('')}</select><div class="mx-dash-weather">${loadingHtml}</div>`;
    body.querySelector('select').onchange = (e) => { lsSet('mixall.dash.city', e.target.value); renderWeather(body); };
    const out = body.querySelector('.mx-dash-weather');
    const key = `mixall.dash.weather:${city[0]}`;
    let data = null;
    const cached = lsJson(key, null);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) data = cached.data;
    if (!data) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city[2]}&longitude=${city[3]}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        data = await res.json();
        lsSet(key, JSON.stringify({ at: Date.now(), data }));
      } catch (_) { out.innerHTML = failHtml; return; }
    }
    const cur = data.current || {};
    const daily = data.daily || {};
    const [emoji, label] = weatherOf(cur.weather_code);
    const max = (daily.temperature_2m_max || [])[0];
    const min = (daily.temperature_2m_min || [])[0];
    out.innerHTML = `<div class="mx-dash-wx"><span class="mx-dash-wx-icon">${emoji}</span>
      <div><div class="mx-dash-big">${cur.temperature_2m != null ? Math.round(cur.temperature_2m) : '--'}<small>℃</small></div>
      <div class="muted">${esc(label)}${max != null ? `・<span class="mx-dash-hi">${Math.round(max)}℃</span> / <span class="mx-dash-lo">${Math.round(min)}℃</span>` : ''}</div></div></div>`;
  }

  const TOOLS = [['calc', '🧮', '電卓'], ['timer', '⏱️', 'タイマー'], ['notes', '📝', '付箋'], ['translate', '🌐', '翻訳'], ['school', '🏫', '時間割']];
  function renderTools(body) {
    body.innerHTML = `<div class="mx-dash-grid">${TOOLS.map(([t, i, n]) => `<button type="button" class="secondary mx-dash-tile" data-tool="${t}" data-name="${n}"><span>${i}</span>${n}</button>`).join('')}</div>`;
    body.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => openTool(b.dataset.tool, b.dataset.name); });
  }

  const SHORTCUTS = [['/Ghost/', '👻', 'Ghost'], ['/Pocket/', '👝', 'ぽけっと'], ['/Uch/', '💬', 'Uch'], ['/Mail/', '✉️', 'Mail'], ['/Calendar/', '📅', 'カレンダー'], ['/Plus/', '➕', '＋広場']];
  function renderShortcuts(body) {
    body.innerHTML = `<div class="mx-dash-grid">${SHORTCUTS.map(([u, i, n]) => `<a class="mx-dash-tile" href="${u}"><span>${i}</span>${n}</a>`).join('')}</div>`;
  }

  // ---------- 並び順・表示設定 ----------
  const layoutKey = () => `mixall.dash:${(session() || {}).email || ''}`;
  function loadLayout() {
    const saved = lsJson(layoutKey(), {});
    const order = (Array.isArray(saved.order) ? saved.order : []).filter(byId);
    WIDGETS.forEach((w) => { if (!order.includes(w.id)) order.push(w.id); });
    const hidden = (Array.isArray(saved.hidden) ? saved.hidden : []).filter(byId);
    return { order, hidden };
  }
  let layout = null;
  const saveLayout = () => lsSet(layoutKey(), JSON.stringify(layout));

  // ---------- 描画 ----------
  let root = null;
  let editing = false;
  const cards = {};

  function cardEl(w) {
    const el = document.createElement('div');
    el.className = 'mx-dash-card';
    el.dataset.id = w.id;
    el.innerHTML = `<div class="mx-dash-head"><span class="mx-dash-title">${w.icon} ${esc(w.title)}</span>
      <span class="mx-dash-tools">
        <label class="mx-dash-vis"><input type="checkbox"> 表示</label>
        <button type="button" class="ghost mx-dash-up" aria-label="上へ">↑</button>
        <button type="button" class="ghost mx-dash-down" aria-label="下へ">↓</button>
      </span></div><div class="mx-dash-body"></div>`;
    el.querySelector('.mx-dash-up').onclick = () => move(w.id, -1);
    el.querySelector('.mx-dash-down').onclick = () => move(w.id, 1);
    el.querySelector('.mx-dash-vis input').onchange = (e) => {
      layout.hidden = layout.hidden.filter((x) => x !== w.id);
      if (!e.target.checked) layout.hidden.push(w.id);
      saveLayout(); arrange();
    };
    // ドラッグ＆ドロップ（編集モードのときだけ）
    el.addEventListener('dragstart', (e) => {
      if (!editing) { e.preventDefault(); return; }
      el.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', w.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) { /* ignore */ }
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      layout.order = [...root.querySelectorAll('.mx-dash-card')].map((c) => c.dataset.id);
      saveLayout(); arrange();
    });
    el.addEventListener('dragover', (e) => {
      if (!editing) return;
      const dragging = root.querySelector('.mx-dash-card.dragging');
      if (!dragging || dragging === el) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // 横に並ぶ場合も縦に並ぶ場合も、カードの中心より前か後ろかで差し込む位置を決める
      const after = r.width > r.height * 1.6 ? e.clientY > r.top + r.height / 2 : (e.clientY > r.bottom - 8 || (e.clientY > r.top + 8 && e.clientX > r.left + r.width / 2));
      el.insertAdjacentElement(after ? 'afterend' : 'beforebegin', dragging);
    });
    return el;
  }

  function move(id, dir) {
    const i = layout.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.order.length) return;
    [layout.order[i], layout.order[j]] = [layout.order[j], layout.order[i]];
    saveLayout(); arrange();
  }

  // 並べ直しと表示切り替え（中身は描き直さない）
  function arrange() {
    const grid = root.querySelector('.mx-dash-grid-main');
    layout.order.forEach((id, idx) => {
      const el = cards[id];
      if (!el) return;
      const hidden = layout.hidden.includes(id);
      el.classList.toggle('is-hidden', hidden);
      el.hidden = hidden && !editing;
      el.draggable = editing;
      el.querySelector('.mx-dash-vis input').checked = !hidden;
      el.querySelector('.mx-dash-up').disabled = idx === 0;
      el.querySelector('.mx-dash-down').disabled = idx === layout.order.length - 1;
      grid.appendChild(el);
      // 非表示から表示に戻したときは初めて中身を描く
      if (!hidden && !el.dataset.rendered) { el.dataset.rendered = '1'; renderOne(id); }
    });
    root.classList.toggle('editing', editing);
    const empty = root.querySelector('.mx-dash-empty');
    if (empty) empty.hidden = editing || layout.order.some((id) => !layout.hidden.includes(id));
  }

  function renderOne(id) {
    const w = byId(id);
    const el = cards[id];
    if (!w || !el) return;
    try { Promise.resolve(w.render(el.querySelector('.mx-dash-body'))).catch(() => { el.querySelector('.mx-dash-body').innerHTML = failHtml; }); }
    catch (_) { el.querySelector('.mx-dash-body').innerHTML = failHtml; }
  }
  function refreshWidgets(ids) { ids.forEach((id) => { if (cards[id] && cards[id].dataset.rendered) renderOne(id); }); }

  function mount() {
    const s = session();
    if (!s || !s.token || document.getElementById('mxDash')) return;
    const hero = document.querySelector('section.card.home-hero') || document.querySelector('.home-hero');
    if (!hero) return;
    layout = loadLayout();
    root = document.createElement('section');
    root.id = 'mxDash';
    root.className = 'mx-dash';
    root.innerHTML = `<div class="mx-dash-bar"><h2>マイダッシュボード</h2>
        <span class="mx-dash-hint muted">ドラッグか ↑↓ で並べ替え、「表示」で出す/隠す</span>
        <button type="button" class="secondary mx-dash-edit">編集</button></div>
      <div class="mx-dash-grid-main"></div>
      <p class="muted mx-dash-empty" hidden>表示中のウィジェットがありません。「編集」から選んでください。</p>`;
    hero.insertAdjacentElement('afterend', root);
    WIDGETS.forEach((w) => { cards[w.id] = cardEl(w); });
    const editBtn = root.querySelector('.mx-dash-edit');
    editBtn.onclick = () => { editing = !editing; editBtn.textContent = editing ? '完了' : '編集'; arrange(); };
    arrange();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
