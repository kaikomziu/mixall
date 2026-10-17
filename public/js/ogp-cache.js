(() => {
  const cache = new Map();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function cached(url) { return cache.get(String(url || '')) || null; }
  function html(url, data) {
    const value = data || { title: '', description: '', image: '', siteName: '' };
    return `${value.image ? `<img src="${esc(value.image)}" alt="" style="width:72px;height:48px;object-fit:cover;float:left;margin-right:8px;border-radius:5px;">` : ''}<strong>${esc(value.title || value.siteName || (() => { try { return new URL(url).hostname; } catch { return 'リンク'; } })())}</strong>${value.description ? `<span>${esc(value.description)}</span>` : '<span>リンクを開く</span>'}`;
  }
  window.NetrifyOgp = {
    get: cached,
    set(url, data) { cache.set(String(url), data); return data; },
    render(url) { const data = cached(url); return data ? html(url, data) : `<strong>リンク情報</strong><span>読み込み中…</span>`; },
    async hydrate(root, fetcher) {
      root?.querySelectorAll('[data-preview-url]').forEach(async (card) => {
        const url = card.dataset.previewUrl; const old = cached(url);
        if (old) { card.innerHTML = html(url, old); return; }
        try { const data = await fetcher(url); cache.set(url, data); if (card.isConnected) card.innerHTML = html(url, data); }
        catch { if (card.isConnected) card.innerHTML = '<strong>リンク</strong><span>クリックして開く</span>'; }
      });
    }
  };
})();
