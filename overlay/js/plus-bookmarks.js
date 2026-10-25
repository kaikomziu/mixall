// js/plus-bookmarks.js（MixAll +（二世代）・サイト全体のブックマーク）
// ヘッダーの☆ボタン（または「b」キー）で一覧を開き、いま見ているページを保存・解除する。
// Uch のスレッド・ぽけっとのルーム・Wiki・ツールなど、どのページでも保存できる（Ghost の投稿は v27c の「保存済み」もそのまま使える）。
// 保存先は /api/plus（server/plus.js の bookmarks・toggleBookmark）。一覧はこの端末にも控えて、☆の表示をすぐ出す。
(function () {
  'use strict';
  if (!window.MixAllPlus || window.MixAllBookmarks) return;
  const { esc, session, toast } = window.MixAllPlus;
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  const SKIP = /^\/(login|register|unlock|reset-password|age\.html|downloads|emergency)/i;
  const here = () => `${location.pathname}${location.search}`;
  const cacheKey = () => `mixall.bookmarks:${(session() || {}).email || ''}`;
  let items = (() => { try { return JSON.parse(localStorage.getItem(cacheKey()) || '[]'); } catch (_) { return []; } })();
  // 一覧を取りに行くのは、このタブで5分に1回まで（ページを移るたびには呼ばない）
  let loadedAt = (() => { try { return Number(sessionStorage.getItem(cacheKey()) || 0); } catch (_) { return 0; } })();
  const saveCache = () => {
    try { localStorage.setItem(cacheKey(), JSON.stringify(items)); sessionStorage.setItem(cacheKey(), String(loadedAt)); } catch (_) { /* ignore */ }
  };

  // ページの種類（一覧のアイコン）
  const KINDS = [[/^\/uch\//i, '💬', 'Uch'], [/^\/pocket\//i, '👝', 'ぽけっと'], [/^\/ghost\//i, '👻', 'Ghost'], [/^\/mail\//i, '✉️', 'Mail'],
    [/^\/wiki\//i, '📚', 'Wiki'], [/^\/tools\//i, '🧰', 'ツール'], [/^\/coin\//i, '🪙', 'Coin'], [/^\/school\//i, '🏫', '学校'], [/^\/maws\//i, '🛰️', 'MAWS']];
  const kindOf = (url) => (KINDS.find(([re]) => re.test(url)) || [null, '🔖', 'ページ']).slice(1);
  // ページの名前: スレッド名などの見出しを優先し、なければタイトルからサイト名を除く
  function titleOfPage() {
    const h = document.querySelector('#threadTitle, #roomTitle, #roomName, main h1, main h2');
    const head = h && h.textContent.trim();
    const t = document.title.replace(/\s*[|｜\-–—]\s*MixAll.*$/i, '').trim();
    if (head && head !== '読み込み中...' && head.length <= 80) return t && !t.includes(head) ? `${head}（${t}）` : head;
    return t || location.pathname;
  }
  const saved = () => items.some((x) => x.url === here());

  async function refresh(force) {
    if (!force && Date.now() - loadedAt < 5 * 60 * 1000) return;
    try { items = (await plus('bookmarks', {}, 'GET')).items || []; loadedAt = Date.now(); saveCache(); updateButton(); } catch (_) { /* 控えのまま */ }
  }
  async function toggle() {
    try {
      const r = await plus('toggleBookmark', { url: here(), title: titleOfPage() });
      items = r.items || []; loadedAt = Date.now(); saveCache(); updateButton();
      toast(r.saved ? 'ブックマークに保存しました' : 'ブックマークから外しました');
      return r.saved;
    } catch (e) { toast(e.message, { kind: 'error' }); return null; }
  }
  async function remove(url) {
    const b = items.find((x) => x.url === url);
    if (!b) return;
    try { const r = await plus('toggleBookmark', { url: b.url, title: b.title }); items = r.items || []; saveCache(); updateButton(); } catch (e) { toast(e.message, { kind: 'error' }); }
  }

  // ---------- ヘッダーの☆ボタン ----------
  let button = null;
  function updateButton() {
    if (!button) return;
    const on = saved();
    button.classList.toggle('on', on);
    button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 4h12v17l-6-4-6 4z"/></svg>`;
  }
  function addButton() {
    const header = document.querySelector('header.top');
    if (!header || header.querySelector('.mx-bm-open')) return;
    button = document.createElement('button');
    button.type = 'button'; button.className = 'mx-bm-open';
    button.setAttribute('aria-label', 'ブックマーク（b）'); button.title = 'ブックマーク（b）';
    button.onclick = openPanel;
    const anchor = header.querySelector('.mx-search-open') || header.querySelector('.settings-widget');
    if (anchor) anchor.insertAdjacentElement('beforebegin', button); else header.appendChild(button);
    updateButton();
  }

  // ---------- 一覧パネル ----------
  let layer = null;
  function closePanel() {
    if (!layer) return;
    layer.remove(); layer = null;
    document.documentElement.classList.remove('mixall-dialog-open');
  }
  function renderList(box, q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = items.filter((b) => words.every((w) => `${b.title} ${b.url}`.toLowerCase().includes(w)));
    box.innerHTML = list.length ? list.map((b) => {
      const [icon, label] = kindOf(b.url);
      return `<div class="mx-bm-item${b.url === here() ? ' here' : ''}"><a href="${esc(b.url)}"><span class="mx-bm-icon" aria-hidden="true">${icon}</span><span class="mx-bm-text"><b>${esc(b.title)}</b><small>${esc(label)}・${new Date(b.at).toLocaleDateString('ja-JP')}</small></span></a><button type="button" class="ghost mx-bm-del" data-url="${esc(b.url)}" aria-label="「${esc(b.title)}」を外す" title="外す">×</button></div>`;
    }).join('') : `<p class="muted mx-bm-empty">${items.length ? '見つかりません' : 'まだありません。保存したいページで「このページを保存」を押してください'}</p>`;
    box.querySelectorAll('.mx-bm-del').forEach((btn) => {
      btn.onclick = async () => { btn.disabled = true; await remove(btn.dataset.url); renderList(box, q); syncToggle(); };
    });
  }
  let syncToggle = () => {};
  function openPanel() {
    if (!session()) { toast('ブックマークを使うにはログインしてください'); return; }
    if (layer) { closePanel(); return; }
    layer = document.createElement('div');
    layer.className = 'mx-bm-layer';
    layer.innerHTML = `<div class="mx-bm-panel" role="dialog" aria-modal="true" aria-label="ブックマーク">
      <div class="mx-bm-head"><b>🔖 ブックマーク</b><button type="button" class="ghost mx-bm-close" aria-label="閉じる">×</button></div>
      <button type="button" class="mx-bm-toggle"></button>
      <input type="search" class="mx-bm-search" placeholder="ブックマークを検索" autocomplete="off">
      <div class="mx-bm-list"></div>
      <a class="mx-bm-ghost" href="/Ghost/bookmarks.html">👻 Ghost の「保存済み」の投稿を見る</a>
    </div>`;
    const list = layer.querySelector('.mx-bm-list');
    const search = layer.querySelector('.mx-bm-search');
    const tg = layer.querySelector('.mx-bm-toggle');
    syncToggle = () => { tg.textContent = saved() ? '★ このページを保存済み（押すと外す）' : '☆ このページを保存'; tg.classList.toggle('on', saved()); };
    tg.onclick = async () => { tg.disabled = true; await toggle(); tg.disabled = false; syncToggle(); renderList(list, search.value); };
    search.oninput = () => renderList(list, search.value);
    layer.querySelector('.mx-bm-close').onclick = closePanel;
    layer.addEventListener('click', (e) => { if (e.target === layer) closePanel(); });
    layer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
    syncToggle(); renderList(list, '');
    document.documentElement.classList.add('mixall-dialog-open');
    document.body.appendChild(layer);
    tg.focus();
    refresh(true).then(() => { if (layer) { syncToggle(); renderList(list, search.value); } });
  }

  // 「b」キーで開く（入力中・ダイアログ表示中は除く）
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'b' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const a = document.activeElement;
    if (a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable)) return;
    if (document.querySelector('.mixall-dialog-layer, .mx-search-layer, .mx-lightbox, .mx-story-viewer')) return;
    e.preventDefault(); openPanel();
  });

  window.MixAllBookmarks = { open: openPanel, toggle, refresh };
  function boot() {
    if (!session() || SKIP.test(location.pathname)) return;
    addButton();
    // 見出しは後から入ることがあるので、☆の状態だけ先に出して一覧は裏で取りに行く
    refresh(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
