// scripts/patches/studio.mjs
// クリエイタースタジオ（/Create/、public/js/creative-studio.js）を「ちゃんと使える」ようにする置き換え。
// 友人のファイルは直接変えず、ビルド時にここで置き換える。画面に足す部品は overlay/js/plus-create.js・overlay/css/plus-create.css。
// 置き換え元は creative-studio.js からそのまま写した短い文字列（形が変わるとビルドで ⚠ が出る）。

// creative-studio.js の中（即時関数の中）に差し込むコード。
// 関数として書いて toString() で本文を取り出す（ここでは実行しない。project・ctx などは差し込み先の変数）。
/* eslint-disable no-undef */
function injected() {
  // ---- ここから MixAll + の追加分（scripts/patches/studio.mjs が差し込む） ----

  // 元に戻すの履歴: 写真・動画・音声のデータ（src）は ID で共有し、履歴の文字列には ID だけ入れる
  var __mediaIds = new Map(), __mediaById = new Map();
  function __pack(k, v) {
    if (k === 'src' && typeof v === 'string' && v.length > 1024) {
      let id = __mediaIds.get(v);
      if (!id) { id = '@media:' + __mediaIds.size; __mediaIds.set(v, id); __mediaById.set(id, v); }
      return id;
    }
    return v;
  }
  function __serialize() { return JSON.stringify(project, __pack); }
  function __revive(k, v) { return k === 'src' && typeof v === 'string' && v.startsWith('@media:') ? (__mediaById.get(v) ?? '') : v; }
  // 入力欄・つまみは動かし始めに1回だけ履歴を取る（手を離す change で次の操作に備える）
  function __snapOnce(el) {
    if (!el || el.__snapped) return;
    snapshot(); el.__snapped = true;
    el.addEventListener('change', () => { el.__snapped = false; }, { once: true });
    el.addEventListener('blur', () => { el.__snapped = false; }, { once: true });
  }

  // キャンバスの形（横長・縦長・正方形）
  var __SHAPES = { '1280x720': 1, '720x1280': 1, '1080x1080': 1 };
  function __validCanvas(c) { return c && __SHAPES[(+c.w) + 'x' + (+c.h)] ? { w: +c.w, h: +c.h } : undefined; }
  function __applyCanvas() {
    const c = __validCanvas(project.canvas) || { w: 1280, h: 720 };
    if (c.w !== W || c.h !== H || canvas.width !== c.w || canvas.height !== c.h) {
      W = c.w; H = c.h; canvas.width = W; canvas.height = H; drawCache.clear();
    }
    const frame = canvas.parentElement;
    if (frame) {
      frame.style.aspectRatio = W + ' / ' + H;
      frame.style.width = 'min(100%, 920px, calc(var(--pc-stage-h, 64vh) * ' + (W / H).toFixed(4) + '))';
    }
    try { window.__studioHooks?.canvas?.(W, H); } catch (err) { console.warn(err); }
  }

  // 文字の幅・高さを文字に合わせる（中心はそのまま）
  function __fitText(l) {
    if (!l || l.kind !== 'text') return;
    const fs = Number(l.fontSize) || 58, lines = String(l.text || '文字').split('\n');
    ctx.save();
    ctx.font = (l.weight || 700) + ' ' + fs + 'px ' + (l.font || 'sans-serif');
    let tw = 0; for (const line of lines) tw = Math.max(tw, ctx.measureText(line).width);
    ctx.restore();
    const nw = Math.max(40, Math.ceil(tw + fs * 0.5)), nh = Math.max(30, Math.ceil(lines.length * fs * 1.18 + fs * 0.3));
    if (nw === l.w && nh === l.h) return;
    const cx = (l.x || 0) + (l.w || nw) / 2, cy = (l.y || 0) + (l.h || nh) / 2;
    l.w = nw; l.h = nh; l.x = Math.round(cx - nw / 2); l.y = Math.round(cy - nh / 2);
  }
  function __fitAllText() { for (const l of project.layers) if (l.kind === 'text') __fitText(l); }

  // 見た目と同じ「中心基準の拡大・回転」で、選択枠・タップ判定・つまみを計算する
  function __px(n) { const r = canvas.getBoundingClientRect(); return n * W / (r.width || W); }
  function __boxable(l) { return !!(l && l.visible && !['draw', 'background', 'audio'].includes(l.kind)); }
  function __box(l, fx) {
    fx = fx || identityEffect();
    let w, h;
    if (l.kind === 'image') { const im = getImage(l.src); w = l.w || im.naturalWidth || 100; h = l.h || im.naturalHeight || 100; }
    else if (l.kind === 'video') { w = l.w || 640; h = l.h || 360; }
    else { w = l.w || 360; h = l.h || 150; }
    return { cx: (l.x || 0) + w / 2 + fx.x, cy: (l.y || 0) + h / 2 + fx.y, w, h, s: (l.scale || 1) * fx.scale, rot: ((l.rotation || 0) + fx.rotation) * Math.PI / 180 };
  }
  function __local(b, p) {
    const dx = p.x - b.cx, dy = p.y - b.cy, c = Math.cos(-b.rot), sn = Math.sin(-b.rot);
    return { x: dx * c - dy * sn, y: dx * sn + dy * c };
  }
  function __handlePos(b) {
    const X = b.w * b.s / 2, Y = b.h * b.s / 2;
    return { x: b.cx + Math.cos(b.rot) * X - Math.sin(b.rot) * Y, y: b.cy + Math.sin(b.rot) * X + Math.cos(b.rot) * Y };
  }
  function hitTest(p) {
    const fxs = effectStatesAt(now), pad = __px(8);
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const l = project.layers[i];
      if (!__boxable(l)) continue;
      if (l.kind === 'video' && !(now >= Number(l.start || 0) && now <= Number(l.end || project.duration))) continue;
      const b = __box(l, fxs.get(l.id)), q = __local(b, p);
      if (Math.abs(q.x) <= b.w * b.s / 2 + pad && Math.abs(q.y) <= b.h * b.s / 2 + pad) return l;
    }
    return null;
  }
  function renderSelection() {
    const l = selected();
    if (!__boxable(l)) return;
    const b = __box(l, effectStatesAt(now).get(l.id)), hw = b.w * b.s / 2, hh = b.h * b.s / 2, k = __px(1), r = 7 * k;
    ctx.save();
    ctx.translate(b.cx, b.cy); ctx.rotate(b.rot);
    ctx.strokeStyle = '#687fff'; ctx.lineWidth = 2 * k; ctx.setLineDash([8 * k, 5 * k]);
    ctx.strokeRect(-hw - 3 * k, -hh - 3 * k, hw * 2 + 6 * k, hh * 2 + 6 * k);
    ctx.setLineDash([]); ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.rect(hw - r, hh - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function __onHandle(l, p, e) {
    if (!__boxable(l)) return false;
    const h = __handlePos(__box(l, effectStatesAt(now).get(l.id)));
    return Math.hypot(p.x - h.x, p.y - h.y) <= __px(e && e.pointerType === 'mouse' ? 12 : 24);
  }
  function __startResize(l, p) {
    const b = __box(l, effectStatesAt(now).get(l.id));
    dragLayer = { layer: l, mode: 'resize', start: p, scale: l.scale || 1, cx: b.cx, cy: b.cy, dist: Math.max(1, Math.hypot(p.x - b.cx, p.y - b.cy)), snapped: false };
  }
  // ドラッグ: 動かし始め（少し動いたとき）に1回だけ履歴を取る。ただのタップでは履歴を増やさない
  function __dragMove(p) {
    const d = dragLayer, l = d.layer;
    if (!d.snapped) {
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < __px(3)) return;
      snapshot(); d.snapped = true;
    }
    if (d.mode === 'resize') l.scale = Math.round(Math.max(0.05, Math.min(20, d.scale * Math.hypot(p.x - d.cx, p.y - d.cy) / d.dist)) * 1000) / 1000;
    else { l.x = d.x + p.x - d.start.x; l.y = d.y + p.y - d.start.y; }
    queueRender(); renderInspector();
  }
  // 2本指: 選択中の素材を拡大・回転・移動
  var __ptrs = new Map(), __pinchState = null;
  function __startPinch() {
    const l = selected(), wasSnapped = !!(dragLayer && dragLayer.snapped);
    dragLayer = null;
    const pts = [...__ptrs.values()];
    if (!__boxable(l) || pts.length < 2) { __pinchState = { layer: null }; return; }
    const [a, b] = pts;
    __pinchState = { layer: l, d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: l.x || 0, y: l.y || 0, scale: l.scale || 1, rot: l.rotation || 0, snapped: wasSnapped };
  }
  function __pinchMove() {
    const s = __pinchState;
    if (!s || !s.layer) return;
    const [a, b] = [...__ptrs.values()];
    if (!a || !b) return;
    if (!s.snapped) { snapshot(); s.snapped = true; }
    const l = s.layer, d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    l.scale = Math.round(Math.max(0.05, Math.min(20, s.scale * d / s.d)) * 1000) / 1000;
    const r = s.rot + (ang - s.a) * 180 / Math.PI;
    l.rotation = Math.round((((r + 180) % 360 + 360) % 360 - 180) * 10) / 10;
    l.x = s.x + (a.x + b.x) / 2 - s.mx; l.y = s.y + (a.y + b.y) / 2 - s.my;
    queueRender();
  }
  // 入力欄の中ではショートカットを使わない（文字の Ctrl+Z は入力欄自身の元に戻すになる）
  function __typing(e) {
    const t = e && e.target;
    if (document.querySelector('.mixall-dialog-layer')) return true;
    return !!(t && t.matches && t.matches('textarea,select,[contenteditable],[contenteditable] *,input:not([type=range]):not([type=color]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file])'));
  }

  // 動画の書き出し: 毎回すべての音声を、新しい録音先と audioContext.destination（手元の再生）の両方につなぐ
  var __monitor = null, __lastExport = null;
  function connectExportAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      if (!audioContext) audioContext = new AC();
      if (!__monitor) { __monitor = audioContext.createGain(); __monitor.connect(audioContext.destination); }
      audioDestination = audioContext.createMediaStreamDestination();
      for (const layer of project.layers.filter((l) => l.kind === 'audio' || l.kind === 'video')) {
        const media = getMedia(layer);
        media.muted = false; media.volume = 1;
        let node = mediaSources.get(layer.id);
        if (!node) {
          const source = audioContext.createMediaElementSource(media), gain = audioContext.createGain();
          source.connect(gain); node = { source, gain }; mediaSources.set(layer.id, node);
        }
        try { node.gain.disconnect(); } catch (_) { /* まだどこにもつながっていない */ }
        node.gain.connect(audioDestination); node.gain.connect(__monitor);
        node.gain.gain.value = Number(layer.volume ?? 1);
      }
      // 書き出し中は手元では鳴らさない（録音先には入る）
      __monitor.gain.value = 0;
      audioContext.resume().catch(() => {});
      return audioDestination.stream;
    } catch (err) { console.warn(err); return null; }
  }
  function __pauseIdle() { if (!playing) for (const m of mediaCache.values()) { try { m.pause(); } catch (_) { /* 無視 */ } } }
  function __afterExport(blob) {
    if (blob) __lastExport = { blob, at: Date.now(), name: project.name, w: W, h: H };
    for (const n of mediaSources.values()) { try { n.gain.gain.value = 1; } catch (_) { /* 無視 */ } }
    if (__monitor) __monitor.gain.value = 1;
    __pauseIdle();
    try { window.__studioHooks?.exported?.(__lastExport); } catch (err) { console.warn(err); }
  }
  // iPhone（Safari）は webm を録画できないので mp4 も試す（Apple の端末では mp4 を先に）
  function __pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    const apple = /iP(hone|ad|od)/.test(navigator.userAgent) || /Apple/.test(navigator.vendor || '');
    const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mp4 = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'];
    for (const m of apple ? [...mp4, ...webm] : [...webm, ...mp4]) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) { /* 次へ */ } }
    return '';
  }
  function __videoName(mime) { return safeName() + '_動画.' + (/mp4/i.test(mime || '') ? 'mp4' : 'webm'); }
  // いま見ている時点の PNG（選択枠なし）
  function __pngBlob() {
    return new Promise((resolve) => {
      if (playing) stopPlayback(false);
      const at = now;
      exportingMedia = true; renderAt(at);
      canvas.toBlob((blob) => { exportingMedia = false; __pauseIdle(); renderAt(at); resolve(blob); }, 'image/png');
    });
  }
  function __inspectorExtra(host, l) { try { window.__studioHooks?.inspector?.(host, l); } catch (err) { console.warn(err); } }

  // 外（overlay/js/plus-create.js）から使う入口
  window.__studio = {
    get project() { return project; }, set project(v) { project = v; },
    get selectedId() { return selectedId; }, set selectedId(v) { selectedId = v; selectedScriptId = 'start'; },
    get now() { return now; }, get playing() { return playing; }, get tool() { return tool; },
    get W() { return W; }, get H() { return H; }, get lastExport() { return __lastExport; },
    canvas, renderAt, queueRender, syncAll, snapshot, snapOnce: __snapOnce, scheduleSave, saveToDevice, notify, selected, deleteLayer,
    uid, freshProject, fitText: __fitText, pngBlob: __pngBlob, stopPlayback, ensureLayerPrograms, renderInspector, typing: __typing,
    box: (l) => __box(l, effectStatesAt(now).get(l.id)), boxable: __boxable, onHandle: __onHandle, hitTest, pointFromEvent, validCanvas: __validCanvas,
    clearHistory() { undoStack = []; redoStack = []; }
  };
  // ---- ここまで MixAll + の追加分 ----
}
const INJECT = (() => { const s = injected.toString(); return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}')).trim() + '\n  '; })();

const R = [
  // [名前, 置き換え元, 置き換え後]
  ['スタジオ: キャンバスの大きさを変えられるように', "const W=1280,H=720,DB_NAME=", "let W=1280,H=720;const DB_NAME="],
  // 1. 写真・文字の追加、元に戻す/やり直し、削除、表示切替のあとに描き直す（写真の読み込みも renderAt → getImage で始まる）
  ['スタジオ: 描き直し', "renderLayers();renderProgram();renderTimeline();renderInspector();}", "renderLayers();renderProgram();renderTimeline();renderInspector();queueRender();}"],
  ['スタジオ: 形と文字幅の反映', "function syncAll(){ui.name.value=project.name||'';", "function syncAll(){__applyCanvas();__fitAllText();ui.name.value=project.name||'';"],
  ['スタジオ: 合計時間の表示', "ui.totalTime.textContent=Number(now).toFixed(1);", "ui.totalTime.textContent=Number(project.duration).toFixed(1);"],
  ['スタジオ: 空の案内', "ui.stageEmpty.hidden=project.layers.some(l=>l.kind!=='background')||!!(project.bg&&project.bg!=='#ffffff');",
    "ui.stageEmpty.hidden=project.layers.length>0||!/^#(fff|ffffff)$/i.test(project.bg||'#ffffff');"],
  // 6. 履歴を軽く
  ['スタジオ: 軽い履歴', "function snapshot(){undoStack.push(JSON.stringify(project));", "function snapshot(){undoStack.push(__serialize());"],
  ['スタジオ: 履歴の復元', "function restore(raw){try{project=JSON.parse(raw);selectedId=project.layers.at(-1)?.id||null;",
    "function restore(raw){try{project=JSON.parse(raw,__revive);drawCache.clear();selectedId=project.layers.some(l=>l.id===selectedId)?selectedId:(project.layers.at(-1)?.id||null);"],
  ['スタジオ: 元に戻す', "redoStack.push(JSON.stringify(project));", "redoStack.push(__serialize());"],
  ['スタジオ: やり直し', "undoStack.push(JSON.stringify(project));restore(redoStack.pop())", "undoStack.push(__serialize());restore(redoStack.pop())"],
  ['スタジオ: 設定欄の履歴', "host.querySelectorAll('[data-inspect]').forEach(input=>input.addEventListener('input',()=>{", "host.querySelectorAll('[data-inspect]').forEach(input=>input.addEventListener('input',()=>{__snapOnce(input);"],
  ['スタジオ: メディア設定の履歴', "host.querySelectorAll('[data-media]').forEach(input=>input.addEventListener('input',()=>{", "host.querySelectorAll('[data-media]').forEach(input=>input.addEventListener('input',()=>{__snapOnce(input);"],
  ['スタジオ: ブロック値の履歴', "stack.querySelectorAll('.program-block input').forEach(input=>input.addEventListener('input',()=>{", "stack.querySelectorAll('.program-block input').forEach(input=>input.addEventListener('input',()=>{__snapOnce(input);"],
  // 7. 文字の書き換えも元に戻せる・幅は自動・設定欄に文字の見た目（plus-create.js がフックで足す）
  ['スタジオ: 文字の書き換え', "const edit=host.querySelector('#editText');if(edit)edit.addEventListener('input',()=>{l.text=edit.value;",
    "const edit=host.querySelector('#editText');__inspectorExtra(host,l);if(edit)edit.addEventListener('input',()=>{__snapOnce(edit);l.text=edit.value;__fitText(l);"],
  ['スタジオ: 大きさの範囲', '<input type="range" min="20" max="220"', '<input type="range" min="5" max="500"'],
  // 4. 選択枠・タップ判定を見た目に合わせる（元の関数は名前を変えて残し、差し込んだ同名の関数を使う）
  ['スタジオ: 選択枠', "function renderSelection(){", "function __origRenderSelection(){"],
  ['スタジオ: タップ判定', "function hitTest(p){", "function __origHitTest(p){"],
  ['スタジオ: つまみ・2本指', "const p=pointFromEvent(e);if(tool==='select'){const l=hitTest(p);if(l){selectedId=l.id;dragLayer={layer:l,start:p,x:l.x,y:l.y};snapshot();syncAll();}else{selectedId=null;syncAll();}return;}",
    "const p=pointFromEvent(e);if(e.isPrimary)__ptrs.clear();__ptrs.set(e.pointerId,p);if(tool==='select'){if(__ptrs.size>=2){__startPinch();return;}const hl=selected();if(hl&&__onHandle(hl,p,e)){__startResize(hl,p);return;}const l=hitTest(p);if(l){const changed=selectedId!==l.id;selectedId=l.id;dragLayer={layer:l,start:p,x:l.x||0,y:l.y||0,snapped:false};if(changed){selectedScriptId='start';syncAll();}}else if(selectedId){selectedId=null;syncAll();}return;}"],
  ['スタジオ: 2本指の追従', "canvas.addEventListener('pointermove',e=>{if(drawing){", "canvas.addEventListener('pointermove',e=>{if(__ptrs.has(e.pointerId))__ptrs.set(e.pointerId,pointFromEvent(e));if(__pinchState){__pinchMove();return;}if(drawing){"],
  ['スタジオ: ドラッグ移動', "else if(dragLayer){const p=pointFromEvent(e);dragLayer.layer.x=dragLayer.x+p.x-dragLayer.start.x;dragLayer.layer.y=dragLayer.y+p.y-dragLayer.start.y;queueRender();renderInspector();}",
    "else if(dragLayer){__dragMove(pointFromEvent(e));}"],
  ['スタジオ: 指を離したとき', "const endPointer=()=>{if(drawing){", "const endPointer=(e)=>{if(e)__ptrs.delete(e.pointerId);if(__pinchState){if(__ptrs.size<2){const moved=__pinchState.snapped;__pinchState=null;dragLayer=null;if(moved){scheduleSave();syncAll();}}return;}if(drawing){"],
  // 5. 入力欄の中ではショートカットを無視
  ['スタジオ: 入力欄ではショートカットを無視', "window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){", "window.addEventListener('keydown',e=>{if(__typing(e))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){"],
  // 2. 書き出しの音
  ['スタジオ: 録音のつなぎ直し', "function connectExportAudio(){", "function __origConnectExportAudio(){"],
  ['スタジオ: 書き出し中の消音をやめる', "media.muted=true;media.currentTime=Number(layer.inPoint||0);", "media.muted=false;media.currentTime=Number(layer.inPoint||0);"],
  ['スタジオ: 再生時に音を戻す', "function startMediaPlayback(){", "function startMediaPlayback(){if(audioContext&&audioContext.state!=='running')audioContext.resume().catch(()=>{});"],
  ['スタジオ: 書き出し失敗時', "recorder.onerror=()=>{button.disabled=false;", "recorder.onerror=()=>{exportingMedia=false;__afterExport(null);button.disabled=false;"],
  // 3. iPhone（Safari）は mp4
  ['スタジオ: 動画の形式', "let mime='video/webm;codecs=vp9';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm;codecs=vp8';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';", "let mime=__pickMime();"],
  ['スタジオ: 録画の設定', "recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000});", "recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:5_000_000}:{videoBitsPerSecond:5_000_000});"],
  ['スタジオ: 動画の保存', "recorder.onstop=()=>{const blob=new Blob(chunks,{type:mime});downloadBlob(blob,",
    "recorder.onstop=()=>{mime=recorder.mimeType||(chunks[0]&&chunks[0].type)||mime||'video/webm';const blob=new Blob(chunks,{type:mime.split(';')[0]});__afterExport(blob);downloadBlob(blob,__videoName(mime)||"],
  // PNG は今の再生位置で書き出す（書き出しで動画・音声が鳴り出さないように止める）
  ['スタジオ: PNGは今の位置で', "exportingMedia=true;renderAt(0);canvas.toBlob(blob=>{exportingMedia=false;renderAt(prior);", "exportingMedia=true;renderAt(prior);canvas.toBlob(blob=>{exportingMedia=false;__pauseIdle();renderAt(prior);"],
  // 動画の位置を変えたとき（止まっている間）に新しいコマで描き直す
  ['スタジオ: 動画の再描画', "media.addEventListener('loadedmetadata',()=>queueRender());", "media.addEventListener('loadedmetadata',()=>queueRender());media.addEventListener('loadeddata',()=>queueRender());media.addEventListener('seeked',()=>{if(!playing&&!exportingMedia)queueRender();});"],
  // 9. ブロックの並べ替えボタン（スマホではドラッグできないため）
  ['スタジオ: ブロックの並べ替えボタン', '<button class="remove-block" data-remove=',
    '<button class="move-block" data-move="-1" type="button" title="上へ" aria-label="上へ">↑</button><button class="move-block" data-move="1" type="button" title="下へ" aria-label="下へ">↓</button><button class="remove-block" data-remove='],
  ['スタジオ: 並べ替えの動き', "stack.querySelectorAll('[data-remove]').forEach(",
    "stack.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('click',()=>{const i=Number(button.closest('.program-block').dataset.index),j=i+Number(button.dataset.move);if(!(j>=0&&j<effects.length))return;snapshot();const t=effects[i];effects[i]=effects[j];effects[j]=t;syncAll();scheduleSave();}));stack.querySelectorAll('[data-remove]').forEach("],
  // 12. 作品データの読み込みでもキャンバスの形を保つ
  ['スタジオ: 読み込みで形を保つ', "bg:/^#[0-9a-f]{6}$/i.test(data.bg)?data.bg:'#fff',layers:", "bg:/^#[0-9a-f]{6}$/i.test(data.bg)?data.bg:'#ffffff',canvas:__validCanvas(data.canvas),layers:"],
  // 差し込みは最後に（上の置き換えが差し込んだコードに当たらないように）
  ['スタジオ: 内部公開と追加機能', "function boot(){", INJECT + "function boot(){"]
];

export const labels = R.map(([label]) => label);

export function apply({ kind, rel, text, patch }) {
  if (kind === 'script' && rel === 'js/creative-studio.js') {
    for (const [label, from, to] of R) text = patch(text, label, from, to);
  }
  return text;
}
