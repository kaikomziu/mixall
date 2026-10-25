// Ghost投稿のOGP画像(1200x630)を作る。先頭の画像を全面に敷き、右下に「MixAll Ghost」ロゴを重ねる。
// 作った画像は setOgpImage で保存され、/Ghost/post/<id> や /Ghost/post.html?id=<id> のリンクプレビューに使われる。
(function () {
  const W = 1200, H = 630;
  function loadImage(src, cors) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = src;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  async function build(src) {
    const img = await loadImage(src, /^https?:/i.test(src) && !src.startsWith(location.origin));
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f1115'; ctx.fillRect(0, 0, W, H);
    // 背景: ぼかした拡大画像(縦長・横長どちらでも余白が自然になる)
    const cover = Math.max(W / img.width, H / img.height);
    ctx.filter = 'blur(28px) brightness(.7)';
    ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
    ctx.filter = 'none';
    // 本体: 画像全体が見える大きさで中央に(切れすぎ防止)。横長に近い画像は全面に敷く。
    const ratio = img.width / img.height;
    const fit = ratio > 1.4 || ratio < 0.7 ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height);
    const dw = img.width * fit, dh = img.height * fit;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    // 右下ロゴ
    let icon = null;
    try { icon = await loadImage('/icons/icon-192.png', false); } catch (_) {}
    const pad = 28, bh = 76, iconS = 52;
    ctx.font = '800 34px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif';
    const mix = 'Mix', all = 'All', ghost = ' Ghost';
    const tw = ctx.measureText(mix + all + ghost).width;
    const bw = Math.round((icon ? iconS + 14 : 0) + tw + 40);
    const bx = W - pad - bw, by = H - pad - bh;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(15,17,21,.86)'; roundRect(ctx, bx, by, bw, bh, 22); ctx.fill();
    ctx.restore();
    let x = bx + 20;
    if (icon) { ctx.save(); roundRect(ctx, x, by + (bh - iconS) / 2, iconS, iconS, 12); ctx.clip(); ctx.drawImage(icon, x, by + (bh - iconS) / 2, iconS, iconS); ctx.restore(); x += iconS + 14; }
    ctx.textBaseline = 'middle';
    const cy = by + bh / 2 + 1;
    ctx.fillStyle = '#ffffff'; ctx.fillText(mix, x, cy); x += ctx.measureText(mix).width;
    ctx.fillStyle = '#7aa2ff'; ctx.fillText(all, x, cy); x += ctx.measureText(all).width;
    ctx.fillStyle = '#e6e8ec'; ctx.fillText(ghost, x, cy);
    for (const q of [0.88, 0.8, 0.7, 0.55]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length < 780 * 1024) return url;
    }
    return canvas.toDataURL('image/jpeg', 0.4);
  }
  function firstImageSrc(post, token) {
    const m = (post.media || []).find((x) => x.kind === 'image' || x.kind === 'imageBlob' || x.kind === 'imageUrl');
    if (!m) return '';
    if (m.kind === 'image') return m.dataUrl || '';
    if (m.kind === 'imageUrl') return m.url || '';
    return m.mediaUrl || (m.fileId ? '/api/ghost?media=' + encodeURIComponent(m.fileId) + '&size=' + encodeURIComponent(m.size || 0) + '&token=' + encodeURIComponent(token || '') : '');
  }
  // 画像つき投稿のOGPがまだ無ければ作って保存する(投稿者・運営のみ)。失敗しても画面には影響させない。
  async function ensure(post, session) {
    try {
      if (!post || post.ogpAt || !session) return false;
      if (!(session.email === post.authorEmail || session.isAdmin === true)) return false;
      const src = firstImageSrc(post, session.token);
      if (!src) return false;
      const dataUrl = await build(src);
      await Netrify.api('/api/ghost', { action: 'setOgpImage', token: session.token, postId: post.id, dataUrl });
      return true;
    } catch (_) { return false; }
  }
  window.GhostOgp = { build, ensure, firstImageSrc };
})();
