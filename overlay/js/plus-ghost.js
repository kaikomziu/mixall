// js/plus-ghost.js（MixAll +（二世代）・Ghost のページ）
// 以前の GitHub 版（js/ghost-plus.js・js/ghost-stories.js）から移したもの:
//   ストーリー（24時間で消える投稿）/ 投票 / 絵文字リアクション / おすすめユーザー / Coinショップの装飾（枠・名前の色・称号）/ 保存済みのメモ
// v27c の画面（フィード #feed の .ghost-post[data-post]、投稿ページ #post、保存済み article[data-post]）に後から付け足す。
(function () {
  'use strict';
  if (!window.MixAllPlus) return;
  const { esc, session, toast } = window.MixAllPlus;
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  const path = location.pathname.toLowerCase();
  const page = /^\/ghost\/?(index\.html)?$/.test(path) ? 'feed' : /^\/ghost\/post\.html$/.test(path) || /^\/ghost\/post\//.test(path) ? 'post' : /^\/ghost\/bookmarks\.html$/.test(path) ? 'bookmarks' : '';
  let EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

  // =================================================================
  // ストーリー
  // =================================================================
  const STORY_MS = 5000;
  const BGS = ['#5b3dff', '#3d7bff', '#0daa93', '#ff4f8b', '#ff9f1a', '#111827'];
  let authors = [];
  const ago = (ms) => { const m = Math.floor((Date.now() - ms) / 60000); return m < 1 ? 'たった今' : m < 60 ? `${m}分前` : `${Math.floor(m / 60)}時間前`; };
  function storyStrip() {
    let strip = document.getElementById('mxStories');
    if (strip) return strip;
    const feed = document.getElementById('feed');
    const main = document.querySelector('main');
    if (!main) return null;
    strip = document.createElement('div');
    strip.id = 'mxStories'; strip.className = 'mx-stories'; strip.setAttribute('aria-label', 'ストーリー');
    const host = feed ? feed.closest('main > *') : null;
    if (host) host.insertAdjacentElement('beforebegin', strip); else main.prepend(strip);
    return strip;
  }
  async function loadStories() {
    const strip = storyStrip();
    if (!strip) return;
    try {
      const d = await plus('stories', {}, 'GET');
      if (d.ageLimited) { strip.remove(); return; }
      authors = d.authors || [];
    } catch (_) { authors = []; }
    strip.innerHTML = `<button type="button" class="mx-story-chip mx-story-add" data-add><span class="mx-story-ring"><span>＋</span></span><span class="mx-story-name">${authors.some((a) => a.mine) ? '追加' : 'ストーリー'}</span></button>`
      + authors.map((a, i) => {
        const seen = a.stories.every((s) => s.seen) && !a.mine;
        const avatar = a.avatarUrl && /^data:image|^https?:/.test(a.avatarUrl) ? `background-image:url('${esc(a.avatarUrl)}')` : '';
        return `<button type="button" class="mx-story-chip${seen ? ' seen' : ''}" data-i="${i}" aria-label="${esc(a.name)}のストーリー"><span class="mx-story-ring"><span style="${avatar}">${avatar ? '' : esc(a.name.slice(0, 1))}</span></span><span class="mx-story-name">${a.mine ? 'あなた' : esc(a.name)}</span></button>`;
      }).join('');
    strip.querySelector('[data-add]').onclick = composeStory;
    strip.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => openViewer(Number(b.dataset.i), 0); });
  }
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
  async function composeStory() {
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
    if (text === null || (!imageDataUrl && !text.trim())) return;
    try {
      await plus('createStory', { text, imageDataUrl, bg: BGS[Math.floor(Math.random() * BGS.length)] });
      toast('ストーリーを投稿しました（24時間で消えます）');
      loadStories();
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }
  function openViewer(ai, si) {
    let a = ai; let s = si; let started = 0; let raf = 0; let paused = false; let elapsed = 0;
    const v = document.createElement('div');
    v.className = 'mx-story-viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true');
    document.body.appendChild(v);
    document.documentElement.classList.add('mixall-dialog-open');
    const close = () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', key, true); v.remove(); document.documentElement.classList.remove('mixall-dialog-open'); loadStories(); };
    const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    document.addEventListener('keydown', key, true);
    function next() { if (s < authors[a].stories.length - 1) s += 1; else if (a < authors.length - 1) { a += 1; s = 0; } else { close(); return; } render(); }
    function prev() { if (s > 0) s -= 1; else if (a > 0) { a -= 1; s = authors[a].stories.length - 1; } render(); }
    function tick(t) {
      if (!started) started = t;
      if (!paused) elapsed = t - started; else started = t - elapsed;
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

  // =================================================================
  // 投票
  // =================================================================
  const remain = (at) => { const m = Math.max(0, Math.round((at - Date.now()) / 60000)); return m >= 1440 ? `${Math.floor(m / 1440)}日` : m >= 60 ? `${Math.floor(m / 60)}時間` : `${m}分`; };
  function pollHtml(postId, p) {
    const voted = Boolean(p.myVote) || p.ended;
    return `<div class="gx-poll" data-poll="${esc(postId)}">${p.question ? `<p class="gx-poll-q">${esc(p.question)}</p>` : ''}
      ${p.options.map((o) => { const pct = p.total ? Math.round((o.count / p.total) * 100) : 0; return `<button type="button" class="gx-poll-opt${p.myVote === o.id ? ' mine' : ''}${voted ? ' shown' : ''}" data-opt="${esc(o.id)}" ${p.ended ? 'disabled' : ''}>
        <i style="width:${voted ? pct : 0}%"></i><span>${esc(o.label)}</span>${voted ? `<b>${pct}%</b>` : ''}</button>`; }).join('')}
      <p class="gx-poll-meta">${p.total}票 ・ ${p.ended ? '終了しました' : `のこり ${remain(p.endsAt)}`}${p.myVote && !p.ended ? ' ・ もう一度押すと取り消し' : ''}</p></div>`;
  }
  function bindPoll(el, postId) {
    el.querySelectorAll('[data-opt]').forEach((b) => { b.onclick = async (ev) => {
      ev.stopPropagation();
      try { const r = await plus('votePoll', { postId, optionId: b.dataset.opt }); el.outerHTML = pollHtml(postId, r.poll); const fresh = document.querySelector(`[data-poll="${CSS.escape(postId)}"]`); if (fresh) bindPoll(fresh, postId); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    }; });
  }
  // 自分の投稿に「📊 投票を付ける」
  async function addPoll(postId, after) {
    const question = await window.MixAllDialog.prompt('投票の質問（なくてもOK）', '', { icon: '📊' });
    if (question === null) return;
    const raw = await window.MixAllDialog.prompt('選択肢を2〜4個、1行に1つずつ', '', { multiline: true, icon: '📊' });
    if (raw === null) return;
    const hours = await window.MixAllDialog.prompt('受付時間（時間。1〜336）', '24', { icon: '⏱' });
    if (hours === null) return;
    try {
      const r = await plus('createPoll', { postId, poll: { question, options: raw.split('\n'), hours: Number(hours) || 24 } });
      after.insertAdjacentHTML('beforebegin', pollHtml(postId, r.poll));
      bindPoll(document.querySelector(`[data-poll="${CSS.escape(postId)}"]`), postId);
      toast('投票を付けました');
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }

  // =================================================================
  // リアクション
  // =================================================================
  function reactHtml(postId, r) {
    const counts = (r && r.counts) || {}; const mine = (r && r.mine) || [];
    return `<div class="gx-react" data-react="${esc(postId)}">${Object.keys(counts).map((e) => `<button type="button" class="gx-react-chip${mine.includes(e) ? ' mine' : ''}" data-emoji="${e}">${e}<span>${counts[e]}</span></button>`).join('')}
      <button type="button" class="gx-react-add" aria-label="リアクションを追加">☺︎＋</button></div>`;
  }
  function bindReact(el) {
    const postId = el.dataset.react;
    const send = async (emoji) => {
      try { const r = await plus('react', { postId, emoji }); el.outerHTML = reactHtml(postId, r); const fresh = document.querySelector(`.gx-react[data-react="${CSS.escape(postId)}"]`); if (fresh) bindReact(fresh); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    };
    el.addEventListener('click', (ev) => ev.stopPropagation());
    el.querySelectorAll('[data-emoji]').forEach((b) => { b.onclick = () => send(b.dataset.emoji); });
    el.querySelector('.gx-react-add').onclick = () => {
      document.querySelectorAll('.gx-react-picker').forEach((p) => p.remove());
      const picker = document.createElement('div');
      picker.className = 'gx-react-picker';
      picker.innerHTML = EMOJIS.map((e) => `<button type="button" data-pick="${e}">${e}</button>`).join('');
      el.appendChild(picker);
      picker.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = (e2) => { e2.stopPropagation(); picker.remove(); send(b.dataset.pick); }; });
      setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 0);
    };
  }

  // =================================================================
  // 装飾（Coinショップの枠・名前の色・称号）
  // =================================================================
  const handleOf = (el) => { const a = el && el.querySelector('a[href*="profile.html?handle="]'); return a ? (new URL(a.href, location.href).searchParams.get('handle') || '').toLowerCase() : ''; };
  function applyCosmetics(card, c) {
    if (!c) return;
    const identity = card.querySelector('.head .identity, .identity');
    if (!identity) return;
    const name = [...identity.children].find((x) => x.tagName === 'SPAN' && !x.className);
    if (name && c.nameColor) { name.style.backgroundImage = c.nameColor; name.classList.add('gx-name-color'); }
    const av = identity.querySelector('img, video, .avatar, [class*="avatar"]');
    if (av && c.frame) { av.classList.add('gx-framed'); av.style.setProperty('--gx-frame', c.frame); }
    if (name && c.title && !identity.querySelector('.gx-title')) name.insertAdjacentHTML('afterend', ` <span class="gx-title">${esc(c.title)}</span>`);
  }

  // =================================================================
  // フィード: 描き直されるたびに付け足す
  // =================================================================
  let decorating = false;
  async function decorateFeed() {
    const feed = document.getElementById('feed');
    if (!feed || decorating) return;
    const cards = [...feed.querySelectorAll('.ghost-post[data-post]')].filter((c) => !c.dataset.gx);
    if (!cards.length) return;
    decorating = true;
    cards.forEach((c) => { c.dataset.gx = '1'; });
    try {
      const ids = cards.map((c) => c.dataset.post);
      const handles = Array.from(new Set(cards.map(handleOf).filter(Boolean)));
      const [d, cos] = await Promise.all([
        plus('postExtras', { postIds: ids.join(',') }, 'GET'),
        handles.length ? plus('cosmetics', { handles: handles.join(',') }, 'GET').catch(() => ({ cosmetics: {} })) : { cosmetics: {} }
      ]);
      if (d.emojis) EMOJIS = d.emojis;
      for (const card of cards) {
        const id = card.dataset.post;
        const actions = card.querySelector(':scope > .actions') || card.querySelector('.actions');
        if (d.polls[id] && !card.querySelector('.gx-poll')) { (actions || card).insertAdjacentHTML('beforebegin', pollHtml(id, d.polls[id])); bindPoll(card.querySelector('.gx-poll'), id); }
        if (!card.querySelector('.gx-react')) { (actions || card).insertAdjacentHTML('afterend', reactHtml(id, d.reactions[id])); bindReact(card.querySelector('.gx-react')); }
        // 自分の投稿（編集ボタンがあるもの）に投票を付けるボタン
        if (actions && !d.polls[id] && actions.querySelector('[data-edit-post]') && !actions.querySelector('[data-mx-poll]')) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'ghost'; b.dataset.mxPoll = '1'; b.textContent = '📊 投票を付ける';
          b.onclick = (ev) => { ev.stopPropagation(); addPoll(id, actions).then(() => { if (card.querySelector('.gx-poll')) b.remove(); }); };
          actions.appendChild(b);
        }
        applyCosmetics(card, cos.cosmetics[handleOf(card)]);
      }
    } catch (_) { /* 飾りが付かなくても本体は使える */ }
    finally { decorating = false; }
  }

  // =================================================================
  // おすすめユーザー
  // =================================================================
  async function recommend() {
    const feed = document.getElementById('feed');
    if (!feed || document.getElementById('gxRecommend')) return;
    let users = [];
    try { users = (await plus('recommendUsers', {}, 'GET')).users; } catch (_) { return; }
    if (!users.length) return;
    const box = document.createElement('section');
    box.id = 'gxRecommend'; box.className = 'card gx-recommend';
    box.innerHTML = `<h3>おすすめユーザー</h3><div class="gx-rec-list">${users.map((u) => `<div class="gx-rec"><a class="gf-avatar" href="/Ghost/profile.html?handle=${encodeURIComponent(u.handle)}"${u.avatarUrl ? ` style="background-image:url('${esc(u.avatarUrl)}')"` : ''}>${u.avatarUrl ? '' : esc(u.name.slice(0, 1))}</a>
      <a class="gx-rec-name" href="/Ghost/profile.html?handle=${encodeURIComponent(u.handle)}">${esc(u.name)}</a><span class="gx-rec-why">${esc(u.reason)}</span>
      <button type="button" data-follow="${esc(u.handle)}">フォロー</button></div>`).join('')}</div>`;
    feed.insertAdjacentElement('beforebegin', box);
    box.querySelectorAll('[data-follow]').forEach((b) => { b.onclick = async () => {
      const s = session();
      try {
        const r = await fetch('/api/ghost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'followAccount', token: s.token, targetHandle: b.dataset.follow, follow: true }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'フォローできませんでした');
        b.textContent = 'フォロー中'; b.disabled = true; b.classList.add('secondary');
      } catch (e) { toast(e.message, { kind: 'error' }); }
    }; });
  }

  // =================================================================
  // 投稿ページ
  // =================================================================
  async function decoratePost() {
    const root = document.getElementById('post');
    const actions = root && root.querySelector('.actions');
    if (!actions || root.dataset.gx) return;
    const id = new URLSearchParams(location.search).get('id') || decodeURIComponent((location.pathname.match(/\/post\/([^/]+)/i) || [])[1] || '');
    if (!id) return;
    root.dataset.gx = '1';
    try {
      const d = await plus('postExtras', { postIds: id }, 'GET');
      if (d.emojis) EMOJIS = d.emojis;
      if (d.polls[id] && !root.querySelector('.gx-poll')) { actions.insertAdjacentHTML('beforebegin', pollHtml(id, d.polls[id])); bindPoll(root.querySelector('.gx-poll'), id); }
      if (!root.querySelector('.gx-react')) { actions.insertAdjacentHTML('afterend', reactHtml(id, d.reactions[id])); bindReact(root.querySelector('.gx-react')); }
      if (!d.polls[id] && actions.querySelector('#editPost') && !actions.querySelector('[data-mx-poll]')) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ghost'; b.dataset.mxPoll = '1'; b.textContent = '📊 投票を付ける';
        b.onclick = () => addPoll(id, actions).then(() => { if (root.querySelector('.gx-poll')) b.remove(); });
        actions.appendChild(b);
      }
    } catch (_) { root.dataset.gx = ''; }
  }

  // =================================================================
  // 保存済み: メモ（自分だけに見える）
  // =================================================================
  let notes = null;
  async function decorateBookmarks() {
    const cards = [...document.querySelectorAll('article[data-post]')].filter((a) => !a.querySelector('.gx-note'));
    if (!cards.length) return;
    if (!notes) { try { notes = (await plus('notes', {}, 'GET')).notes; } catch (_) { notes = {}; } }
    cards.forEach((a) => {
      if (a.querySelector('.gx-note')) return;
      const id = a.dataset.post;
      const box = document.createElement('div');
      box.className = 'gx-note';
      const draw = () => {
        const cur = notes[id];
        box.innerHTML = cur ? `<span class="gx-note-text">📝 ${esc(cur.text)}</span><button type="button" class="ghost" data-note-edit>メモを編集</button>` : '<button type="button" class="ghost" data-note-edit>📝 メモを付ける</button>';
        box.querySelector('[data-note-edit]').onclick = async (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const v = await window.MixAllDialog.prompt('この投稿のメモ（自分だけに見えます）', cur ? cur.text : '', { multiline: true, icon: '📝' });
          if (v === null) return;
          try { notes = (await plus('saveNote', { postId: id, note: v })).notes; draw(); toast(v.trim() ? 'メモを保存しました' : 'メモを消しました'); } catch (e) { toast(e.message, { kind: 'error' }); }
        };
      };
      draw();
      a.appendChild(box);
    });
  }

  function observe(el, fn) {
    if (!el) return;
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(fn, 120); }).observe(el, { childList: true, subtree: true });
    fn();
  }

  function boot() {
    if (!session()) return;
    if (page === 'feed') { loadStories(); observe(document.getElementById('feed'), decorateFeed); recommend(); }
    if (page === 'post') observe(document.getElementById('post'), decoratePost);
    if (page === 'bookmarks') observe(document.querySelector('main'), decorateBookmarks);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200), { once: true });
  else setTimeout(boot, 200);
})();
