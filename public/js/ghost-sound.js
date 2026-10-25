// Ghostの「音源」: 動画の音声を、ほかの投稿(動画・画像)で使えるようにする(YouTubeショートの「このサウンドを使用する」相当)。
// 使った投稿は soundPostId(元の音源の投稿ID)を持ち、再生時に元動画の音声を同期して流す。
(function () {
  const css = document.createElement('style');
  css.textContent = '.ghost-sound-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;margin:6px 0;padding:4px 12px;border:1px solid var(--border);border-radius:999px;font-size:.85rem;color:var(--accent);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ghost-sound-play{margin:6px 0}';
  document.head.appendChild(css);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cache = new Map();
  const token = () => { try { return (window.Netrify && Netrify.getSession && Netrify.getSession() || {}).token || ''; } catch (_) { return ''; } };
  const isSoundMedia = (m) => m && (m.kind === 'videoBlob' || m.kind === 'videoFile' || (m.kind === 'videoUrl' && !/youtu\.?be/i.test(String(m.url || ''))));
  function rootIdOf(p) {
    if (!p) return '';
    if (p.soundPostId) return p.soundPostId;
    return (p.media || []).some(isSoundMedia) ? p.id : '';
  }
  function chipHtml(p) {
    const root = rootIdOf(p);
    if (!root || p.deleted) return '';
    const name = p.authorProfile?.displayName || p.authorName || '';
    const label = p.soundPostId ? '♪ 使用している音源' : '♪ オリジナル音源' + (name ? ' · ' + name : '');
    return '<a class="ghost-sound-chip" href="/Ghost/sound.html?id=' + encodeURIComponent(root) + '">' + esc(label) + '</a>';
  }
  function sourceUrl(post) {
    const m = (post.media || []).find(isSoundMedia);
    if (!m) return '';
    return m.kind === 'videoBlob' ? (m.mediaUrl || '') : m.kind === 'videoFile' ? (m.dataUrl || '') : (m.url || '');
  }
  async function loadSource(id) {
    if (cache.has(id)) return cache.get(id);
    const job = (async () => {
      const t = token();
      const r = await fetch('/api/ghost?post=' + encodeURIComponent(id) + (t ? '&token=' + encodeURIComponent(t) : ''));
      const d = await r.json();
      if (!r.ok || !d.post || d.post.deleted) return null;
      return { post: d.post, url: sourceUrl(d.post) };
    })().catch(() => null);
    cache.set(id, job);
    return job;
  }
  // container内の<video>を無音にして、元動画の音声を同期再生する。動画が無い投稿(画像)には再生ボタンを出す。
  async function bind(container, post, opts) {
    opts = opts || {};
    if (!container || !post || !post.soundPostId || container.dataset.soundBound) return;
    container.dataset.soundBound = '1';
    const mutedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    container.querySelectorAll('video').forEach((v) => mutedDesc.set.call(v, true)); // 読み込み中も元動画の音は出さない
    const src = await loadSource(post.soundPostId);
    if (!src || !src.url) return;
    const audio = new Audio(src.url); audio.preload = 'none'; audio.loop = true;
    const videos = Array.from(container.querySelectorAll('video'));
    const sync = (v) => { const d = audio.duration; const t = v.currentTime || 0; const target = d && isFinite(d) ? t % d : t; if (Math.abs(audio.currentTime - target) > 0.35) { try { audio.currentTime = target; } catch (_) {} } };
    if (videos.length) {
      audio.loop = false;
      videos.forEach((v) => {
        // 動画自体の音は常に無音にして、元の音源だけを鳴らす。
        const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
        let want = opts.mirrorMuted ? (v.defaultMuted || v.muted) : false;
        desc.set.call(v, true);
        audio.muted = want;
        if (opts.mirrorMuted) {
          // ショート画面のミュート切替(video.muted = …)を、音源側のミュートに反映する
          Object.defineProperty(v, 'muted', { configurable: true, get() { return want; }, set(x) { want = !!x; audio.muted = want; } });
        }
        v.addEventListener('play', () => { sync(v); audio.play().catch(() => {}); });
        v.addEventListener('pause', () => audio.pause());
        v.addEventListener('ended', () => audio.pause());
        v.addEventListener('seeked', () => sync(v));
        v.addEventListener('waiting', () => audio.pause());
        v.addEventListener('playing', () => { sync(v); audio.play().catch(() => {}); });
        v.addEventListener('timeupdate', () => sync(v));
        v.addEventListener('volumechange', () => { audio.volume = v.volume; if (!opts.mirrorMuted && !desc.get.call(v)) { audio.muted = false; desc.set.call(v, true); } });
      });
    } else {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'ghost ghost-sound-play'; btn.textContent = '♪ 音源を再生';
      btn.onclick = () => { if (audio.paused) { audio.play().catch(() => {}); btn.textContent = '■ 音源を停止'; } else { audio.pause(); btn.textContent = '♪ 音源を再生'; } };
      container.appendChild(btn);
    }
  }
  window.GhostSound = { chipHtml, bind, rootIdOf, loadSource, sourceUrl, isSoundMedia };
})();
