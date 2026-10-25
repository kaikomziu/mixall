/* 各ページの検索ボックスに、Uchと同じ絞り込み検索(FilterSearch)をつなぐ */
(function () {
  if (!window.FilterSearch) return;
  const FS = window.FilterSearch;
  const path = location.pathname.toLowerCase();
  const $ = (id) => document.getElementById(id);
  const sess = () => { try { return window.Netrify && Netrify.getSession(); } catch (_) { return null; } };
  const tokenQs = () => { const s = sess(); return s ? '&token=' + encodeURIComponent(s.token) : ''; };
  const go = (btn, run) => { if (btn && run) btn.onclick = (e) => { e.preventDefault(); run(); }; };
  const ghostLabels = { messages: '投稿', links: 'リンク付き', empty: '条件に一致する投稿が見つかりませんでした。' };
  const toPost = (item) => { location.href = '/Ghost/post.html?id=' + encodeURIComponent(item.id); };
  const loadGhost = async () => { const r = await fetch('/api/ghost?limit=200' + tokenQs()); const d = await r.json(); return FS.ghostItems(d.posts || []); };

  if (path.indexOf('/ghost/') === 0 || path === '/ghost') {
    if ($('q')) go($('go'), FS.attach($('q'), { labels: ghostLabels, loadItems: loadGhost, onPick: toPost }));
    if ($('ghostSearch')) go($('ghostSearchBtn'), FS.attach($('ghostSearch'), { labels: ghostLabels, loadItems: loadGhost, onPick: toPost }));
    if ($('bookmarkSearch')) FS.attach($('bookmarkSearch'), { labels: ghostLabels, loadItems: async () => FS.ghostItems(typeof allPosts !== 'undefined' ? allPosts : []), onPick: toPost });
  }

  if (path.indexOf('/mail') === 0 && $('mailSearch')) {
    go($('mailSearchBtn'), FS.attach($('mailSearch'), {
      labels: { messages: 'メール', links: 'リンク付き', empty: '条件に一致するメールが見つかりませんでした。' },
      loadItems: async () => {
        const r = await fetch('/api/mail?view=all' + tokenQs()); const d = await r.json();
        return (d.threads || []).map((t) => {
          const name = (t.otherProfile && t.otherProfile.displayName) || t.otherEmail || '?';
          const text = `${t.subject || ''}\n${(t.lastMessage && t.lastMessage.text) || ''}`.trim();
          return { id: t.id, authorId: t.otherEmail || name, authorName: name, text, ts: Date.parse((t.lastMessage && t.lastMessage.createdAt) || t.updatedAt || t.createdAt) || 0, mentions: [], types: FS.typesOf(text, null), isBot: false };
        });
      },
      onPick: (item) => { location.href = '/Mail/Thread/' + encodeURIComponent(item.id) + '/'; }
    }));
  }

  if (path.indexOf('/tools') === 0 && $('toolSearch')) {
    let cards = [];
    FS.attach($('toolSearch'), {
      labels: { messages: 'ツール', links: 'リンク付き', empty: '条件に一致するツールが見つかりませんでした。' },
      loadItems: async () => {
        cards = [...document.querySelectorAll('.tool-card')];
        return cards.map((c, i) => {
          const cat = ((c.closest('section') || document).querySelector('h2') || {}).textContent || 'ツール';
          const title = c.dataset.title || (c.querySelector('summary') || {}).textContent || '';
          return { id: String(i), authorId: cat, authorName: cat, text: `${title}\n${c.textContent.replace(/\s+/g, ' ').slice(0, 300)}`.trim(), ts: 0, mentions: [], types: [], isBot: false };
        });
      },
      onPick: (item) => { const c = cards[Number(item.id)]; if (c) { c.classList.remove('hidden'); c.open = true; c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
    });
  }

  if (path.indexOf('/extensions') === 0 && $('search')) {
    FS.attach($('search'), {
      labels: { messages: '拡張機能', links: 'リンク付き', empty: '条件に一致する拡張機能が見つかりませんでした。' },
      loadItems: async () => (typeof rows !== 'undefined' ? rows : []).map((x) => { const text = `${x.name || ''}\n${x.description || ''}`.trim(); return { id: x.id || x.name, authorId: x.author || '運営', authorName: x.author || '運営', text, ts: Date.parse(x.updatedAt || x.createdAt) || 0, mentions: [], types: FS.typesOf(text, null), isBot: false, raw: x }; }),
      onPick: (item) => { $('search').value = (item.raw && item.raw.name) || ''; if (typeof render === 'function') render(); $('search').blur(); }
    });
  }

  if (path.indexOf('/admin') === 0 && $('auditSearch')) {
    FS.attach($('auditSearch'), {
      labels: { messages: '操作履歴', links: 'リンク付き', empty: '条件に一致する操作履歴が見つかりませんでした。' },
      loadItems: async () => ((typeof latest !== 'undefined' && latest && latest.audits) || []).map((x, i) => { const text = `${x.action || ''} ${x.targetType || ''} ${x.targetId || ''} ${x.detail || ''}`.trim(); return { id: String(i), authorId: x.actorEmail || '', authorName: x.actorEmail || '不明', text, ts: Date.parse(x.createdAt) || 0, mentions: [], types: FS.typesOf(text, null), isBot: false, raw: x }; }),
      onPick: (item) => { const x = item.raw || {}; $('auditSearch').value = x.targetId || x.action || ''; if (typeof renderAudits === 'function' && typeof latest !== 'undefined') renderAudits(latest.audits || []); }
    });
  }
})();
