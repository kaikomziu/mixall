// Ghostプロフィールの「アイコン」と「カバー」。選んだ画像をブラウザ内で切り抜き・縮小(JPEG)してから保存する。
(function () {
  const SPEC = { avatar: { w: 320, h: 320 }, cover: { w: 1200, h: 400 } };
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
      img.src = url;
    });
  }
  async function resize(file, kind) {
    if (!file || !/^image\//.test(file.type)) throw new Error('画像ファイルを選んでください');
    const { w, h } = SPEC[kind];
    const img = await readImage(file);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const scale = Math.max(w / img.width, h / img.height); // 中央を切り抜いて全面に敷く
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    for (const q of [0.88, 0.78, 0.66, 0.5]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length < 600 * 1024) return url;
    }
    return canvas.toDataURL('image/jpeg', 0.4);
  }
  async function upload(file, kind, token) {
    const dataUrl = await resize(file, kind);
    return Netrify.api('/api/ghost', { action: 'saveGhostImage', token, kind, dataUrl });
  }
  function remove(kind, token) { return Netrify.api('/api/ghost', { action: 'removeGhostImage', token, kind }); }
  function avatarHtml(url, size, name) {
    const s = size || 28;
    if (url) return '<img src="' + String(url).replace(/"/g, '&quot;') + '" alt="" style="width:' + s + 'px;height:' + s + 'px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;background:var(--panel-2)">';
    const ch = String(name || '?').trim().charAt(0) || '?';
    return '<span style="display:inline-grid;place-items:center;width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:var(--panel-2);vertical-align:middle;margin-right:6px;font-size:' + Math.round(s * 0.5) + 'px">' + ch.replace(/[<>&"]/g, '') + '</span>';
  }
  window.GhostProfileImg = { resize, upload, remove, avatarHtml };
})();
