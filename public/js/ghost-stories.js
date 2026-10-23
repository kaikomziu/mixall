// public/js/ghost-stories.js
// Ghost のストーリー（24時間で消える投稿）。Ghost トップの上部に並べ、タップで全画面表示する。
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const toast = (m, o) => window.MixAllUX && window.MixAllUX.toast(m, o);
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  const STORY_MS = 5000;
  const BGS = ['#5b3dff', '#3d7bff', '#0daa93', '#ff4f8b', '#ff9f1a', '#111827'];
  let authors = [];
  // 受け取ったアイコンを覚えておき、次からは目印(avatarKey)だけ送ってサーバーに本体を省いてもらう（通信量の節約）
  // ページを移動しても使えるよう sessionStorage にも保存する（合計約2MBまで）
  const AVATAR_STORE = 'mixall.storyAvatars';
  const avatarCache = (() => { try { return new Map(JSON.parse(sessionStorage.getItem(AVATAR_STORE) || '[]')); } catch (_) { return new Map(); } })();
  function saveAvatarCache() {
    try {
      const entries = Array.from(avatarCache.entries());
      while (entries.length && JSON.stringify(entries).length > 2000000) entries.shift();
      sessionStorage.setItem(AVATAR_STORE, JSON.stringify(entries));
    } catch (_) { /* 保存できなくてもメモリ上では使える */ }
  }

  function ago(ms) {
    const m = Math.floor((Date.now() - ms) / 60000);
    return m < 1 ? 'たった今' : m < 60 ? `${m}分前` : `${Math.floor(m / 60)}時間前`;
  }

  async function load() {
    const strip = ensureStrip();
    if (!strip) return;
    try {
      const d = await plus('stories', avatarCache.size ? { avatars: Array.from(avatarCache.keys()).slice(-100).join(',') } : {}, 'GET');
      if (d.ageLimited) { strip.remove(); return; }
      authors = d.authors || [];
      for (const a of authors) {
        if (!a.avatarKey) continue;
        if (a.avatarCached && avatarCache.has(a.avatarKey)) a.avatarUrl = avatarCache.get(a.avatarKey);
        else if (a.avatarUrl) avatarCache.set(a.avatarKey, a.avatarUrl);
      }
      saveAvatarCache();
    } catch (_) { authors = []; }
    const mine = authors.find((a) => a.mine);
    strip.innerHTML = `<button type="button" class="mx-story-chip mx-story-add" data-add><span class="mx-story-ring"><span>＋</span></span><span class="mx-story-name">ストーリー</span></button>`
      + authors.map((a, i) => {
        const seen = a.stories.every((s) => s.seen) && !a.mine;
        const avatar = a.avatarUrl && /^data:image|^https?:/.test(a.avatarUrl) ? `background-image:url('${esc(a.avatarUrl)}')` : '';
        return `<button type="button" class="mx-story-chip${seen ? ' seen' : ''}" data-i="${i}" aria-label="${esc(a.name)}のストーリー"><span class="mx-story-ring"><span style="${avatar}">${avatar ? '' : esc(a.name.slice(0, 1))}</span></span><span class="mx-story-name">${a.mine ? 'あなた' : esc(a.name)}</span></button>`;
      }).join('');
    strip.querySelector('[data-add]').onclick = compose;
    strip.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => openViewer(Number(b.dataset.i), 0); });
    if (mine) strip.querySelector('[data-add] .mx-story-name').textContent = '追加';
  }

  function ensureStrip() {
    let strip = document.getElementById('mxStories');
    if (strip) return strip;
    const main = document.querySelector('main');
    if (!main) return null;
    strip = document.createElement('div');
    strip.id = 'mxStories'; strip.className = 'mx-stories'; strip.setAttribute('aria-label', 'ストーリー');
    main.prepend(strip);
    return strip;
  }

  // ---------- 投稿 ----------
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1080 / img.width, 1920 / img.height);
        const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82)); URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = URL.createObjectURL(file);
    });
  }
  async function compose() {
    const pick = document.createElement('input');
    pick.type = 'file'; pick.accept = 'image/*';
    const choice = await window.MixAllDialog.confirm('ストーリーを追加\n24時間で消える投稿です。写真を選ぶか、文字だけで投稿できます。', { okLabel: '写真を選ぶ', cancelLabel: '文字だけ', icon: '✨' });
    let imageDataUrl = '';
    if (choice) {
      const file = await new Promise((resolve) => { pick.onchange = () => resolve(pick.files[0] || null); pick.click(); });
      if (!file) return;
      try { imageDataUrl = await readImage(file); } catch (e) { toast(e.message, { kind: 'error' }); return; }
    }
    const text = await window.MixAllDialog.prompt(imageDataUrl ? 'ひとこと（なくてもOK）' : 'ストーリーの文字', '', { multiline: !imageDataUrl });
    if (text === null) return;
    if (!imageDataUrl && !text.trim()) return;
    try {
      await plus('createStory', { text, imageDataUrl, bg: BGS[Math.floor(Math.random() * BGS.length)] });
      toast('ストーリーを投稿しました（24時間で消えます）');
      load();
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }

  // ---------- 表示 ----------
  function openViewer(ai, si) {
    let a = ai; let s = si; let started = 0; let raf = 0; let paused = false; let elapsed = 0;
    const v = document.createElement('div');
    v.className = 'mx-story-viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
    document.body.appendChild(v);
    document.documentElement.classList.add('mixall-dialog-open');
    const close = () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', key, true); v.remove(); document.documentElement.classList.remove('mixall-dialog-open'); load(); };
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    document.addEventListener('keydown', key, true);
    function next() { if (s < authors[a].stories.length - 1) s += 1; else if (a < authors.length - 1) { a += 1; s = 0; } else { close(); return; } render(); }
    function prev() { if (s > 0) s -= 1; else if (a > 0) { a -= 1; s = authors[a].stories.length - 1; } render(); }
    function tick(t) {
      if (!started) started = t;
      if (!paused) elapsed = t - started;
      else started = t - elapsed;
      const bar = v.querySelector(`.mx-story-bars i:nth-child(${s + 1}) b`);
      if (bar) bar.style.width = `${Math.min(100, (elapsed / STORY_MS) * 100)}%`;
      if (elapsed >= STORY_MS) { next(); return; }
      raf = requestAnimationFrame(tick);
    }
    function render() {
      cancelAnimationFrame(raf); started = 0; elapsed = 0;
      const au = authors[a]; const st = au.stories[s];
      v.innerHTML = `<div class="mx-story-frame">
        <div class="mx-story-slide${st.imageUrl ? ' has-image' : ''}" style="--story-bg:${esc(st.bg || '#5b3dff')}">
          ${st.imageUrl ? `<img src="${esc(st.imageUrl)}" alt="">` : ''}${st.text ? `<div class="mx-story-text">${esc(st.text)}</div>` : ''}</div>
        <div class="mx-story-bars">${au.stories.map((x, i) => `<i><b style="width:${i < s ? 100 : 0}%"></b></i>`).join('')}</div>
        <div class="mx-story-head"><span>${au.mine ? 'あなた' : esc(au.name)}</span><span class="ago">${ago(st.createdAt)}</span><button type="button" data-close aria-label="閉じる">×</button></div>
        <button type="button" class="mx-story-tap prev" aria-label="前へ"></button><button type="button" class="mx-story-tap next" aria-label="次へ"></button>
        <div class="mx-story-foot">${au.mine ? `<span>👁 ${st.views || 0}人が見ました</span><button type="button" class="secondary" data-del>削除</button>` : '<span></span>'}</div></div>`;
      v.querySelector('[data-close]').onclick = close;
      v.querySelector('.mx-story-tap.prev').onclick = prev;
      v.querySelector('.mx-story-tap.next').onclick = next;
      const frame = v.querySelector('.mx-story-frame');
      frame.onpointerdown = () => { paused = true; };
      frame.onpointerup = frame.onpointerleave = () => { paused = false; };
      const del = v.querySelector('[data-del]');
      if (del) del.onclick = async (e) => {
        e.stopPropagation(); paused = true;
        if (!(await window.MixAllDialog.confirm('このストーリーを削除しますか？'))) { paused = false; return; }
        try { await plus('deleteStory', { id: st.id }); toast('ストーリーを削除しました'); close(); } catch (err) { toast(err.message, { kind: 'error' }); }
      };
      if (!au.mine && !st.seen) { st.seen = true; plus('viewStory', { id: st.id }).catch(() => {}); }
      raf = requestAnimationFrame(tick);
    }
    render();
  }

  function boot() { if (session() && window.MixAllPlus) load(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200), { once: true });
  else setTimeout(boot, 200);
})();
