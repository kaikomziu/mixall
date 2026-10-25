// ツール一覧: 保存した並び順を反映する(並べ替え自体は、⚙の「編集する」→ ui-edit.js で行う)。
(function () {
  const KEY = 'mixall_tool_order';
  function applySaved() {
    let saved = []; try { saved = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) {}
    if (!Array.isArray(saved) || !saved.length) return;
    const list = Array.from(document.querySelectorAll('details.tool-card[id]')), byId = new Map(list.map((c) => [c.id, c]));
    const ordered = [...saved.filter((id) => byId.has(id)).map((id) => byId.get(id)), ...list.filter((c) => !saved.includes(c.id))];
    const slots = list.map((c) => { const m = document.createComment('slot'); c.replaceWith(m); return m; }); // 元の位置に、保存した順で入れ直す
    slots.forEach((m, i) => m.replaceWith(ordered[i]));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySaved, { once: true }); else applySaved();
})();
