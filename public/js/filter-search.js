/* 複数条件チップ式の検索(from: / has: / mentions: / on: before: after: / type:) */
(function () {
  if (window.FilterSearch) return;
  const css = document.createElement('style');
  css.textContent = `
  .fs-overlay{position:fixed;inset:0;z-index:3000;background:var(--fs-solid,var(--bg,#fff));color:var(--text,#111);display:flex;flex-direction:column}
  .fs-top{display:flex;align-items:center;gap:8px;padding:10px 10px 6px;position:relative;background:var(--fs-solid,transparent)}
  .fs-tabs,.fs-results{background:var(--fs-solid,transparent)}
  .fs-back{border:0;background:transparent;color:inherit;font-size:1.6rem;cursor:pointer;padding:0 6px}
  .fs-bar{flex:1;min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border:2px solid var(--accent,#3b82f6);border-radius:12px;padding:5px 8px;background:var(--fs-solid-2,var(--panel,#f4f4f4))}
  .fs-chip{display:inline-flex;align-items:center;gap:4px;border-radius:6px;padding:2px 4px 2px 8px;background:var(--panel-2,#e5e7eb);font-size:.85rem;white-space:nowrap}
  .fs-chip b{color:var(--accent,#2563eb)}
  .fs-chip button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:1rem;line-height:1;padding:0 4px}
  .fs-chip.pending{padding-right:8px}
  .fs-input{flex:1;min-width:90px;border:0!important;outline:0;background:transparent!important;color:inherit;font-size:1rem;padding:6px 2px!important;box-shadow:none!important;margin:0!important}
  .fs-drop{position:absolute;left:44px;right:10px;top:100%;z-index:3010;background:var(--fs-solid-2,var(--card,#fff));border:1px solid var(--border,#ccc);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.3);max-height:55vh;overflow-y:auto}
  .fs-drop button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:10px 12px;cursor:pointer;font-size:.95rem}
  .fs-drop button:hover,.fs-drop button.on{background:var(--panel-2,rgba(127,127,127,.18))}
  .fs-drop small{display:block;color:var(--text-dim,#777)}
  .fs-drop .fs-h{padding:8px 12px 2px;font-size:.8rem;color:var(--text-dim,#777)}
  .fs-ava{width:30px;height:30px;border-radius:50%;background:var(--panel-2,#ddd);display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;overflow:hidden;font-size:.75rem}
  .fs-ava img,.fs-ava video{width:100%;height:100%;object-fit:cover}
  .fs-tabs{display:flex;gap:16px;padding:6px 16px;border-bottom:1px solid var(--border,#ddd)}
  .fs-tabs button{border:0;background:transparent;color:var(--text-dim,#777);padding:6px 0;font-size:.95rem;cursor:pointer;border-bottom:2px solid transparent}
  .fs-tabs button.on{color:var(--accent,#2563eb);border-bottom-color:var(--accent,#2563eb);font-weight:700}
  .fs-results{flex:1;overflow-y:auto;padding:6px 12px 24px}
  .fs-item{display:flex;gap:10px;padding:10px 4px;border-bottom:1px solid var(--border,#eee);cursor:pointer}
  .fs-item:hover{background:var(--panel-2,rgba(127,127,127,.12))}
  .fs-item .t{min-width:0;flex:1}
  .fs-item .n{font-weight:700;font-size:.9rem}
  .fs-item .n span{font-weight:400;color:var(--text-dim,#777);font-size:.75rem;margin-left:6px}
  .fs-item .x{overflow-wrap:anywhere;white-space:pre-wrap;font-size:.92rem;max-height:6.5em;overflow:hidden}
  .fs-item mark{background:rgba(250,204,21,.45);color:inherit;border-radius:3px}
  .fs-empty{padding:40px 12px;text-align:center;color:var(--text-dim,#777)}`;
  document.head.appendChild(css);

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FILTERS = [
    { key: 'from', title: '特定の人', hint: '特定のユーザーからのメッセージをフィルター', icon: '👤' },
    { key: 'has', title: '特定のデータタイプ', hint: '画像・動画・リンクなどを含むメッセージ', icon: '📎' },
    { key: 'mentions', title: '誰かをメンション', hint: '特定のユーザーへのメンションを含むメッセージ', icon: '＠' },
    { key: 'on', title: '日付（一致）', hint: 'その日に送られたメッセージ', icon: '📅' },
    { key: 'before', title: '日付（以前）', hint: 'その日より前のメッセージ', icon: '📅' },
    { key: 'after', title: '日付（以降）', hint: 'その日以降のメッセージ', icon: '📅' },
    { key: 'type', title: '投稿者タイプ', hint: 'ユーザーまたはbotの投稿', icon: '🤖' }
  ];
  const HAS = [['image', '画像'], ['video', '動画'], ['audio', '音声'], ['file', 'ファイル'], ['link', 'リンク'], ['stamp', 'スタンプ'], ['poll', '投票'], ['location', '位置情報'], ['attachment', '添付あり']];
  const TYPES = [['user', 'ユーザー'], ['bot', 'bot']];
  const DAY = 864e5;
  const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dateLabel = (ms) => new Date(ms).toLocaleDateString('ja-JP');
  function parseDate(text) {
    const m = /^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})日?$/.exec(String(text).trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function open(opts) {
    const state = { chips: [], pending: null, text: '', tab: 'messages', items: [], sel: 0, remote: null };
    let remoteTimer = null;
    function scheduleRemote() {
      if (!opts.remote) return;
      clearTimeout(remoteTimer);
      const q = state.pending ? '' : state.text.trim();
      if (q.length < 1) { state.remote = null; return; }
      remoteTimer = setTimeout(async () => { try { const sig = JSON.stringify(state.chips); const items = await opts.remote(q, state.chips); if (q === (state.pending ? '' : state.text.trim()) && sig === JSON.stringify(state.chips)) { state.remote = { q, sig, items: items || [] }; renderResults(); } } catch (_) {} }, 450);
    }
    const extraF = () => opts.extraFilters || [];
    const allFilters = () => FILTERS.concat(extraF());
    const keyRe = () => new RegExp('^(' + ['from', 'has', 'mentions', 'on', 'before', 'after', 'type'].concat(extraF().map((f) => f.key)).join('|') + '):?$', 'i');
    const L = Object.assign({ messages: 'メッセージ', links: 'リンク', empty: '条件に一致するメッセージが見つかりませんでした。', placeholder: '' }, opts.labels || {});
    const root = document.createElement('div');
    root.className = 'fs-overlay';
    root.innerHTML = `<div class="fs-top"><button class="fs-back" type="button" aria-label="閉じる">‹</button><div class="fs-bar"></div><div class="fs-drop" style="display:none"></div></div>
      <div class="fs-tabs"><button type="button" data-tab="messages" class="on">メッセージ</button><button type="button" data-tab="links">リンク</button></div>
      <div class="fs-results"><div class="fs-empty">読み込み中…</div></div>`;
    // 壁紙テーマでは --bg が透明・--panel が半透明になり裏が透けるため、テーマの明暗から不透明色を決める
    (function solidify() {
      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue('--bg').trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(bg)) return; // すでに不透明
      const m = cs.getPropertyValue('--text').trim().match(/#([0-9a-f]{6})|#([0-9a-f]{3})\b|rgba?\(([^)]+)\)/i);
      let r = 255, g = 255, b = 255;
      if (m && m[1]) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); }
      else if (m && m[2]) { r = parseInt(m[2][0] + m[2][0], 16); g = parseInt(m[2][1] + m[2][1], 16); b = parseInt(m[2][2] + m[2][2], 16); }
      else if (m && m[3]) { const a = m[3].split(',').map(parseFloat); r = a[0]; g = a[1]; b = a[2]; }
      const darkTheme = (0.299 * r + 0.587 * g + 0.114 * b) > 140; // 文字が明るい=暗いテーマ
      root.style.setProperty('--fs-solid', darkTheme ? '#14161b' : '#f4f5f7');
      root.style.setProperty('--fs-solid-2', darkTheme ? '#232733' : '#ffffff');
    })();
    document.body.appendChild(root);
    const bar = root.querySelector('.fs-bar'), drop = root.querySelector('.fs-drop'), results = root.querySelector('.fs-results');
    let derivedPeople = [];
    const people = () => (opts.people ? opts.people() : derivedPeople);
    function close() { root.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    root.querySelector('.fs-back').onclick = close;
    root.querySelectorAll('.fs-tabs button').forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; root.querySelectorAll('.fs-tabs button').forEach((x) => x.classList.toggle('on', x === b)); renderResults(); });

    function chipHtml(c, i) { return `<span class="fs-chip"><b>${c.key}:</b>${esc(c.label)}<button type="button" data-rm="${i}" aria-label="外す">×</button></span>`; }
    function renderBar() {
      bar.innerHTML = state.chips.map(chipHtml).join('') + (state.pending ? `<span class="fs-chip pending"><b>${state.pending}:</b></span>` : '') + `<input class="fs-input" type="text" autocomplete="off" placeholder="${state.chips.length || state.pending ? '' : '検索（例: from: で人を絞り込み）'}" />`;
      const input = bar.querySelector('.fs-input');
      input.value = state.text;
      input.oninput = () => { state.text = input.value; state.sel = 0; autoKey(); renderDrop(); renderResults(); scheduleRemote(); };
      input.onfocus = renderDrop;
      input.onkeydown = onInputKey;
      bar.querySelectorAll('[data-rm]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); state.chips.splice(Number(b.dataset.rm), 1); scheduleRemote(); renderBar(); renderDrop(); renderResults(); });
      input.focus();
      const len = input.value.length; try { input.setSelectionRange(len, len); } catch (_) {}
    }
    function autoKey() {
      const m = new RegExp('^(' + ['from', 'has', 'mentions', 'on', 'before', 'after', 'type'].concat((opts.extraFilters || []).map((f) => f.key)).join('|') + '):$', 'i').exec(state.text.trim());
      if (m && !state.pending) { state.pending = m[1].toLowerCase(); state.text = ''; renderBar(); }
    }
    function options() {
      const q = state.text.trim().toLowerCase();
      if (!state.pending) {
        if (state.text.trim() && !allFilters().some((f) => f.key.startsWith(q))) return [];
        return allFilters().filter((f) => !(opts.hideFilters || []).includes(f.key) && (!q || f.key.startsWith(q))).map((f0) => { const f = Object.assign({}, f0, (opts.filterLabels || {})[f0.key] || {}); return { kind: 'key', key: f.key, title: f.title, hint: f.hint, icon: f.icon, main: f.key }; });
      }
      const k = state.pending;
      if (k === 'from' || k === 'mentions') return people().filter((p) => !q || String(p.name).toLowerCase().startsWith(q) || String(p.name).toLowerCase().includes(q)).map((p) => ({ kind: 'val', key: k, value: p.id, label: p.name, ava: p.ava, title: p.name, hint: p.sub || '' }));
      if (k === 'has') return HAS.filter(([, l]) => !q || l.includes(q) || HAS.find((h) => h[0].startsWith(q) && h[1] === l)).map(([v, l]) => ({ kind: 'val', key: k, value: v, label: l, title: l, hint: v }));
      const xf = extraF().find((f) => f.key === k);
      if (xf) { const list0 = typeof xf.options === 'function' ? xf.options(state.items) : xf.options; return list0.filter(([, l]) => !q || String(l).toLowerCase().includes(q)).map(([v, l]) => ({ kind: 'val', key: k, value: v, label: l, title: l, hint: xf.hint || '' })); }
      if (k === 'type') return (opts.typeOptions || TYPES).map(([v, l]) => ({ kind: 'val', key: k, value: v, label: l, title: l, hint: '' }));
      const now = startOfDay(Date.now());
      const list = [['今日', now], ['昨日', now - DAY], ['1週間前', now - 7 * DAY], ['1か月前', now - 30 * DAY]];
      const typed = parseDate(state.text);
      const out = typed !== null ? [{ kind: 'val', key: k, value: String(typed), label: dateLabel(typed), title: `指定: ${dateLabel(typed)}`, hint: '' }] : [];
      for (const [l, ms] of list) out.push({ kind: 'val', key: k, value: String(ms), label: `${l}（${dateLabel(ms)}）`, title: l, hint: dateLabel(ms) });
      if (typed === null) out.push({ kind: 'hint', title: '日付を入力: 例 2026/10/20', hint: '' });
      return out;
    }
    function renderDrop() {
      const list = options();
      if (!list.length) { drop.style.display = 'none'; return; }
      state.sel = Math.min(state.sel, list.length - 1);
      drop.innerHTML = (state.pending ? '' : '<div class="fs-h">検索オプション</div>') + list.map((o, i) => o.kind === 'hint' ? `<div class="fs-h">${esc(o.title)}</div>` : `<button type="button" data-i="${i}" class="${i === state.sel ? 'on' : ''}">${o.kind === 'key' ? `<span class="fs-ava">${o.icon}</span>` : `<span class="fs-ava">${o.ava || esc(String(o.title).slice(0, 2))}</span>`}<span><b>${esc(o.kind === 'key' ? o.main : o.title)}</b><small>${esc(o.kind === 'key' ? `${o.title} — ${o.hint}` : o.hint)}</small></span></button>`).join('');
      drop.style.display = 'block';
      drop.querySelectorAll('[data-i]').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); choose(list[Number(b.dataset.i)]); });
    }
    function choose(o) {
      if (!o) return;
      if (o.kind === 'key') { state.pending = o.key; state.text = ''; }
      else if (o.kind === 'val') { if (!state.chips.some((c) => c.key === o.key && c.value === o.value)) state.chips.push({ key: o.key, value: o.value, label: o.label }); state.pending = null; state.text = ''; scheduleRemote(); }
      state.sel = 0; renderBar(); renderDrop(); renderResults();
    }
    function onInputKey(e) {
      const list = options().filter((o) => o.kind !== 'hint');
      if (e.key === 'Backspace' && !state.text) {
        if (state.pending) { state.pending = null; } else if (state.chips.length) state.chips.pop(); else return;
        e.preventDefault(); renderBar(); renderDrop(); renderResults();
      } else if (e.key === 'ArrowDown' && list.length) { state.sel = (state.sel + 1) % list.length; renderDrop(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' && list.length) { state.sel = (state.sel - 1 + list.length) % list.length; renderDrop(); e.preventDefault(); }
      else if ((e.key === 'Enter' || e.key === 'Tab') && list.length && drop.style.display !== 'none' && (state.pending || state.text.trim() || e.key === 'Tab')) { if (state.pending || !state.text.trim() || list.length) { choose(list[state.sel]); e.preventDefault(); } }
      else if (e.key === 'Enter') { drop.style.display = 'none'; }
    }
    document.addEventListener('click', (e) => { if (!root.contains(e.target)) return; if (!e.target.closest('.fs-bar') && !e.target.closest('.fs-drop')) drop.style.display = 'none'; });

    function matches(item) {
      const byKey = {};
      for (const c of state.chips) (byKey[c.key] ||= []).push(c.value);
      if (byKey.from && !byKey.from.includes(String(item.authorId))) return false;
      if (byKey.mentions && !byKey.mentions.some((id) => (item.mentions || []).includes(id))) return false;
      if (byKey.has && !byKey.has.some((v) => (item.types || []).includes(v) || (v === 'attachment' && (item.types || []).some((t) => t !== 'link')))) return false;
      if (byKey.type && !byKey.type.includes(opts.typeOf ? opts.typeOf(item) : (item.isBot ? 'bot' : 'user'))) return false;
      if (byKey.on && !byKey.on.some((v) => startOfDay(item.ts) === Number(v))) return false;
      if (byKey.before && !byKey.before.some((v) => item.ts < Number(v))) return false;
      if (byKey.after && !byKey.after.some((v) => item.ts >= Number(v))) return false;
      for (const f of extraF()) if (byKey[f.key] && f.match && !f.match(item, byKey[f.key])) return false;
      const terms = (state.pending ? '' : state.text).toLowerCase().split(/[\s　]+/).filter(Boolean);
      if (terms.length && !keyRe().test(state.text.trim())) {
        const hay = `${item.text || ''} ${item.authorName || ''}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    }
    function highlight(text) {
      let html = esc(String(text || '').slice(0, 600));
      if (state.pending) return html;
      for (const t of state.text.trim().split(/[\s　]+/).filter(Boolean)) {
        if (keyRe().test(t)) continue;
        const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        html = html.split(/(<[^>]*>)/).map((seg) => seg.startsWith('<') ? seg : seg.replace(re, (m0) => `<mark>${m0}</mark>`)).join('');
      }
      return html;
    }
    function renderResults() {
      const remoteNow = state.remote && !state.pending && state.remote.q === state.text.trim() && state.remote.sig === JSON.stringify(state.chips) ? state.remote.items : [];
      const typeChips = state.chips.filter((c) => c.key === 'type').map((c) => c.value);
      const all = state.items.filter(matches).concat(remoteNow.filter((it) => !typeChips.length || typeChips.includes(opts.typeOf ? opts.typeOf(it) : 'user')));
      const links = all.filter((i) => (i.types || []).includes('link'));
      root.querySelector('[data-tab="messages"]').textContent = `${L.messages} (${all.length})`;
      root.querySelector('[data-tab="links"]').textContent = `${L.links} (${links.length})`;
      const pool = (state.tab === 'links' ? links : all).slice();
      const rankTerms = (state.pending ? '' : state.text).toLowerCase().split(/[\s　]+/).filter((t) => t && !keyRe().test(t));
      const shown = (opts.sort ? opts.sort(pool, rankTerms, state.chips) : pool.sort((a, b) => b.ts - a.ts)).slice(0, 300);
      if (!shown.length) { results.innerHTML = `<div class="fs-empty">${esc(L.empty)}</div>`; return; }
      results.innerHTML = shown.map((i) => `<div class="fs-item" data-id="${esc(i.id)}"><span class="fs-ava">${i.ava || esc(String(i.authorName || '?').slice(0, 2))}</span><div class="t"><div class="n">${esc(i.authorName)}<span>${i.ts ? new Date(i.ts).toLocaleString('ja-JP') : ''}</span></div><div class="x">${highlight(i.text || (i.types && i.types.length ? '[' + i.types.join('・') + ']' : ''))}</div></div></div>`).join('');
      results.querySelectorAll('.fs-item').forEach((el) => el.onclick = () => { const item = state.items.concat(state.remote ? state.remote.items : []).find((x) => String(x.id) === el.dataset.id); close(); if (opts.onPick && item) opts.onPick(item); });
    }
    renderBar();
    Promise.resolve(opts.loadItems()).then((items) => { state.items = items || []; { const seen = new Map(); state.items.forEach((it) => { if (it.authorId !== undefined && it.authorId !== '' && !seen.has(it.authorId)) seen.set(it.authorId, { id: it.authorId, name: it.authorName || String(it.authorId), ava: it.ava }); }); derivedPeople = [...seen.values()]; } renderResults(); renderDrop(); }).catch((err) => { results.innerHTML = `<div class="fs-empty">${esc(err.message || '読み込みに失敗しました')}</div>`; });
    return { close };
  }

  function typesOf(text, attachment) {
    const types = [];
    if (/https?:\/\//i.test(text || '')) types.push('link');
    const a = attachment;
    if (a) {
      if (a.isStamp) types.push('stamp');
      else if (a.isPoll) types.push('poll');
      else if (a.isLocation || (a.lat !== undefined && a.lng !== undefined)) types.push('location');
      else {
        const t = String(a.type || '');
        if (t.startsWith('image/')) types.push('image');
        else if (t.startsWith('video/')) types.push('video');
        else if (t.startsWith('audio/')) types.push('audio');
        else types.push('file');
      }
    }
    return types;
  }
  // 検索ボックスをタップすると、この絞り込み検索画面が開くようにする
  function attach(input, opts) {
    if (!input || input.dataset.fsAttached) return;
    input.dataset.fsAttached = '1';
    input.readOnly = true; input.placeholder = (opts && opts.placeholder) || '🔍 タップして検索（from: on: before: などで絞り込み）'; input.style.cursor = 'pointer';
    const run = () => { input.blur(); open(opts); };
    input.addEventListener('focus', run); input.addEventListener('click', run);
    return run;
  }
  // Ghostの投稿一覧を検索用の項目に変換
  function ghostItems(posts) {
    const handleToEmail = new Map();
    (posts || []).forEach((p) => { const h = p.authorProfile && p.authorProfile.handle; if (h && p.authorEmail) handleToEmail.set(String(h).toLowerCase(), p.authorEmail); });
    return (posts || []).map((p) => {
      const prof = p.authorProfile || {};
      const name = prof.displayName || p.authorName || 'Ghost';
      const text = [p.title, p.text || p.description, (p.tags || []).map((x) => '#' + x).join(' ')].filter(Boolean).join('\n');
      const types = typesOf(text, null);
      (p.media || []).forEach((m) => { const k = String(m.kind || ''); if (/image/i.test(k) && !types.includes('image')) types.push('image'); else if (/video/i.test(k) && !types.includes('video')) types.push('video'); else if (/audio/i.test(k) && !types.includes('audio')) types.push('audio'); });
      const mentions = [];
      (String(text).match(/@([A-Za-z0-9_]+)/g) || []).forEach((m) => { const e = handleToEmail.get(m.slice(1).toLowerCase()); if (e && !mentions.includes(e)) mentions.push(e); });
      const ava = prof.avatarUrl && !String(prof.avatarType || '').startsWith('video/') ? `<img src="${esc(prof.avatarUrl)}" alt="">` : '';
      return { id: p.id, authorId: p.authorEmail, authorName: name, text, ts: Date.parse(p.createdAt) || 0, mentions, types, isBot: Boolean(p.isBot), ava };
    });
  }
  window.FilterSearch = { open, typesOf, attach, ghostItems };
})();
