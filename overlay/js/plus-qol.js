// js/plus-qol.js（MixAll +（二世代）・全ページ共通の使いやすさ改善 その2）
// - Ctrl（⌘）＋Enter で送信: 入力欄の近くにある「送信・投稿・返信…」ボタンを押す（ページ側で対応済みのところ・チャット画面は触らない）
// - 「↑ 上へ」ボタン: 長いページで下までスクロールしたら右下に出す
// - 戻るボタンで前のページに戻ったとき、スクロール位置を元に戻す
// - Ghost・Uch の長い投稿を折りたたみ、「続きを読む」で開く
// - キーボードショートカット: g→h ホーム / g→g Ghost / g→p ぽけっと / g→u Uch / g→m Mail / g→c Coin / g→n 通知 / g→a アカウント、「?」で一覧
// - 文字数カウンター: 入力欄に文字を入れている間、右下に文字数を出す（上限がある欄は「残り」も）
(function () {
  'use strict';
  if (window.MixAllQoL) return;
  const path = location.pathname.toLowerCase();
  const isChat = () => Boolean(document.getElementById('messageList'));
  const typing = (el) => el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());

  // =================================================================
  // Ctrl（⌘）＋Enter で送信
  // =================================================================
  const SEND_RE = /^(送信|投稿|投稿する|返信|返信する|送る|コメント|コメントする|書き込む|書き込み|保存|作成|追加)$/;
  function sendButtonFor(field) {
    const form = field.closest('form');
    if (form) return form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    // 入力欄を含む近い入れ物から、送信らしいボタンを探す（近いものから3段まで）
    let box = field.parentElement;
    for (let i = 0; box && i < 3; i += 1, box = box.parentElement) {
      const btn = [...box.querySelectorAll('button')].find((b) => !b.disabled && b.offsetParent !== null && SEND_RE.test(b.textContent.replace(/[\s📨✉️➤▶]/g, '')));
      if (btn) return btn;
    }
    return null;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing || e.defaultPrevented) return;
    const field = e.target;
    if (!field || field.tagName !== 'TEXTAREA' || isChat() || field.closest('.mixall-dialog-layer, .mx-search-layer')) return;
    const btn = sendButtonFor(field);
    if (!btn) return;
    e.preventDefault();
    btn.click();
  });

  // =================================================================
  // 「↑ 上へ」ボタン
  // =================================================================
  function setupToTop() {
    if (isChat() || /emergency/.test(path)) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mx-totop'; btn.setAttribute('aria-label', 'ページの先頭へ'); btn.title = 'ページの先頭へ';
    btn.textContent = '↑';
    btn.onclick = () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    document.body.appendChild(btn);
    let shown = false;
    const check = () => {
      const on = window.scrollY > window.innerHeight * 1.5;
      if (on !== shown) { shown = on; btn.classList.toggle('on', on); }
    };
    window.addEventListener('scroll', check, { passive: true });
    check();
  }

  // =================================================================
  // 戻ったときにスクロール位置を戻す
  // =================================================================
  const SCROLL_KEY = `mixall.scroll:${location.pathname}${location.search}`;
  function setupScrollRestore() {
    if (isChat()) return;
    try { history.scrollRestoration = 'manual'; } catch (_) { /* ignore */ }
    const save = () => { try { sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY))); } catch (_) { /* ignore */ } };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (!nav || nav.type !== 'back_forward') return;
    const target = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    if (!target) return;
    // 一覧は後から読み込まれるので、高さが足りるまで少し待ってから戻す（自分でスクロールしたらやめる）
    let stopped = false;
    const stop = () => { stopped = true; };
    ['wheel', 'touchstart', 'keydown'].forEach((t) => window.addEventListener(t, stop, { once: true, passive: true }));
    const started = Date.now();
    (function tryRestore() {
      if (stopped) return;
      if (document.documentElement.scrollHeight - window.innerHeight >= target - 40) { window.scrollTo(0, target); return; }
      if (Date.now() - started < 6000) setTimeout(tryRestore, 150);
    })();
  }

  // =================================================================
  // 長い投稿の折りたたみ（一覧だけ。投稿ページ・スレッドの1件表示では折りたたまない）
  // =================================================================
  const FOLD_SELECTOR = '#feed .ghost-post .ghost-text-content, #feed .ghost-post h3 + .ghost-text-content';
  const FOLD_PX = 260;
  function fold(root) {
    (root || document).querySelectorAll(FOLD_SELECTOR).forEach((el) => {
      if (el.dataset.mxFold) return;
      el.dataset.mxFold = '1';
      if (el.scrollHeight <= FOLD_PX + 60) return;
      el.classList.add('mx-folded');
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'mx-more ghost'; more.textContent = '続きを読む';
      more.onclick = (e) => {
        e.stopPropagation();
        const open = el.classList.toggle('mx-folded');
        more.textContent = open ? '続きを読む' : '閉じる';
      };
      el.insertAdjacentElement('afterend', more);
    });
  }
  function setupFold() {
    const feed = document.getElementById('feed');
    if (!feed) return;
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => fold(feed), 100); }).observe(feed, { childList: true, subtree: true });
    fold(feed);
  }


  // =================================================================
  // 文字数カウンター（入力欄の右下に重ねて出す。欄の並びは変えない）
  // =================================================================
  const countOf = (v) => [...v].length;
  function setupCounter() {
    const tip = document.createElement('div');
    tip.className = 'mx-count'; tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    let field = null;
    const target = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.maxLength > 0 && /^(text|search|)$/.test(el.type))) && !el.readOnly && !el.disabled;
    function update() {
      if (!field || document.activeElement !== field || !field.value) { tip.classList.remove('on'); return; }
      const n = countOf(field.value);
      const max = field.maxLength > 0 ? field.maxLength : 0;
      const lines = field.tagName === 'TEXTAREA' ? field.value.split('\n').length : 1;
      tip.textContent = max ? `${n} / ${max}` : `${n}文字${lines > 1 ? `・${lines}行` : ''}`;
      tip.classList.toggle('warn', Boolean(max) && n >= max * 0.9 && n < max);
      tip.classList.toggle('full', Boolean(max) && n >= max);
      const r = field.getBoundingClientRect();
      if (r.width < 80 || r.bottom < 0 || r.top > window.innerHeight) { tip.classList.remove('on'); return; }
      tip.style.left = `${Math.round(r.right - 6)}px`;
      tip.style.top = `${Math.round(Math.min(r.bottom, window.innerHeight) - 4)}px`;
      tip.classList.add('on');
    }
    document.addEventListener('focusin', (e) => { field = target(e.target) ? e.target : null; update(); });
    document.addEventListener('focusout', () => setTimeout(update, 0));
    document.addEventListener('input', (e) => { if (target(e.target)) { field = e.target; update(); } });
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update);
    // 送信後にページ側が中身を消したとき（input が起きない）にも消す
    setInterval(() => { if (field && tip.classList.contains('on') && !field.value) update(); }, 800);
  }

  // =================================================================
  // キーボードショートカット
  // =================================================================
  const GO = { h: ['ホーム', '/'], g: ['Ghost', '/Ghost/'], p: ['ぽけっと', '/Pocket/'], u: ['Uch', '/Uch/'], m: ['Mail', '/Mail/'], c: ['Coin', '/Coin/'], n: ['通知', '/Notifications/'], a: ['アカウント設定', '/account/'], t: ['ツール', '/Tools/'] };
  function showHelp() {
    const lines = [
      'キーボードショートカット',
      ...Object.entries(GO).map(([k, [label]]) => `g → ${k}　${label}を開く`),
      'Ctrl＋K または /　サイト内検索',
      'b　ブックマーク',
      'Ctrl＋Enter　入力欄の内容を送信',
      'Esc　ダイアログを閉じる',
      '?　この一覧'
    ];
    if (window.MixAllDialog) window.MixAllDialog.confirm(lines.join('\n'), { okLabel: '閉じる', noCancel: true, icon: '⌨', danger: false });
  }
  let gAt = 0;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(document.activeElement) || document.querySelector('.mixall-dialog-layer, .mx-search-layer, .mx-lightbox, .mx-story-viewer')) return;
    if (e.key === '?') { e.preventDefault(); showHelp(); return; }
    if (e.key === 'g') { gAt = Date.now(); return; }
    if (gAt && Date.now() - gAt < 1200 && GO[e.key]) { e.preventDefault(); gAt = 0; location.href = GO[e.key][1]; return; }
    gAt = 0;
  });

  window.MixAllQoL = { showHelp, fold };
  ready(() => {
    try { setupToTop(); } catch (_) { /* ignore */ }
    try { setupScrollRestore(); } catch (_) { /* ignore */ }
    try { setupFold(); } catch (_) { /* ignore */ }
    try { setupCounter(); } catch (_) { /* ignore */ }
  });
})();
