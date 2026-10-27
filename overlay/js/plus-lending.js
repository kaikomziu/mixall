// js/plus-lending.js（MixAll +（二世代）・サイト作成 /lending/ だけで読む）
// 友人の public/lending/index.html はそのままにして、画面を使いやすくする:
//   一覧の読み込みエラー表示・状態バッジ / 保存の結果（トーストと URL） / 保存前のライブプレビュー /
//   初心者向けの説明とテンプレート / エディタ（Tab字下げ・Ctrl+S・行番号・下書きの自動保存）/ 画像の追加 / 公開・非公開
// API は /api/lending（cloud/api/lending.js）。status・url・private・画像の API はまだ無いこともあるので、無ければ表示しない。
(function () {
  'use strict';
  if (window.__mxLending) return;
  window.__mxLending = true;

  const $ = (id) => document.getElementById(id);
  const P = () => window.MixAllPlus || {};
  const esc = (s) => (P().esc ? P().esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, o) => { if (P().toast) P().toast(m, o); };
  function getSession() {
    try { if (P().session) return P().session(); } catch (_) { /* 下で読む */ }
    try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; }
  }
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* 容量不足などは無視 */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } };

  async function ask(message, opts) {
    if (window.MixAllDialog) return window.MixAllDialog.confirm(message, opts);
    return window.confirm(message);
  }

  // サーバーと同じ規則（英小文字・数字・ハイフン、2〜40文字）
  function normalizeSlug(input) {
    const slug = String(input || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    return slug && slug.length >= 2 && slug.length <= 40 ? slug : null;
  }
  const siteUrl = (slug) => `${location.origin}/site-view/${encodeURIComponent(slug)}`;
  const fmtDate = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const fmtSize = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    toast('URLをコピーしました');
  }

  // ===== テンプレート（自己完結のHTML。外部ファイルは使わない） =====
  const TEMPLATES = [
    { id: 'profile', icon: '🙋', name: '自己紹介', desc: 'プロフィールカード', title: 'わたしの自己紹介', html: `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>わたしの自己紹介</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
    background: linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%); color: #2b2d42; }
  .card { width: 100%; max-width: 420px; background: rgba(255,255,255,.88); border-radius: 24px; padding: 32px 24px;
    box-shadow: 0 20px 50px rgba(60,60,120,.25); text-align: center; }
  .avatar { width: 110px; height: 110px; margin: 0 auto 14px; border-radius: 50%; display: grid; place-items: center;
    font-size: 56px; background: linear-gradient(135deg, #ffecd2, #fcb69f); box-shadow: 0 6px 18px rgba(0,0,0,.12); }
  h1 { margin: 0 0 4px; font-size: 1.6rem; }
  .sub { margin: 0 0 18px; color: #6c6f93; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 20px; }
  .tags span { padding: 5px 12px; border-radius: 999px; background: #eef0ff; color: #4a4fc4; font-size: .85rem; font-weight: 700; }
  ul { list-style: none; padding: 0; margin: 0; text-align: left; }
  li { padding: 10px 14px; border-radius: 12px; background: #f6f7fb; margin-bottom: 8px; }
  li b { display: inline-block; min-width: 5em; color: #8a5cf6; }
</style>
</head>
<body>
  <div class="card">
    <div class="avatar">😺</div>
    <h1>なまえ</h1>
    <p class="sub">ひとことメッセージを書こう！</p>
    <div class="tags"><span>#ゲーム</span><span>#おえかき</span><span>#音楽</span></div>
    <ul>
      <li><b>すきなもの</b> ねこ・ラーメン</li>
      <li><b>とくい</b> タイピング</li>
      <li><b>いまハマり中</b> サイトづくり</li>
    </ul>
  </div>
</body>
</html>
` },
    { id: 'game', icon: '🎯', name: 'クリックゲーム', desc: '10秒で何回押せる？', title: 'クリックゲーム', html: `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>クリックゲーム</title>
<style>
  body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;
    background: radial-gradient(circle at 30% 20%, #3a1c71, #0f0c29 70%); color: #fff; overflow: hidden; user-select: none; }
  header { display: flex; justify-content: space-between; padding: 16px 20px; font-weight: 800; font-size: 1.1rem; }
  #field { position: relative; height: calc(100vh - 60px); }
  #target { position: absolute; width: 72px; height: 72px; border: 0; border-radius: 50%; cursor: pointer; font-size: 34px;
    background: radial-gradient(circle, #ffd86f, #fc6262); box-shadow: 0 0 24px #fc6262; transition: transform .08s; display: none; }
  #target:active { transform: scale(.88); }
  #panel { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 2rem; }
  #start { padding: 14px 32px; border: 0; border-radius: 999px; font-size: 1.1rem; font-weight: 800; color: #0f0c29;
    background: linear-gradient(90deg, #f7971e, #ffd200); cursor: pointer; }
  p { color: #c9c6ff; }
</style>
</head>
<body>
  <header><span>スコア: <span id="score">0</span></span><span>のこり <span id="time">10.0</span> 秒</span></header>
  <div id="field">
    <button id="target" aria-label="まと">⭐</button>
    <div id="panel"><div><h1>クリックゲーム</h1><p id="msg">10秒間で ⭐ を何回押せるかな？</p><button id="start">スタート</button></div></div>
  </div>
<script>
  var score = 0, best = 0, end = 0, timer = null;
  var field = document.getElementById('field'), target = document.getElementById('target');
  function move() {
    var w = field.clientWidth - 72, h = field.clientHeight - 72;
    target.style.left = Math.random() * w + 'px';
    target.style.top = Math.random() * h + 'px';
  }
  function tick() {
    var left = Math.max(0, end - Date.now());
    document.getElementById('time').textContent = (left / 1000).toFixed(1);
    if (left <= 0) finish();
  }
  function finish() {
    clearInterval(timer);
    target.style.display = 'none';
    best = Math.max(best, score);
    document.getElementById('msg').textContent = 'スコア ' + score + ' 点！（ベスト ' + best + ' 点）';
    document.getElementById('start').textContent = 'もう一回';
    document.getElementById('panel').style.display = 'grid';
  }
  document.getElementById('start').onclick = function () {
    score = 0; document.getElementById('score').textContent = 0;
    document.getElementById('panel').style.display = 'none';
    target.style.display = 'block'; move();
    end = Date.now() + 10000; timer = setInterval(tick, 50);
  };
  target.onclick = function () { score++; document.getElementById('score').textContent = score; move(); };
</script>
</body>
</html>
` },
    { id: 'links', icon: '🔗', name: 'リンク集', desc: 'お気に入りをまとめる', title: 'リンク集', html: `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>リンク集</title>
<style>
  body { margin: 0; min-height: 100vh; padding: 40px 20px; box-sizing: border-box;
    font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; color: #fff;
    background: linear-gradient(160deg, #0f2027, #203a43 50%, #2c5364); }
  .wrap { max-width: 460px; margin: 0 auto; text-align: center; }
  .icon { width: 84px; height: 84px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center; font-size: 42px;
    background: linear-gradient(135deg, #43e97b, #38f9d7); }
  h1 { margin: 0 0 4px; font-size: 1.4rem; }
  p { margin: 0 0 24px; color: #b8d4dc; }
  a { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 15px 18px; border-radius: 16px;
    background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); color: #fff; text-decoration: none;
    font-weight: 700; transition: transform .15s, background .15s; }
  a:hover { transform: translateY(-2px); background: rgba(255,255,255,.18); }
  a span { font-size: 1.4rem; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="icon">🌿</div>
    <h1>わたしのリンク集</h1>
    <p>よく見るサイトをまとめました</p>
    <a href="https://www.youtube.com/" target="_blank" rel="noopener"><span>📺</span>YouTube</a>
    <a href="https://ja.wikipedia.org/" target="_blank" rel="noopener"><span>📚</span>ウィキペディア</a>
    <a href="https://www.google.com/maps" target="_blank" rel="noopener"><span>🗺️</span>Google マップ</a>
    <a href="https://tenki.jp/" target="_blank" rel="noopener"><span>☀️</span>天気予報</a>
  </div>
</body>
</html>
` },
    { id: 'portfolio', icon: '🎨', name: 'ポートフォリオ', desc: '作品を並べて見せる', title: 'ポートフォリオ', html: `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ポートフォリオ</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; background: #f7f7fb; color: #1d1d2c; }
  .hero { padding: 64px 24px 48px; text-align: center; color: #fff; background: linear-gradient(120deg, #667eea, #764ba2); }
  .hero h1 { margin: 0 0 8px; font-size: clamp(1.8rem, 6vw, 2.8rem); letter-spacing: .02em; }
  .hero p { margin: 0; opacity: .9; }
  main { max-width: 960px; margin: -28px auto 0; padding: 0 20px 48px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
  .work { background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(30,30,80,.1); }
  .thumb { height: 140px; display: grid; place-items: center; font-size: 48px; }
  .work div.body { padding: 14px 16px 18px; }
  .work h3 { margin: 0 0 4px; font-size: 1.05rem; }
  .work p { margin: 0; color: #6b6b85; font-size: .9rem; }
  .contact { margin-top: 36px; padding: 24px; text-align: center; background: #fff; border-radius: 18px; }
  .contact a { display: inline-block; margin-top: 8px; padding: 10px 22px; border-radius: 999px; color: #fff; text-decoration: none;
    background: linear-gradient(90deg, #667eea, #764ba2); font-weight: 700; }
</style>
</head>
<body>
  <section class="hero"><h1>なまえ の作品集</h1><p>イラスト・ゲーム・プログラミング</p></section>
  <main>
    <div class="grid">
      <article class="work"><div class="thumb" style="background:linear-gradient(135deg,#ff9a9e,#fecfef)">🖌️</div><div class="body"><h3>作品のなまえ 1</h3><p>どんな作品かを書きます。</p></div></article>
      <article class="work"><div class="thumb" style="background:linear-gradient(135deg,#a1c4fd,#c2e9fb)">🎮</div><div class="body"><h3>作品のなまえ 2</h3><p>使った道具や工夫したところ。</p></div></article>
      <article class="work"><div class="thumb" style="background:linear-gradient(135deg,#d4fc79,#96e6a1)">📷</div><div class="body"><h3>作品のなまえ 3</h3><p>「画像を追加」で写真も入れられます。</p></div></article>
    </div>
    <div class="contact"><strong>お仕事・ご連絡はこちら</strong><br><a href="mailto:example@example.com">連絡する</a></div>
  </main>
</body>
</html>
` },
    { id: 'countdown', icon: '⏳', name: 'カウントダウン', desc: 'イベントまでの残り時間', title: 'カウントダウン', html: `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>カウントダウン</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 20px; box-sizing: border-box; text-align: center;
    font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; color: #fff;
    background: linear-gradient(135deg, #141e30, #243b55); }
  h1 { margin: 0 0 6px; font-size: clamp(1.4rem, 5vw, 2.2rem); }
  p { margin: 0 0 28px; color: #9fb3d1; }
  .boxes { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .box { min-width: 76px; padding: 16px 10px; border-radius: 18px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); }
  .num { font-size: clamp(2rem, 9vw, 3rem); font-weight: 800; font-variant-numeric: tabular-nums;
    background: linear-gradient(180deg, #fff, #8ec5fc); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .lbl { font-size: .8rem; color: #9fb3d1; }
  #done { display: none; font-size: 2rem; margin-top: 20px; }
</style>
</head>
<body>
  <div>
    <h1 id="title">お正月まで</h1>
    <p id="date"></p>
    <div class="boxes">
      <div class="box"><div class="num" id="d">0</div><div class="lbl">日</div></div>
      <div class="box"><div class="num" id="h">0</div><div class="lbl">時間</div></div>
      <div class="box"><div class="num" id="m">0</div><div class="lbl">分</div></div>
      <div class="box"><div class="num" id="s">0</div><div class="lbl">秒</div></div>
    </div>
    <div id="done">🎉 その日になりました！</div>
  </div>
<script>
  // ここの日時を書きかえると、好きなイベントのカウントダウンになります（例: '2027-03-20T09:00'）
  var TARGET = '';
  var target = TARGET ? new Date(TARGET) : new Date(new Date().getFullYear() + 1, 0, 1);
  document.getElementById('date').textContent = target.toLocaleString('ja-JP');
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function update() {
    var left = Math.max(0, target - new Date());
    var sec = Math.floor(left / 1000);
    document.getElementById('d').textContent = Math.floor(sec / 86400);
    document.getElementById('h').textContent = pad(Math.floor(sec / 3600) % 24);
    document.getElementById('m').textContent = pad(Math.floor(sec / 60) % 60);
    document.getElementById('s').textContent = pad(sec % 60);
    if (left <= 0) document.getElementById('done').style.display = 'block';
  }
  update(); setInterval(update, 1000);
</script>
</body>
</html>
` }
  ];

  const EMPTY_PREVIEW = '<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;color:#889;background:#fafafc;text-align:center;padding:20px;box-sizing:border-box">ここにプレビューが出ます。<br>左のエディタにHTMLを書くか、テンプレートを選んでください。</body>';
  const SANDBOX = 'allow-scripts allow-forms allow-popups';
  const DRAFT_PREFIX = 'mixall.lending.draft:';

  function init() {
    const session = getSession();
    const slugInput = $('slugInput'), titleInput = $('titleInput'), ta = $('htmlEditor'), saveBtn = $('saveSubmit'), errEl = $('saveError');
    if (!session || !session.token || !slugInput || !titleInput || !ta || !saveBtn) return;
    // 特殊言語入力（js/language-input.js）は textarea を文字画像入りの編集欄に置き換えるので、HTML と識別子には使わない
    // （このスクリプトは defer なので、あちらの DOMContentLoaded より先に動く）
    ta.dataset.languageInputReady = '1';
    slugInput.dataset.languageInputReady = '1';
    const token = session.token;
    const canCoin = Boolean(session.isAdmin || session.isDeputyAdmin || session.isOfficial);
    const card = slugInput.closest('.card') || slugInput.parentElement;
    document.body.classList.add('mxl-page');

    // ---------- 見出し・説明 ----------
    const h2 = card.querySelector('h2');
    if (h2) h2.textContent = 'サイト作成';
    if (/貸し出しサーバー/.test(document.title)) document.title = document.title.replace('貸し出しサーバー', 'サイト作成');
    const coinP = card.querySelector('p.muted');
    const guide = document.createElement('div');
    guide.className = 'mxl-guide';
    guide.innerHTML = `
      <ol class="mxl-steps">
        <li><b>名前を決める</b><span>識別子（URLになる英数字とハイフン）とタイトルを入れます</span></li>
        <li><b>中身を書く</b><span>HTMLを書くか、下のテンプレートを選びます。プレビューですぐ確認できます</span></li>
        <li><b>保存すると公開</b><span>「保存して公開」を押すと <code>/site-view/識別子</code> で見られるようになります</span></li>
      </ol>
      <p class="mxl-note">安全のため、公開したページは隔離された枠（sandbox）の中で動きます。MixAll のログイン情報には触れません。</p>
      <div class="mxl-tpl-head">テンプレートから始める</div>
      <div class="mxl-tpls">${TEMPLATES.map((t) => `<button type="button" class="mx-plain mxl-tpl" data-tpl="${t.id}"><span class="mxl-tpl-ic" aria-hidden="true">${t.icon}</span><span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span></button>`).join('')}</div>`;
    if (h2) h2.after(guide); else card.prepend(guide);
    if (coinP) {
      const adv = document.createElement('details');
      adv.className = 'mxl-adv';
      adv.innerHTML = '<summary>上級者向け: Coin命令とサイトの仕組み</summary>';
      guide.after(adv);
      adv.appendChild(coinP);
    }

    // ---------- ツールバー・エディタ・プレビュー ----------
    const bar = document.createElement('div');
    bar.className = 'mxl-bar';
    bar.innerHTML = `
      <button type="button" class="ghost" id="mxlNew">＋新規作成</button>
      <button type="button" class="ghost" id="mxlAddImg">🖼 画像を追加</button>
      <label class="mxl-switch" title="オフにすると自分だけが見られます"><input type="checkbox" id="mxlPublic" checked><span class="mxl-knob" aria-hidden="true"></span><em id="mxlPublicLabel">公開する</em></label>
      <input type="file" id="mxlFile" accept="image/*" hidden>`;
    slugInput.before(bar);
    const hint = document.createElement('div');
    hint.className = 'mxl-hint';
    slugInput.after(hint);

    const tabs = document.createElement('div');
    tabs.className = 'mxl-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML = '<button type="button" class="mx-plain" role="tab" data-tab="edit" aria-selected="true">✏️ 編集</button><button type="button" class="mx-plain" role="tab" data-tab="preview" aria-selected="false">👀 プレビュー</button>';
    const split = document.createElement('div');
    split.className = 'mxl-split';
    split.dataset.view = 'edit';
    split.innerHTML = `
      <div class="mxl-pane mxl-edit"><div class="mxl-code"><pre class="mxl-gutter" aria-hidden="true">1</pre></div>
        <div class="mxl-keys">Tab: 字下げ ／ Shift+Tab: 戻す ／ Ctrl+S: 保存 ／ Esc のあと Tab: 次の欄へ</div></div>
      <div class="mxl-pane mxl-prev"><div class="mxl-prev-head"><span>プレビュー（保存前の内容）</span><button type="button" class="ghost mxl-sm" id="mxlPrevOpen">新しいタブで開く</button></div>
        <iframe id="mxlFrame" title="プレビュー" sandbox="${SANDBOX}"></iframe></div>`;
    ta.before(tabs);
    tabs.after(split);
    const code = split.querySelector('.mxl-code');
    const gutter = split.querySelector('.mxl-gutter');
    code.appendChild(ta);
    ta.setAttribute('wrap', 'off');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('autocapitalize', 'off');
    const frame = $('mxlFrame');

    // 保存ボタンの並び（元の「公開後にプレビューを開く」は保存前に自分のページが開くので隠す）
    const previewLink = $('previewLink');
    if (previewLink) previewLink.hidden = true;
    saveBtn.textContent = '保存して公開';
    const actRow = saveBtn.parentElement;
    const openBtn = document.createElement('button');
    openBtn.type = 'button'; openBtn.className = 'secondary'; openBtn.id = 'mxlOpen'; openBtn.textContent = 'プレビューを開く';
    saveBtn.after(openBtn);
    const urlBox = document.createElement('div');
    urlBox.className = 'mxl-url';
    urlBox.hidden = true;
    urlBox.innerHTML = '<span class="mxl-url-label">公開URL</span><a id="mxlUrl" target="_blank" rel="noopener"></a><span id="mxlUrlBadge"></span><button type="button" class="ghost mxl-sm" id="mxlUrlCopy">URLをコピー</button>';
    (actRow || saveBtn).after(urlBox);
    const imgBox = document.createElement('div');
    imgBox.className = 'mxl-imgs';
    imgBox.hidden = true;
    imgBox.innerHTML = '<div class="mxl-imgs-head"><strong>このサイトの画像</strong><span class="muted" id="mxlImgCount"></span></div><div class="mxl-img-grid" id="mxlImgGrid"></div>';
    urlBox.after(imgBox);

    // 一覧（元の #siteList は元のスクリプトがあとから書き込むことがあるので隠して、別の箱に出す）
    const oldList = $('siteList');
    const listEl = document.createElement('div');
    listEl.id = 'mxlSiteList';
    listEl.className = 'mxl-sites';
    if (oldList) { oldList.hidden = true; oldList.after(listEl); const h3 = oldList.parentElement && oldList.parentElement.querySelector('h3'); if (h3) h3.textContent = '自分のサイト'; }

    // ---------- 状態 ----------
    let currentSlug = null; // 読み込んだ／保存したサイトの識別子（新規なら null）
    let sites = [];
    let imagesSupported = null; // 画像 API があるか（未確認は null）
    let imgCount = 0, imgMax = 30;
    let saving = false;
    const pub = $('mxlPublic');
    const snapshot = () => JSON.stringify([slugInput.value.trim(), titleInput.value, ta.value, pub.checked]);
    let baseline = snapshot();
    const dirty = () => snapshot() !== baseline;

    function api(body) {
      return fetch('/api/lending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) { const e = new Error(d.error || `エラー (${r.status})`); e.status = r.status; throw e; }
          return d;
        }, () => { throw new Error('通信できませんでした。ネットワークを確認してください'); });
    }

    // ---------- 行番号 ----------
    let lineCount = 0;
    function updateGutter() {
      const n = ta.value.split('\n').length;
      if (n !== lineCount) {
        lineCount = n;
        let s = '';
        for (let i = 1; i <= n; i++) s += i + '\n';
        gutter.textContent = s;
      }
      gutter.scrollTop = ta.scrollTop;
    }
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });

    // ---------- ライブプレビュー ----------
    let lastPreview = null, previewTimer = null;
    function updatePreview() {
      clearTimeout(previewTimer);
      const html = ta.value.trim() ? ta.value : EMPTY_PREVIEW;
      if (html === lastPreview) return;
      lastPreview = html;
      frame.srcdoc = html;
    }
    const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 500); };
    function setView(v) {
      split.dataset.view = v;
      tabs.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === v)));
      if (v === 'preview') updatePreview();
    }
    tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setView(b.dataset.tab); });

    // ---------- 識別子のヒント・保存ボタンの文字 ----------
    function updateHint() {
      const raw = slugInput.value.trim();
      const slug = normalizeSlug(raw);
      if (!raw) { hint.innerHTML = '公開URL: <code>' + esc(location.origin) + '/site-view/識別子</code>'; hint.className = 'mxl-hint'; return; }
      if (!slug) { hint.textContent = '識別子は英数字とハイフンで2〜40文字にしてください'; hint.className = 'mxl-hint mxl-hint-bad'; return; }
      let text = '公開URL: <code>' + esc(siteUrl(slug)) + '</code>';
      if (slug !== raw.toLowerCase()) text += '（保存時に「' + esc(slug) + '」になります）';
      if (currentSlug && slug !== currentSlug) text += '<br><b>識別子を変えると、別の新しいサイトとして保存されます</b>（/site-view/' + esc(currentSlug) + ' はそのまま残ります）';
      hint.innerHTML = text;
      hint.className = 'mxl-hint' + (currentSlug && slug !== currentSlug ? ' mxl-hint-warn' : '');
    }
    function updateSaveLabel() {
      $('mxlPublicLabel').textContent = pub.checked ? '公開する' : '非公開（自分だけ）';
      if (!saving) saveBtn.textContent = pub.checked ? '保存して公開' : '保存（非公開）';
    }
    pub.addEventListener('change', () => { updateSaveLabel(); scheduleDraft(); });

    // ---------- 下書きの自動保存（サイトごと） ----------
    const draftKey = (slug) => DRAFT_PREFIX + (slug || currentSlug || '_new');
    function readDraft(slug) { try { return JSON.parse(lsGet(draftKey(slug)) || 'null'); } catch (_) { return null; } }
    let draftTimer = null;
    function flushDraft() {
      clearTimeout(draftTimer);
      if (!dirty()) return;
      lsSet(draftKey(), JSON.stringify({ slug: slugInput.value.trim(), title: titleInput.value, html: ta.value, private: !pub.checked, at: Date.now() }));
    }
    const scheduleDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 800); };
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushDraft(); });

    function setEditor(v) {
      slugInput.value = v.slug || '';
      titleInput.value = v.title || '';
      ta.value = v.html || '';
      pub.checked = !v.private;
      ta.scrollTop = 0;
      lineCount = 0;
      updateGutter(); updateHint(); updateSaveLabel(); updatePreview();
    }
    function onEdit() { updateGutter(); schedulePreview(); scheduleDraft(); }
    ta.addEventListener('input', onEdit);
    titleInput.addEventListener('input', scheduleDraft);
    slugInput.addEventListener('input', () => { updateHint(); scheduleDraft(); });

    // ---------- Tab字下げ・Ctrl+S ----------
    function insertText(text) {
      ta.focus();
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
      if (!ok) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    function indent(outdent) {
      const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      if (!outdent && !v.slice(s, e).includes('\n')) { insertText('  '); return; }
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
      if (le < 0) le = v.length;
      const lines = v.slice(ls, le).split('\n');
      const firstRemoved = outdent ? (lines[0].match(/^( {1,2}|\t)/) || [''])[0].length : 0;
      const out = lines.map((l) => (outdent ? l.replace(/^( {1,2}|\t)/, '') : '  ' + l)).join('\n');
      if (out === v.slice(ls, le)) return;
      ta.setSelectionRange(ls, le);
      insertText(out);
      if (s === e) { const c = Math.max(ls, s - firstRemoved); ta.setSelectionRange(c, c); }
      else ta.setSelectionRange(ls, ls + out.length);
    }
    let tabFree = false;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { tabFree = true; return; }
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing) {
        if (tabFree) { tabFree = false; return; }
        e.preventDefault();
        indent(e.shiftKey);
        return;
      }
      tabFree = false;
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) {
        if (document.documentElement.classList.contains('mixall-dialog-open')) return;
        e.preventDefault();
        save();
      }
    });

    // ---------- 公開URLの表示 ----------
    const STATUS = { public: ['公開中', 'ok'], reviewing: ['審査中', 'wait'], blocked: ['停止', 'bad'], private: ['非公開', 'off'] };
    function badge(status, note, isPrivate) {
      const st = STATUS[status] || (isPrivate ? STATUS.private : null);
      if (!st) return '';
      return `<span class="mxl-badge mxl-badge-${st[1]}"${note ? ` title="${esc(note)}"` : ''}>${st[0]}${note ? ' ⓘ' : ''}</span>`;
    }
    function showUrl(slug, url, status, note, isPrivate) {
      if (!slug) { urlBox.hidden = true; return; }
      const full = url || siteUrl(slug);
      const a = $('mxlUrl');
      a.href = full; a.textContent = full;
      $('mxlUrlBadge').innerHTML = badge(status, note, isPrivate);
      urlBox.hidden = false;
    }
    $('mxlUrlCopy').onclick = () => copyText($('mxlUrl').href);

    // 新しいタブで開く: 保存済みで変更が無ければ公開ページ、それ以外は保存前の内容を sandbox の枠で開く
    function openPreviewTab() {
      const slug = normalizeSlug(slugInput.value);
      if (currentSlug && slug === currentSlug && !dirty()) {
        const site = sites.find((s) => s.slug === currentSlug);
        window.open((site && site.url) || siteUrl(currentSlug), '_blank', 'noopener');
        return;
      }
      if (!ta.value.trim()) { toast('まだ中身がありません。HTMLを書くかテンプレートを選んでください', { kind: 'error' }); return; }
      const page = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>プレビュー（保存前）</title><style>html,body{margin:0;height:100%;background:#0f1115}iframe{width:100%;height:calc(100% - 30px);border:0;background:#fff}div{height:30px;line-height:30px;padding:0 12px;font:13px system-ui,sans-serif;color:#fff;background:#5b8cff}</style></head><body><div>保存前のプレビューです（まだ公開されていません）</div><iframe sandbox="${SANDBOX}" srcdoc="${esc(ta.value)}"></iframe></body></html>`;
      const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
      const w = window.open(url, '_blank');
      if (!w) toast('ポップアップがブロックされました。横のプレビューで確認できます', { kind: 'error' });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    openBtn.onclick = openPreviewTab;
    $('mxlPrevOpen').onclick = openPreviewTab;

    // ---------- 保存 ----------
    let recheckTimer = null;
    async function save() {
      if (saving) return false;
      if (errEl) errEl.textContent = '';
      const showErr = (m) => { if (errEl) errEl.textContent = m; toast(m, { kind: 'error' }); };
      const raw = slugInput.value.trim();
      if (!raw) { showErr('識別子を入力してください'); slugInput.focus(); return false; }
      const slug = normalizeSlug(raw);
      if (!slug) { showErr('識別子は英数字とハイフンで2〜40文字にしてください'); slugInput.focus(); return false; }
      if (currentSlug && slug !== currentSlug) {
        const ok = await ask(`識別子が「${currentSlug}」から「${slug}」に変わっています。\n新しい別のサイト /site-view/${slug} として保存します（/site-view/${currentSlug} はそのまま残ります）。`, { okLabel: '別のサイトとして保存', cancelLabel: 'やめる', icon: '⚠️', danger: false });
        if (!ok) return false;
      } else if (!currentSlug && sites.some((s) => s.slug === slug)) {
        const ok = await ask(`「${slug}」はすでにあなたのサイトにあります。今の内容で上書きしますか？`, { okLabel: '上書きする', cancelLabel: 'やめる', icon: '⚠️' });
        if (!ok) return false;
      }
      const isPrivate = !pub.checked;
      const prevKey = draftKey();
      saving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      saveBtn.setAttribute('aria-busy', 'true');
      if (errEl) errEl.innerHTML = '<span class="mxl-saving">保存しています… 内容の確認に最大15秒ほどかかることがあります</span>';
      try {
        const d = await api({ action: 'saveSite', slug, title: titleInput.value.trim(), html: ta.value, private: isPrivate });
        const site = d.site || {};
        currentSlug = site.slug || slug;
        slugInput.value = currentSlug;
        lsDel(prevKey); lsDel(draftKey(currentSlug));
        baseline = snapshot();
        if (errEl) errEl.textContent = '';
        const status = d.status || site.status || null;
        const url = d.url || site.url || siteUrl(currentSlug);
        showUrl(currentSlug, url, status, d.statusNote || site.statusNote, isPrivate);
        let msg;
        if (status === 'reviewing') msg = '保存しました。確認が終わると公開されます: ' + url;
        else if (status === 'blocked') msg = '保存しましたが、このサイトは停止中です' + ((d.statusNote || site.statusNote) ? '（' + (d.statusNote || site.statusNote) + '）' : '');
        else if (status === 'private' || isPrivate) msg = '保存しました（非公開・自分だけが見られます）: ' + url;
        else msg = '保存して公開しました: ' + url;
        toast(msg, { kind: status === 'blocked' ? 'error' : 'info' });
        updateHint();
        loadSites();
        loadImages();
        // 確認が長引くと reviewing で返るので、少しあとで一覧を読み直して状態を更新する
        clearTimeout(recheckTimer);
        if (status === 'reviewing') {
          let tries = 0;
          const recheck = async () => {
            tries++;
            await loadSites();
            const s = sites.find((x) => x.slug === currentSlug);
            if (s && s.status === 'reviewing' && tries < 4) recheckTimer = setTimeout(recheck, 20000 * tries);
            else if (s && s.status === 'public') toast('確認が終わり、公開されました: ' + (s.url || siteUrl(s.slug)));
            else if (s && s.status === 'blocked') toast('このサイトは停止されました' + (s.statusNote ? '（' + s.statusNote + '）' : ''), { kind: 'error' });
          };
          recheckTimer = setTimeout(recheck, 15000);
        }
        return true;
      } catch (e) {
        showErr('保存できませんでした: ' + e.message);
        return false;
      } finally {
        saving = false;
        saveBtn.disabled = false;
        saveBtn.removeAttribute('aria-busy');
        updateSaveLabel();
      }
    }
    saveBtn.onclick = (e) => { e.preventDefault(); save(); };

    // ---------- 新規作成・テンプレート ----------
    async function startNew() {
      if (!currentSlug && dirty() && (ta.value.trim() || titleInput.value.trim())) {
        const ok = await ask('保存していない内容があります。消して新しく始めますか？', { okLabel: '新しく始める', cancelLabel: 'やめる', icon: '📝' });
        if (!ok) return;
        lsDel(draftKey());
      } else flushDraft();
      currentSlug = null;
      setEditor({ slug: '', title: '', html: '', private: false });
      baseline = snapshot();
      showUrl(null);
      loadImages();
      renderSites();
      setView('edit');
      slugInput.focus();
    }
    $('mxlNew').onclick = startNew;
    guide.querySelector('.mxl-tpls').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-tpl]');
      if (!b) return;
      const t = TEMPLATES.find((x) => x.id === b.dataset.tpl);
      if (!t) return;
      if (ta.value.trim() && !(await ask(`エディタの中身を「${t.name}」のテンプレートに置き換えますか？\n（今の中身は消えます）`, { okLabel: '置き換える', cancelLabel: 'やめる', icon: t.icon }))) return;
      ta.focus();
      ta.select();
      insertText(t.html); // 元に戻す（Ctrl+Z）が効くように
      ta.setSelectionRange(0, 0);
      ta.scrollTop = 0;
      if (!titleInput.value.trim()) titleInput.value = t.title;
      updatePreview();
      scheduleDraft();
      toast(`「${t.name}」を入れました。文字や色を書きかえてみましょう`);
      if (!slugInput.value.trim()) slugInput.focus();
    });

    // ---------- サイトを開く ----------
    async function openSite(slug) {
      flushDraft();
      try {
        const d = await api({ action: 'getSite', slug });
        const s = d.site || {};
        currentSlug = s.slug || slug;
        setEditor({ slug: currentSlug, title: s.title || '', html: s.html || '', private: s.private === true });
        baseline = snapshot();
        const item = sites.find((x) => x.slug === currentSlug) || {};
        showUrl(currentSlug, s.url || item.url, s.status || item.status, s.statusNote || item.statusNote, s.private === true || item.private === true);
        renderSites();
        loadImages();
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const dr = readDraft(currentSlug);
        if (dr && (dr.html !== (s.html || '') || dr.title !== (s.title || '') || Boolean(dr.private) !== (s.private === true))) {
          const ok = await ask(`「${currentSlug}」に保存していない下書きがあります（${fmtDate(dr.at)}）。下書きを復元しますか？`, { okLabel: '下書きを復元', cancelLabel: '保存済みを使う', icon: '📝', danger: false });
          if (ok) setEditor({ slug: dr.slug || currentSlug, title: dr.title, html: dr.html, private: dr.private });
          else lsDel(draftKey(currentSlug));
          updateHint();
        }
      } catch (e) {
        toast('サイトを開けませんでした: ' + e.message, { kind: 'error' });
      }
    }

    // ---------- 一覧 ----------
    function renderSites() {
      if (!sites.length) { listEl.innerHTML = '<p class="muted">まだサイトがありません。上の「テンプレートから始める」から作ってみましょう。</p>'; return; }
      const sorted = sites.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      listEl.innerHTML = sorted.map((s) => {
        const url = s.url || siteUrl(s.slug);
        const upd = s.updatedAt ? fmtDate(s.updatedAt) : '';
        return `<div class="mxl-site${s.slug === currentSlug ? ' mxl-site-on' : ''}" data-slug="${esc(s.slug)}">
          <div class="mxl-site-main">
            <div class="mxl-site-title"><strong>${esc(s.title || s.slug)}</strong>${badge(s.status, s.statusNote, s.private === true)}${s.slug === currentSlug ? '<span class="mxl-editing">編集中</span>' : ''}</div>
            <div class="mxl-site-meta"><span>/site-view/${esc(s.slug)}</span>${upd ? `<span>更新 ${esc(upd)}</span>` : ''}</div>
          </div>
          <div class="mxl-site-acts">
            <a class="mxl-btn" href="${esc(url)}" target="_blank" rel="noopener">表示</a>
            <button type="button" class="ghost" data-act="copy">URLコピー</button>
            <button type="button" class="ghost" data-act="edit">編集</button>
            ${canCoin ? '<button type="button" class="ghost" data-act="coin">Coin実行</button>' : ''}
            <button type="button" class="ghost mxl-danger" data-act="del">削除</button>
          </div>
        </div>`;
      }).join('');
    }
    listEl.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) { if (e.target.closest('[data-retry]')) loadSites(); return; }
      const slug = b.closest('[data-slug]').dataset.slug;
      const s = sites.find((x) => x.slug === slug) || { slug };
      if (b.dataset.act === 'copy') copyText(s.url || siteUrl(slug));
      else if (b.dataset.act === 'edit') openSite(slug);
      else if (b.dataset.act === 'del') {
        if (!(await ask(`「${s.title || slug}」（/site-view/${slug}）を削除しますか？\nこの操作は取り消せません。`, { okLabel: '削除する', cancelLabel: 'やめる', danger: true, icon: '🗑️' }))) return;
        try {
          await api({ action: 'deleteSite', slug });
          toast('サイトを削除しました');
          if (currentSlug === slug) { currentSlug = null; baseline = ''; showUrl(null); updateHint(); loadImages(); }
          lsDel(draftKey(slug));
          loadSites();
        } catch (err) { toast('削除できませんでした: ' + err.message, { kind: 'error' }); }
      } else if (b.dataset.act === 'coin') {
        if (!(await ask('このサイトに保存されたCoin命令を実行しますか？', { okLabel: '実行する', icon: '🪙', danger: false }))) return;
        try {
          const r = await api({ action: 'runCoinProgram', slug });
          const text = (r.results || []).map((it) => (it.ok ? `${it.target}: +${it.amount}` : `${it.target || ''}: ${it.error}`)).join('\n') || '結果はありません';
          await ask('Coin命令の結果\n' + text, { okLabel: '閉じる', noCancel: true, icon: '🪙', danger: false });
        } catch (err) { toast(err.message, { kind: 'error' }); }
      }
    });
    async function loadSites() {
      if (!listEl.innerHTML) listEl.innerHTML = '<p class="muted">読み込み中…</p>';
      try {
        let r;
        try { r = await fetch('/api/lending?token=' + encodeURIComponent(token)); }
        catch (_) { throw new Error('通信できませんでした。ネットワークを確認してください'); }
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error((d && d.error) || `サーバーエラー (${r.status})`);
        if (!d || !Array.isArray(d.sites)) throw new Error('サーバーの応答を読み取れませんでした');
        sites = d.sites;
        renderSites();
        if (currentSlug) {
          const s = sites.find((x) => x.slug === currentSlug);
          if (s && (s.status || s.url)) showUrl(currentSlug, s.url, s.status, s.statusNote, s.private === true);
        }
        if (imagesSupported === null && !currentSlug && sites[0]) probeImages(sites[0].slug);
      } catch (e) {
        listEl.innerHTML = `<div class="mxl-err" role="alert"><p>サイト一覧を読み込めませんでした: ${esc(e.message)}</p><button type="button" class="ghost" data-retry>もう一度読み込む</button></div>`;
      }
    }
    window.loadSites = loadSites; // 元のスクリプトから呼ばれても新しい一覧を使う

    // ---------- 画像 ----------
    const notSupported = (e) => e && e.status === 400 && /action/i.test(e.message);
    function markImagesUnsupported() { imagesSupported = false; imgBox.hidden = true; $('mxlAddImg').hidden = true; }
    async function probeImages(slug) {
      try { const d = await api({ action: 'listImages', slug }); imagesSupported = Array.isArray(d.images); if (!imagesSupported) markImagesUnsupported(); }
      catch (e) { if (notSupported(e)) markImagesUnsupported(); }
    }
    async function loadImages() {
      const slug = currentSlug;
      if (!slug || imagesSupported === false) { imgBox.hidden = true; return; }
      try {
        const d = await api({ action: 'listImages', slug });
        if (slug !== currentSlug) return;
        if (!Array.isArray(d.images)) { markImagesUnsupported(); return; }
        imagesSupported = true;
        if (Number(d.max) > 0) imgMax = Number(d.max);
        imgCount = Number.isFinite(Number(d.count)) ? Number(d.count) : d.images.length;
        renderImages(d.images);
      } catch (e) {
        if (notSupported(e)) markImagesUnsupported();
        else imgBox.hidden = true;
      }
    }
    function renderImages(images) {
      $('mxlImgCount').textContent = `${imgCount}／${imgMax}枚`;
      $('mxlImgGrid').innerHTML = images.length ? images.map((im) => `<div class="mxl-img" data-id="${esc(im.id)}" data-url="${esc(im.url)}" data-name="${esc(im.name || '')}">
          <img src="${esc(im.url)}" alt="${esc(im.name || '')}" loading="lazy">
          <div class="mxl-img-name" title="${esc(im.name || '')}">${esc(im.name || '画像')}${(im.bytes || im.size) ? ` <small>${fmtSize(im.bytes || im.size)}</small>` : ''}</div>
          <div class="mxl-img-acts"><button type="button" class="ghost mxl-sm" data-img="insert">挿入</button><button type="button" class="ghost mxl-sm" data-img="copy">URL</button><button type="button" class="ghost mxl-sm mxl-danger" data-img="del" aria-label="削除">削除</button></div>
        </div>`).join('') : '<p class="muted">まだ画像はありません。「🖼 画像を追加」から入れられます。</p>';
      imgBox.hidden = false;
    }
    const imgTag = (url, name) => `<img src="${esc(url)}" alt="${esc(String(name || '').replace(/\.[a-z0-9]+$/i, ''))}" style="max-width:100%">`;
    $('mxlImgGrid').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-img]');
      if (!b) return;
      const box = b.closest('.mxl-img');
      if (b.dataset.img === 'copy') copyText(box.dataset.url);
      else if (b.dataset.img === 'insert') { setView('edit'); insertText(imgTag(box.dataset.url, box.dataset.name)); }
      else if (b.dataset.img === 'del') {
        if (!(await ask(`画像「${box.dataset.name || '画像'}」を削除しますか？\nページの中で使っていると表示されなくなります。`, { okLabel: '削除する', danger: true, icon: '🗑️' }))) return;
        try { const r = await api({ action: 'deleteImage', slug: currentSlug, id: box.dataset.id }); if (Number.isFinite(Number(r.count))) imgCount = Number(r.count); toast('画像を削除しました'); loadImages(); }
        catch (err) { toast('削除できませんでした: ' + err.message, { kind: 'error' }); }
      }
    });

    // 大きい画像は縮小する（長辺1600px・WebP/JPEG 0.85、700KB以下）。サーバーの上限は1枚 716800 バイト・1サイト30枚
    const MAX_BYTES = 716800;
    const readAsDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('画像を読み込めませんでした')); r.readAsDataURL(blob); });
    function loadImg(file) {
      return new Promise((res, rej) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); res(img); };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('この画像は読み込めませんでした')); };
        img.src = url;
      });
    }
    async function shrink(file) {
      if ((file.type === 'image/gif' || file.type === 'image/svg+xml') && file.size <= MAX_BYTES) return readAsDataUrl(file);
      if (file.type === 'image/svg+xml') throw new Error('SVG画像は700KB以下にしてください');
      const img = await loadImg(file);
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      if (!w0 || !h0) throw new Error('画像の大きさを読み取れませんでした');
      const scale = Math.min(1, 1600 / Math.max(w0, h0));
      if (scale === 1 && file.size <= MAX_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type)) return readAsDataUrl(file);
      const canvas = document.createElement('canvas');
      const webp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      const type = webp ? 'image/webp' : 'image/jpeg';
      let w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale)), q = 0.85;
      for (let i = 0; i < 10; i++) {
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await new Promise((res) => canvas.toBlob(res, type, q));
        if (blob && blob.size <= MAX_BYTES) return readAsDataUrl(blob);
        if (q > 0.65) q = Math.round((q - 0.1) * 100) / 100;
        else { w = Math.max(1, Math.round(w * 0.8)); h = Math.max(1, Math.round(h * 0.8)); }
      }
      throw new Error('画像を700KB以下にできませんでした');
    }
    let savedSel = null;
    $('mxlAddImg').onclick = () => {
      const slug = currentSlug || normalizeSlug(slugInput.value);
      if (!slug) { toast('先に識別子（URLになる名前）を入力してください', { kind: 'error' }); slugInput.focus(); return; }
      if (currentSlug && slug === currentSlug && imgCount >= imgMax) { toast(`画像は1つのサイトに${imgMax}枚までです。いらない画像を削除してください`, { kind: 'error' }); return; }
      savedSel = [ta.selectionStart, ta.selectionEnd];
      $('mxlFile').click();
    };
    $('mxlFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast('画像ファイルを選んでください', { kind: 'error' }); return; }
      const typed = normalizeSlug(slugInput.value);
      if (!currentSlug || typed !== currentSlug) {
        const ok = await ask('画像は保存済みのサイトにだけ追加できます。\nいまのサイトを保存してから画像を追加しますか？', { okLabel: '保存して追加', cancelLabel: 'やめる', icon: '🖼', danger: false });
        if (!ok) { toast('先にサイトを保存してから画像を追加してください', { kind: 'error' }); return; }
        const sel = savedSel;
        if (!(await save())) return;
        savedSel = sel;
      }
      const slug = currentSlug;
      const btn = $('mxlAddImg');
      btn.disabled = true; btn.textContent = '🖼 アップロード中…';
      try {
        const dataUrl = await shrink(file);
        const d = await api({ action: 'uploadImage', slug, name: file.name, dataUrl });
        if (!d.url) throw new Error('画像のURLが返ってきませんでした');
        setView('edit');
        ta.focus();
        if (savedSel) ta.setSelectionRange(savedSel[0], savedSel[1]);
        insertText(imgTag(d.url, file.name));
        toast('画像を追加しました');
        imagesSupported = true;
        if (Number.isFinite(Number(d.count))) imgCount = Number(d.count);
        if (slug === currentSlug) loadImages();
      } catch (err) {
        if (notSupported(err)) { markImagesUnsupported(); toast('画像の追加はまだ使えません', { kind: 'error' }); }
        else if (err.status === 404) toast('先にサイトを保存してから画像を追加してください', { kind: 'error' });
        else toast('画像を追加できませんでした: ' + err.message, { kind: 'error' });
      } finally {
        btn.disabled = false; btn.textContent = '🖼 画像を追加';
      }
    });

    // ---------- はじめの表示 ----------
    updateGutter(); updateHint(); updateSaveLabel(); updatePreview();
    loadSites();
    const newDraft = readDraft('_new');
    if (newDraft && (newDraft.html || newDraft.title) && !ta.value.trim()) {
      ask(`前回保存していない下書きがあります（${fmtDate(newDraft.at)}${newDraft.title ? '・' + newDraft.title : ''}）。復元しますか？`, { okLabel: '復元する', cancelLabel: 'いらない', icon: '📝', danger: false }).then((ok) => {
        if (ok) setEditor({ slug: newDraft.slug, title: newDraft.title, html: newDraft.html, private: newDraft.private });
        else lsDel(draftKey('_new'));
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
