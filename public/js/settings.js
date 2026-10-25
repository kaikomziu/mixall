// ---- 読み込みの優先順位: まず「いま見ている画面のデータ」を取得・描画し、通知・ポーリングなどの周辺は通信が落ち着いてから少しずつ読み込む ----
(function () {
  if (window.mxIdle) return;
  let inflight = 0, lastDone = Date.now();
  const skip = /\/api\/(notifications|push|auto-compact|ai-sweep|site-state|health|kodomiru|archive|backup)\b/;
  const orig = window.fetch && window.fetch.bind(window);
  if (orig) window.fetch = function (input, init) {
    const url = String(typeof input === 'string' ? input : (input && input.url) || '');
    if (skip.test(url) || (init && init.quiet)) return orig(input, init);
    inflight++;
    const fin = () => { inflight = Math.max(0, inflight - 1); lastDone = Date.now(); };
    return orig(input, init).then((r) => { fin(); return r; }, (e) => { fin(); throw e; });
  };
  // 主要な通信がすべて終わり、画面の読み込みが済んでから fn を実行する(最長 max ミリ秒待つ)
  window.mxIdle = function (fn, max) {
    const start = Date.now(), limit = max || 6000;
    (function wait() {
      const quiet = inflight === 0 && Date.now() - lastDone > 300 && document.readyState === 'complete';
      if (quiet || Date.now() - start > limit) { const run = () => { try { fn(); } catch (_) {} }; if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 0); return; }
      setTimeout(wait, 150);
    })();
  };
})();

// public/js/settings.js
// デザイン(シンプル/カラフル)・テーマ(ダーク/ホワイト/カラーピッカー/画像)・文字サイズをlocalStorageに保存し、全ページに適用する共通スクリプト。
// <head>内でCSSの直後に読み込むことで、描画前にテーマを適用しちらつきを防ぐ。

// public/js/settings.js
// デザイン(シンプル/カラフル)・テーマ(ダーク/ホワイト/カラーピッカー/画像)・文字サイズをlocalStorageに保存し、全ページに適用する共通スクリプト。
// <head>内でCSSの直後に読み込むことで、描画前にテーマを適用しちらつきを防ぐ。

(function () {
  const THEME_KEY = 'netrify_theme';        // dark | light | color | image
  const DESIGN_KEY = 'netrify_design';      // simple | colorful
  const SCALE_KEY = 'netrify_font_scale';
  const COLOR_KEY = 'netrify_theme_color';  // {h,s,v}
  const IMG_KEY = 'netrify_theme_image';    // dataURL or URL
  const DIM_KEY = 'netrify_theme_dim';      // 0-80
  const TONE_KEY = 'netrify_theme_tone';    // dark | light (画像の上の文字色)
  const SCALES = [0.85, 1, 1.15, 1.3];
  const SCALE_LABELS = ['小', '標準', '大', '特大'];
  const VARS = ['--bg', '--panel', '--panel-2', '--border', '--text', '--text-dim', '--accent', '--accent-2'];
  const root = document.documentElement;
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };

  function hsv2rgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  const hex = (c) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  const lum = (c) => { const a = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

  function clearInline() {
    VARS.forEach((v) => root.style.removeProperty(v));
    root.style.removeProperty('background-image'); root.style.removeProperty('background-size');
    root.style.removeProperty('background-attachment'); root.style.removeProperty('background-position');
    root.style.removeProperty('background-color');
  }
  function colorVars() {
    let c = { h: 220, s: 0.5, v: 0.35 };
    try { c = Object.assign(c, JSON.parse(get(COLOR_KEY, '{}'))); } catch (_) {}
    const base = hsv2rgb(c.h, c.s, c.v), light = lum(base) > 0.45;
    const white = [255, 255, 255], black = [0, 0, 0];
    const text = light ? [24, 26, 32] : [236, 238, 242];
    const accent = hsv2rgb((c.h + 40) % 360, light ? 0.9 : 0.45, light ? 0.5 : 1);
    const accent2 = hsv2rgb((c.h + 160) % 360, light ? 0.8 : 0.5, light ? 0.5 : 1);
    root.style.setProperty('--bg', hex(base));
    root.style.setProperty('--panel', hex(mix(base, light ? white : white, light ? 0.55 : 0.08)));
    root.style.setProperty('--panel-2', hex(mix(base, light ? white : white, light ? 0.35 : 0.15)));
    root.style.setProperty('--border', hex(mix(base, light ? black : white, light ? 0.18 : 0.25)));
    root.style.setProperty('--text', hex(text));
    root.style.setProperty('--text-dim', hex(mix(text, base, 0.35)));
    root.style.setProperty('--accent', hex(accent));
    root.style.setProperty('--accent-2', hex(accent2));
    root.style.colorScheme = light ? 'light' : 'dark';
  }
  function imageVars() {
    const img = get(IMG_KEY, ''), dim = Math.max(0, Math.min(80, parseInt(get(DIM_KEY, '35'), 10) || 0)) / 100;
    const tone = get(TONE_KEY, 'dark'); // 'dark'=暗い画像向け(白文字)
    const ov = tone === 'light' ? '255,255,255' : '0,0,0';
    const a = dim.toFixed(2);
    if (img) {
      const safe = img.replace(/["\\\n\r]/g, '');
      root.style.backgroundImage = `linear-gradient(rgba(${ov},${a}),rgba(${ov},${a})),url("${safe}")`;
      root.style.backgroundSize = 'cover'; root.style.backgroundPosition = 'center'; root.style.backgroundAttachment = 'fixed';
    } else root.style.backgroundColor = tone === 'light' ? '#eee' : '#111';
    const text = tone === 'light' ? '#14161b' : '#f1f3f7';
    const panel = tone === 'light' ? 'rgba(255,255,255,.72)' : 'rgba(18,20,26,.72)';
    root.style.setProperty('--bg', 'transparent');
    root.style.setProperty('--panel', panel);
    root.style.setProperty('--panel-2', tone === 'light' ? 'rgba(255,255,255,.55)' : 'rgba(40,44,54,.6)');
    root.style.setProperty('--border', tone === 'light' ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.22)');
    root.style.setProperty('--text', text);
    root.style.setProperty('--text-dim', tone === 'light' ? '#444a57' : '#c3c9d4');
    root.style.setProperty('--accent', tone === 'light' ? '#2d57d4' : '#7aa2ff');
    root.style.setProperty('--accent-2', tone === 'light' ? '#128a6e' : '#7ee0c0');
    root.style.colorScheme = tone === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    clearInline(); root.style.removeProperty('color-scheme');
    root.dataset.theme = theme;
    if (theme === 'color') colorVars(); else if (theme === 'image') imageVars();
    applyCustom();
  }
  function applyDesign(d) { root.dataset.design = d; }
  function applyScale(scale) { root.style.setProperty('--font-scale', scale); }

  // ---- 色の個別変更 / メニューバーの位置 ----
  const CUSTOM_KEY = 'mixall_ui_custom', NAVPOS_KEY = 'mixall_nav_pos', NAVORDER_KEY = 'mixall_nav_order';
  // [キー, 表示名, 参照するCSS変数(初期値の取得用), 初期値の予備]
  const CUSTOM_FIELDS = [['bg', '背景', '--bg', '#111111'], ['panel', 'パネル・カード', '--panel', '#222222'], ['text', '文字', '--text', '#eeeeee'], ['textDim', '補助の文字', '--text-dim', '#aaaaaa'], ['heading', '見出しの文字', '--text', '#ffffff'], ['link', 'リンクの文字', '--accent', '#7aa2ff'], ['accent', '強調色(ボタンなど)', '--accent', '#7aa2ff'], ['navBg', '下部メニューの背景', '--panel', '#222222'], ['navFg', '下部メニューの文字', '--text', '#eeeeee']];
  const COLORFUL_FIELDS = [['cf1', 'カラフル色1', '--accent', '#7aa2ff'], ['cf2', 'カラフル色2', '--accent-2', '#7ee0c0'], ['cf3', 'カラフル色3', '', '#ff7ab8']];
  const readCustom = () => { try { return JSON.parse(get(CUSTOM_KEY, '{}')) || {}; } catch (_) { return {}; } };
  function applyCustom() {
    const c = readCustom(), ok = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    const flag = (key, cssVar, dataName) => { if (ok(c[key])) { root.style.setProperty(cssVar, c[key]); root.dataset[dataName] = '1'; } else { root.style.removeProperty(cssVar); delete root.dataset[dataName]; } };
    // 画像テーマのときは背景色を使わない(画像を優先する)
    if (ok(c.bg) && root.dataset.theme !== 'image') { root.style.setProperty('--bg', c.bg); root.style.backgroundColor = c.bg; root.style.backgroundImage = 'none'; }
    if (ok(c.panel)) { root.style.setProperty('--panel', c.panel); root.style.setProperty('--panel-2', `color-mix(in srgb, ${c.panel} 90%, var(--text))`); }
    if (ok(c.text)) { root.style.setProperty('--text', c.text); root.style.setProperty('--text-dim', `color-mix(in srgb, ${c.text} 65%, var(--panel))`); root.style.setProperty('--border', `color-mix(in srgb, ${c.text} 22%, var(--panel))`); }
    if (ok(c.textDim)) root.style.setProperty('--text-dim', c.textDim);
    if (ok(c.accent)) root.style.setProperty('--accent', c.accent);
    flag('heading', '--mx-heading', 'heading'); flag('link', '--mx-link', 'link');
    flag('navBg', '--mx-nav-bg', 'navBg'); flag('navFg', '--mx-nav-fg', 'navFg');
    [['cf1', '--cf-1'], ['cf2', '--cf-2'], ['cf3', '--cf-3']].forEach(([k, v]) => { if (ok(c[k])) root.style.setProperty(v, c[k]); else root.style.removeProperty(v); });
  }

  // 即時適用 (ちらつき防止)
  let savedTheme = get(THEME_KEY, 'dark'); if (!['dark', 'light', 'color', 'image'].includes(savedTheme)) savedTheme = 'dark';
  applyTheme(savedTheme);
  applyDesign(get(DESIGN_KEY, 'simple') === 'colorful' ? 'colorful' : 'simple');
  applyScale(parseFloat(get(SCALE_KEY, '1')) || 1);
  root.dataset.navPos = get(NAVPOS_KEY, 'bottom') === 'top' ? 'top' : 'bottom';

  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header.top, header.studio-head');
    if (!header) return;

    const wrap = document.createElement('div');
    wrap.className = 'settings-widget';
    wrap.innerHTML = `
      <button type="button" class="gear" id="settingsGearBtn" title="表示設定">⚙</button>
      <div class="settings-panel" id="settingsPanel">
        <h4>デザイン</h4>
        <div class="row" id="designButtons">
          <button type="button" class="secondary small" data-design="simple">シンプル</button>
          <button type="button" class="secondary small" data-design="colorful">カラフル</button>
        </div>
        <h4>テーマ</h4>
        <div class="row" id="themeButtons">
          <button type="button" class="secondary small" data-theme-set="dark">ダーク</button>
          <button type="button" class="secondary small" data-theme-set="light">ホワイト</button>
          <button type="button" class="secondary small" data-theme-set="color">カラーピッカー</button>
          <button type="button" class="secondary small" data-theme-set="image">画像</button>
        </div>
        <div id="themeColorBox" style="display:none;margin-bottom:12px">
          <div id="svPad" style="position:relative;width:100%;height:130px;border-radius:8px;touch-action:none;cursor:crosshair;overflow:hidden">
            <div style="position:absolute;inset:0;background:linear-gradient(to right,#fff,rgba(255,255,255,0))"></div>
            <div style="position:absolute;inset:0;background:linear-gradient(to top,#000,rgba(0,0,0,0))"></div>
            <div id="svKnob" style="position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #000,0 1px 4px rgba(0,0,0,.5);pointer-events:none"></div>
          </div>
          <div id="huePad" style="position:relative;height:16px;margin-top:10px;border-radius:8px;touch-action:none;cursor:pointer;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)">
            <div id="hueKnob" style="position:absolute;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #000;pointer-events:none"></div>
          </div>
          <p class="muted" style="margin:6px 0 0">四角の中や色の帯をドラッグして好きな色にします</p>
        </div>
        <div id="themeImageBox" style="display:none;margin-bottom:12px">
          <input type="file" id="bgFile" accept="image/*" style="display:none">
          <div class="row"><button type="button" class="secondary small" id="bgPick">画像を選ぶ</button><button type="button" class="ghost small" id="bgClear">なし</button></div>
          <input type="text" id="bgUrl" placeholder="または画像のURL(https://…)" style="width:100%;box-sizing:border-box;margin-top:6px">
          <label class="muted" style="display:block;margin-top:8px">画像の暗さ/白さ <span id="bgDimVal"></span></label>
          <input type="range" id="bgDim" min="0" max="80" step="5" style="width:100%">
          <div class="row" style="margin-top:6px"><button type="button" class="secondary small" data-tone="dark">白い文字</button><button type="button" class="secondary small" data-tone="light">黒い文字</button></div>
          <div class="muted" id="bgMsg"></div>
        </div>
        <h4>背景の個別設定</h4>
        <div id="bgCustomHost" class="muted">読み込み中…</div>
        <h4>色の個別設定</h4>
        <p class="muted" style="margin-top:0">好きな色をカラーピッカーか16進数(#rrggbb)で指定できます。「戻す」で元の色になります。一部分だけの色は「編集する」→3回タップで変えられます。</p>
        <div id="customColorBox"></div>
        <h4>文字サイズ</h4>
        <div class="row" id="scaleButtons"></div>
        <h4>UIの編集</h4>
        <p class="muted" style="margin-top:0">「編集する」を押すと、下部メニューやツールを長押ししてから動かして並べ替えできます。どの部分でも3回タップすると、その部分だけの色(背景・文字・枠線)を変えられます。</p>
        <div class="row"><button type="button" class="secondary small" id="uiEditBtn">✏️ 編集する</button></div>
        <h4>端末ロック</h4>
        <div id="deviceLockBox"></div>
      </div>
    `;
    header.appendChild(wrap);
    const q = (s) => wrap.querySelector(s), qa = (s) => Array.from(wrap.querySelectorAll(s));

    const panel = q('#settingsPanel');
    q('#settingsGearBtn').onclick = (e) => { e.stopPropagation(); panel.classList.toggle('open'); if (panel.classList.contains('open')) { const host = q('#bgCustomHost'); const tryMount = (n) => { const api = window.MixAllUIEdit; if (api && api.mountBg) api.mountBg(host); else if (n < 20) setTimeout(() => tryMount(n + 1), 200); else host.textContent = '背景の個別設定を読み込めませんでした。ページを再読み込みしてください。'; }; tryMount(0); } };
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) panel.classList.remove('open'); });

    function refresh() {
      const theme = root.dataset.theme, design = root.dataset.design;
      qa('[data-theme-set]').forEach((b) => { b.style.borderColor = b.dataset.themeSet === theme ? 'var(--accent)' : ''; });
      qa('[data-design]').forEach((b) => { b.style.borderColor = b.dataset.design === design ? 'var(--accent)' : ''; });
      qa('[data-tone]').forEach((b) => { b.style.borderColor = b.dataset.tone === get(TONE_KEY, 'dark') ? 'var(--accent)' : ''; });
      q('#themeColorBox').style.display = theme === 'color' ? 'block' : 'none';
      q('#themeImageBox').style.display = theme === 'image' ? 'block' : 'none';
    }
    qa('[data-design]').forEach((b) => { b.onclick = () => { applyDesign(b.dataset.design); set(DESIGN_KEY, b.dataset.design); refresh(); buildCustomColors(); }; });
    qa('[data-theme-set]').forEach((b) => { b.onclick = () => { applyTheme(b.dataset.themeSet); applyCustom(); set(THEME_KEY, b.dataset.themeSet); refresh(); placeKnobs(); try { const api = window.MixAllUIEdit; if (api && api.applyBg) api.applyBg(); if (api && api.mountBg) api.mountBg(q('#bgCustomHost')); } catch (_) {} buildCustomColors(); }; });

    // ---- カラーピッカー ----
    let col = { h: 220, s: 0.5, v: 0.35 };
    try { col = Object.assign(col, JSON.parse(get(COLOR_KEY, '{}'))); } catch (_) {}
    const sv = q('#svPad'), hue = q('#huePad'), svK = q('#svKnob'), hK = q('#hueKnob');
    function placeKnobs() {
      sv.style.background = `hsl(${col.h},100%,50%)`;
      svK.style.left = (col.s * 100) + '%'; svK.style.top = ((1 - col.v) * 100) + '%';
      hK.style.left = (col.h / 360 * 100) + '%';
      svK.style.background = hex(hsv2rgb(col.h, col.s, col.v)); hK.style.background = `hsl(${col.h},100%,50%)`;
    }
    function commitColor() { set(COLOR_KEY, JSON.stringify(col)); if (root.dataset.theme === 'color') { clearInline(); colorVars(); } placeKnobs(); }
    function drag(el, fn) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); el.setPointerCapture(e.pointerId); fn(e);
        const mv = (ev) => fn(ev), up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
    }
    drag(sv, (e) => { const r = sv.getBoundingClientRect(); col.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); col.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); commitColor(); });
    drag(hue, (e) => { const r = hue.getBoundingClientRect(); col.h = Math.max(0, Math.min(359.9, (e.clientX - r.left) / r.width * 360)); commitColor(); });
    placeKnobs();

    // ---- 画像 ----
    const msg = q('#bgMsg'), dimEl = q('#bgDim'), dimVal = q('#bgDimVal');
    dimEl.value = get(DIM_KEY, '35'); dimVal.textContent = dimEl.value + '%';
    q('#bgUrl').value = /^https?:/.test(get(IMG_KEY, '')) ? get(IMG_KEY, '') : '';
    function applyImage() { if (root.dataset.theme === 'image') { clearInline(); imageVars(); } refresh(); }
    dimEl.oninput = () => { set(DIM_KEY, dimEl.value); dimVal.textContent = dimEl.value + '%'; applyImage(); };
    qa('[data-tone]').forEach((b) => { b.onclick = () => { set(TONE_KEY, b.dataset.tone); applyImage(); }; });
    q('#bgPick').onclick = () => q('#bgFile').click();
    q('#bgClear').onclick = () => { try { localStorage.removeItem(IMG_KEY); } catch (_) {} q('#bgUrl').value = ''; msg.textContent = ''; applyImage(); };
    q('#bgUrl').onchange = () => { const v = q('#bgUrl').value.trim(); if (v && !/^https?:\/\//i.test(v)) { msg.textContent = 'http(s):// から始まるURLを入力してください'; return; } if (set(IMG_KEY, v)) { msg.textContent = ''; applyImage(); } };
    q('#bgFile').onchange = (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      msg.textContent = '読み込み中…';
      const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        const max = 1920, k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        let data = ''; for (const qlt of [0.82, 0.65, 0.5]) { data = cv.toDataURL('image/jpeg', qlt); if (data.length < 2.4e6) break; }
        if (set(IMG_KEY, data)) { q('#bgUrl').value = ''; msg.textContent = '設定しました'; applyImage(); } else msg.textContent = '画像が大きすぎて保存できませんでした。小さい画像か、URLを使ってください。';
      };
      im.onerror = () => { URL.revokeObjectURL(url); msg.textContent = '画像を読み込めませんでした'; };
      im.src = url; e.target.value = '';
    };

    // ---- 文字サイズ ----
    const scaleEl = q('#scaleButtons');
    SCALES.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'secondary small'; btn.textContent = SCALE_LABELS[i];
      btn.onclick = () => { applyScale(s); set(SCALE_KEY, s); refreshScale(); };
      scaleEl.appendChild(btn);
    });
    function refreshScale() {
      const current = parseFloat(get(SCALE_KEY, '1')) || 1;
      Array.from(scaleEl.children).forEach((btn, i) => { btn.style.borderColor = SCALES[i] === current ? 'var(--accent)' : ''; });
    }
    refreshScale(); refresh();

    // ---- 端末ロック ----
    const LOCK_KEY = 'mixall_device_lock', AUTOLOCK_KEY = 'mixall_autolock_min';
    const lockRec = () => { try { return JSON.parse(get(LOCK_KEY, 'null')); } catch (_) { return null; } };
    const sessNow = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
    async function lockApi(body) {
      const r = await fetch('/api/device-lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(d.error || '失敗しました'), { data: d });
      return d;
    }
    async function performLock() {
      const rec = lockRec(), sess = sessNow();
      try { if (rec && sess) await Promise.race([lockApi({ action: 'refresh', deviceToken: rec.d, session: sess }), new Promise((_, rej) => setTimeout(rej, 3000))]); } catch (_) {}
      try { localStorage.removeItem('netrify_session'); localStorage.removeItem('netrify_accounts'); } catch (_) {}
      location.replace('/unlock/?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
    }
    function renderLockBox() {
      const box = q('#deviceLockBox'), rec = lockRec(), sess = sessNow();
      if (!rec) {
        if (!sess) { box.innerHTML = '<p class="muted">ログイン後に設定できます</p>'; return; }
        box.innerHTML = '<p class="muted" style="margin-top:0">この端末だけのパスワードを設定します。設定すると、この端末はロック中パスワードなしでは開けなくなります(他の端末には影響しません)。</p><input type="password" id="lockPw" placeholder="パスワード(6文字以上)" autocomplete="new-password" style="width:100%;box-sizing:border-box"><input type="password" id="lockPw2" placeholder="もう一度入力" autocomplete="new-password" style="width:100%;box-sizing:border-box;margin-top:6px"><button type="button" class="secondary small" id="lockEnable" style="margin-top:6px">この端末にパスワードを掛ける</button><div class="muted" id="lockMsg"></div>';
        box.querySelector('#lockEnable').onclick = async () => {
          const pw = box.querySelector('#lockPw').value, msgEl = box.querySelector('#lockMsg');
          if (pw !== box.querySelector('#lockPw2').value) { msgEl.textContent = 'パスワードが一致しません'; return; }
          if (!confirm('設定すると、この端末は今すぐロックされます。パスワードを忘れると、通常のログインをやり直す必要があります。続けますか？')) return;
          msgEl.textContent = '設定中…';
          try {
            const r = await lockApi({ action: 'enable', token: sess.token, password: pw, session: sess });
            set(LOCK_KEY, JSON.stringify({ d: r.deviceToken }));
            await performLock();
          } catch (e) { msgEl.textContent = e.message; }
        };
        return;
      }
      box.innerHTML = '<p class="muted" style="margin-top:0">🔒 この端末はパスワードで保護されています。</p><label class="muted" style="display:block">自動ロック <select id="autoLock"><option value="0">しない</option><option value="1">1分</option><option value="5">5分</option><option value="15">15分</option><option value="60">1時間</option></select></label><div class="row" style="margin-top:6px"><button type="button" class="secondary small" id="lockNow">今すぐロック</button><button type="button" class="secondary small" id="lockChange">パスワード変更</button><button type="button" class="ghost small" id="lockOff">保護を解除</button></div><div class="muted" id="lockMsg"></div>';
      const auto = box.querySelector('#autoLock'); auto.value = get(AUTOLOCK_KEY, '0');
      auto.onchange = () => set(AUTOLOCK_KEY, auto.value);
      const msgEl = box.querySelector('#lockMsg');
      box.querySelector('#lockNow').onclick = performLock;
      box.querySelector('#lockChange').onclick = async () => {
        const oldPassword = prompt('いまのパスワード'); if (oldPassword === null) return;
        const newPassword = prompt('新しいパスワード(6文字以上)'); if (newPassword === null) return;
        try { await lockApi({ action: 'change', deviceToken: rec.d, oldPassword, newPassword }); msgEl.textContent = '変更しました'; } catch (e) { msgEl.textContent = e.message; }
      };
      box.querySelector('#lockOff').onclick = async () => {
        const password = prompt('保護を解除します。いまのパスワードを入力してください'); if (password === null) return;
        try { await lockApi({ action: 'disable', deviceToken: rec.d, password }); try { localStorage.removeItem(LOCK_KEY); } catch (_) {} msgEl.textContent = '保護を解除しました'; renderLockBox(); } catch (e) { msgEl.textContent = e.message; }
      };
    }
    // ---- 色の個別設定(カラーピッカー + 16進数) ----
    function buildCustomColors() {
      const box = q('#customColorBox'); if (!box) return;
      const c0 = readCustom(), isOk = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));
      const norm = (v) => { v = String(v || '').trim(); if (/^[0-9a-f]{6}$/i.test(v)) v = '#' + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map((x) => x + x).join(''); return isOk(v) ? v.toLowerCase() : ''; };
      const cs = getComputedStyle(root), cssHex = (name, fb) => { const v = cs.getPropertyValue(name).trim(); return isOk(v) ? v : (norm(v) || fb); };
      const colorful = root.dataset.design === 'colorful', image = root.dataset.theme === 'image';
      const rows = CUSTOM_FIELDS.filter((f) => !(f[0] === 'bg' && image)).concat(colorful ? COLORFUL_FIELDS : []);
      box.innerHTML = '';
      if (image) { const n = document.createElement('p'); n.className = 'muted'; n.textContent = '画像テーマ中は「背景色」は使えません(背景は画像が優先されます)。'; box.appendChild(n); }
      rows.forEach(([key, label, cssVar, fb]) => {
        const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0;flex-wrap:wrap';
        const cur = () => readCustom()[key];
        const initial = isOk(cur()) ? cur() : (cssVar ? cssHex(cssVar, fb) : fb);
        row.innerHTML = '<span style="flex:1 1 100%;font-size:.8rem"></span><input type="color" aria-label="色を選ぶ" style="width:42px;height:30px;padding:0"><input type="text" maxlength="7" spellcheck="false" autocapitalize="off" aria-label="16進数カラー" style="width:6.5em"><button type="button" class="ghost small">戻す</button>';
        const [lab, pick, hexI, reset] = [row.children[0], row.children[1], row.children[2], row.children[3]];
        lab.textContent = label; pick.value = initial; hexI.value = initial; reset.style.visibility = isOk(cur()) ? 'visible' : 'hidden';
        const save = (v) => { const c = readCustom(); if (v) c[key] = v; else delete c[key]; set(CUSTOM_KEY, JSON.stringify(c)); if (!v) { ['--bg', '--panel', '--panel-2', '--text', '--text-dim', '--border', '--accent'].forEach((n) => root.style.removeProperty(n)); root.style.removeProperty('background-color'); root.style.removeProperty('background-image'); applyTheme(root.dataset.theme); } applyCustom(); reset.style.visibility = v ? 'visible' : 'hidden'; };
        pick.oninput = () => { hexI.value = pick.value; hexI.style.outline = ''; save(pick.value); };
        hexI.oninput = () => { const h = norm(hexI.value); if (h) { hexI.style.outline = ''; pick.value = h; save(h); } else hexI.style.outline = '2px solid #e5484d'; };
        reset.onclick = () => { save(''); const v = cssVar ? cssHex(cssVar, fb) : fb; pick.value = hexI.value = v; };
        box.appendChild(row);
      });
    }
    buildCustomColors();
    q('#settingsGearBtn').addEventListener('click', buildCustomColors);
    renderLockBox();
    q('#settingsGearBtn').addEventListener('click', () => { renderLockBox(); });
    q('#uiEditBtn').onclick = () => { panel.classList.remove('open'); const api = window.MixAllUIEdit; if (api && api.start) api.start(); else alert('編集機能を読み込み中です。少し待ってからもう一度お試しください。'); };
  });

  // 自動ロック: 操作が無い時間(または画面を閉じていた時間)が設定を超えたらロック
  document.addEventListener('DOMContentLoaded', () => {
    const lockRec = () => { try { return JSON.parse(get('mixall_device_lock', 'null')); } catch (_) { return null; } };
    const minutes = () => parseInt(get('mixall_autolock_min', '0'), 10) || 0;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((ev) => addEventListener(ev, bump, { passive: true }));
    const check = () => {
      const m = minutes(); if (!m || !lockRec() || !localStorage.getItem('netrify_session')) return;
      if (Date.now() - last > m * 60000) (async () => {
        const rec = lockRec(); let sess = null; try { sess = JSON.parse(localStorage.getItem('netrify_session')); } catch (_) {}
        try { if (rec && sess) await Promise.race([fetch('/api/device-lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh', deviceToken: rec.d, session: sess }) }), new Promise((_, rej) => setTimeout(rej, 3000))]); } catch (_) {}
        localStorage.removeItem('netrify_session'); localStorage.removeItem('netrify_accounts');
        location.replace('/unlock/?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
      })();
    };
    setInterval(check, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  });
})();
;(function(){ if (window.self !== window.top) return; window.mxIdle(function(){ var sc=document.createElement('script'); sc.src='/js/notify-center.js'; sc.defer=true; document.head.appendChild(sc); var sp=document.createElement('script'); sp.src='/js/push-client.js'; sp.defer=true; document.head.appendChild(sp); var sk=document.createElement('script'); sk.src='/js/kodomiru-guard.js'; sk.defer=true; document.head.appendChild(sk); }); })();
;(function(){ var s=document.createElement('script'); s.src='/js/ui-edit.js'; s.defer=true; (document.head||document.documentElement).appendChild(s); })();
