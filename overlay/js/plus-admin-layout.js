// js/plus-admin-layout.js（MixAll +（二世代）・運営画面の並べ方）
// 友人の運営画面（24枚のカード）と MixAll + のカードを、内容ごとのタブに分けて見やすくする。
// - PC: 左に縦のタブと検索、右にカードを2列（表やグラフの大きいカードは横いっぱい）
// - スマホ: 上に横スクロールのタブ、カードは1列
// カードは動かさず、data-mx-tab の印を付けて表示を切り替える（各画面が中身を描き直しても崩れない）。
(function () {
  'use strict';
  if (!/^\/admin\/?(index\.html)?$/i.test(location.pathname) || window.MixAllAdminLayout) return;

  // 見出しの言葉で、どのタブに入れるか決める（上から順に最初に当たったもの）
  const TABS = [
    { id: 'overview', icon: '📊', label: '概要', match: /運営ダッシュボード|MixAll \+ ダッシュボード|使用量|容量|Manus運営コンソール/ },
    { id: 'moderation', icon: '🚩', label: '通報・監視', match: /通報|モデレーション|審査|監査|ワンタップ用タグ|Uchスレッド・貸し出し|プログラム／HTML/ },
    { id: 'notice', icon: '📢', label: 'お知らせ・連絡', match: /お知らせ|個別に連絡|警告|フィードバック/ },
    { id: 'accounts', icon: '👥', label: 'アカウント', match: /^(?!公式アカウント).*(アカウント|生年月日|アクティブ端末|ログインメール|ゴミ箱)/ },
    { id: 'settings', icon: '⚙️', label: '設定・連携', match: /拡張機能|MAWS|x\.gd|Gemini|公式アカウント|自動応答|初回設定|SQL|データ書き出し|APIキー/ },
    { id: 'history', icon: '📜', label: '履歴', match: /操作履歴/ },
    { id: 'other', icon: '🗂️', label: 'その他', match: /./ }
  ];
  // 横いっぱいに使うカード（表・グラフ・長い一覧）
  const WIDE = /運営ダッシュボード|MixAll \+ ダッシュボード|使用量|通報の受付箱|通報対応|操作履歴|アカウント・運営権限|チャット監査|Uchスレッド・貸し出し|プログラム／HTML|Ghostモデレーション|定期AI審査|全アカウントのアクティブ端末/;
  // タブの中での並び（先頭にしたいもの）
  const FIRST = /運営ダッシュボード|MixAll \+ ダッシュボード|通報の受付箱|お知らせバナー/;
  const KEY = 'mixall.adminTab';

  const titleOf = (card) => {
    const h = card.querySelector('h1, h2, h3, summary');
    return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  const tabOf = (title) => (TABS.find((t) => t.match.test(title)) || TABS[TABS.length - 1]).id;
  let current = (() => {
    const h = location.hash.replace('#', '');
    if (TABS.some((t) => t.id === h)) return h;
    try { return localStorage.getItem(KEY) || 'overview'; } catch (_) { return 'overview'; }
  })();
  let query = '';
  let main = null;
  let nav = null;

  // カードに印を付ける（新しく描かれたカードにも）
  function tag() {
    const cards = [...main.querySelectorAll(':scope > .card, :scope > #mxAdminPlus > .card')];
    for (const card of cards) {
      const title = titleOf(card);
      if (card.dataset.mxTitle !== title) {
        card.dataset.mxTitle = title;
        card.dataset.mxTab = tabOf(title);
        card.classList.toggle('mx-wide', WIDE.test(title));
        card.style.order = FIRST.test(title) ? '-1' : '';
      }
    }
    return cards;
  }
  function apply() {
    const cards = tag();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const counts = {};
    for (const card of cards) {
      const hit = words.length ? words.every((w) => card.textContent.toLowerCase().includes(w)) : card.dataset.mxTab === current;
      card.classList.toggle('mx-tab-on', hit);
      if (!card.hidden && card.style.display !== 'none') counts[card.dataset.mxTab] = (counts[card.dataset.mxTab] || 0) + 1;
    }
    nav.querySelectorAll('[data-tab]').forEach((b) => {
      const on = !words.length && b.dataset.tab === current;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.hidden = !counts[b.dataset.tab];
      const c = b.querySelector('.mx-atab-count');
      if (c) c.textContent = counts[b.dataset.tab] || '';
    });
    const empty = main.querySelector('.mx-admin-empty');
    if (empty) empty.hidden = cards.some((c) => c.classList.contains('mx-tab-on'));
  }
  function select(id) {
    current = id; query = '';
    const s = nav.querySelector('.mx-atab-search');
    if (s) s.value = '';
    try { localStorage.setItem(KEY, id); } catch (_) { /* ignore */ }
    history.replaceState(null, '', `#${id}`);
    apply();
    window.scrollTo({ top: 0 });
  }

  function boot() {
    main = document.querySelector('main');
    if (!main || main.classList.contains('mx-admin')) return;
    main.classList.add('mx-admin');
    nav = document.createElement('nav');
    nav.className = 'mx-admin-tabs';
    nav.setAttribute('aria-label', '運営画面のタブ');
    nav.innerHTML = `<input type="search" class="mx-atab-search" placeholder="運営画面を検索" aria-label="運営画面を検索">
      <div class="mx-atab-list" role="tablist">${TABS.map((t) => `<button type="button" role="tab" data-tab="${t.id}"><span aria-hidden="true">${t.icon}</span><b>${t.label}</b><span class="mx-atab-count"></span></button>`).join('')}</div>`;
    main.before(nav);
    const empty = document.createElement('p');
    empty.className = 'muted mx-admin-empty'; empty.textContent = '当てはまる項目がありません';
    main.appendChild(empty);
    nav.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => select(b.dataset.tab); });
    let t = null;
    nav.querySelector('.mx-atab-search').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim(); apply(); }, 120); };
    // 各画面があとからカードを足したり描き直したりするので、そのたびに印を付け直す
    let pending = false;
    new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; apply(); }); } })
      .observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
    apply();
  }
  window.MixAllAdminLayout = { select };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
