(() => {
  const root = document.getElementById('animeImageSearch') || document.getElementById('anime-search');
  if (!root) return;
  const drop = root.querySelector('[data-anime-drop]');
  const input = root.querySelector('[data-anime-file]');
  const preview = root.querySelector('[data-anime-preview]');
  const status = root.querySelector('[data-anime-status]');
  const results = root.querySelector('[data-anime-results]');
  const form = root.querySelector('form');
  const searchButton = root.querySelector('[data-anime-search]');
  const blur = root.querySelector('[data-anime-blur]');
  const bar = window.MxProgress ? MxProgress.lazy(() => results) : { busy() {}, hide() {} };
  const siteNames = ['pixiv', 'skeb', 'bilibili', 'misskey', 'danbooru'];
  let imageFile = null;
  let previewUrl = '';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const setStatus = (message, error = false) => { status.textContent = message; status.className = error ? 'error' : 'muted'; };
  const setImage = (file) => {
    if (!file || !file.type.startsWith('image/')) { setStatus('画像ファイルを選択してください。', true); return; }
    imageFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    drop.classList.add('has-image');
    setStatus(`${file.name || '貼り付け画像'} を選択しました。検索先を選んで検索できます。`);
  };
  const selectedSites = () => siteNames.filter((name) => root.querySelector(`[data-anime-site="${name}"]`)?.checked);
  const renderResults = (payload) => {
    const items = Array.isArray(payload?.result) ? payload.result : Array.isArray(payload?.results) ? payload.results : [];
    if (!items.length) { results.innerHTML = '<p class="muted">一致する画像が見つかりませんでした。</p>'; return; }
    results.innerHTML = items.map((item) => {
      const image = item.pixivId ? '' : (item.image || '');
      const href = item.viewerUrl || item.url || item.image || '#';
      const score = Number(item.nsfw || 0);
      const isBlurred = blur.checked && score > 0.85;
      const external = item.viewerUrl ? '' : ' target="_blank" rel="noopener noreferrer"';
      const pic = image ? `<img src="${esc(image)}" alt="${esc(item.title || '検索結果')}" loading="lazy">` : `<img data-pixiv-thumb="${esc(item.pixivId || '')}" alt="${esc(item.title || 'pixiv')}" loading="lazy">`;
      const sim = item.score ? ` ・ 類似度 ${Math.round(item.score * (item.score <= 1 ? 100 : 1))}%` : '';
      return `<article class="anime-result"><a href="${esc(href)}"${external} class="anime-result-image${isBlurred ? ' is-nsfw' : ''}" data-nsfw="${isBlurred ? '1' : '0'}">${pic}${isBlurred ? '<span>クリックで表示</span>' : ''}</a><a class="anime-result-title" href="${esc(href)}"${external}>${esc(item.title || item.source || '結果')}</a><small class="muted">${esc(item.source || '')}${sim}</small></article>`;
    }).join('');
    // pixivの結果はサムネイルもサーバー経由で読み込む(直接読むとReferer制限で表示されない)
    results.querySelectorAll('img[data-pixiv-thumb]').forEach(async (img) => {
      const id = img.dataset.pixivThumb; if (!id) return;
      try { const r = await fetch('/api/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pixivImage', url: id }) }); const d = await r.json(); if (r.ok && d.pages?.[0]) img.src = d.pages[0].proxyUrl; } catch (_) {}
    });
    results.querySelectorAll('.anime-result-image.is-nsfw').forEach((link) => link.addEventListener('click', (event) => {
      if (link.dataset.nsfw === '1') { event.preventDefault(); link.dataset.nsfw = '0'; link.classList.remove('is-nsfw'); link.querySelector('span')?.remove(); }
    }));
  };
  const normalizeImage = async (file) => {
    const source = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = URL.createObjectURL(file); });
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d'); context.drawImage(source, 0, 0, 256, 256);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  };
  const runSearch = async (event) => {
    event?.preventDefault();
    if (!imageFile) { setStatus('先に画像を選択、ドロップ、または貼り付けてください。', true); return; }
    const sites = selectedSites();
    if (!sites.length) { setStatus('検索先を1つ以上選択してください。', true); return; }
    searchButton.disabled = true;
    results.innerHTML = '';
    setStatus('画像を検索しています…'); bar.busy('検索中');
    try {
      const blob = await normalizeImage(imageFile);
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      const response = await fetch('/api/anime-search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl, sites }), signal: AbortSignal.timeout(45000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || `検索に失敗しました (${response.status})`);
      renderResults(payload);
      setStatus((payload.note ? payload.note + ' ' : '') + '検索結果を表示しました。pixivの作品はMixAll内のビューアで開きます。');
    } catch (error) {
      results.innerHTML = '<p class="error">検索結果を取得できませんでした。</p>';
      setStatus(`画像検索に失敗しました: ${error.message}`, true);
    } finally { searchButton.disabled = false; bar.hide(); }
  };
  input.addEventListener('change', () => setImage(input.files?.[0]));
  drop.addEventListener('click', () => input.click());
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', (event) => setImage(event.dataTransfer.files?.[0]));
  document.addEventListener('paste', (event) => { const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith('image/')); if (file) setImage(file); });
  blur.addEventListener('change', () => results.querySelectorAll('.anime-result-image').forEach((element) => { if (blur.checked && element.dataset.nsfw === '1') element.classList.add('is-nsfw'); }));
  form.addEventListener('submit', runSearch);
})();
