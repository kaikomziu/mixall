// public/js/settings.js
// テーマ(ダーク/ライト)と文字サイズをlocalStorageに保存し、全ページに適用する共通スクリプト。
// <head>内でCSSの直後に読み込むことで、描画前にテーマを適用しちらつきを防ぐ。

(function () {
  const THEME_KEY = 'netrify_theme';
  const SCALE_KEY = 'netrify_font_scale';
  const SCALES = [0.85, 1, 1.15, 1.3];
  const SCALE_LABELS = ['小', '標準', '大', '特大'];

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  function applyScale(scale) {
    document.documentElement.style.setProperty('--font-scale', scale);
  }

  // 即時適用 (ちらつき防止)
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  const savedScale = parseFloat(localStorage.getItem(SCALE_KEY)) || 1;
  applyTheme(savedTheme);
  applyScale(savedScale);

  // ウィジェットの注入はDOM構築後
  document.addEventListener('DOMContentLoaded', () => {
    // Shared application pages use .top; the canvas studio uses its own header.
    const header = document.querySelector('header.top, header.studio-head');
    if (!header) return;

    const wrap = document.createElement('div');
    wrap.className = 'settings-widget';
    wrap.innerHTML = `
      <button type="button" class="gear" id="settingsGearBtn" title="表示設定">⚙</button>
      <div class="settings-panel" id="settingsPanel">
        <h4>テーマ</h4>
        <div class="row">
          <button type="button" class="secondary small" id="themeDarkBtn">ダーク</button>
          <button type="button" class="secondary small" id="themeLightBtn">ライト</button>
        </div>
        <h4>文字サイズ</h4>
        <div class="row" id="scaleButtons"></div>
      </div>
    `;
    header.appendChild(wrap);

    const panel = wrap.querySelector('#settingsPanel');
    wrap.querySelector('#settingsGearBtn').onclick = (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
    };
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) panel.classList.remove('open');
    });

    function refreshThemeButtons() {
      const theme = document.documentElement.dataset.theme;
      wrap.querySelector('#themeDarkBtn').style.borderColor = theme === 'dark' ? 'var(--accent)' : '';
      wrap.querySelector('#themeLightBtn').style.borderColor = theme === 'light' ? 'var(--accent)' : '';
    }
    wrap.querySelector('#themeDarkBtn').onclick = () => {
      applyTheme('dark'); localStorage.setItem(THEME_KEY, 'dark'); refreshThemeButtons();
    };
    wrap.querySelector('#themeLightBtn').onclick = () => {
      applyTheme('light'); localStorage.setItem(THEME_KEY, 'light'); refreshThemeButtons();
    };
    refreshThemeButtons();

    const scaleEl = wrap.querySelector('#scaleButtons');
    SCALES.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary small';
      btn.textContent = SCALE_LABELS[i];
      btn.onclick = () => {
        applyScale(s);
        localStorage.setItem(SCALE_KEY, s);
        refreshScaleButtons();
      };
      scaleEl.appendChild(btn);
    });
    function refreshScaleButtons() {
      const current = parseFloat(localStorage.getItem(SCALE_KEY)) || 1;
      Array.from(scaleEl.children).forEach((btn, i) => {
        btn.style.borderColor = SCALES[i] === current ? 'var(--accent)' : '';
      });
    }
    refreshScaleButtons();
  });
})();
