(() => {
  const root = document.getElementById('pixiv-tool'); 
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  async function fetchInfo(url) {
    const r = await fetch('/api/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pixivImage', url }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || '取得に失敗しました'); return d;
  }
  function pagesHtml(d, startPage) {
    return d.pages.filter((p, i) => !startPage || p.page === startPage || d.pages.length === 1).map((p) => `<div class="card" style="margin:8px 0"><p class="muted" style="margin:0 0 6px">${esc(d.id)} ・ ${p.page}枚目</p><a href="${esc(p.proxyOriginalUrl)}" target="_blank" rel="noopener"><img src="${esc(p.proxyUrl)}" alt="" loading="lazy" style="max-width:100%;border-radius:8px"></a><div class="row" style="margin-top:6px"><button type="button" class="secondary small" data-copy="${esc(p.image1200)}">画像URLをコピー</button><button type="button" class="ghost small" data-copy="${esc(p.original)}">オリジナルURLをコピー</button></div><p class="muted" style="word-break:break-all;margin:6px 0 0">${esc(p.image1200)}</p></div>`).join('');
  }
  function bindCopy(el) { el.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'コピーしました'; } catch (_) { prompt('コピーしてください', b.dataset.copy); } }; }); }
  if (root) {
    const input = root.querySelector('[data-px-url]'), out = root.querySelector('[data-px-out]'), btn = root.querySelector('[data-px-go]');
    btn.onclick = async () => {
      const v = input.value.trim(); const pg = /#(\d+)/.exec(v); out.innerHTML = '<p class="muted">取得中…</p>'; btn.disabled = true;
      try { const d = await fetchInfo(v); out.innerHTML = pagesHtml(d, pg ? Number(pg[1]) : 0) || '<p class="muted">画像が見つかりません</p>'; bindCopy(out); }
      catch (e) { out.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; } finally { btn.disabled = false; }
    };
  }
  // アニメ画像検索の結果にpixivの「元画像を表示」ボタンを追加
  const results = document.querySelector('[data-anime-results]');
  if (results) {
    const decorate = () => results.querySelectorAll('article.anime-result').forEach((a) => {
      if (a.dataset.pxDone) return; const link = a.querySelector('a[href*="pixiv.net/"]'); if (!link || !/artworks\/\d+/.test(link.href)) return; a.dataset.pxDone = '1';
      const holder = document.createElement('div'); const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary small'; b.textContent = 'pixivの元画像を表示'; holder.appendChild(b); a.appendChild(holder);
      b.onclick = async () => { b.disabled = true; b.textContent = '取得中…'; try { const d = await fetchInfo(link.href); holder.innerHTML = pagesHtml(d, 0); bindCopy(holder); } catch (e) { holder.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; } };
    });
    new MutationObserver(decorate).observe(results, { childList: true, subtree: true });
  }
})();
