// MixAll UI編集モード
//  ・⚙の「編集する」で開始。編集中は、下部メニューの項目とツールのカードをドラッグ&ドロップで並べ替えできる。
//  ・どの部分でも長押し(押したまま動かさずに離す)すると、その部分だけの「背景・文字・枠線」の色を変えるパレットが出る。
//  ・個別の色は端末に保存し、全ページで自動適用する(下部メニューと「同じ種類すべて」は全ページ共通、それ以外はそのページだけ)。
(function () {
  const COLOR_KEY = 'mixall_elem_colors', NAV_KEY = 'mixall_nav_order';
  const isTop = window.self === window.top;
  const scopeNow = () => (location.pathname.toLowerCase().replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/');
  const readAll = () => { try { return JSON.parse(localStorage.getItem(COLOR_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const writeAll = (v) => { try { localStorage.setItem(COLOR_KEY, JSON.stringify(v)); } catch (_) {} };
  const okHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));

  // ---------- 個別の色を反映 ----------
  function applyColors() {
    const all = readAll(); const css = [];
    ['*', scopeNow()].forEach((scope) => {
      Object.entries(all[scope] || {}).forEach(([sel, c]) => {
        try { document.createDocumentFragment().querySelector(sel); } catch (_) { return; }
        const heading = /(^|[\s>])h[1-6]\b/i.test(sel);
        const rule = [];
        if (okHex(c.bg)) rule.push(`background:${c.bg} !important`);
        if (okHex(c.fg)) { rule.push(`color:${c.fg} !important`, `-webkit-text-fill-color:${c.fg} !important`); if (heading && !okHex(c.bg)) rule.push('background-image:none !important'); }
        if (okHex(c.bd)) rule.push(`border-color:${c.bd} !important`, 'border-style:solid !important', 'border-width:2px !important');
        if (rule.length) css.push(`${sel}{${rule.join(';')}}`);
      });
    });
    let el = document.getElementById('mx-elem-colors');
    if (!el) { el = document.createElement('style'); el.id = 'mx-elem-colors'; document.head.appendChild(el); }
    el.textContent = css.join('\n');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyColors, { once: true }); else applyColors();

  // ---------- 背景(全画面共通 / このページだけ / ON・OFF) ----------
  //  mixall_bg = { global:{on,kind,color,image,dim}, pages:{ '/path': {mode:'inherit'|'own'|'off', kind,color,image,dim} } }
  const BG_KEY = 'mixall_bg';
  const readBg = () => { try { const v = JSON.parse(localStorage.getItem(BG_KEY) || '{}') || {}; v.global = v.global || {}; v.pages = v.pages || {}; return v; } catch (_) { return { global: {}, pages: {} }; } };
  const writeBg = (v) => { try { localStorage.setItem(BG_KEY, JSON.stringify(v)); return true; } catch (_) { return false; } };
  function bgCss(c) {
    const dim = Math.max(0, Math.min(80, Number(c.dim) || 0)) / 100, ov = `linear-gradient(rgba(0,0,0,${dim.toFixed(2)}),rgba(0,0,0,${dim.toFixed(2)}))`;
    if (c.kind === 'image' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(c.image || '')) return `${ov},url("${c.image}") center/cover no-repeat`;
    if (okHex(c.color)) return `${ov},${c.color}`;
    return '';
  }
  function applyBg() {
    if (!isTop) return;
    const all = readBg(), page = all.pages[scopeNow()] || {};
    let cfg = null;
    if (page.mode === 'off') cfg = null; else if (page.mode === 'own') cfg = page; else if (all.global.on) cfg = all.global;
    if (document.documentElement.dataset.theme === 'image') cfg = null; // 画像テーマ中は背景色/背景を重ねない(画像を優先)
    const css = cfg ? bgCss(cfg) : '';
    let el = document.getElementById('mx-bg-style');
    if (!el) { el = document.createElement('style'); el.id = 'mx-bg-style'; document.head.appendChild(el); }
    el.textContent = css ? `html::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:${css}}html[data-mx-bg] body{background:transparent !important}` : '';
    document.documentElement.toggleAttribute('data-mx-bg', Boolean(css));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBg, { once: true }); else applyBg();

  // ---------- 画面のカード(ブロック)の並び順 ----------
  const UNIT_KEY = 'mixall_unit_order';
  const readUnits = () => { try { return JSON.parse(localStorage.getItem(UNIT_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const parentKeyOf = (p) => (p.id && /^[A-Za-z][\w-]*$/.test(p.id) ? '#' + p.id : p.tagName.toLowerCase() + Array.from(p.classList).filter((c) => /^[a-z][a-z0-9_-]*$/i.test(c) && !/^(mx-)/.test(c)).slice(0, 2).map((c) => '.' + c).join(''));
  const unitKeyOf = (u, i) => (u.id && /^[A-Za-z][\w-]*$/.test(u.id) ? '#' + u.id : (u.querySelector('h1,h2,h3,summary,strong') || u).textContent.replace(/\s+/g, ' ').trim().slice(0, 24) || 'i' + i);
  const unitsIn = (p) => Array.from(p.children).filter((c) => !/^(SCRIPT|STYLE|TEMPLATE)$/.test(c.tagName) && !c.hidden && !c.matches('details.tool-card[id], .mx-edit-bar, .mx-palette'));
  function applyUnitOrder() {
    const saved = (readUnits()[scopeNow()]) || {};
    Object.entries(saved).forEach(([pk, keys]) => {
      let parent = null; try { parent = pk.startsWith('#') ? document.querySelector(pk) : Array.from(document.querySelectorAll('main, main > *')).find((e) => parentKeyOf(e) === pk); } catch (_) {}
      if (!parent) return;
      const map = new Map(unitsIn(parent).map((u, i) => [unitKeyOf(u, i), u]));
      keys.forEach((k) => { const u = map.get(k); if (u) parent.appendChild(u); });
    });
  }
  const onceLoad = () => { applyUnitOrder(); setTimeout(applyUnitOrder, 1500); };
  if (document.readyState === 'complete') onceLoad(); else window.addEventListener('load', onceLoad, { once: true });

  window.MixAllUIEdit = { applyBg };
  if (!isTop) return;

  // ---------- 対象の判定 ----------
  const inUi = (el) => el.closest && el.closest('.mx-edit-bar, .mx-palette, .settings-widget');
  function dragItemOf(el) {
    const nav = el.closest('.mixall-bottom-nav [data-nav-group]'); if (nav) return { kind: 'nav', el: nav };
    const tool = el.closest('details.tool-card[id]'); if (tool) return { kind: 'tool', el: tool };
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const par = n.parentElement; if (!par) break;
      if (par.tagName === 'MAIN' || (par.parentElement && par.parentElement.tagName === 'MAIN' && /grid|cards|list|columns/i.test(par.className))) { if (/^(SCRIPT|STYLE)$/.test(n.tagName)) return null; return { kind: 'unit', el: n }; }
    }
    return null;
  }
  function colorTargetOf(el) {
    const t = el.closest('[data-nav-group], details.tool-card[id], button, a.button, a.button-link, h1, h2, h3, h4, h5, input, select, textarea, summary, .card, header.top, .brand, label, p') || el;
    return t === document.body || t === document.documentElement || t.tagName === 'MAIN' ? null : t;
  }
  const stableClasses = (el) => Array.from(el.classList).filter((c) => /^[a-z][a-z0-9_-]*$/i.test(c) && !/^(mx-|tool-)/.test(c) && !/\d{3,}/.test(c)).slice(0, 2);
  function selectorFor(el) {
    const nav = el.closest('[data-nav-group]');
    if (nav) return { sel: `.mixall-bottom-nav [data-nav-group="${nav.dataset.navGroup}"]`, scope: '*' };
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return { sel: '#' + el.id, scope: scopeNow() };
    const parts = []; let node = el;
    for (let depth = 0; node && node !== document.body && depth < 7; depth++) {
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) { parts.unshift('#' + node.id); break; }
      const tag = node.tagName.toLowerCase(), same = Array.from(node.parentElement?.children || []).filter((c) => c.tagName === node.tagName);
      parts.unshift(tag + stableClasses(node).map((c) => '.' + c).join('') + (same.length > 1 ? `:nth-of-type(${same.indexOf(node) + 1})` : ''));
      node = node.parentElement;
    }
    return { sel: parts.join(' > '), scope: scopeNow() };
  }
  const kindSelector = (el) => el.tagName.toLowerCase() + stableClasses(el).map((c) => '.' + c).join('');
  const labelOf = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 24) || el.tagName.toLowerCase();

  // ---------- カラーパレット ----------
  let palette = null;
  const toHex = (v) => { try { const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = '#000000'; ctx.fillStyle = String(v); return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : ''; } catch (_) { return ''; } };
  const normHex = (v) => { let t = String(v).trim(); if (!t.startsWith('#')) t = '#' + t; if (/^#[0-9a-f]{3}$/i.test(t)) t = '#' + t.slice(1).split('').map((x) => x + x).join(''); return okHex(t) ? t.toLowerCase() : null; };
  function closePalette() { palette?.remove(); palette = null; bar && (bar.hidden = false); }
  function openPalette(target) {
    if (!target) return;
    closePalette(); if (bar) bar.hidden = true;
    const own = selectorFor(target), kind = { sel: kindSelector(target), scope: '*' };
    const lockedKind = Boolean(target.closest('[data-nav-group], details.tool-card'));
    const all = readAll();
    const existing = () => (all[own.scope] || {})[own.sel] || (all['*'] || {})[kind.sel] || {};
    const cur = Object.assign({}, existing());
    let applyAll = Boolean((all['*'] || {})[kind.sel]) && !lockedKind;
    const cs = getComputedStyle(target);
    palette = document.createElement('div');
    palette.className = 'mx-palette';
    palette.innerHTML = '<div class="mx-pal-title"></div><div class="mx-pal-rows"></div><label class="mx-pal-all"><input type="checkbox"> 同じ種類のものすべてに適用</label><div class="mx-pal-actions"><button type="button" data-clear>この部分の色を消す</button><button type="button" data-close>閉じる</button></div>';
    palette.querySelector('.mx-pal-title').textContent = `「${labelOf(target)}」の色`;
    const allBox = palette.querySelector('.mx-pal-all input'); allBox.checked = applyAll; allBox.disabled = lockedKind;
    if (lockedKind) palette.querySelector('.mx-pal-all').style.opacity = '.5';
    function commit() {
      const data = readAll();
      [[own.scope, own.sel], ['*', kind.sel]].forEach(([sc, sel]) => { if (data[sc]) { delete data[sc][sel]; if (!Object.keys(data[sc]).length) delete data[sc]; } });
      const value = {}; ['bg', 'fg', 'bd'].forEach((k) => { if (okHex(cur[k])) value[k] = cur[k]; });
      if (Object.keys(value).length) { const dest = applyAll ? kind : own; (data[dest.scope] = data[dest.scope] || {})[dest.sel] = value; }
      writeAll(data); applyColors();
    }
    const rows = palette.querySelector('.mx-pal-rows');
    [['bg', '背景', cs.backgroundColor], ['fg', '文字', cs.color], ['bd', '枠線', cs.borderTopColor]].forEach(([key, label, computed]) => {
      const row = document.createElement('div'); row.className = 'mx-pal-row';
      row.innerHTML = '<span></span><input type="text" maxlength="7" spellcheck="false" autocapitalize="off" aria-label="16進数カラー"><input type="color" aria-label="色を選ぶ"><button type="button" aria-label="この色を消す">↺</button>';
      const [name, hex, pick, off] = row.children; name.textContent = label;
      const set = (v) => { cur[key] = v; if (v) { hex.value = v; pick.value = v; } commit(); off.style.visibility = v ? 'visible' : 'hidden'; };
      hex.value = pick.value = okHex(cur[key]) ? cur[key] : (toHex(computed) || '#888888'); off.style.visibility = okHex(cur[key]) ? 'visible' : 'hidden';
      pick.oninput = () => set(pick.value);
      hex.oninput = () => { const h = normHex(hex.value); if (h) { hex.style.outline = ''; set(h); } else hex.style.outline = '2px solid #e5484d'; };
      off.onclick = () => { delete cur[key]; hex.value = pick.value = toHex(computed) || '#888888'; off.style.visibility = 'hidden'; commit(); };
      rows.appendChild(row);
    });
    allBox.onchange = () => { applyAll = allBox.checked; commit(); };
    palette.querySelector('[data-clear]').onclick = () => { Object.keys(cur).forEach((k) => delete cur[k]); commit(); openPalette(target); };
    palette.querySelector('[data-close]').onclick = closePalette;
    document.body.appendChild(palette);
  }

  // ---------- 背景パネル ----------
  function pickImage(done) {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
    f.onchange = () => {
      const file = f.files && f.files[0]; if (!file) return;
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let out = ''; for (const q of [0.8, 0.65, 0.5]) { out = c.toDataURL('image/jpeg', q); if (out.length < 900 * 1024) break; }
        done(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); alert('画像を読み込めませんでした'); };
      img.src = url;
    };
    f.click();
  }
  function cfgEditor(host, cfg, save) {
    const nm = 'k' + Math.random().toString(36).slice(2, 7);
    host.innerHTML = `<div class="mx-bg-row"><label><input type="radio" name="${nm}" value="color"> 色</label> <label><input type="radio" name="${nm}" value="image"> 画像</label></div><div class="mx-bg-row" data-color><input type="color" aria-label="背景色"> <input type="text" maxlength="7" spellcheck="false" aria-label="16進カラー" style="width:6.5em"></div><div class="mx-bg-row" data-image><button type="button" data-pick>画像を選ぶ</button> <button type="button" data-del class="ghost">画像を消す</button><div class="mx-bg-prev"></div></div><div class="mx-bg-row">暗さ <input type="range" min="0" max="80" data-dim> <span data-dimv></span>%</div>`;
    const $ = (q) => host.querySelector(q);
    const paint = () => {
      host.querySelectorAll('input[type=radio]').forEach((r) => { r.checked = r.value === (cfg.kind || 'color'); });
      $('[data-color]').style.display = (cfg.kind || 'color') === 'color' ? '' : 'none'; $('[data-image]').style.display = cfg.kind === 'image' ? '' : 'none';
      $('input[type=color]').value = okHex(cfg.color) ? cfg.color : '#1b2a4a'; $('input[type=text]').value = okHex(cfg.color) ? cfg.color : '#1b2a4a';
      $('[data-dim]').value = cfg.dim ?? 0; $('[data-dimv]').textContent = cfg.dim ?? 0;
      $('.mx-bg-prev').style.backgroundImage = cfg.image ? `url("${cfg.image}")` : 'none';
    };
    host.querySelectorAll('input[type=radio]').forEach((r) => { r.onchange = () => { cfg.kind = r.value; if (cfg.kind === 'color' && !okHex(cfg.color)) cfg.color = '#1b2a4a'; save(); paint(); }; });
    $('input[type=color]').oninput = (e) => { cfg.color = e.target.value; save(); paint(); };
    $('input[type=text]').oninput = (e) => { const h = normHex(e.target.value); if (h) { cfg.color = h; save(); $('input[type=color]').value = h; } };
    $('[data-dim]').oninput = (e) => { cfg.dim = Number(e.target.value); $('[data-dimv]').textContent = cfg.dim; save(); };
    $('[data-pick]').onclick = () => pickImage((data) => { cfg.kind = 'image'; cfg.image = data; if (!save()) { delete cfg.image; alert('保存できませんでした(端末の保存容量が足りません)。小さい画像でもう一度試してください。'); } paint(); });
    $('[data-del]').onclick = () => { delete cfg.image; save(); paint(); };
    paint();
  }
  // ⚙設定パネルの「背景」欄に、共通/ページ別/ON・OFFの設定を組み込む(host=差し込み先)
  function mountBg(host) {
    if (!host) return;
    if (document.documentElement.dataset.theme === 'image') { host.innerHTML = '<p class="muted" style="margin:0">画像テーマ中は、背景色などの個別背景は使えません(OFFになっています)。上の「画像」の設定が使われます。</p>'; return; }
    const all = readBg(), sc = scopeNow(); const page = all.pages[sc] = all.pages[sc] || { mode: 'inherit' };
    host.innerHTML = '<div class="mx-bg-block"><label class="mx-bg-head"><input type="checkbox" data-gon> 全画面共通の背景 (ON/OFF)</label><div data-g></div></div><div class="mx-bg-block"><div class="mx-bg-head">このページだけ(<span data-sc></span>)</div><select data-mode><option value="inherit">共通の背景を使う</option><option value="own">このページ専用の背景</option><option value="off">背景なし</option></select><div data-p></div></div>';
    host.querySelector('[data-sc]').textContent = sc;
    const commit = () => { const ok = writeBg(all); applyBg(); return ok; };
    const gon = host.querySelector('[data-gon]'), g = host.querySelector('[data-g]'), pm = host.querySelector('[data-mode]'), pp = host.querySelector('[data-p]');
    gon.checked = Boolean(all.global.on); g.style.display = gon.checked ? '' : 'none';
    gon.onchange = () => { all.global.on = gon.checked; g.style.display = gon.checked ? '' : 'none'; commit(); };
    cfgEditor(g, all.global, commit);
    pm.value = page.mode || 'inherit'; pp.style.display = pm.value === 'own' ? '' : 'none';
    pm.onchange = () => { page.mode = pm.value; pp.style.display = pm.value === 'own' ? '' : 'none'; commit(); };
    cfgEditor(pp, page, commit);
  }

  // ---------- 編集モード ----------
  //  ・長押し(約0.5秒)で持ち上がり、そのまま動かすと並べ替え(下部メニュー・ツールのカード)
  //  ・同じ場所を3回タップすると、その部分の色(背景・文字・枠線)を変えるパレットが開く
  const NAVPOS_KEY = 'mixall_nav_pos';
  let editing = false, bar = null, st = null, tap = null;
  function resetAll() {
    ['mixall_elem_colors', 'mixall_nav_order', 'mixall_tool_order', 'mixall_ui_custom', 'mixall_bg', 'mixall_unit_order'].forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
    location.reload();
  }
  function start() {
    if (editing) return; editing = true;
    document.documentElement.classList.add('mx-editing');
    bar = document.createElement('div'); bar.className = 'mx-edit-bar';
    const pos = () => (document.documentElement.dataset.navPos === 'top' ? 'top' : 'bottom');
    bar.innerHTML = '<span class="mx-edit-help">編集中: 長押ししてドラッグ=並べ替え(メニュー・カード) / 3回タップ=色の変更</span><div class="mx-edit-btns"><button type="button" data-pos></button><button type="button" data-reset class="ghost">初期化</button><button type="button" data-done>完了</button></div>';
    const posBtn = bar.querySelector('[data-pos]');
    const label = () => { posBtn.textContent = pos() === 'top' ? 'メニューを下へ' : 'メニューを上へ'; };
    label();
    posBtn.onclick = () => { const next = pos() === 'top' ? 'bottom' : 'top'; document.documentElement.dataset.navPos = next; try { localStorage.setItem(NAVPOS_KEY, next); } catch (_) {} label(); };
    bar.querySelector('[data-reset]').onclick = () => { if (confirm('並び順と個別の色をすべて初期状態に戻しますか？')) resetAll(); };
    bar.querySelector('[data-done]').onclick = stop;
    document.body.appendChild(bar);
    document.querySelectorAll('details.tool-card').forEach((c) => { c.open = false; });
    document.querySelector('.settings-panel.open')?.classList.remove('open');
  }
  function stop() { editing = false; st = null; tap = null; closePalette(); bar?.remove(); bar = null; document.documentElement.classList.remove('mx-editing'); document.querySelectorAll('.mx-picked').forEach((e) => e.classList.remove('mx-picked')); }
  window.MixAllUIEdit.start = start; window.MixAllUIEdit.stop = stop; window.MixAllUIEdit.isEditing = () => editing; window.MixAllUIEdit.resetAll = resetAll; window.MixAllUIEdit.mountBg = mountBg;

  // 編集中は通常のクリック(ページ移動・メニュー展開など)を止める
  document.addEventListener('click', (e) => { if (editing && !inUi(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('contextmenu', (e) => { if (editing && !inUi(e.target)) e.preventDefault(); }, true);
  document.addEventListener('touchmove', (e) => { if (st && st.dragging) e.preventDefault(); }, { passive: false, capture: true });

  const toolCards = () => Array.from(document.querySelectorAll('details.tool-card[id]'));
  document.addEventListener('pointerdown', (e) => {
    if (!editing || e.button > 0 || inUi(e.target)) return;
    const item = dragItemOf(e.target), target = item && item.kind !== 'unit' ? item.el : colorTargetOf(e.target); // 普通のブロックは、中の部品を色変更の対象にする
    if (!target) return;
    closePalette();
    st = { item, target, x: e.clientX, y: e.clientY, pid: e.pointerId, t: Date.now(), picked: false, dragging: false };
    if (item) st.timer = setTimeout(() => { if (!st) return; st.picked = true; item.el.classList.add('mx-picked'); try { navigator.vibrate && navigator.vibrate(15); } catch (_) {} }, 450); // 長押しで持ち上げ
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    if (!st.dragging) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 10) return;
      clearTimeout(st.timer);
      if (st.item && st.picked) st.dragging = true; // 持ち上げた後に動かした → 並べ替え
      else { st.target.classList.remove('mx-picked'); st.item && st.item.el.classList.remove('mx-picked'); st = null; tap = null; return; } // 持ち上げる前に動かした → スクロールなど
    }
    e.preventDefault();
    const el = st.item.el;
    if (st.item.kind === 'nav') {
      const nav = el.parentElement, others = Array.from(nav.children).filter((c) => c !== el);
      const next = others.find((c) => { const r = c.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
      if (next) { if (el.nextElementSibling !== next) next.before(el); } else if (others.length) others[others.length - 1].after(el);
    } else if (st.item.kind === 'unit') {
      const y = e.clientY; if (y < 90) window.scrollBy(0, -14); else if (y > window.innerHeight - 90) window.scrollBy(0, 14);
      const others = unitsIn(el.parentElement).filter((c) => c !== el && c.offsetParent !== null);
      const next = others.find((c) => { const r = c.getBoundingClientRect(), half = r.width < window.innerWidth * 0.8; return half ? (e.clientY < r.top || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2)) : e.clientY < r.top + r.height / 2; });
      if (next) { if (el.nextElementSibling !== next) next.before(el); } else if (others.length) others[others.length - 1].after(el);
    } else {
      const y = e.clientY; if (y < 90) window.scrollBy(0, -14); else if (y > window.innerHeight - 90) window.scrollBy(0, 14);
      const others = toolCards().filter((c) => c !== el && c.offsetParent !== null);
      const next = others.find((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (next) { if (el.nextElementSibling !== next) next.before(el); } else if (others.length && el !== others[others.length - 1]) others[others.length - 1].after(el);
    }
  }, true);
  function finish(e, canceled) {
    if (!st || e.pointerId !== st.pid) return;
    clearTimeout(st.timer);
    const s = st; st = null; s.target.classList.remove('mx-picked'); s.item && s.item.el.classList.remove('mx-picked');
    if (s.dragging) {
      tap = null;
      if (s.item.kind === 'nav') {
        const keys = Array.from(s.item.el.parentElement.querySelectorAll('[data-nav-group]')).map((b) => b.dataset.navGroup);
        try { localStorage.setItem(NAV_KEY, JSON.stringify(keys)); } catch (_) {}
        window.MixAllNav && window.MixAllNav.rerender();
      } else if (s.item.kind === 'unit') {
        const par = s.item.el.parentElement, all = readUnits(), sc = scopeNow();
        (all[sc] = all[sc] || {})[parentKeyOf(par)] = unitsIn(par).map((u, i) => unitKeyOf(u, i));
        try { localStorage.setItem(UNIT_KEY, JSON.stringify(all)); } catch (_) {}
      } else { try { localStorage.setItem('mixall_tool_order', JSON.stringify(toolCards().map((c) => c.id))); } catch (_) {} }
      return;
    }
    if (canceled || s.picked) { tap = null; return; } // 長押しだけ(動かさず)は何もしない
    const now = Date.now();
    if (now - s.t > 450) { tap = null; return; }       // 短いタップだけを数える
    if (tap && tap.target === s.target && now - tap.last < 600) { tap.count += 1; tap.last = now; } else tap = { target: s.target, count: 1, last: now };
    if (tap.count >= 3) { const t = s.target; tap = null; openPalette(t); } // 3回タップ → 色のパレット
  }
  document.addEventListener('pointerup', (e) => finish(e, false), true);
  document.addEventListener('pointercancel', (e) => finish(e, true), true);
})();
