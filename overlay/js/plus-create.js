// js/plus-create.js（MixAll +（二世代））: クリエイタースタジオ（/Create/）に足す機能
// 中身は public/js/creative-studio.js（scripts/patches/studio.mjs の置き換えで window.__studio を出している）を使う。
// - 文字の大きさ・色・フォント・太さを設定欄で変える（?tool=text で来たら文字入力欄にカーソル）
// - キャンバスの形（横長・縦長・正方形）
// - ショートカット（Delete・Ctrl+D・矢印・Esc・Ctrl+Y）。入力欄では無効
// - 「Ghostに投稿」（いま見ている時点の PNG か、書き出した動画）
// - 端末に保存した作品の削除・複製・名前変更
// - 写真の追加をタップでも（ドロップ欄を押すとファイル選択）
(function () {
  'use strict';
  const S = window.__studio;
  if (!S || window.__plusCreate) return;
  window.__plusCreate = true;
  const $ = (id) => document.getElementById(id);
  const P = window.MixAllPlus || {};
  const esc = P.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, o) => (P.toast ? P.toast(m, o) : S.notify(m));
  const session = () => { try { return (P.session && P.session()) || JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const ask = {
    confirm: (m, o) => (window.MixAllDialog ? window.MixAllDialog.confirm(m, o) : Promise.resolve(window.confirm(m))),
    prompt: (m, v, o) => (window.MixAllDialog ? window.MixAllDialog.prompt(m, v, o) : Promise.resolve(window.prompt(m, v)))
  };
  const hooks = window.__studioHooks = window.__studioHooks || {};

  // ===== 文字の見た目（設定欄） =====
  const FONTS = [
    ['sans-serif', '標準'],
    ['"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif', 'ゴシック'],
    ['"Hiragino Mincho ProN","Noto Serif JP","Yu Mincho",serif', '明朝'],
    ['"Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Kosugi Maru",sans-serif', '丸ゴシック'],
    ['"Klee One","Comic Sans MS",cursive', '手書き風'],
    ['monospace', '等幅']
  ];
  const WEIGHTS = [[400, '標準'], [700, '太字'], [900, '極太']];
  hooks.inspector = (host, l) => {
    if (!l || l.kind !== 'text') return;
    const font = l.font || 'sans-serif', weight = Number(l.weight || 700), size = Number(l.fontSize || 58);
    const fonts = FONTS.some(([v]) => v === font) ? FONTS : [...FONTS, [font, 'その他']];
    const box = document.createElement('div');
    box.className = 'pc-textstyle';
    box.innerHTML = `<div class="mini-row"><label>文字サイズ</label><input type="range" min="12" max="240" value="${size}" data-pc="fontSize" aria-label="文字サイズ"><output>${size}</output></div>`
      + `<div class="mini-row"><label>文字の色</label><input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#202633')}" data-pc="color" aria-label="文字の色"></div>`
      + `<div class="mini-row"><label>フォント</label><select data-pc="font" aria-label="フォント">${fonts.map(([v, n]) => `<option value="${esc(v)}"${v === font ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`
      + `<div class="mini-row"><label>太さ</label><select data-pc="weight" aria-label="文字の太さ">${WEIGHTS.map(([v, n]) => `<option value="${v}"${v === weight ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
    // 文字入力欄（#editText）のすぐ上に置く
    const edit = host.querySelector('#editText');
    if (edit) host.insertBefore(box, edit); else host.appendChild(box);
    box.querySelectorAll('[data-pc]').forEach((input) => input.addEventListener('input', () => {
      S.snapOnce(input);
      const key = input.dataset.pc;
      if (key === 'fontSize') { l.fontSize = Math.max(8, Math.min(400, Number(input.value) || 58)); input.nextElementSibling.textContent = l.fontSize; }
      else if (key === 'weight') l.weight = Number(input.value) || 700;
      else l[key] = input.value;
      S.fitText(l); S.queueRender(); S.scheduleSave();
    }));
  };

  // ===== キャンバスの形 =====
  const SHAPES = [['1280x720', '横長 1280×720'], ['720x1280', '縦長 720×1280'], ['1080x1080', '正方形 1080×1080']];
  const stageLabel = document.querySelector('.stage-panel .panel-head h2 small');
  let shapeSelect = null;
  if (stageLabel) {
    stageLabel.textContent = '';
    shapeSelect = document.createElement('select');
    shapeSelect.className = 'pc-shape';
    shapeSelect.setAttribute('aria-label', 'キャンバスの形');
    shapeSelect.innerHTML = SHAPES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
    stageLabel.appendChild(shapeSelect);
    shapeSelect.addEventListener('change', () => {
      const [w, h] = shapeSelect.value.split('x').map(Number), ow = S.W, oh = S.H;
      if (w === ow && h === oh) return;
      S.snapshot();
      // 素材は中心の位置を比率で移し、はみ出す大きさなら縮める
      for (const l of S.project.layers) {
        if (!S.boxable({ ...l, visible: true }) || l.w == null) continue;
        const bw = l.w || 0, bh = l.h || 0, s = l.scale || 1;
        const cx = (l.x || 0) + bw / 2, cy = (l.y || 0) + bh / 2;
        l.x = Math.round(cx * w / ow - bw / 2); l.y = Math.round(cy * h / oh - bh / 2);
        if (bw && bh) l.scale = Math.round(Math.min(s, 0.95 * w / bw, 0.95 * h / bh) * 1000) / 1000;
      }
      S.project.canvas = { w, h };
      S.syncAll(); S.scheduleSave();
      toast(`キャンバスを${SHAPES.find(([v]) => v === shapeSelect.value)[1]}にしました`);
    });
  }
  hooks.canvas = (w, h) => {
    if (shapeSelect) shapeSelect.value = `${w}x${h}`;
    const frame = S.canvas.parentElement;
    if (frame) frame.dataset.shape = w > h ? 'landscape' : w < h ? 'portrait' : 'square';
  };
  hooks.canvas(S.W, S.H);

  // ===== 写真の追加（タップでファイル選択） =====
  const drop = $('dropzone');
  if (drop) {
    drop.setAttribute('role', 'button');
    drop.tabIndex = 0;
    if (matchMedia('(pointer: coarse)').matches) drop.innerHTML = 'タップして写真・動画・音声を選ぶ<br><small>（パソコンではここにドロップもできます）</small>';
    const pick = () => $('imageFiles') && $('imageFiles').click();
    drop.addEventListener('click', pick);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }

  // ===== ?tool=text のときは文字入力欄にカーソル =====
  if (new URLSearchParams(location.search).get('tool') === 'text') {
    const input = $('textInput');
    if (input) setTimeout(() => { input.scrollIntoView({ block: 'center' }); input.focus({ preventScroll: true }); }, 150);
  }

  // ===== つまみの上ではカーソルを変える =====
  S.canvas.addEventListener('pointermove', (e) => {
    if (e.buttons || S.tool !== 'select') return;
    const l = S.selected();
    S.canvas.style.cursor = l && S.onHandle(l, S.pointFromEvent(e), e) ? 'nwse-resize' : (S.hitTest(S.pointFromEvent(e)) ? 'move' : 'default');
  });

  // ===== ショートカット =====
  let lastArrow = 0;
  function modalOpen() { return !!document.querySelector('.modal-backdrop.open, .mixall-dialog-layer'); }
  function duplicateSelected() {
    const src = S.selected();
    if (!src) { toast('複製する素材を選んでください'); return; }
    S.snapshot();
    const { src: media, ...rest } = src; // 写真・動画のデータはコピーせず同じものを使う
    const copy = structuredClone(rest);
    if (media !== undefined) copy.src = media;
    copy.id = S.uid();
    copy.name = `${src.name || '素材'} のコピー`.slice(0, 40);
    if (copy.kind !== 'draw' && copy.kind !== 'audio') { copy.x = (copy.x || 0) + 24; copy.y = (copy.y || 0) + 24; }
    if (Array.isArray(copy.messageScripts)) copy.messageScripts.forEach((m) => { m.id = S.uid(); });
    const layers = S.project.layers;
    layers.splice(layers.indexOf(src) + 1, 0, copy);
    S.selectedId = copy.id;
    S.syncAll(); S.scheduleSave();
    toast('複製しました');
  }
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || S.typing(e) || modalOpen()) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key;
    if (mod && key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (mod && key.toLowerCase() === 'y') { e.preventDefault(); $('redo') && $('redo').click(); return; }
    if (mod || e.altKey) return;
    const l = S.selected();
    if (key === 'Delete' || key === 'Backspace') {
      if (!l) return;
      e.preventDefault(); S.deleteLayer(l.id); toast('削除しました（Ctrl+Z で元に戻せます）');
      return;
    }
    if (key === 'Escape') { if (S.selectedId) { S.selectedId = null; S.syncAll(); } return; }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (dir && l && l.kind !== 'draw' && l.kind !== 'audio' && l.kind !== 'background') {
      // 矢印を押している間など、続けて押したときは履歴を1回にまとめる
      if (e.target && e.target.matches && e.target.matches('input,select')) return;
      e.preventDefault();
      if (Date.now() - lastArrow > 800) S.snapshot();
      lastArrow = Date.now();
      const step = e.shiftKey ? 10 : 1;
      l.x = (l.x || 0) + dir[0] * step; l.y = (l.y || 0) + dir[1] * step;
      S.queueRender(); S.renderInspector(); S.scheduleSave();
    }
  });

  // ===== 端末に保存した作品の管理（削除・複製・名前変更） =====
  const DB_NAME = 'mixall-creative-studio', STORE = 'projects';
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbRun(mode, fn) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        let result;
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('保存できませんでした'));
      });
    } finally { db.close(); }
  }
  const getRecord = (id) => dbRun('readonly', (st) => st.get(id));
  const putRecord = (rec) => dbRun('readwrite', (st) => st.put(rec));
  const deleteRecord = (id) => dbRun('readwrite', (st) => st.delete(id));
  const refreshSaved = () => { const b = $('openSaved'); if (b) b.click(); };
  async function savedAction(action, id) {
    try {
      const rec = await getRecord(id);
      if (!rec) { toast('作品が見つかりませんでした', { kind: 'error' }); refreshSaved(); return; }
      const isCurrent = S.project.id === id;
      if (action === 'rename') {
        const name = await ask.prompt('作品の名前', rec.name || '', { icon: '✎', okLabel: '変更する' });
        if (name == null || !name.trim()) return;
        rec.name = name.trim().slice(0, 50); rec.updatedAt = Date.now();
        await putRecord(rec);
        if (isCurrent) { S.project.name = rec.name; S.syncAll(); }
        toast('名前を変更しました');
      } else if (action === 'copy') {
        const copy = { ...rec, id: S.uid(), name: `${rec.name || '無題'} のコピー`.slice(0, 50), updatedAt: Date.now() };
        await putRecord(copy);
        toast('複製しました');
      } else if (action === 'delete') {
        if (!(await ask.confirm(`「${rec.name || '無題'}」を削除しますか？\nこの端末から消え、元に戻せません。${isCurrent ? '\n（いま開いている作品です。削除すると新しい作品になります）' : ''}`, { okLabel: '削除する', danger: true }))) return;
        await deleteRecord(id);
        if (isCurrent) {
          try { localStorage.removeItem('mixallCreativeLastProject'); } catch (_) { /* 無視 */ }
          S.project = S.freshProject(); S.selectedId = null; S.clearHistory(); S.syncAll();
        }
        toast('削除しました');
      }
      refreshSaved();
    } catch (err) { toast('操作できませんでした: ' + (err && err.message || err), { kind: 'error' }); }
  }
  const savedList = $('savedList');
  if (savedList) {
    const enhance = () => {
      savedList.querySelectorAll('.layer-row').forEach((row) => {
        const open = row.querySelector('.open-project');
        if (!open || row.querySelector('.pc-saved-actions')) return;
        const id = open.dataset.project;
        if (id === S.project.id) row.querySelector('.layer-title')?.insertAdjacentHTML('beforeend', ' <em class="pc-current">編集中</em>');
        const box = document.createElement('span');
        box.className = 'pc-saved-actions';
        box.innerHTML = '<button type="button" data-act="rename" title="名前を変更">名前</button><button type="button" data-act="copy" title="複製">複製</button><button type="button" data-act="delete" class="pc-danger" title="削除">削除</button>';
        box.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) savedAction(b.dataset.act, id); });
        row.classList.add('pc-saved-row');
        row.appendChild(box);
      });
    };
    new MutationObserver(enhance).observe(savedList, { childList: true });
  }

  // ===== Ghost に投稿 =====
  const head = document.querySelector('.head-actions');
  const ghostBtn = document.createElement('button');
  ghostBtn.type = 'button'; ghostBtn.id = 'pcGhostPost'; ghostBtn.className = 'pc-ghost-btn';
  ghostBtn.title = 'いま見ている画面（または書き出した動画）を Ghost に投稿';
  ghostBtn.textContent = 'Ghostに投稿';
  if (head) head.insertBefore(ghostBtn, $('exportPng') || null);
  hooks.exported = () => { ghostBtn.classList.add('pc-has-video'); };

  async function ghostApi(body) {
    if (window.Netrify && window.Netrify.api) return window.Netrify.api('/api/ghost', body);
    const res = await fetch('/api/ghost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `エラー (${res.status})`);
    return data;
  }
  // Ghost の画面（Ghost/index.html の uploadGhostMedia）と同じ: 256KB ずつ uploadGhostMediaChunk で送り、mediaStatus で完了を確かめる
  async function uploadGhostMedia(blob, name, s, onProgress) {
    const mimeType = String(blob.type || '').split(';')[0];
    if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(mimeType)) throw new Error('画像・動画の種類を判別できません');
    if (!blob.size) throw new Error('ファイルが空です');
    if (mimeType.startsWith('image/') && blob.size > 15 * 1024 * 1024) throw new Error('画像は15MBまでです');
    const fileId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const chunkBytes = 256 * 1024, totalChunks = Math.ceil(blob.size / chunkBytes);
    for (let index = 0; index < totalChunks; index += 1) {
      const chunk = blob.slice(index * chunkBytes, Math.min(blob.size, (index + 1) * chunkBytes));
      const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(new Error('ファイルを読み込めませんでした')); r.readAsDataURL(chunk); });
      let sent = false;
      for (let attempt = 1; attempt <= 3 && !sent; attempt += 1) {
        try { await ghostApi({ action: 'uploadGhostMediaChunk', token: s.token, fileId, index, totalChunks, data, mimeType, sizeBytes: blob.size, chunkBytes }); sent = true; }
        catch (error) { if (attempt === 3) throw new Error(error.message || 'アップロードに失敗しました'); await new Promise((r) => setTimeout(r, 300 * attempt)); }
      }
      onProgress && onProgress((index + 1) / totalChunks);
    }
    const verify = await fetch('/api/ghost?mediaStatus=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(s.token));
    const v = verify.ok ? await verify.json() : null;
    if (!v || !v.complete || (v.received || []).length !== totalChunks) throw new Error('アップロード完了を確認できませんでした。もう一度お試しください');
    return { kind: mimeType.startsWith('image/') ? 'imageBlob' : 'videoBlob', fileId, size: blob.size, name, mimeType };
  }
  function hashtags(text) {
    const tags = [], re = /#([\p{L}\p{N}_-]{1,40})/gu;
    for (let m; (m = re.exec(String(text || '')));) { const t = m[1].toLowerCase(); if (!tags.includes(t)) tags.push(t); }
    return tags.slice(0, 12);
  }
  function loadScript(src) {
    return new Promise((resolve) => { if (window.GhostOgp) { resolve(); return; } const sc = document.createElement('script'); sc.src = src; sc.onload = resolve; sc.onerror = resolve; document.head.appendChild(sc); });
  }
  function toastLink(message, url) {
    toast(`${message}: ${url}`, { sticky: true });
    // トーストの URL を押せるリンクにする
    const nodes = document.querySelectorAll('.mixall-toast-text');
    const node = nodes[nodes.length - 1];
    if (node && node.textContent.includes(url)) node.innerHTML = `${esc(message)}: <a href="${esc(url)}" class="pc-toast-link">投稿を見る</a>`;
  }
  const safeName = () => (S.project.name || 'MixAll作品').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50) || 'MixAll作品';

  let preparing = false;
  ghostBtn.addEventListener('click', async () => {
    // 二重に開かない（画像づくりに時間がかかる端末で何度も押されたとき）
    if (preparing || document.querySelector('.pc-ghost-modal')) return;
    const s = session();
    if (!s || !s.token) {
      if (await ask.confirm('Ghost に投稿するにはログインが必要です。\nログイン画面に移りますか？（作品はこの端末に自動保存されています）', { okLabel: 'ログインする', danger: false })) {
        S.saveToDevice(true);
        if (window.Netrify && window.Netrify.requireLogin) window.Netrify.requireLogin(); else location.href = '/login/';
      }
      return;
    }
    if (S.playing) S.stopPlayback(false);
    preparing = true;
    let png = null;
    try { png = await S.pngBlob(); } finally { preparing = false; }
    if (!png) { toast('画像を作れませんでした', { kind: 'error' }); return; }
    openGhostModal(s, png);
  });

  function openGhostModal(s, png) {
    const video = S.lastExport;
    const pngUrl = URL.createObjectURL(png), videoUrl = video ? URL.createObjectURL(video.blob) : '';
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop open pc-ghost-modal';
    wrap.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="pcGhostTitle">
      <h2 id="pcGhostTitle">Ghostに投稿</h2>
      <div class="pc-ghost-kind" role="radiogroup" aria-label="投稿するもの">
        <label><input type="radio" name="pcGhostKind" value="png" checked> いまの画面（PNG・${S.now.toFixed(1)}秒の時点）</label>
        <label class="${video ? '' : 'pc-disabled'}"><input type="radio" name="pcGhostKind" value="video" ${video ? '' : 'disabled'}> 書き出した動画${video ? `（${(video.blob.size / 1024 / 1024).toFixed(1)}MB）` : '（先に「動画を書き出す」を押すと選べます）'}</label>
      </div>
      <div class="pc-ghost-preview"><img src="${pngUrl}" alt="投稿する画像">${video ? `<video src="${videoUrl}" controls playsinline preload="metadata" hidden></video>` : ''}</div>
      <label class="pc-ghost-field">タイトル<span class="pc-ghost-need">（動画は必須）</span><input type="text" maxlength="160" class="pc-ghost-title" value="${esc(S.project.name || '')}"></label>
      <label class="pc-ghost-field">本文<textarea rows="4" maxlength="5000" class="pc-ghost-text" placeholder="作品のひとこと。#タグ も使えます"></textarea></label>
      <p class="pc-ghost-status" aria-live="polite"></p>
      <div class="modal-actions"><button type="button" class="subtle pc-ghost-cancel">やめる</button><button type="button" class="primary pc-ghost-send">投稿する</button></div>
    </section>`;
    document.body.appendChild(wrap);
    const q = (sel) => wrap.querySelector(sel);
    const status = q('.pc-ghost-status'), send = q('.pc-ghost-send');
    let busy = false;
    const close = () => { if (busy) return; wrap.remove(); URL.revokeObjectURL(pngUrl); if (videoUrl) URL.revokeObjectURL(videoUrl); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    q('.pc-ghost-cancel').onclick = close;
    const kind = () => (wrap.querySelector('input[name=pcGhostKind]:checked') || {}).value || 'png';
    wrap.querySelectorAll('input[name=pcGhostKind]').forEach((r) => r.addEventListener('change', () => {
      const isVideo = kind() === 'video';
      q('.pc-ghost-preview img').hidden = isVideo;
      if (q('.pc-ghost-preview video')) q('.pc-ghost-preview video').hidden = !isVideo;
      q('.pc-ghost-need').hidden = !isVideo;
    }));
    q('.pc-ghost-need').hidden = true;
    setTimeout(() => q('.pc-ghost-text').focus(), 50);
    send.onclick = async () => {
      const isVideo = kind() === 'video';
      const title = q('.pc-ghost-title').value.trim(), text = q('.pc-ghost-text').value.trim();
      if (isVideo && !title) { status.textContent = '動画のタイトルを入力してください'; q('.pc-ghost-title').focus(); return; }
      busy = true; send.disabled = true; send.textContent = '投稿中…';
      try {
        const blob = isVideo ? video.blob : png;
        const ext = isVideo ? (/mp4/.test(blob.type) ? 'mp4' : 'webm') : 'png';
        const name = `${safeName()}.${ext}`;
        status.textContent = 'アップロード中 0%';
        const media = await uploadGhostMedia(blob, name, s, (r) => { status.textContent = `アップロード中 ${Math.round(r * 100)}%`; });
        status.textContent = '投稿しています…';
        const portrait = (isVideo ? video.h > video.w : S.H > S.W);
        const contentType = isVideo ? (portrait ? 'short' : 'video') : 'illustration';
        const created = await ghostApi({ action: 'createPost', token: s.token, displayName: s.displayName, title, text, media: [media], contentType, tags: hashtags(`${title} ${text}`) });
        const post = created && created.post;
        if (!post || !post.id) throw new Error('投稿の結果を受け取れませんでした');
        busy = false; close();
        toastLink('Ghostに投稿しました', `${location.origin}/Ghost/post.html?id=${encodeURIComponent(post.id)}`);
        // リンクプレビュー用の画像（Ghost の画面と同じく、作れなくても投稿には影響しない）
        if (!isVideo) loadScript('/js/ghost-ogp.js').then(() => window.GhostOgp && window.GhostOgp.ensure(post, s)).catch(() => {});
      } catch (err) {
        busy = false; send.disabled = false; send.textContent = '投稿する';
        status.textContent = '投稿できませんでした: ' + (err && err.message || err);
      }
    };
  }

  // このファイルより前に作品が読み込まれて文字が選ばれていたときも、文字の設定欄を出す
  S.renderInspector();
})();
