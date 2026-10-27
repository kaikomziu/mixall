// js/plus-theme.js（MixAll +（二世代）・着せ替えテーマ）
// Coinショップで交換した「着せ替えテーマ」を全ページに当てる。
// <head> の中で settings.js より後に同期で読み込む（描画前に当ててちらつきを防ぐ）。
//
// settings.js との関係:
//   settings.js はダーク/ホワイト/カラー/画像テーマを root の data-theme と style（CSS 変数）で当てる。
//   ここでは settings.js の値の上から style.setProperty で着せ替えの CSS 変数を当て、
//   settings.js が当て直したとき（data-theme や style が変わったとき）は MutationObserver で当て直す。
//   ・設定パネルの「色の個別設定」で自分で決めた色はそちらを優先する（着せ替えで上書きしない）
//   ・画像テーマのときは背景の画像を優先し、着せ替えは当てない
//   ・外したときは settings.js が当てていた値に戻す
// 公開: window.MixAllTheme = { apply(themeOrNull), refresh(force), current() }
(function () {
  'use strict';
  if (window.MixAllTheme) return;
  const root = document.documentElement;
  const VARS = ['--bg', '--panel', '--panel-2', '--border', '--text', '--text-dim', '--accent', '--accent-2'];
  const KEY = 'mixall.themeSkin';
  const CHECK_KEY = 'mixall.themeSkin.checkedAt';
  const CHECK_MS = 10 * 60 * 1000;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* 容量不足などは無視 */ } };

  function email() {
    try { const s = JSON.parse(lsGet('netrify_session') || 'null'); return s && s.email ? String(s.email) : ''; } catch (_) { return ''; }
  }
  const keyFor = (e) => (e ? `${KEY}:${e}` : KEY);

  // サーバーやキャッシュから来たテーマを、当ててよい形だけに整える（変数名は決まった8つだけ・値は色として素直なものだけ）
  function clean(t) {
    if (!t || typeof t !== 'object' || !t.vars || typeof t.vars !== 'object') return null;
    const vars = {};
    VARS.forEach((v) => {
      const val = t.vars[v];
      if (typeof val === 'string' && val.length <= 120 && /^[#\w\s(),.%+\-/]+$/.test(val) && !/url\s*\(/i.test(val)) vars[v] = val.trim();
    });
    if (!Object.keys(vars).length) return null;
    return { id: String(t.id || ''), name: t.name ? String(t.name) : '', vars, scheme: t.scheme === 'light' || t.scheme === 'dark' ? t.scheme : '' };
  }

  // 保存してあるテーマ（アカウントごと。なければ共通のキー）
  function readCache() {
    const e = email();
    if (!e) return null;
    let raw = lsGet(keyFor(e));
    if (raw == null) raw = lsGet(KEY);
    try { return clean(JSON.parse(raw || 'null')); } catch (_) { return null; }
  }
  function writeCache(t) {
    const e = email();
    if (e) lsSet(keyFor(e), JSON.stringify(t)); // 外したときも null を保存して、共通キーに戻らないようにする
  }

  // 「色の個別設定」（settings.js の mixall_ui_custom）で自分で決めた色に対応する変数
  function customVars() {
    const out = new Set();
    let c = {};
    try { c = JSON.parse(lsGet('mixall_ui_custom') || '{}') || {}; } catch (_) { c = {}; }
    const ok = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    if (ok(c.bg)) out.add('--bg');
    if (ok(c.panel)) { out.add('--panel'); out.add('--panel-2'); }
    if (ok(c.text)) { out.add('--text'); out.add('--text-dim'); out.add('--border'); }
    if (ok(c.textDim)) out.add('--text-dim');
    if (ok(c.accent)) out.add('--accent');
    return out;
  }

  let current = null; // いま当てているテーマ
  const saved = {};    // 上書きする前の値（settings.js が当てていた値。'' は「なし」）
  const applied = {};  // こちらが当てた値（読み直したときの表記で持つ）

  // いま当てるべき値 { プロパティ: 値 }
  function wanted() {
    const out = {};
    if (!current || root.dataset.theme === 'image') return out;
    const skip = customVars();
    Object.entries(current.vars).forEach(([k, v]) => { if (!skip.has(k)) out[k] = v; });
    if (current.scheme) out['color-scheme'] = current.scheme;
    return out;
  }

  // 当てるべき値と root の style をそろえる（何度呼んでも同じ結果になる）
  function enforce() {
    const want = wanted();
    const st = root.style;
    // もう当てない値は元に戻す（settings.js が書き換え済みならそのまま）
    Object.keys(applied).forEach((p) => {
      if (p in want) return;
      if (st.getPropertyValue(p).trim() === applied[p]) {
        if (saved[p]) st.setProperty(p, saved[p]); else st.removeProperty(p);
      }
      delete applied[p]; delete saved[p];
    });
    Object.entries(want).forEach(([p, v]) => {
      const cur = st.getPropertyValue(p).trim();
      if (p in applied && cur === applied[p]) return; // 当たったまま
      saved[p] = cur; // settings.js が新しく当てた値（または初回の値）を覚えておく
      st.setProperty(p, v);
      applied[p] = st.getPropertyValue(p).trim();
    });
    if (current && Object.keys(want).length) { if (root.dataset.skin !== current.id) root.dataset.skin = current.id; }
    else if ('skin' in root.dataset) delete root.dataset.skin;
  }

  let observer = null;
  function watch() {
    if (observer || typeof MutationObserver !== 'function') return;
    // data-theme（テーマ切り替え）と style（色の当て直し）の変化を見る。自分の変更で呼ばれても enforce は何もしないので繰り返さない
    observer = new MutationObserver(() => enforce());
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  }

  // テーマを当てる（null で外す）。ログイン中ならキャッシュにも保存する
  function apply(theme) {
    if (!email()) return;
    current = clean(theme);
    writeCache(current);
    watch();
    enforce();
  }

  // サーバーの最新（myTheme）を取りに行く。force でなければ1タブで10分に1回まで
  async function refresh(force) {
    const e = email();
    if (!e || !window.MixAllPlus) return current;
    const ck = `${CHECK_KEY}:${e}`;
    try {
      if (!force && Date.now() - Number(sessionStorage.getItem(ck) || 0) < CHECK_MS) return current;
      sessionStorage.setItem(ck, String(Date.now()));
    } catch (_) { /* sessionStorage が使えないときは毎回取りに行く */ }
    try {
      const d = await window.MixAllPlus.api('myTheme', {});
      const next = clean(d && d.theme);
      if (JSON.stringify(next) !== JSON.stringify(current)) apply(next);
    } catch (_) { /* 取れなければキャッシュのまま */ }
    return current;
  }

  window.MixAllTheme = { apply, refresh, current: () => current };

  // ---------- 起動 ----------
  if (!email()) return; // ログインしていなければ何もしない
  current = readCache();
  watch();
  enforce();

  // 別のタブで付け替えたとき
  window.addEventListener('storage', (ev) => {
    if (ev.key === keyFor(email()) || ev.key === 'mixall_ui_custom') { current = readCache(); enforce(); }
  });

  // ページの読み込みが落ち着いてから最新を確認する
  const later = () => { if (window.mxIdle) window.mxIdle(() => refresh(false), 8000); else setTimeout(() => refresh(false), 2000); };
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
})();
