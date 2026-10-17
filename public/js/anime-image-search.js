(() => {
  const root = document.getElementById('animeImageSearch');
  if (!root) return;
  const drop = root.querySelector('[data-anime-drop]');
  const input = root.querySelector('[data-anime-file]');
  const preview = root.querySelector('[data-anime-preview]');
  const status = root.querySelector('[data-anime-status]');
  const results = root.querySelector('[data-anime-results]');
  const form = root.querySelector('form');
  const searchButton = root.querySelector('[data-anime-search]');
  const blur = root.querySelector('[data-anime-blur]');
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
      const image = item.cdn_path ? `https://cdn.onegai.moe/${String(item.cdn_path).replace(/^\/+/, '')}` : (item.thumbnail || item.image || '');
      const href = item.url || image || '#';
      const score = Number(item.nsfw_score || 0);
      const isBlurred = blur.checked && score > 0.85;
      return `<article class="anime-result"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="anime-result-image${isBlurred ? ' is-nsfw' : ''}" data-nsfw="${isBlurred ? '1' : '0'}"><img src="${esc(image)}" alt="${esc(item.title || '検索結果')}" loading="lazy">${isBlurred ? '<span>クリックで表示</span>' : ''}</a><a class="anime-result-title" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.site_instance || '結果を開く')}</a><small class="muted">${esc(item.site_instance || '')}</small></article>`;
    }).join('');
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
    setStatus('画像を検索しています…');
    try {
      const body = new FormData();
      body.set('image', await normalizeImage(imageFile), 'search.png');
      body.set('sites', sites.join(','));
      const response = await fetch('https://api.onegai.moe/search', { method: 'POST', body, signal: AbortSignal.timeout(30000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || `検索に失敗しました (${response.status})`);
      renderResults(payload);
      setStatus('検索結果を表示しました。画像をクリックすると元サイトを開けます。');
    } catch (error) {
      results.innerHTML = '<p class="error">検索結果を取得できませんでした。</p>';
      setStatus(`画像検索に失敗しました: ${error.message}`, true);
    } finally { searchButton.disabled = false; }
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
