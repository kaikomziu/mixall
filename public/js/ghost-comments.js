// Ghostコメントの階層表示。返信の入れ子を「範囲線」(コードのインデントガイドのような縦線)で示す。
(function () {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // renderItem(comment, parentComment|null, depth) => 1件分のHTML。入れ子と範囲線は共通でここが作る。
  function tree(comments, renderItem) {
    const list = Array.isArray(comments) ? comments : [];
    const ids = new Set(list.map((c) => c.id));
    const byId = new Map(list.map((c) => [c.id, c]));
    const kids = new Map();
    list.forEach((c) => {
      const key = c.parentCommentId && ids.has(c.parentCommentId) && c.parentCommentId !== c.id ? c.parentCommentId : '';
      if (!kids.has(key)) kids.set(key, []);
      kids.get(key).push(c);
    });
    const seen = new Set();
    const level = (key, depth) => (kids.get(key) || []).map((c) => {
      if (seen.has(c.id) || depth > 60) return '';
      seen.add(c.id);
      const children = level(c.id, depth + 1);
      const parent = c.parentCommentId ? byId.get(c.parentCommentId) || null : null;
      return `<div class="gc-node" data-cid="${esc(c.id)}"><div class="gc-item">${renderItem(c, parent, depth)}</div>${children ? `<div class="gc-replies gc-d${depth % 6}">${children}</div>` : ''}</div>`;
    }).join('');
    return level('', 0);
  }
  const nameOf = (c) => (c && (c.authorProfile?.displayName || c.authorName)) || 'ユーザー';
  window.GhostComments = { tree, nameOf, esc };
})();
