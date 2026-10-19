// public/js/mixall-ux.js
// 全ページ共通の使いやすさ改善（各画面のコードは変えずに効く）。
// - 操作してから通信が終わるまで、画面上部に細い進行バーを出す（定期更新の通信では出さない）
// - 押したボタンは通信が終わるまで「処理中」にして、二重送信を防ぐ
// - alert() を画面を止めない通知（トースト）に置き換える。直後に画面が移動しても次の画面で表示する
// - オフラインになったら知らせる
(function () {
  'use strict';
  if (window.MixAllUX) return;

  // ---------- トースト ----------
  const TOAST_KEY = 'mixall.pendingToasts';
  let toastBox = null;
  function ensureBox() {
    if (toastBox && document.body.contains(toastBox)) return toastBox;
    toastBox = document.createElement('div');
    toastBox.className = 'mixall-toasts';
    toastBox.setAttribute('role', 'status');
    toastBox.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastBox);
    return toastBox;
  }
  function looksLikeError(text) { return /失敗|エラー|できません|できない|不正|見つかりません|必要です|違います|ありません|拒否|制限|超え|未設定|error/i.test(text); }
  function show(message, options) {
    const text = String(message == null ? '' : message);
    if (!text.trim()) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => show(text, options), { once: true }); return; }
    const kind = (options && options.kind) || (looksLikeError(text) ? 'error' : 'info');
    const el = document.createElement('div');
    el.className = `mixall-toast mixall-toast-${kind}`;
    el.innerHTML = `<span class="mixall-toast-icon" aria-hidden="true">${kind === 'error' ? '!' : '✓'}</span><span class="mixall-toast-text"></span><button type="button" class="mixall-toast-close" aria-label="閉じる">×</button>`;
    el.querySelector('.mixall-toast-text').textContent = text;
    const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); };
    el.querySelector('.mixall-toast-close').onclick = close;
    ensureBox().appendChild(el);
    // 一時パスワードやURLなど、書き写す必要がある内容は自動で消さない（×で閉じる）
    const sticky = (options && options.sticky) || /パスワード:|パスワード：|コード:|https?:\/\//.test(text);
    if (sticky) el.classList.add('mixall-toast-sticky');
    const ms = Math.min(12000, 3200 + text.length * 60 + (kind === 'error' ? 2500 : 0));
    let timer = sticky ? null : setTimeout(close, ms);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { if (!sticky) timer = setTimeout(close, 2000); });
    // 直後に画面が切り替わっても読めるよう、少しのあいだ保存しておく
    try {
      const pending = JSON.parse(sessionStorage.getItem(TOAST_KEY) || '[]');
      pending.push({ text, kind, at: Date.now() });
      sessionStorage.setItem(TOAST_KEY, JSON.stringify(pending.slice(-3)));
      setTimeout(() => { try { const list = JSON.parse(sessionStorage.getItem(TOAST_KEY) || '[]').filter((t) => t.text !== text); sessionStorage.setItem(TOAST_KEY, JSON.stringify(list)); } catch (_) { /* ignore */ } }, 1500);
    } catch (_) { /* ignore */ }
  }
  function replayPending() {
    try {
      const pending = JSON.parse(sessionStorage.getItem(TOAST_KEY) || '[]').filter((t) => Date.now() - t.at < 5000);
      sessionStorage.removeItem(TOAST_KEY);
      pending.forEach((t) => show(t.text, { kind: t.kind }));
    } catch (_) { /* ignore */ }
  }
  const nativeAlert = window.alert ? window.alert.bind(window) : null;
  window.alert = (message) => show(message);

  // ---------- 確認・入力ダイアログ（confirm / prompt の代わり） ----------
  // 使い方: if (!(await MixAllDialog.confirm('削除しますか？'))) return;
  //         const name = await MixAllDialog.prompt('名前', '初期値');  // キャンセルは null
  const DANGER_RE = /削除|消去|解除|退出|追放|キック|ブロック|リセット|失効|ログアウト|取り消|破棄|初期化|停止|ロック|BAN/i;
  let dialogQueue = Promise.resolve();
  function splitMessage(message) {
    const text = String(message == null ? '' : message).trim();
    const lines = text.split('\n');
    // 1行目が短ければ見出しにし、残りを本文にする
    if (lines.length > 1 && lines[0].length <= 40) return { title: lines[0], body: lines.slice(1).join('\n').trim() };
    if (text.length <= 40) return { title: text, body: '' };
    return { title: '', body: text };
  }
  function openDialog({ kind, message, defaultValue, options }) {
    return new Promise((resolve) => {
      const opts = options || {};
      const { title, body } = splitMessage(message);
      const danger = opts.danger ?? (kind === 'confirm' && DANGER_RE.test(String(message)));
      const multiline = kind === 'prompt' && (opts.multiline ?? (String(defaultValue || '').length > 40 || /\n/.test(String(defaultValue || '')) || /編集|本文|メッセージ|説明|理由|詳細/.test(String(message))));
      const okLabel = opts.okLabel || (kind === 'prompt' ? '決定' : (danger ? (/削除/.test(String(message)) ? '削除する' : '実行する') : 'OK'));
      const previousFocus = document.activeElement;

      const layer = document.createElement('div');
      layer.className = 'mixall-dialog-layer';
      layer.innerHTML = `<div class="mixall-dialog${danger ? ' is-danger' : ''}" role="${kind === 'confirm' ? 'alertdialog' : 'dialog'}" aria-modal="true">
          <div class="mixall-dialog-glow" aria-hidden="true"></div>
          <div class="mixall-dialog-icon" aria-hidden="true">${danger ? '!' : (kind === 'prompt' ? '✎' : '?')}</div>
          <div class="mixall-dialog-content">
            ${title ? '<h2 class="mixall-dialog-title"></h2>' : ''}
            ${body ? '<p class="mixall-dialog-body"></p>' : ''}
            ${kind === 'prompt' ? (multiline ? '<textarea class="mixall-dialog-input" rows="4"></textarea><p class="mixall-dialog-hint">Ctrl＋Enterで決定</p>' : '<input class="mixall-dialog-input" type="text" autocomplete="off">') : ''}
          </div>
          <div class="mixall-dialog-actions">
            <button type="button" class="mixall-dialog-cancel">${opts.cancelLabel || 'キャンセル'}</button>
            <button type="button" class="mixall-dialog-ok">${okLabel}</button>
          </div>
        </div>`;
      const dialog = layer.querySelector('.mixall-dialog');
      const id = 'mixall-dialog-' + Math.random().toString(36).slice(2);
      if (title) { const h = layer.querySelector('.mixall-dialog-title'); h.textContent = title; h.id = id + '-t'; dialog.setAttribute('aria-labelledby', h.id); }
      if (body) { const p = layer.querySelector('.mixall-dialog-body'); p.textContent = body; p.id = id + '-b'; dialog.setAttribute('aria-describedby', p.id); }
      const input = layer.querySelector('.mixall-dialog-input');
      if (input) { input.value = defaultValue == null ? '' : String(defaultValue); if (title) input.setAttribute('aria-label', title); }

      let finished = false;
      function finish(value) {
        if (finished) return;
        finished = true;
        layer.classList.add('leaving');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => {
          layer.remove();
          if (!document.querySelector('.mixall-dialog-layer')) document.documentElement.classList.remove('mixall-dialog-open');
          if (previousFocus && previousFocus.focus) { try { previousFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }
        }, 170);
        resolve(value);
      }
      const ok = () => finish(kind === 'prompt' ? input.value : true);
      const cancel = () => finish(kind === 'prompt' ? null : false);
      layer.querySelector('.mixall-dialog-ok').onclick = ok;
      layer.querySelector('.mixall-dialog-cancel').onclick = cancel;
      layer.addEventListener('pointerdown', (event) => { if (event.target === layer) cancel(); });
      function onKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return; }
        if (event.key === 'Enter' && !event.isComposing) {
          const inTextarea = event.target && event.target.tagName === 'TEXTAREA';
          if (inTextarea && !(event.ctrlKey || event.metaKey)) return;
          if (event.target && event.target.classList && event.target.classList.contains('mixall-dialog-cancel')) return;
          event.preventDefault(); event.stopPropagation(); ok();
        }
        if (event.key === 'Tab') {
          // ダイアログの外へフォーカスが出ないようにする
          const items = [...dialog.querySelectorAll('button, input, textarea')];
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      document.documentElement.classList.add('mixall-dialog-open');
      (document.body || document.documentElement).appendChild(layer);
      requestAnimationFrame(() => {
        if (input) { input.focus(); input.select(); }
        else layer.querySelector(danger ? '.mixall-dialog-cancel' : '.mixall-dialog-ok').focus();
      });
    });
  }
  // 同時に複数呼ばれても1つずつ順番に出す
  function enqueue(spec) {
    const run = dialogQueue.then(() => openDialog(spec));
    dialogQueue = run.catch(() => {});
    return run;
  }
  window.MixAllDialog = {
    confirm: (message, options) => enqueue({ kind: 'confirm', message, options }),
    prompt: (message, defaultValue, options) => enqueue({ kind: 'prompt', message, defaultValue, options }),
    alert: (message) => show(message)
  };

  // ---------- 進行バー・ボタンの処理中表示 ----------
  let lastInteraction = 0;
  let lastButton = null;
  const markInteraction = (event) => {
    lastInteraction = Date.now();
    // ダイアログのボタンを押したときは、ダイアログを開いた元のボタンを「処理中」にする
    if (event.target && event.target.closest && event.target.closest('.mixall-dialog-layer')) { if (lastButton) lastButton.at = Date.now(); return; }
    const target = event.target && event.target.closest ? event.target.closest('button, input[type="submit"], .button') : null;
    if (target) lastButton = { el: target, at: Date.now() };
    else if (event.type === 'submit' && event.submitter) lastButton = { el: event.submitter, at: Date.now() };
  };
  ['pointerdown', 'click', 'submit'].forEach((type) => document.addEventListener(type, markInteraction, true));
  document.addEventListener('keydown', (event) => { if (event.key === 'Enter') lastInteraction = Date.now(); }, true);

  let bar = null;
  let active = 0;
  let barTimer = null;
  function ensureBar() {
    if (bar && document.body.contains(bar)) return bar;
    bar = document.createElement('div');
    bar.className = 'mixall-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    return bar;
  }
  function startBar() {
    active += 1;
    if (active !== 1 || !document.body) return;
    clearTimeout(barTimer);
    // すぐ終わる通信では出さない（ちらつき防止）
    barTimer = setTimeout(() => { if (active > 0) ensureBar().classList.add('on'); }, 180);
  }
  function stopBar() {
    active = Math.max(0, active - 1);
    if (active) return;
    clearTimeout(barTimer);
    if (bar) { bar.classList.add('done'); setTimeout(() => { bar.classList.remove('on', 'done'); }, 260); }
  }

  const busyCounts = new WeakMap();
  function setBusy(el, on) {
    const n = (busyCounts.get(el) || 0) + (on ? 1 : -1);
    busyCounts.set(el, Math.max(0, n));
    if (n > 0) { el.classList.add('is-busy'); el.setAttribute('aria-busy', 'true'); }
    else { el.classList.remove('is-busy'); el.removeAttribute('aria-busy'); }
  }

  const baseFetch = window.fetch.bind(window);
  const pageStartedAt = Date.now();
  window.fetch = function (input, init) {
    const now = Date.now();
    const userTriggered = now - lastInteraction < 1200 || now - pageStartedAt < 2500;
    const button = lastButton && now - lastButton.at < 1200 && document.contains(lastButton.el) ? lastButton.el : null;
    if (userTriggered) startBar();
    if (button) setBusy(button, true);
    const done = () => { if (userTriggered) stopBar(); if (button) setBusy(button, false); };
    let promise;
    try { promise = baseFetch(input, init); } catch (error) { done(); throw error; }
    return promise.then((res) => { done(); return res; }, (error) => {
      done();
      if (!navigator.onLine) show('インターネットに接続されていません。接続を確認してください。', { kind: 'error' });
      throw error;
    });
  };

  // ---------- オフライン表示 ----------
  function offlineBanner(on) {
    let el = document.getElementById('mixall-offline');
    if (!on) { if (el) el.remove(); return; }
    if (el || !document.body) return;
    el = document.createElement('div');
    el.id = 'mixall-offline';
    el.className = 'mixall-offline';
    el.textContent = 'オフラインです。つながると自動で再開します。';
    document.body.appendChild(el);
  }
  window.addEventListener('offline', () => offlineBanner(true));
  window.addEventListener('online', () => { offlineBanner(false); show('オンラインに戻りました'); });

  function boot() {
    replayPending();
    if (!navigator.onLine) offlineBanner(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.MixAllUX = { toast: show, nativeAlert };
})();
