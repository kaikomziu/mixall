// public/js/ghost-plus.js
// Ghost の追加機能（フィード・投稿ページ・保存済みページ）:
//   投票 / 絵文字リアクション / フォロー中タブ / おすすめユーザー / Coinショップの装飾 / ブックマークのメモ / コメント欄
(function () {
  'use strict';
  const BASE = String(window.MIXALL_BASE || '').replace(/\/$/, '');
  const API = String(window.MIXALL_API_BASE || '/.netlify/functions').replace(/\/$/, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const toast = (m, o) => window.MixAllUX && window.MixAllUX.toast(m, o);
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  let path = location.pathname; if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length);
  const page = /^\/ghost\/?(index\.html)?$/i.test(path) ? 'feed' : /^\/ghost\/post\.html$/i.test(path) ? 'post' : /^\/ghost\/bookmarks\.html$/i.test(path) ? 'bookmarks' : '';
  let EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

  // ---------- 投票 ----------
  function pollHtml(postId, p) {
    const voted = Boolean(p.myVote) || p.ended;
    return `<div class="gx-poll" data-poll="${esc(postId)}">${p.question ? `<p class="gx-poll-q">${esc(p.question)}</p>` : ''}
      ${p.options.map((o) => { const pct = p.total ? Math.round((o.count / p.total) * 100) : 0; return `<button type="button" class="gx-poll-opt${p.myVote === o.id ? ' mine' : ''}${voted ? ' shown' : ''}" data-opt="${esc(o.id)}" ${p.ended ? 'disabled' : ''}>
        <i style="width:${voted ? pct : 0}%"></i><span>${esc(o.label)}</span>${voted ? `<b>${pct}%</b>` : ''}</button>`; }).join('')}
      <p class="gx-poll-meta">${p.total}票 ・ ${p.ended ? '終了しました' : `のこり ${remain(p.endsAt)}`}${p.myVote && !p.ended ? ' ・ もう一度押すと取り消し' : ''}</p></div>`;
  }
  function remain(at) { const m = Math.max(0, Math.round((at - Date.now()) / 60000)); return m >= 1440 ? `${Math.floor(m / 1440)}日` : m >= 60 ? `${Math.floor(m / 60)}時間` : `${m}分`; }
  function bindPoll(el, postId) {
    el.querySelectorAll('[data-opt]').forEach((b) => { b.onclick = async () => {
      try { const r = await plus('votePoll', { postId, optionId: b.dataset.opt }); el.outerHTML = pollHtml(postId, r.poll); const fresh = document.querySelector(`[data-poll="${CSS.escape(postId)}"]`); if (fresh) bindPoll(fresh, postId); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    }; });
  }

  // ---------- リアクション ----------
  function reactHtml(target, r) {
    const counts = (r && r.counts) || {}; const mine = (r && r.mine) || [];
    const used = Object.keys(counts);
    return `<div class="gx-react" data-target="${esc(target)}">${used.map((e) => `<button type="button" class="gx-react-chip${mine.includes(e) ? ' mine' : ''}" data-emoji="${e}">${e}<span>${counts[e]}</span></button>`).join('')}
      <button type="button" class="gx-react-add" aria-label="リアクションを追加">☺︎＋</button></div>`;
  }
  function bindReact(el) {
    const target = el.dataset.target;
    const send = async (emoji) => {
      try { const r = await plus('react', { target, emoji }); el.outerHTML = reactHtml(target, r); const fresh = document.querySelector(`.gx-react[data-target="${CSS.escape(target)}"]`); if (fresh) bindReact(fresh); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    };
    el.querySelectorAll('[data-emoji]').forEach((b) => { b.onclick = () => send(b.dataset.emoji); });
    el.querySelector('.gx-react-add').onclick = (ev) => {
      ev.stopPropagation();
      document.querySelectorAll('.gx-react-picker').forEach((p) => p.remove());
      const picker = document.createElement('div');
      picker.className = 'gx-react-picker';
      picker.innerHTML = EMOJIS.map((e) => `<button type="button" data-pick="${e}">${e}</button>`).join('');
      el.appendChild(picker);
      picker.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = (e2) => { e2.stopPropagation(); picker.remove(); send(b.dataset.pick); }; });
      setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 0);
    };
  }

  // ---------- 装飾（Coinショップ） ----------
  function applyCosmetics(root, cos) {
    root.querySelectorAll('[data-handle]').forEach((art) => {
      const c = cos[String(art.dataset.handle || '').toLowerCase()];
      if (!c) return;
      const name = art.querySelector('.gf-name');
      if (name && c.nameColor) { name.style.backgroundImage = c.nameColor; name.classList.add('gx-name-color'); }
      const av = art.querySelector('.gf-avatar');
      if (av && c.frame) { av.style.boxShadow = 'none'; av.style.outline = 'none'; av.classList.add('gx-framed'); av.style.setProperty('--gx-frame', c.frame); }
      if (name && c.title && !art.querySelector('.gx-title')) name.insertAdjacentHTML('afterend', ` <span class="gx-title">${esc(c.title)}</span>`);
    });
  }

  // ---------- フィードの飾り付け（描き直されるたびに） ----------
  let decorating = false;
  async function decorateFeed() {
    const feed = document.getElementById('feed');
    if (!feed || decorating) return;
    const arts = [...feed.querySelectorAll('article[data-id]')].filter((a) => !a.dataset.gx);
    if (!arts.length) return;
    decorating = true;
    arts.forEach((a) => { a.dataset.gx = '1'; });
    try {
      const ids = arts.map((a) => a.dataset.id);
      const handles = Array.from(new Set(arts.map((a) => a.dataset.handle).filter(Boolean)));
      const d = await plus('postExtras', { postIds: ids, handles });
      if (d.emojis) EMOJIS = d.emojis;
      for (const a of arts) {
        const id = a.dataset.id;
        const actions = a.querySelector('.gf-actions');
        if (d.polls[id] && !a.querySelector('.gx-poll')) { (actions || a).insertAdjacentHTML('beforebegin', pollHtml(id, d.polls[id])); bindPoll(a.querySelector('.gx-poll'), id); }
        if (!a.querySelector('.gx-react')) { (actions || a).insertAdjacentHTML('afterend', reactHtml(`post:${id}`, d.reactions[`post:${id}`])); bindReact(a.querySelector('.gx-react')); }
      }
      applyCosmetics(feed, d.cosmetics || {});
      if (followingOnly) applyFollowingFilter();
    } catch (_) { /* 飾りが付かなくても本体は使える */ }
    finally { decorating = false; }
  }

  // ---------- フォロー中タブ ----------
  let followingOnly = false; let followHandles = null;
  async function applyFollowingFilter() {
    const feed = document.getElementById('feed');
    if (!feed) return;
    if (!followHandles) { try { followHandles = new Set((await plus('following', {}, 'GET')).handles); } catch (_) { followHandles = new Set(); } }
    let shown = 0;
    feed.querySelectorAll('article[data-id]').forEach((a) => { const on = !followingOnly || followHandles.has(String(a.dataset.handle || '').toLowerCase()); a.hidden = !on; if (on) shown += 1; });
    let empty = document.getElementById('gxFollowEmpty');
    if (followingOnly && !shown) {
      if (!empty) { empty = document.createElement('div'); empty.id = 'gxFollowEmpty'; empty.className = 'card'; feed.prepend(empty); }
      empty.innerHTML = '<p class="muted">フォロー中の人の投稿はまだありません。下の「おすすめユーザー」からフォローしてみましょう。</p>';
    } else if (empty) empty.remove();
  }
  function addFollowingTab() {
    const tabs = document.querySelector('.gf-tabs');
    if (!tabs || tabs.querySelector('[data-following]')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary'; b.dataset.following = '1'; b.setAttribute('aria-pressed', 'false'); b.textContent = 'フォロー中';
    tabs.insertBefore(b, tabs.children[1] || null);
    b.onclick = () => {
      // 「フォロー中」はタイムライン（すべての種類）を、フォロー中の人だけに絞って表示する
      const all = tabs.querySelector('[data-channel=""]');
      if (all && all.getAttribute('aria-pressed') !== 'true') all.click();
      followingOnly = true;
      tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      applyFollowingFilter();
    };
    tabs.querySelectorAll('[data-channel]').forEach((x) => x.addEventListener('click', () => { if (followingOnly) { followingOnly = false; applyFollowingFilter(); } }, true));
  }

  // ---------- おすすめユーザー ----------
  async function recommend() {
    const feed = document.getElementById('feed');
    if (!feed || document.getElementById('gxRecommend')) return;
    let users = [];
    try { users = (await plus('recommendUsers', {}, 'GET')).users; } catch (_) { return; }
    if (!users.length) return;
    const box = document.createElement('section');
    box.id = 'gxRecommend'; box.className = 'card gx-recommend';
    box.innerHTML = `<h3>おすすめユーザー</h3><div class="gx-rec-list">${users.map((u) => `<div class="gx-rec"><a class="gf-avatar" href="${BASE}/Ghost/profile.html?handle=${encodeURIComponent(u.handle)}"${u.avatarUrl ? ` style="background-image:url('${esc(u.avatarUrl)}')"` : ''}>${u.avatarUrl ? '' : esc(u.name.slice(0, 1))}</a>
      <a class="gx-rec-name" href="${BASE}/Ghost/profile.html?handle=${encodeURIComponent(u.handle)}">${esc(u.name)}</a><span class="gx-rec-why">${esc(u.reason)}</span>
      <button type="button" data-follow="${esc(u.handle)}">フォロー</button></div>`).join('')}</div>`;
    feed.parentElement.insertBefore(box, feed);
    box.querySelectorAll('[data-follow]').forEach((b) => { b.onclick = async () => {
      const s = session();
      try {
        const r = await fetch(`${API}/ghost`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'followAccount', token: s.token, targetHandle: b.dataset.follow, follow: true }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'フォローできませんでした');
        b.textContent = 'フォロー中'; b.disabled = true; b.classList.add('secondary');
        if (followHandles) followHandles.add(b.dataset.follow.toLowerCase());
      } catch (e) { toast(e.message, { kind: 'error' }); }
    }; });
  }

  // ---------- 投稿ページ: 投票・リアクション・コメント欄 ----------
  async function decoratePost() {
    const id = new URLSearchParams(location.search).get('id');
    const host = document.getElementById('post');
    if (!id || !host) return;
    const s = session();
    let post = null;
    try { const r = await fetch(`${API}/ghost?post=${encodeURIComponent(id)}&token=${encodeURIComponent(s.token)}`); post = (await r.json()).post; } catch (_) { /* ignore */ }
    if (!post) return;
    const comments = post.comments || [];
    const targets = comments.map((c) => `${id}:${c.id}`).filter((t) => !t.endsWith(':undefined'));
    let d = null;
    try { d = await plus('postExtras', { postIds: [id], commentTargets: targets }); if (d.emojis) EMOJIS = d.emojis; } catch (_) { return; }
    const commentsBox = host.querySelector('.comments');
    if (d.polls[id] && !host.querySelector('.gx-poll')) { (commentsBox || host).insertAdjacentHTML('beforebegin', pollHtml(id, d.polls[id])); bindPoll(host.querySelector('.gx-poll'), id); }
    if (!host.querySelector(`.gx-react[data-target="post:${CSS.escape(id)}"]`)) { (commentsBox || host).insertAdjacentHTML('beforebegin', reactHtml(`post:${id}`, d.reactions[`post:${id}`])); bindReact(host.querySelector('.gx-react')); }
    host.querySelectorAll('.comment-item').forEach((el, i) => {
      const c = comments[i]; if (!c || !c.id || el.querySelector('.gx-react')) return;
      const t = `comment:${id}:${c.id}`;
      el.insertAdjacentHTML('beforeend', reactHtml(t, d.reactions[t]));
      bindReact(el.querySelector('.gx-react'));
    });
    if (commentsBox && !document.getElementById('gxCommentForm')) {
      commentsBox.insertAdjacentHTML('beforeend', `<form id="gxCommentForm" class="gx-comment-form"><textarea id="gxCommentText" rows="2" placeholder="コメントを書く…" maxlength="1000"></textarea><button type="submit">送信</button></form>`);
      document.getElementById('gxCommentForm').onsubmit = async (e) => {
        e.preventDefault();
        const ta = document.getElementById('gxCommentText'); const text = ta.value.trim(); if (!text) return;
        try {
          const r = await fetch(`${API}/ghost`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'addComment', token: s.token, postId: id, text }) });
          const data = await r.json(); if (!r.ok) throw new Error(data.error || 'コメントできませんでした');
          ta.value = ''; toast('コメントしました');
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast(err.message, { kind: 'error' }); }
      };
    }
  }

  // ---------- 保存済み: メモ ----------
  let notes = null;
  async function decorateBookmarks() {
    if (!notes) { try { notes = (await plus('notes', {}, 'GET')).notes; } catch (_) { notes = {}; } }
    document.querySelectorAll('article[data-post]').forEach((a) => {
      if (a.querySelector('.gx-note')) return;
      const id = a.dataset.post;
      const n = notes[id];
      const box = document.createElement('div');
      box.className = 'gx-note';
      const draw = () => {
        const cur = notes[id];
        box.innerHTML = cur ? `<span class="gx-note-text">📝 ${esc(cur.text)}</span><button type="button" class="ghost" data-note-edit>メモを編集</button>` : '<button type="button" class="ghost" data-note-edit>📝 メモを付ける</button>';
        box.querySelector('[data-note-edit]').onclick = async () => {
          const v = await window.MixAllDialog.prompt('この投稿のメモ（自分だけに見えます）', cur ? cur.text : '', { multiline: true, icon: '📝' });
          if (v === null) return;
          try { notes = (await plus('saveNote', { postId: id, note: v })).notes; draw(); toast(v.trim() ? 'メモを保存しました' : 'メモを消しました'); } catch (e) { toast(e.message, { kind: 'error' }); }
        };
      };
      draw();
      a.appendChild(box);
      void n;
    });
  }

  function observe(id, fn) {
    const el = document.getElementById(id) || document.querySelector('main');
    if (!el) return;
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(fn, 120); }).observe(el, { childList: true, subtree: true });
    fn();
  }

  function boot() {
    if (!session() || !window.MixAllPlus) return;
    if (page === 'feed') { addFollowingTab(); observe('feed', decorateFeed); recommend(); }
    if (page === 'post') { let tries = 0; const wait = () => { if (document.querySelector('#post .comments') || tries++ > 20) decoratePost(); else setTimeout(wait, 250); }; wait(); }
    if (page === 'bookmarks') observe(null, decorateBookmarks);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 200), { once: true });
  else setTimeout(boot, 200);
})();
