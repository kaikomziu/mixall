// js/plus-hub.js（MixAll +（二世代）・＋広場 /Plus/）
// タブ（#odai / #ranking / #gallery / #avatar）で切り替える。
//   今日のお題: /api/plus の odai・setOdai（運営だけ差し替え）と、Ghost の「#今日のお題」付きの今日の投稿
//   週間ランキング: /api/plus の ranking・rankOptOut
//   ギャラリー: Ghost のフィードから画像だけをタイル表示
//   アバターメーカー: SVG でパーツを選んで 512x512 の PNG にし、プロフィールのアイコンに設定
(function () {
  'use strict';
  if (!window.MixAllPlus || window.__mxHubLoaded) return;
  window.__mxHubLoaded = true;
  const { esc, session, toast } = window.MixAllPlus;
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);
  const $ = (sel, el) => (el || document).querySelector(sel);

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } };
  const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');
  const token = () => (session() || {}).token || '';
  const ODAI_TAG = '#今日のお題';
  const odaiPostUrl = () => `/Ghost/?text=${encodeURIComponent(`${ODAI_TAG} `)}`;
  const toMs = (t) => (typeof t === 'number' ? t : Date.parse(t || '') || 0);
  // 日本時間の日付（YYYY-MM-DD）
  const jstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const timeText = (ms) => { try { return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
  const loginNote = '<p class="muted">ログインすると見られます。<a href="/login/">ログイン</a></p>';

  // ---------- Ghost のフィード ----------
  // 応答の posts は {post:{...}} の形と post そのものの形があるので、どちらも post に揃える
  const unwrap = (x) => (x && x.post && typeof x.post === 'object' ? x.post : x) || {};
  const postId = (p) => p.id || p.postId || p._id || '';
  const postUrl = (p) => `/Ghost/post.html?id=${encodeURIComponent(postId(p))}`;
  async function ghostFeed(q, limit, cursor) {
    const url = `/api/ghost?channel=main&limit=${limit}${cursor || ''}&q=${encodeURIComponent(q)}&token=${encodeURIComponent(token())}`;
    const res = await fetch(url);
    if (res.status === 401 || res.status === 403) { const e = new Error('forbidden'); e.status = res.status; throw e; }
    if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）`);
    const data = await res.json();
    return { posts: (data.posts || []).map(unwrap).filter((p) => postId(p)), next: data.nextCursor || data.cursor || null };
  }
  const forbiddenNote = '<p class="muted">Ghost の投稿を見られないアカウントです（13歳未満のアカウントや、Ghost の登録がまだの場合など）。</p>';
  const authorHtml = (p) => {
    const a = p.authorProfile || p.author || {};
    const name = a.displayName || a.handle || '名無し';
    const avatar = a.avatarUrl ? `<img class="mx-hub-av" src="${esc(a.avatarUrl)}" alt="" loading="lazy">` : '<span class="mx-hub-av mx-hub-av-none"></span>';
    return `${avatar}<b>${esc(name)}</b>${a.handle ? `<span class="muted">@${esc(a.handle)}</span>` : ''}`;
  };

  // ---------- メディアから画像の URL を探す ----------
  function imageSrc(m) {
    if (!m || typeof m !== 'object') return '';
    const kind = String(m.kind || m.type || '');
    if (/video|audio|embed/i.test(kind) && !/image/i.test(kind)) return m.thumbnailDataUrl || m.thumbnail || m.thumbUrl || '';
    const src = m.mediaUrl || m.url || m.dataUrl || m.thumbnailDataUrl || m.thumbnail || m.thumbUrl || m.src || '';
    if (!src || typeof src !== 'string') return '';
    if (/image/i.test(kind)) return src;
    // 種類が分からないものは、画像らしい URL のときだけ使う
    return /^data:image\//i.test(src) || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(src) ? src : '';
  }

  // =================================================================
  // 今日のお題
  // =================================================================
  async function showOdai(panel) {
    panel.innerHTML = `<div class="card"><h2>💡 今日のお題</h2><div class="mx-hub-odai-box"><p class="muted">読み込み中…</p></div></div>
      <div class="card"><div class="mx-hub-sub"><h3>みんなの投稿（今日）</h3><button type="button" class="secondary mx-hub-reload">更新</button></div><div class="mx-hub-odai-posts"><p class="muted">読み込み中…</p></div></div>`;
    const box = $('.mx-hub-odai-box', panel);
    let odai = null;
    try { odai = await plus('odai', {}, 'GET'); } catch (e) { box.innerHTML = `<p class="muted">お題を読み込めませんでした（${esc(e.message)}）</p>`; }
    if (odai) {
      const s = session() || {};
      const staff = s.isAdmin || s.isDeputyAdmin;
      box.innerHTML = `<p class="mx-hub-odai">${esc(odai.text || 'お題はまだありません')}</p>
        <p class="muted mx-hub-small">${esc(odai.day || '')}${odai.custom ? '・運営が設定したお題' : ''}${odai.tag ? `・タグ ${esc(odai.tag)}` : ''}</p>
        <div class="mx-hub-row"><a class="button" href="${odaiPostUrl()}">投稿する</a></div>
        ${staff ? `<div class="mx-hub-staff"><label class="muted mx-hub-small" for="mxOdaiInput">運営: 今日のお題を差し替える</label>
          <div class="mx-hub-row"><input id="mxOdaiInput" maxlength="120" value="${esc(odai.text || '')}" placeholder="お題を入力"><button type="button" class="mx-hub-setodai">差し替え</button></div></div>` : ''}`;
      const btn = $('.mx-hub-setodai', box);
      if (btn) btn.onclick = async () => {
        const text = $('#mxOdaiInput', box).value.trim();
        if (!text) { toast('お題を入力してください', { kind: 'error' }); return; }
        btn.disabled = true;
        try { await plus('setOdai', { text }); toast('お題を差し替えました'); showOdai(panel); }
        catch (e) { toast(e.message, { kind: 'error' }); btn.disabled = false; }
      };
    }
    const list = $('.mx-hub-odai-posts', panel);
    const today = (odai && odai.day) || jstDay(Date.now());
    const load = async () => {
      list.innerHTML = '<p class="muted">読み込み中…</p>';
      if (!token()) { list.innerHTML = loginNote; return; }
      try {
        const { posts } = await ghostFeed(ODAI_TAG, 30);
        const todays = posts.filter((p) => jstDay(toMs(p.createdAt)) === today);
        list.innerHTML = todays.length ? todays.map((p) => {
          const img = (p.media || []).map(imageSrc).find(Boolean);
          return `<a class="mx-hub-post" href="${postUrl(p)}"><div class="mx-hub-post-head">${authorHtml(p)}<span class="muted mx-hub-small">${esc(timeText(toMs(p.createdAt)))}</span></div>
            <p>${esc(String(p.text || '').slice(0, 280))}</p>${img ? `<img class="mx-hub-post-img" src="${esc(img)}" alt="" loading="lazy">` : ''}</a>`;
        }).join('') : `<p class="muted">今日の投稿はまだありません。最初の1件を投稿してみよう！</p>`;
      } catch (e) { list.innerHTML = e.status ? forbiddenNote : `<p class="muted">${esc(e.message)}</p>`; }
    };
    $('.mx-hub-reload', panel).onclick = load;
    load();
  }

  // =================================================================
  // 週間ランキング
  // =================================================================
  const BOARDS = [['posts', 'Ghost投稿数', '件'], ['likes', 'もらったリアクション', ''], ['uch', 'Uch書き込み', '件'], ['streak', '連続ログイン', '日'], ['coins', 'Coin', '']];
  async function showRanking(panel) {
    panel.innerHTML = '<div class="card"><h2>🏆 週間ランキング</h2><p class="muted">読み込み中…</p></div>';
    let r;
    try { r = await plus('ranking', {}, 'GET'); } catch (e) { panel.innerHTML = `<div class="card"><h2>🏆 週間ランキング</h2><p class="muted">読み込めませんでした（${esc(e.message)}）</p></div>`; return; }
    const boards = r.boards || {};
    const at = r.at ? timeText(toMs(r.at)) : '';
    const rows = (list, unit) => (list || []).map((x, i) => {
      const name = esc(x.name || x.handle || '名無し');
      const who = x.handle ? `<a href="/Ghost/profile.html?handle=${encodeURIComponent(x.handle)}">${name}</a>` : `<span>${name}</span>`;
      return `<li><span class="mx-hub-rk">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><span class="mx-hub-rname">${who}</span><span class="mx-hub-rval">${fmt(x.value)}${unit}</span></li>`;
    }).join('') || '<li class="muted">まだありません</li>';
    panel.innerHTML = `<div class="card"><div class="mx-hub-sub"><h2>🏆 週間ランキング</h2><span class="muted mx-hub-small">${at ? `集計: ${esc(at)}` : ''}</span></div>
        ${session() ? `<label class="mx-hub-optout"><input type="checkbox"${r.optOut ? ' checked' : ''}> 自分をランキングに出さない</label>` : ''}</div>
      <div class="mx-hub-boards">${BOARDS.map(([k, label, unit]) => `<div class="card mx-hub-board"><h3>${label}</h3><ol>${rows(boards[k], unit)}</ol></div>`).join('')}</div>`;
    const cb = $('.mx-hub-optout input', panel);
    if (cb) cb.onchange = async () => {
      cb.disabled = true;
      try { const res = await plus('rankOptOut', { on: cb.checked }); toast((res && res.note) || (cb.checked ? 'ランキングに出さないようにしました' : 'ランキングに出すようにしました')); }
      catch (e) { cb.checked = !cb.checked; toast(e.message, { kind: 'error' }); }
      cb.disabled = false;
    };
  }

  // =================================================================
  // ギャラリー
  // =================================================================
  async function showGallery(panel) {
    panel.innerHTML = `<div class="card"><div class="mx-hub-sub"><h2>🖼️ ギャラリー</h2><span class="muted mx-hub-small">Ghost に投稿された画像</span></div>
      <div class="mx-hub-gallery"></div><p class="mx-hub-gstatus muted">読み込み中…</p><div class="mx-hub-row mx-hub-center"><button type="button" class="secondary mx-hub-more" hidden>もっと見る</button></div></div>`;
    const grid = $('.mx-hub-gallery', panel);
    const status = $('.mx-hub-gstatus', panel);
    const more = $('.mx-hub-more', panel);
    if (!token()) { status.innerHTML = loginNote; return; }
    let cursor = '';
    let count = 0;
    const seen = new Set();
    const load = async () => {
      more.disabled = true;
      status.textContent = '読み込み中…'; status.hidden = false;
      try {
        const { posts, next } = await ghostFeed('', 40, cursor);
        let added = 0;
        posts.forEach((p) => {
          if (seen.has(postId(p))) return;
          seen.add(postId(p));
          (p.media || []).map(imageSrc).filter(Boolean).forEach((src) => {
            const a = document.createElement('a');
            a.className = 'mx-hub-tile'; a.href = postUrl(p);
            a.title = String(p.text || '').slice(0, 80);
            a.innerHTML = `<img src="${esc(src)}" alt="" loading="lazy">`;
            grid.appendChild(a); added++; count++;
          });
        });
        // 次のページ: nextCursor があればそれを、なければ最後の投稿の時刻より前を取る（Ghost の画面と同じ）
        const last = posts[posts.length - 1];
        if (next) cursor = `&cursor=${encodeURIComponent(next)}`;
        else if (last && posts.length >= 40) cursor = `&before=${encodeURIComponent(last.createdAt)}`;
        else cursor = null;
        more.hidden = !cursor;
        status.hidden = count > 0;
        status.textContent = count ? '' : (cursor ? 'この範囲には画像がありませんでした。「もっと見る」で続きを探せます。' : '画像はまだありません。');
        if (!added && cursor && count) toast('この範囲には画像がありませんでした');
      } catch (e) { status.hidden = false; status.innerHTML = e.status ? forbiddenNote : esc(e.message); }
      more.disabled = false;
    };
    more.onclick = load;
    load();
  }

  // =================================================================
  // アバターメーカー
  // =================================================================
  const PARTS = {
    face: [['round', '丸'], ['egg', 'たまご'], ['square', '四角']],
    skin: ['#ffe0c7', '#f8cfa8', '#e9b48a', '#c98e62', '#8d5a3b', '#cfe8ff'],
    hair: [['short', 'ショート'], ['long', 'ロング'], ['spiky', 'ツンツン'], ['bob', 'ボブ'], ['bun', 'おだんご'], ['buzz', 'ぼうず']],
    hairColor: ['#2b1d16', '#6b3e26', '#c9893b', '#f2d16b', '#e85d8a', '#5b8cff', '#8a8f9c', '#7ee0c0'],
    eyes: [['dot', 'てん'], ['kira', 'キラキラ'], ['smile', 'にっこり'], ['sleepy', 'ねむい'], ['jito', 'ジト目']],
    mouth: [['smile', 'にこ'], ['open', 'あーん'], ['flat', 'むっ'], ['cat', 'ω'], ['o', 'お']],
    acc: [['none', 'なし'], ['glasses', 'メガネ'], ['hat', '帽子'], ['ribbon', 'リボン'], ['phones', 'ヘッドホン']],
    bg: ['#5b8cff', '#9a5bff', '#ff4f8b', '#ffb84d', '#7ee0c0', '#1f232c', '#f4f5f7'],
  };
  const LABELS = { face: '輪郭', skin: '肌の色', hair: '髪型', hairColor: '髪の色', eyes: '目', mouth: '口', acc: 'アクセサリ', bg: '背景' };
  const AV_KEY = 'mixall.avatarMaker';
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const valueOf = (x) => (Array.isArray(x) ? x[0] : x);
  function defaults() { return { face: 'round', skin: PARTS.skin[0], hair: 'short', hairColor: PARTS.hairColor[0], eyes: 'kira', mouth: 'smile', acc: 'none', bg: PARTS.bg[0] }; }
  function loadAvatar() {
    const d = defaults();
    try {
      const saved = JSON.parse(lsGet(AV_KEY) || '{}');
      Object.keys(d).forEach((k) => { if (PARTS[k].map(valueOf).includes(saved[k])) d[k] = saved[k]; });
    } catch (_) { /* 初期値のまま */ }
    return d;
  }

  // パーツから SVG を組み立てる（viewBox 200x200）
  function avatarSvg(a, size) {
    const skin = a.skin, hc = a.hairColor, ink = '#2a2230';
    const head = a.face === 'square' ? `<rect x="42" y="50" width="116" height="118" rx="34" fill="${skin}"/>`
      : a.face === 'egg' ? `<ellipse cx="100" cy="110" rx="54" ry="64" fill="${skin}"/>`
        : `<circle cx="100" cy="110" r="60" fill="${skin}"/>`;
    const ears = `<circle cx="42" cy="114" r="12" fill="${skin}"/><circle cx="158" cy="114" r="12" fill="${skin}"/>`;
    const hairBack = {
      long: `<path d="M36 104 Q34 34 100 32 Q166 34 164 104 L168 182 Q152 190 140 178 L140 116 L60 116 L60 178 Q48 190 32 182Z" fill="${hc}"/>`,
      bob: `<path d="M36 76 Q36 30 100 30 Q164 30 164 76 L166 144 Q150 152 138 142 L62 142 Q50 152 34 144Z" fill="${hc}"/>`,
      bun: `<circle cx="100" cy="34" r="22" fill="${hc}"/>`,
    }[a.hair] || '';
    const hairFront = {
      short: `<path d="M40 104 Q38 40 100 38 Q162 40 160 104 Q152 72 124 66 Q104 82 72 68 Q50 76 40 104Z" fill="${hc}"/>`,
      long: `<path d="M40 106 Q40 40 100 38 Q160 40 160 106 Q150 74 118 70 Q96 86 66 74 Q48 82 40 106Z" fill="${hc}"/>`,
      spiky: `<path d="M40 100 L44 60 L56 70 L60 34 L76 54 L88 22 L100 50 L114 22 L124 54 L140 34 L144 70 L156 60 L160 100 Q140 72 100 74 Q60 72 40 100Z" fill="${hc}"/>`,
      bob: `<path d="M42 94 Q42 38 100 36 Q158 38 158 94 Q132 78 100 78 Q68 78 42 94Z" fill="${hc}"/>`,
      bun: `<path d="M42 100 Q42 44 100 42 Q158 44 158 100 Q140 70 100 68 Q60 70 42 100Z" fill="${hc}"/>`,
      buzz: `<path d="M44 92 Q46 46 100 44 Q154 46 156 92 Q130 66 100 64 Q70 66 44 92Z" fill="${hc}" opacity=".8"/>`,
    }[a.hair] || '';
    const eye = (x) => ({
      dot: `<circle cx="${x}" cy="112" r="6" fill="${ink}"/>`,
      kira: `<circle cx="${x}" cy="112" r="9" fill="${ink}"/><circle cx="${x + 3}" cy="108" r="3.2" fill="#fff"/><circle cx="${x - 3}" cy="115" r="1.6" fill="#fff"/>`,
      smile: `<path d="M${x - 9} 114 Q${x} 102 ${x + 9} 114" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      sleepy: `<path d="M${x - 9} 110 Q${x} 118 ${x + 9} 110" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      jito: `<path d="M${x - 10} 108 L${x + 10} 108" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><circle cx="${x}" cy="113" r="4.5" fill="${ink}"/>`,
    }[a.eyes] || '');
    const mouth = {
      smile: `<path d="M86 138 Q100 152 114 138" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      open: `<path d="M86 136 Q100 160 114 136Z" fill="#c23a4b"/><path d="M93 146 Q100 152 107 146" fill="#ff8fa0"/>`,
      flat: `<path d="M90 142 L110 142" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`,
      cat: `<path d="M86 138 Q93 147 100 138 Q107 147 114 138" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      o: `<ellipse cx="100" cy="143" rx="6" ry="8" fill="#c23a4b"/>`,
    }[a.mouth] || '';
    const cheeks = '<ellipse cx="66" cy="132" rx="10" ry="6" fill="#ff7a9a" opacity=".35"/><ellipse cx="134" cy="132" rx="10" ry="6" fill="#ff7a9a" opacity=".35"/>';
    const acc = {
      glasses: `<g stroke="${ink}" stroke-width="3.5" fill="rgba(255,255,255,.18)"><circle cx="78" cy="112" r="15"/><circle cx="122" cy="112" r="15"/></g><path d="M93 111 L107 111" stroke="${ink}" stroke-width="3.5"/>`,
      hat: '<rect x="58" y="14" width="84" height="46" rx="12" fill="#2f3542"/><rect x="58" y="44" width="84" height="9" fill="#ff4f8b"/><ellipse cx="100" cy="60" rx="72" ry="12" fill="#2f3542"/>',
      ribbon: '<g fill="#ff4f8b"><path d="M138 50 L116 36 L118 64Z"/><path d="M138 50 L160 36 L158 64Z"/><circle cx="138" cy="50" r="6" fill="#ff7aa6"/></g>',
      phones: `<path d="M36 112 Q36 30 100 30 Q164 30 164 112" stroke="#2f3542" stroke-width="10" fill="none" stroke-linecap="round"/><rect x="26" y="96" width="22" height="38" rx="10" fill="#2f3542"/><rect x="152" y="96" width="22" height="38" rx="10" fill="#2f3542"/><rect x="30" y="104" width="14" height="22" rx="6" fill="#5b8cff"/><rect x="156" y="104" width="14" height="22" rx="6" fill="#5b8cff"/>`,
    }[a.acc] || '';
    const sz = size ? ` width="${size}" height="${size}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"${sz}><rect width="200" height="200" fill="${a.bg}"/>${hairBack}${ears}${head}${hairFront}${cheeks}${eye(78)}${eye(122)}${mouth}${acc}</svg>`;
  }

  // SVG を 512x512 の PNG（data URL）にする
  function avatarPng(a) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 512; c.height = 512;
          c.getContext('2d').drawImage(img, 0, 0, 512, 512);
          resolve(c.toDataURL('image/png'));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('画像を作れませんでした'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(a, 512))}`;
    });
  }

  function showAvatar(panel) {
    let a = loadAvatar();
    panel.innerHTML = `<div class="card"><h2>🎨 アバターメーカー</h2>
      <div class="mx-av-wrap"><div class="mx-av-side"><div class="mx-av-preview"></div>
        <div class="mx-hub-row mx-hub-center"><button type="button" class="secondary mx-av-random">🎲 ランダム</button></div>
        <div class="mx-hub-row mx-hub-center"><button type="button" class="mx-av-set">アイコンに設定</button><button type="button" class="secondary mx-av-save">PNGを保存</button></div></div>
      <div class="mx-av-parts"></div></div></div>`;
    const preview = $('.mx-av-preview', panel);
    const parts = $('.mx-av-parts', panel);
    const save = () => lsSet(AV_KEY, JSON.stringify(a));
    const draw = () => {
      preview.innerHTML = avatarSvg(a);
      parts.querySelectorAll('[data-part]').forEach((b) => {
        const on = a[b.dataset.part] === b.dataset.value;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    };
    parts.innerHTML = Object.keys(PARTS).map((k) => {
      const isColor = typeof PARTS[k][0] === 'string';
      const btns = PARTS[k].map((x) => isColor
        ? `<button type="button" class="mx-av-swatch" data-part="${k}" data-value="${x}" style="background:${x}" aria-label="${LABELS[k]} ${x}"></button>`
        : `<button type="button" class="secondary mx-av-opt" data-part="${k}" data-value="${x[0]}">${esc(x[1])}</button>`).join('');
      return `<div class="mx-av-group"><h4>${LABELS[k]}</h4><div class="mx-av-opts">${btns}</div></div>`;
    }).join('');
    parts.addEventListener('click', (e) => {
      const b = e.target.closest('[data-part]');
      if (!b) return;
      a[b.dataset.part] = b.dataset.value; save(); draw();
    });
    $('.mx-av-random', panel).onclick = () => {
      Object.keys(PARTS).forEach((k) => { a[k] = valueOf(pick(PARTS[k])); });
      if (Math.random() < 0.5) a.acc = 'none';
      save(); draw();
    };
    $('.mx-av-save', panel).onclick = async () => {
      try {
        const png = await avatarPng(a);
        const link = document.createElement('a');
        link.href = png; link.download = 'mixall-avatar.png';
        document.body.appendChild(link); link.click(); link.remove();
      } catch (e) { toast(e.message, { kind: 'error' }); }
    };
    const setBtn = $('.mx-av-set', panel);
    setBtn.onclick = async () => {
      const s = session();
      if (!s || !s.token) { toast('ログインしてください', { kind: 'error' }); return; }
      if (window.MixAllDialog && !(await window.MixAllDialog.confirm('このアバターをプロフィールのアイコンに設定しますか？'))) return;
      setBtn.disabled = true;
      try {
        const png = await avatarPng(a);
        const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateProfile', token: s.token, avatarDataUrl: png, avatarType: 'image' }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false || data.error) throw new Error(data.error || data.message || `設定できませんでした（${res.status}）`);
        try {
          const cur = JSON.parse(localStorage.getItem('netrify_session') || '{}');
          localStorage.setItem('netrify_session', JSON.stringify({ ...cur, avatarUrl: data.avatarUrl || png, avatarType: data.avatarType || 'image' }));
        } catch (_) { /* ignore */ }
        toast('アイコンを設定しました');
      } catch (e) { toast(e.message, { kind: 'error' }); }
      setBtn.disabled = false;
    };
    draw();
  }

  // =================================================================
  // タブ
  // =================================================================
  const TABS = { odai: showOdai, ranking: showRanking, gallery: showGallery, avatar: showAvatar };
  const shown = {};
  function route() {
    let tab = location.hash.replace(/^#/, '');
    if (!TABS[tab]) tab = 'odai';
    document.querySelectorAll('.mx-hub-tabs [data-tab]').forEach((t) => {
      const on = t.dataset.tab === tab;
      t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
      // スマホでタブが横にはみ出しているときは、選んだタブを見える位置へ
      if (on && t.parentElement) t.parentElement.scrollLeft = Math.max(0, t.offsetLeft - 16);
    });
    Object.keys(TABS).forEach((k) => { const p = document.getElementById(`tab-${k}`); if (p) p.hidden = k !== tab; });
    const panel = document.getElementById(`tab-${tab}`);
    if (panel && !shown[tab]) { shown[tab] = true; TABS[tab](panel); }
  }
  function init() {
    if (!document.querySelector('.mx-hub-tabs')) return;
    window.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
