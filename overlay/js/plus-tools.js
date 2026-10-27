// js/plus-tools.js（MixAll +（二世代）・コマンドパレットと小窓の道具）
// - コマンドパレット: Ctrl＋Shift＋P（Mac は ⌘＋Shift＋P）またはヘッダーの「⌘」ボタンで開き、ページ移動・道具・ブックマークなどをすぐ呼び出す
// - 道具（電卓・タイマー・付箋・翻訳・時間割と単語帳）は /Plus/tool.html?t=… を小窓（js/float-windows.js の MixAllFloat）で開く
// - ミニぽけっと: ルームを選んで小窓で開く。ルーム画面には「🪟 小窓で開く」ボタンを足す
// - 小窓の中で /Pocket/room.html?mini=1 が開かれたら、html に mx-embed を付けてメッセージ一覧と入力欄だけにする（見た目は css/plus-tools.css）
(function () {
  'use strict';
  if (window.MixAllTools) return;
  const inFrame = (() => { try { return window.self !== window.top; } catch (_) { return true; } })();
  const path = location.pathname.toLowerCase();
  const isRoom = /^\/pocket\/room(\.html)?$/.test(path);
  const params = new URLSearchParams(location.search);
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  const session = () => { try { return JSON.parse(lsGet('netrify_session') || 'null'); } catch (_) { return null; } };
  const toast = (m, o) => { if (window.MixAllPlus && window.MixAllPlus.toast) window.MixAllPlus.toast(m, o); };

  // =================================================================
  // 小窓の中のミニぽけっと（メッセージ一覧と入力欄だけにする）
  // =================================================================
  if (inFrame && isRoom && params.get('mini') === '1') {
    document.documentElement.classList.add('mx-embed');
    // 下に固定した入力欄の高さ（添付のプレビューなどで変わる）を --composer-h に入れて、一覧の高さと余白を合わせる
    ready(() => {
      const body = document.getElementById('msgBody');
      const card = body && body.closest('.card');
      if (!card || !window.ResizeObserver) return;
      new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', `${Math.ceil(card.getBoundingClientRect().height)}px`)).observe(card);
    });
  }

  // 小窓の中では、パレットのショートカットを親のページへ回す（同じサイトのときだけ）
  if (inFrame) {
    document.addEventListener('keydown', (e) => {
      if (!isPaletteKey(e)) return;
      try {
        if (window.top.MixAllTools) { e.preventDefault(); e.stopPropagation(); window.top.MixAllTools.open(); }
      } catch (_) { /* 別サイトの中なら何もしない */ }
    }, true);
    window.MixAllTools = { open: () => { try { window.top.MixAllTools.open(); } catch (_) { /* ignore */ } } };
    return;
  }

  function isPaletteKey(e) {
    return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'KeyP' || String(e.key).toLowerCase() === 'p');
  }

  // =================================================================
  // 小窓（MixAllFloat）で道具を開く
  // =================================================================
  function float(url, title) {
    if (!window.MixAllFloat) { toast('このページでは小窓を開けません', { kind: 'error' }); return null; }
    return window.MixAllFloat.open(url, title);
  }
  const TOOLS = [
    ['calc', '🧮', '電卓・単位変換', 'でんたく けいさん たんいへんかん calculator unit dentaku'],
    ['timer', '⏱️', 'タイマー・ストップウォッチ', 'たいまー すとっぷうぉっち timer stopwatch kitchen'],
    ['notes', '🗒️', '付箋', 'ふせん めも ノート notes memo sticky fusen'],
    ['translate', '🌐', '翻訳・辞書', 'ほんやく じしょ いみ translate dictionary honyaku jisho'],
    ['school', '🏫', '時間割と単語帳', 'じかんわり たんごちょう がっこう school timetable flashcard tango']
  ];
  const openTool = (t, name) => float(`/Plus/tool.html?t=${encodeURIComponent(t)}`, name);

  // =================================================================
  // ミニぽけっと
  // =================================================================
  async function pocketRooms() {
    const s = session();
    if (!s || !s.token) throw new Error('ぽけっとを使うにはログインしてください');
    // 一覧の取得は public/Pocket/index.html と同じ GET /api/pocket?token=…（{ rooms }）
    const r = await fetch(`/api/pocket?token=${encodeURIComponent(s.token)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `エラー (${r.status})`);
    return d.rooms || [];
  }
  const roomName = (r) => r.title || (r.type === 'dm' ? '個人チャット' : 'グループ');
  const openMiniRoom = (id, name) => float(`/Pocket/room.html?id=${encodeURIComponent(id)}&mini=1`, `ぽけっと: ${name}`);
  async function miniPocket() {
    if (!window.MixAllFloat) { toast('このページでは小窓を開けません', { kind: 'error' }); return; }
    openPalette({ placeholder: 'ルームを読み込み中…', items: [], loading: true });
    let rooms;
    try { rooms = await pocketRooms(); } catch (e) { closePalette(); toast(e.message, { kind: 'error' }); return; }
    if (!layer) return; // 読み込み中に閉じられた
    const items = rooms.map((r) => ({
      id: `room:${r.id}`, icon: r.type === 'dm' ? '👤' : '👥', label: `${r.pinned ? '📌 ' : ''}${roomName(r)}`,
      hint: r.unreadCount ? `未読 ${r.unreadCount > 99 ? '99+' : r.unreadCount}` : (r.lastMessage ? `${r.lastMessage.authorName || ''}: ${String(r.lastMessage.text || '').slice(0, 30)}` : ''),
      keys: '', run: () => openMiniRoom(r.id, roomName(r)), noRecent: true
    }));
    openPalette({ placeholder: items.length ? '小窓で開くルームを選ぶ' : 'ルームがありません', items });
  }

  // ルーム画面に「🪟 小窓で開く」ボタン（いまのルームを小窓にして、元のページはぽけっと一覧へ戻す）
  function addRoomButton() {
    if (!isRoom || !params.get('id') || document.querySelector('.mx-room-float')) return;
    const anchor = document.getElementById('searchChatButton');
    const row = anchor ? anchor.parentElement : null;
    if (!row) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'secondary mx-room-float';
    btn.textContent = '🪟 小窓で開く'; btn.title = 'このルームを小窓で開き、ぽけっと一覧へ戻ります';
    btn.onclick = () => {
      const t = (document.getElementById('roomTitle') || {}).textContent || '';
      const name = t && t.trim() !== '読み込み中...' ? t.trim() : 'ルーム';
      if (!openMiniRoom(params.get('id'), name)) return;
      location.href = '/Pocket/';
    };
    row.insertBefore(btn, row.firstChild);
  }

  // =================================================================
  // コマンド
  // =================================================================
  const go = (url) => () => { location.href = url; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function toggleTheme() {
    const now = lsGet('netrify_theme');
    lsSet('netrify_theme', now === 'light' ? 'dark' : 'light');
    location.reload();
  }
  function commands() {
    const list = [
      ['go:home', '🏠', 'ホームへ移動', 'home ほーむ top トップ', go('/')],
      ['go:ghost', '👻', 'Ghost へ移動', 'ghost ごーすと ゴースト sns', go('/Ghost/')],
      ['go:pocket', '👝', 'ぽけっとへ移動', 'pocket ぽけっと chat ちゃっと', go('/Pocket/')],
      ['go:uch', '💬', 'Uch へ移動', 'uch うち けいじばん 掲示板', go('/Uch/')],
      ['go:mail', '✉️', 'Mail へ移動', 'mail めーる', go('/Mail/')],
      ['go:coin', '🪙', 'Coin へ移動', 'coin こいん', go('/Coin/')],
      ['go:notif', '🔔', '通知へ移動', 'notifications つうち', go('/Notifications/')],
      ['go:account', '⚙️', 'アカウントへ移動', 'account あかうんと せってい 設定', go('/account/')],
      ['go:tools', '🧰', 'ツールセンターへ移動', 'tools つーる', go('/Tools/')],
      ['go:calendar', '📅', 'カレンダーへ移動', 'calendar かれんだー よてい 予定', go('/Calendar/')],
      ['go:wiki', '📚', 'Wiki へ移動', 'wiki うぃき', go('/Wiki/')],
      ['go:plus', '✨', '＋広場へ移動', 'plus ぷらす ひろば', go('/Plus/')],
      ['go:ranking', '🏆', '＋広場: ランキング', 'ranking らんきんぐ', go('/Plus/#ranking')],
      ['go:gallery', '🖼️', '＋広場: ギャラリー', 'gallery ぎゃらりー', go('/Plus/#gallery')],
      ['go:avatar', '🧑‍🎨', '＋広場: アバター', 'avatar あばたー', go('/Plus/#avatar')],
      ['go:odai', '🎯', '＋広場: お題', 'odai おだい theme', go('/Plus/#odai')],
      ...TOOLS.map(([t, icon, name, keys]) => [`tool:${t}`, icon, `${name}を小窓で開く`, `どうぐ 道具 こまど 小窓 ${keys}`, () => openTool(t, name)]),
      ['mini:pocket', '🪟', 'ミニぽけっと（ルームを小窓で開く）', 'mini pocket みにぽけっと こまど 小窓 chat', miniPocket, { keep: true }],
      ['bm:open', '🔖', 'ブックマークを開く', 'bookmark ぶっくまーく しおり', () => window.MixAllBookmarks && window.MixAllBookmarks.open(), { need: () => window.MixAllBookmarks }],
      ['bm:toggle', '☆', 'このページをブックマーク', 'bookmark ぶっくまーく ほぞん 保存', () => window.MixAllBookmarks && window.MixAllBookmarks.toggle(), { need: () => window.MixAllBookmarks && window.MixAllBookmarks.toggle }],
      ['search', '🔍', 'サイト内検索', 'search けんさく さがす', () => window.MixAllPlus.openSearch(), { need: () => window.MixAllPlus && window.MixAllPlus.openSearch }],
      ['help', '⌨', 'ショートカット一覧', 'shortcut しょーとかっと きー help へるぷ', () => window.MixAllQoL.showHelp(), { need: () => window.MixAllQoL }],
      ['float:close', '✕', '小窓をすべて閉じる', 'close こまど 小窓 とじる', () => window.MixAllFloat.closeAll(), { need: () => window.MixAllFloat && window.MixAllFloat.count() > 0 }],
      ['scroll:top', '⤒', 'ページの先頭へ', 'top せんとう うえ scroll', () => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })],
      ['scroll:bottom', '⤓', 'ページの末尾へ', 'bottom まつび した scroll', () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' })],
      ['theme', '🌓', lsGet('netrify_theme') === 'light' ? 'ダークテーマに切り替え' : 'ライトテーマに切り替え', 'theme てーま dark light だーく らいと', toggleTheme]
    ];
    return list.filter((c) => !c[5] || !c[5].need || c[5].need())
      .map(([id, icon, label, keys, run, opt]) => ({ id, icon, label, keys, run, keep: Boolean(opt && opt.keep) }));
  }

  // ---------- あいまい検索（ひらがな/カタカナ・全角/半角・大文字/小文字を区別しない） ----------
  function norm(s) {
    return String(s || '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/[\s・:：]+/g, ' ').trim();
  }
  // 並び順の点数（高いほど上）。一致しなければ -1
  function score(item, q) {
    if (!q) return 0;
    const label = norm(item.label), all = `${label} ${norm(item.keys)} ${norm(item.hint)}`;
    let total = 0;
    for (const w of q.split(' ')) {
      if (!w) continue;
      if (label.startsWith(w)) { total += 100; continue; }
      const at = all.indexOf(w);
      if (at >= 0) { total += 60 - Math.min(at, 40) / 2; continue; }
      // 1文字ずつ順に含まれていれば（とびとびでも）一致とみなす
      let i = 0, gaps = 0, last = -1;
      for (const ch of w) {
        const f = all.indexOf(ch, i);
        if (f < 0) return -1;
        if (last >= 0 && f > last + 1) gaps += 1;
        last = f; i = f + 1;
      }
      total += Math.max(1, 30 - gaps * 4);
    }
    return total;
  }

  // ---------- 最近使ったコマンド ----------
  const RECENT_KEY = 'mixall.palette.recent';
  const recent = () => { try { const a = JSON.parse(lsGet(RECENT_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
  const remember = (id) => lsSet(RECENT_KEY, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 8)));

  // =================================================================
  // パレットの画面
  // =================================================================
  let layer = null, view = null, active = 0, shown = [], lastFocus = null;
  function closePalette() {
    if (!layer) return;
    layer.remove(); layer = null; view = null;
    document.documentElement.classList.remove('mixall-dialog-open');
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (_) { /* ignore */ } }
  }
  function render() {
    if (!layer) return;
    const input = layer.querySelector('.mx-pal-input');
    const box = layer.querySelector('.mx-pal-list');
    const q = norm(input.value);
    let items = view.items;
    if (q) {
      items = items.map((it) => [it, score(it, q)]).filter(([, s]) => s >= 0).sort((a, b) => b[1] - a[1]).map(([it]) => it);
    } else if (view.recent) {
      const r = recent();
      const rank = (it) => { const i = r.indexOf(it.id); return i < 0 ? 99 : i; };
      items = items.slice().sort((a, b) => rank(a) - rank(b));
    }
    shown = items;
    active = Math.max(0, Math.min(active, items.length - 1));
    const r = view.recent && !q ? recent() : [];
    box.innerHTML = view.loading ? '<p class="mx-pal-empty">読み込み中…</p>' : items.length ? items.map((it, i) => `
      <button type="button" class="mx-pal-item${i === active ? ' on' : ''}" role="option" aria-selected="${i === active}" data-i="${i}" id="mx-pal-opt-${i}">
        <span class="mx-pal-icon" aria-hidden="true">${esc(it.icon || '・')}</span>
        <span class="mx-pal-text"><b>${esc(it.label)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>
        ${r.includes(it.id) ? '<span class="mx-pal-tag">最近</span>' : ''}
      </button>`).join('') : '<p class="mx-pal-empty">見つかりません</p>';
    input.setAttribute('aria-activedescendant', items.length ? `mx-pal-opt-${active}` : '');
    const on = box.querySelector('.mx-pal-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function run(i) {
    const it = shown[i];
    if (!it) return;
    if (view.recent && !it.noRecent) remember(it.id);
    if (!it.keep) closePalette();
    try { const p = it.run(); if (p && p.catch) p.catch((e) => toast(e.message, { kind: 'error' })); } catch (e) { toast(e.message, { kind: 'error' }); }
  }
  // opt: { items, placeholder, recent, loading }。省略時はコマンド一覧
  function openPalette(opt) {
    const o = opt || { items: commands(), placeholder: 'コマンドを入力（例: でんたく、ghost、ぶっくまーく）', recent: true };
    if (!layer) {
      lastFocus = document.activeElement;
      layer = document.createElement('div');
      layer.className = 'mx-pal-layer';
      layer.innerHTML = `<div class="mx-pal" role="dialog" aria-modal="true" aria-label="コマンドパレット">
        <div class="mx-pal-bar"><span class="mx-pal-mark" aria-hidden="true">⌘</span><input type="text" class="mx-pal-input" role="combobox" aria-expanded="true" aria-controls="mx-pal-list" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
        <div class="mx-pal-list" id="mx-pal-list" role="listbox"></div>
        <div class="mx-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 選ぶ</span><span><kbd>Enter</kbd> 実行</span><span><kbd>Esc</kbd> 閉じる</span></div>
      </div>`;
      const input = layer.querySelector('.mx-pal-input');
      input.addEventListener('input', () => { active = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); active = shown.length ? (active + 1) % shown.length : 0; render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = shown.length ? (active - 1 + shown.length) % shown.length : 0; render(); }
        else if (e.key === 'Enter') { e.preventDefault(); run(active); }
      });
      layer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); } });
      layer.addEventListener('click', (e) => {
        if (e.target === layer) { closePalette(); return; }
        const b = e.target.closest('.mx-pal-item');
        if (b) run(Number(b.dataset.i));
      });
      layer.addEventListener('mousemove', (e) => {
        const b = e.target.closest('.mx-pal-item');
        if (b && Number(b.dataset.i) !== active) { active = Number(b.dataset.i); layer.querySelectorAll('.mx-pal-item').forEach((x, i) => x.classList.toggle('on', i === active)); }
      });
      document.documentElement.classList.add('mixall-dialog-open');
      document.body.appendChild(layer);
    }
    view = o; active = 0;
    const input = layer.querySelector('.mx-pal-input');
    input.value = ''; input.placeholder = o.placeholder || '';
    render();
    input.focus();
  }
  function togglePalette() { if (layer) closePalette(); else openPalette(); }

  // 入力中の欄からでも開けるよう、捕捉の段階で受け取る
  document.addEventListener('keydown', (e) => {
    if (!isPaletteKey(e) || e.isComposing) return;
    e.preventDefault(); e.stopPropagation();
    togglePalette();
  }, true);

  // ---------- ヘッダーの「⌘」ボタン ----------
  function addButton() {
    const header = document.querySelector('header.top');
    if (!header || header.querySelector('.mx-pal-open')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mx-pal-open';
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const label = `コマンドパレット（${mac ? '⌘' : 'Ctrl'}＋Shift＋P）`;
    btn.setAttribute('aria-label', label); btn.title = label;
    btn.textContent = '⌘';
    btn.onclick = togglePalette;
    const anchor = header.querySelector('.mx-search-open');
    if (anchor) anchor.insertAdjacentElement('beforebegin', btn); else header.appendChild(btn);
  }

  window.MixAllTools = { open: () => openPalette(), close: closePalette, openTool, miniPocket };
  ready(() => {
    try { addRoomButton(); } catch (_) { /* ignore */ }
    // 検索ボタン（plus.js）が後から入ることがあるので少し待ってから足す
    try { addButton(); } catch (_) { /* ignore */ }
    setTimeout(() => {
      const b = document.querySelector('header.top .mx-pal-open');
      const s = document.querySelector('header.top .mx-search-open');
      if (b && s && b.nextElementSibling !== s) s.insertAdjacentElement('beforebegin', b);
      if (!b) { try { addButton(); } catch (_) { /* ignore */ } }
    }, 600);
  });
})();
