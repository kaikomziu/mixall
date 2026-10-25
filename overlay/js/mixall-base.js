// js/mixall-base.js（GitHub Pages 版だけで使う）
// GitHub Pages では サイトが /<リポジトリ名>/ 配下に置かれ、APIは Supabase Edge Function になるため、その差を吸収する小さな補助。
// - MixAllBase.path(): ベースを除いた現在のパス（EdgeOne版の location.pathname 相当）
// - MixAllBase.fix(url): サーバーや保存データ由来の "/Pocket/..." のようなURLにベースを付ける。"/api/..." はAPIのURLにする
// - ビルド時に書き換えきれなかったURL（リンク・画像・fetch・history・画面移動）も、実行時に補正する
(function () {
  'use strict';
  const base = String(window.MIXALL_BASE || '').replace(/\/$/, '');
  const api = String(window.MIXALL_API_BASE || '/api').replace(/\/$/, '');

  function path() {
    const p = location.pathname;
    if (base && (p === base || p.startsWith(base + '/'))) return p.slice(base.length) || '/';
    return p;
  }

  function fix(url) {
    const value = String(url == null ? '' : url);
    if (value.startsWith('/api/')) return api + value.slice(4);
    if (!base || !value.startsWith('/') || value.startsWith('//')) return value;
    if (value === base || value.startsWith(base + '/') || value.startsWith(base + '?') || value.startsWith(base + '#')) return value;
    return base + value;
  }

  // 同じサイトの絶対URL（https://<host>/Pocket/ など）も補正する
  function fixAbsolute(url) {
    try {
      const u = new URL(String(url), location.href);
      if (u.origin !== location.origin) return null;
      const rel = u.pathname + u.search + u.hash;
      const fixed = fix(rel);
      return fixed === rel ? null : fixed;
    } catch (_) { return null; }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string') input = fixAbsolute(input) || input;
    else if (input instanceof URL) input = fixAbsolute(input.href) || input;
    return nativeFetch(input, init);
  };
  if (window.EventSource) {
    const NativeES = window.EventSource;
    window.EventSource = function (url, options) { return new NativeES(fixAbsolute(url) || url, options); };
    window.EventSource.prototype = NativeES.prototype;
  }
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name].bind(history);
    history[name] = function (state, title, url) { return original(state, title, url == null ? url : (fixAbsolute(url) || url)); };
  }
  // location.href = "/Pocket/" のような画面移動（Chrome系の Navigation API がある場合）
  if (window.navigation && navigation.addEventListener) {
    navigation.addEventListener('navigate', (event) => {
      if (!event.cancelable || event.navigationType === 'traverse' || event.downloadRequest || event.formData) return;
      const fixed = fixAbsolute(event.destination.url);
      if (!fixed) return;
      event.preventDefault();
      location.assign(fixed);
    });
  }

  // 定期更新: 画面が見えていないときは止め、3分操作が無ければ間隔を4倍に延ばす（API呼び出しの節約）。
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
  document.addEventListener('submit', (event) => {
    const form = event.target;
    const action = form && form.getAttribute && form.getAttribute('action');
    if (action) { const fixed = fix(action); if (fixed !== action) form.setAttribute('action', fixed); }
  }, true);

  // 動的に差し込まれた画像・動画などの src も補正する
  function fixNode(node) {
    if (!node || node.nodeType !== 1) return;
    for (const attr of ['src', 'poster', 'href', 'action']) {
      const value = node.getAttribute && node.getAttribute(attr);
      if (value && value.startsWith('/') && !value.startsWith('//')) {
        const fixed = fix(value);
        if (fixed !== value) node.setAttribute(attr, fixed);
      }
    }
  }
  if (base || api !== '/api') {
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') fixNode(record.target);
        else for (const node of record.addedNodes) {
          fixNode(node);
          if (node.querySelectorAll) node.querySelectorAll('[src],[poster],a[href],link[href],form[action]').forEach(fixNode);
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'poster', 'href', 'action'] });
  }
})();
