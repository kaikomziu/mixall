// public/js/mixall-base.js
// GitHub Pages では サイトが /<リポジトリ名>/ 配下に置かれるため、そのベースパスを扱う小さな補助。
// - MixAllBase.path(): ベースを除いた現在のパス（旧Netlify版の location.pathname 相当）
// - MixAllBase.fix(url): サーバーや保存データ由来の "/Pocket/..." のようなURLにベースを付ける
// - リンクのクリック時に、ベースが無いサイト内URLを自動で補正する
(function () {
  'use strict';
  const base = String(window.MIXALL_BASE || '').replace(/\/$/, '');
  const api = String(window.MIXALL_API_BASE || '/.netlify/functions').replace(/\/$/, '');

  function path() {
    const p = location.pathname;
    if (base && (p === base || p.startsWith(base + '/'))) return p.slice(base.length) || '/';
    return p;
  }

  function fix(url) {
    const value = String(url == null ? '' : url);
    if (value.startsWith('/.netlify/functions/')) return api + value.slice('/.netlify/functions'.length);
    if (!base || !value.startsWith('/') || value.startsWith('//')) return value;
    if (value === base || value.startsWith(base + '/') || value.startsWith(base + '?') || value.startsWith(base + '#')) return value;
    return base + value;
  }

  // 定期更新: 画面が見えていないときは止め、3分操作が無ければ間隔を4倍に延ばす（API呼び出しの節約）。
  // 画面に戻ったときは、前回から間が空いていればすぐ1回更新する。
  let lastActive = Date.now();
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach((name) => addEventListener(name, () => { lastActive = Date.now(); }, { passive: true, capture: true }));
  function poll(fn, ms) {
    let last = Date.now();
    const run = () => { last = Date.now(); try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (error) { console.error(error); } };
    const id = setInterval(() => {
      if (document.hidden) return;
      const wait = Date.now() - lastActive > 3 * 60 * 1000 ? ms * 4 : ms;
      if (Date.now() - last >= wait - 50) run();
    }, ms);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > ms) { lastActive = Date.now(); run(); } });
    return id;
  }
  window.MixAllBase = { base, api, path, fix, poll };

  document.addEventListener('click', (event) => {
    const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    const fixed = fix(href);
    if (fixed !== href) anchor.setAttribute('href', fixed);
  }, true);

  // 動的に差し込まれた画像・動画などの src も補正する
  function fixNode(node) {
    if (!node || node.nodeType !== 1) return;
    for (const attr of ['src', 'poster', 'href']) {
      const value = node.getAttribute && node.getAttribute(attr);
      if (value && value.startsWith('/') && !value.startsWith('//')) {
        const fixed = fix(value);
        if (fixed !== value) node.setAttribute(attr, fixed);
      }
    }
  }
  if (base || api !== '/.netlify/functions') {
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') fixNode(record.target);
        else for (const node of record.addedNodes) {
          fixNode(node);
          if (node.querySelectorAll) node.querySelectorAll('[src],[poster],a[href],link[href]').forEach(fixNode);
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'poster', 'href'] });
  }
})();
