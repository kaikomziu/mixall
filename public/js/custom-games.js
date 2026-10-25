/* Custom: HTMLゲームの一覧とアップロード */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = Netrify.requireLogin(); if (!session) return;
  const G = window.MixAllHtmlGame;
  const TEXT = new Set(['html', 'htm', 'css', 'js', 'mjs', 'json', 'svg', 'txt', 'csv', 'xml', 'glsl', 'obj', 'md']);
  const BIN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'mp3', 'ogg', 'wav', 'm4a', 'mp4', 'webm', 'woff', 'woff2', 'ttf', 'otf']);
  const MAX_FILE = 1536 * 1024, MAX_TOTAL = 4 * 1024 * 1024;
  let files = [], updatingId = null;

  // ---------- zip(保存/deflateのみ)を読む ----------
  async function inflateRaw(u8) { const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
  async function readZip(buf) {
    const v = new DataView(buf), u8 = new Uint8Array(buf); let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('zipを読めませんでした');
    const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = [];
    for (let i = 0; i < n; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      if (name.endsWith('/') || /(^|\/)(__MACOSX|\.DS_Store)/.test(name)) continue;
      const lnl = v.getUint16(off + 26, true), lel = v.getUint16(off + 28, true), start = off + 30 + lnl + lel, raw = u8.subarray(start, start + csize);
      out.push({ name, data: method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null });
    }
    return out.filter((x) => x.data);
  }
  const toDataUrl = (blobOrU8, mime) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blobOrU8 instanceof Blob ? blobOrU8 : new Blob([blobOrU8], { type: mime })); });
  async function fromBytes(path, u8) {
    const ext = G.extOf(path);
    if (TEXT.has(ext)) return { path, content: new TextDecoder().decode(u8) };
    if (BIN.has(ext)) return { path, content: await toDataUrl(u8, G.mimeOf(path)) };
    return null;
  }
  async function collect(list) {
    const out = [];
    for (const item of list) {
      const f = item.file || item, rel = item.path || f.webkitRelativePath || f.name;
      if (/\.zip$/i.test(f.name)) { for (const z of await readZip(await f.arrayBuffer())) { const r = await fromBytes(G.norm(z.name), z.data); if (r) out.push(r); } continue; }
      const ext = G.extOf(f.name); if (TEXT.has(ext)) out.push({ path: G.norm(rel), content: await f.text() }); else if (BIN.has(ext)) out.push({ path: G.norm(rel), content: await toDataUrl(f) });
    }
    // フォルダ/zipの最上位フォルダ名を取り除く
    if (out.length && out.every((f) => f.path.includes('/'))) { const top = out[0].path.split('/')[0]; if (out.every((f) => f.path.startsWith(top + '/'))) out.forEach((f) => { f.path = f.path.slice(top.length + 1); }); }
    return out;
  }
  const bytesOf = (f) => f.content.length;
  function show() {
    const total = files.reduce((a, f) => a + bytesOf(f), 0), htmls = files.filter((f) => /\.html?$/i.test(f.path));
    $('metaBox').hidden = !files.length;
    $('fileInfo').innerHTML = files.length ? '<div class="hg-files">' + files.map((f) => esc(f.path) + ' <span class="muted">(' + Math.ceil(bytesOf(f) / 1024) + 'KB)</span>').join('<br>') + '</div>合計 ' + (total / 1048576).toFixed(2) + 'MB / 4MB' : '';
    const sel = $('entrySel'); sel.innerHTML = htmls.map((f) => '<option value="' + esc(f.path) + '">' + esc(f.path) + '</option>').join('');
    const idx = htmls.find((f) => /(^|\/)index\.html?$/i.test(f.path)); if (idx) sel.value = idx.path;
    if (!$('gName').value && htmls.length) { const t = /<title>([^<]{1,60})<\/title>/i.exec(htmls[0].content); if (t) $('gName').value = t[1].trim(); }
  }
  async function add(list) {
    $('upErr').textContent = '';
    try { const got = await collect(list); const map = new Map(files.map((f) => [f.path, f])); got.forEach((f) => map.set(f.path, f)); files = [...map.values()]; } catch (e) { $('upErr').textContent = e.message; }
    show();
  }
  $('pickFiles').onclick = () => $('fFiles').click(); $('pickDir').onclick = () => $('fDir').click();
  $('fFiles').onchange = (e) => { add([...e.target.files]); e.target.value = ''; }; $('fDir').onchange = (e) => { add([...e.target.files]); e.target.value = ''; };
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('on'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('on'); }));
  drop.addEventListener('drop', async (e) => {
    const items = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (items.length) { const acc = []; const walk = async (en, base) => { if (en.isFile) { const f = await new Promise((r) => en.file(r)); acc.push({ file: f, path: base + f.name }); } else { const rd = en.createReader(); let all = []; for (;;) { const b = await new Promise((r) => rd.readEntries(r)); if (!b.length) break; all = all.concat(b); } for (const c of all) await walk(c, base + en.name + '/'); } }; for (const en of items) await walk(en, ''); add(acc); }
    else add([...e.dataTransfer.files]);
  });
  $('upCancel').onclick = () => { files = []; updatingId = null; $('upHead').textContent = 'ゲームをアップロード'; $('gName').value = ''; $('gDesc').value = ''; show(); };
  $('upGo').onclick = async () => {
    const err = $('upErr'); err.textContent = '';
    const total = files.reduce((a, f) => a + bytesOf(f), 0);
    if (!files.some((f) => /\.html?$/i.test(f.path))) { err.textContent = 'HTMLファイルを入れてください'; return; }
    const big = files.find((f) => bytesOf(f) > MAX_FILE); if (big) { err.textContent = big.path + ' が大きすぎます(1.5MBまで)'; return; }
    if (total > MAX_TOTAL) { err.textContent = '合計が4MBを超えています'; return; }
    const name = $('gName').value.trim() || 'HTMLゲーム';
    $('upGo').disabled = true; $('upGo').textContent = 'アップロード中…';
    try {
      const r = await Netrify.api('/api/custom', { action: 'saveProject', token: session.token, projectId: updatingId || undefined, kind: 'html', entry: $('entrySel').value, name, description: $('gDesc').value.trim(), visibility: document.querySelector('input[name=vis]:checked').value, programFiles: files });
      const saved = (r.project && r.project.programFiles || []).length;
      if (saved < files.length) { err.textContent = (files.length - saved) + '個のファイルが保存されませんでした(サイズ上限)。'; }
      else { $('upCancel').click(); location.href = '/Custom/play.html?id=' + encodeURIComponent(r.project.id); return; }
    } catch (e) { err.textContent = e.message; }
    $('upGo').disabled = false; $('upGo').textContent = 'アップロード';
  };
  // ---------- 一覧 ----------
  async function load() {
    const box = $('list');
    try {
      const r = await fetch('/api/custom?projects=1&token=' + encodeURIComponent(session.token)); const d = await r.json(); if (!r.ok) throw new Error(d.error || '読み込めませんでした');
      const list = (d.projects || []).filter((p) => p.kind === 'html');
      if (!list.length) { box.innerHTML = '<p class="muted">まだゲームがありません。最初の1本をアップロードしてみましょう。</p>'; return; }
      box.innerHTML = list.map((p) => { const mine = p.ownerEmail === session.email; return '<div class="hg-card"><h3>' + esc(p.name) + '</h3><div>' + (p.visibility === 'public' ? '<span class="hg-tag">公開</span>' : '<span class="hg-tag priv">非公開</span>') + (mine ? ' <span class="hg-tag">あなたの作品</span>' : '') + '</div><div class="muted" style="font-size:.85rem">' + esc(p.description || '') + '</div><div class="row"><a class="button" href="/Custom/play.html?id=' + encodeURIComponent(p.id) + '">遊ぶ</a>' + (mine ? '<button type="button" class="secondary" data-up="' + esc(p.id) + '" data-name="' + esc(p.name) + '">更新</button><button type="button" class="ghost" data-del="' + esc(p.id) + '">削除</button>' : '') + '</div></div>'; }).join('');
      box.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { files = []; updatingId = b.dataset.up; $('upHead').textContent = '「' + b.dataset.name + '」を更新(新しいファイルを選んでください)'; $('gName').value = b.dataset.name; show(); $('upCard').scrollIntoView({ behavior: 'smooth' }); });
      box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('このゲームを削除しますか?')) return; try { await Netrify.api('/api/custom', { action: 'deleteProject', token: session.token, projectId: b.dataset.del }); load(); } catch (e) { alert(e.message); } });
    } catch (e) { box.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }
  load();
})();
