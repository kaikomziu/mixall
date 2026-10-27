// js/plus-admin.js（MixAll +（二世代）・運営画面）
// 以前の GitHub 版（js/admin-plus.js）から移したもの:
//   統計ダッシュボード（直近30日のグラフ） / お知らせバナーの配信 / 運営から個別に連絡（警告）
// MixAll + で足したもの: 通報の受付箱（状態別タブ・警告フォームへの連携） / 使用量パネル（DB・ストア・cron・アーカイブ・応答速度）
// v27c の運営画面にもともとある「Supabaseの使用量」「データ書き出し」はそのまま使う。
(function () {
  'use strict';
  if (!window.MixAllPlus) return;
  const { esc, session, toast } = window.MixAllPlus;
  const plus = (a, b, m) => window.MixAllPlus.api(a, b, m);

  function host() {
    let el = document.getElementById('mxAdminPlus');
    if (el) return el;
    const main = document.querySelector('main');
    if (!main) return null;
    el = document.createElement('div');
    el.id = 'mxAdminPlus';
    main.prepend(el);
    return el;
  }

  // 30日分の棒グラフ（SVG）
  function bars(series, color) {
    const w = 600; const h = 120; const pad = 18;
    const max = Math.max(1, ...series.map((x) => x.n));
    const bw = (w - pad * 2) / series.length;
    const rects = series.map((x, i) => {
      const bh = Math.round(((h - pad * 2) * x.n) / max);
      return `<rect x="${(pad + i * bw + 1).toFixed(1)}" y="${h - pad - bh}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh}" rx="2" fill="${color}"><title>${x.day}: ${x.n}</title></rect>`;
    }).join('');
    return `<svg class="mx-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="直近30日"><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="currentColor" stroke-opacity=".2"/>${rects}
      <text x="${pad}" y="${h - 4}" font-size="10" fill="currentColor" opacity=".6">${series[0].day.slice(5)}</text><text x="${w - pad}" y="${h - 4}" font-size="10" fill="currentColor" opacity=".6" text-anchor="end">${series[series.length - 1].day.slice(5)}</text>
      <text x="${pad}" y="12" font-size="10" fill="currentColor" opacity=".6">最大 ${max}</text></svg>`;
  }
  function meter(label, value, limit, unit) {
    const rate = limit ? value / limit : 0;
    return `<div style="margin:10px 0"><div class="row" style="justify-content:space-between"><span>${label}</span><strong>${value.toLocaleString()}${unit} / ${limit.toLocaleString()}${unit}（${Math.round(rate * 100)}%）</strong></div>
      <div class="mx-meter${rate >= 0.95 ? ' danger' : rate >= 0.8 ? ' warn' : ''}"><i style="width:${Math.min(100, rate * 100).toFixed(1)}%"></i></div></div>`;
  }

  const when = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ja-JP'); };
  const num = (n) => (Number(n) || 0).toLocaleString('ja-JP');
  function fmtBytes(n) {
    let v = Number(n) || 0; let i = 0;
    const u = ['B', 'KB', 'MB', 'GB'];
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 || v >= 100 ? 0 : 1)} ${u[i]}`;
  }

  // =================================================================
  // 🚩 通報の受付箱
  // =================================================================
  const TARGET_LABEL = {
    pocketMessage: 'ぽけっと', pocketRoom: 'ぽけっとのルーム', ghostPost: 'Ghost投稿', ghostComment: 'Ghostコメント', ghostProfile: 'Ghostプロフィール',
    ghostStory: 'Ghostストーリー', uchPost: 'Uch', uchThread: 'Uchのスレ', mail: 'Mail', account: 'アカウント', user: 'アカウント', site: '公開サイト'
  };
  const REPORT_STATUS = [['open', '未対応'], ['reviewing', '対応中'], ['resolved', '解決'], ['dismissed', '却下']];
  const STATUS_LABEL = Object.fromEntries(REPORT_STATUS);
  let reportTab = 'open'; // 画面を作り直しても選んでいたタブを残す

  // v27c の運営画面の call('resolveReport', …) と同じ呼び方（/api/admin に token 付きで POST）
  async function resolveReport(reportId, status, note) {
    const s = session();
    const body = { action: 'resolveReport', token: s && s.token, reportId, status, ...(note ? { note } : {}) };
    if (window.Netrify && window.Netrify.api) return window.Netrify.api('/api/admin', body);
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `エラー (${r.status})`);
    return d;
  }
  // 通報の理由から、個別連絡フォームのテンプレートを選ぶ
  function guessTpl(r) {
    const t = `${r.reason || ''} ${r.detail || ''}`.toLowerCase();
    if (/spam|連投|スパム|宣伝|荒らし/.test(t)) return 'spam';
    if (/abuse|harass|悪口|誹謗|中傷|いじめ|暴言|嫌がらせ|差別/.test(t)) return 'abuse';
    if (/nsfw|sexual|adult|性的|年齢|グロ|不適切な画像/.test(t)) return 'nsfw';
    return 'other';
  }

  async function loadReports(card, warnCard) {
    const title = '<h2 style="margin:0">🚩 通報の受付箱</h2>';
    card.innerHTML = `${title}<p class="muted">読み込み中...</p>`;
    let d;
    try { d = await plus('reports', {}, 'GET'); } catch (e) {
      card.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center">${title}<button type="button" class="secondary" data-reload>再読み込み</button></div><p class="muted">読み込めませんでした: ${esc(e.message)}</p>`;
      card.querySelector('[data-reload]').onclick = () => loadReports(card, warnCard);
      return;
    }
    const items = (d.items || []).slice().sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
    const warned = d.warned || {};
    const statusOf = (r) => (STATUS_LABEL[r.status] ? r.status : 'open');
    const authorOf = (r) => (r.snapshot && r.snapshot.authorEmail ? String(r.snapshot.authorEmail) : '');
    // 投稿者ごとの通報の数（全部 / まだ片付いていないもの）
    const byAuthor = {};
    items.forEach((r) => {
      const a = authorOf(r); if (!a) return;
      const x = byAuthor[a] || (byAuthor[a] = { all: 0, open: 0 });
      x.all++; if (statusOf(r) === 'open' || statusOf(r) === 'reviewing') x.open++;
    });
    const count = (st) => items.filter((r) => statusOf(r) === st).length;

    const itemHtml = (r) => {
      const s = r.snapshot || {};
      const author = authorOf(r);
      const st = statusOf(r);
      const nWarn = author ? Number(warned[author] || 0) : 0;
      const same = author ? byAuthor[author] : null;
      const text = typeof s.text === 'string' && s.text.trim() ? s.text : '';
      const snap = text
        ? `<details class="mx-rep-snap"><summary>通報された内容</summary><div class="mx-rep-text">${esc(text)}</div></details>`
        : `<details class="mx-rep-snap"><summary>通報された内容（本文なし・記録をそのまま表示）</summary><div class="mx-rep-text">${esc(JSON.stringify(s, null, 2))}</div></details>`;
      return `<div class="mx-rep-item" data-id="${esc(r.id)}">
        <div class="mx-rep-head"><span class="mx-rep-kind">${esc(TARGET_LABEL[r.targetType] || r.targetType || '不明')}</span><strong>${esc(r.reason || '（理由なし）')}</strong><span class="muted">${esc(when(r.createdAt))}</span></div>
        ${r.detail ? `<p class="mx-rep-detail">${esc(r.detail)}</p>` : ''}
        ${snap}
        <div class="mx-rep-meta">投稿者: ${author ? `<strong>${esc(author)}</strong>` : '<span class="muted">不明</span>'}
          ${author ? `<span class="mx-rep-badge${nWarn ? ' warn' : ''}">送った警告 ${nWarn}回</span>` : ''}
          ${same && same.all > 1 ? `<span class="mx-rep-badge multi">この人への通報 ${same.all}件${same.open > 1 ? `（未解決 ${same.open}）` : ''}</span>` : ''}
          <br><span class="muted">通報者: ${esc(r.reporterEmail || '不明')}${r.targetId ? ` ・ 対象ID: ${esc(r.targetId)}` : ''}</span>
          ${r.resolutionNote ? `<br><span class="muted">メモ: ${esc(r.resolutionNote)}</span>` : ''}
        </div>
        <div class="mx-rep-actions">
          ${REPORT_STATUS.filter(([k]) => k !== 'open' && k !== st).map(([k, label]) => `<button type="button" class="secondary" data-status="${k}">${label}</button>`).join('')}
          ${author ? '<button type="button" class="mx-rep-warn" data-warn>⚠ 警告を送る</button>' : ''}
        </div>
      </div>`;
    };

    const draw = () => {
      const list = items.filter((r) => statusOf(r) === reportTab);
      card.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center">${title}<button type="button" class="secondary" data-reload>更新</button></div>
        <div class="mx-rep-tabs" role="tablist">${REPORT_STATUS.map(([k, label]) => `<button type="button" role="tab" class="mx-rep-tab${k === reportTab ? ' on' : ''}" aria-selected="${k === reportTab}" data-tab="${k}">${label}<span>${count(k)}</span></button>`).join('')}</div>
        <div class="mx-rep-list">${list.length ? list.map(itemHtml).join('') : `<p class="muted">${STATUS_LABEL[reportTab]}の通報はありません。</p>`}</div>`;
      card.querySelector('[data-reload]').onclick = () => loadReports(card, warnCard);
      card.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { reportTab = b.dataset.tab; draw(); }; });
      card.querySelectorAll('.mx-rep-item').forEach((row) => {
        const r = items.find((x) => String(x.id) === row.dataset.id);
        if (!r) return;
        row.querySelectorAll('[data-status]').forEach((b) => { b.onclick = async () => {
          const status = b.dataset.status;
          let note = '';
          if (status === 'resolved' || status === 'dismissed') {
            note = await window.MixAllDialog.prompt(`「${STATUS_LABEL[status]}」にします。対応のメモ（なくてもOK）`, r.resolutionNote || '', { icon: '🚩', okLabel: STATUS_LABEL[status] + 'にする' });
            if (note === null) return;
          }
          b.disabled = true;
          try { await resolveReport(r.id, status, note.trim()); toast(`「${STATUS_LABEL[status]}」にしました`); }
          catch (e) { toast(e.message, { kind: 'error' }); b.disabled = false; return; }
          loadReports(card, warnCard);
        }; });
        const wb = row.querySelector('[data-warn]');
        if (wb) wb.onclick = () => {
          const author = authorOf(r);
          const n = Number(warned[author] || 0);
          const to = warnCard.querySelector('#mxWarnTo');
          const tpl = warnCard.querySelector('#mxWarnTpl');
          to.value = author;
          // これまでに2回以上警告していれば「最終警告」を選んでおく
          warnCard.querySelector('#mxWarnLevel').value = n >= 2 ? 'final' : 'warning';
          tpl.value = guessTpl(r);
          tpl.dispatchEvent(new Event('change'));
          warnCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          warnCard.classList.remove('mx-rep-target'); void warnCard.offsetWidth; warnCard.classList.add('mx-rep-target');
          setTimeout(() => tpl.focus({ preventScroll: true }), 500);
          toast(`${author} を宛先に入れました（これまでの警告 ${n}回）。テンプレートと本文を確認して送ってください`);
        };
      });
    };
    draw();
  }

  // =================================================================
  // 📈 使用量パネル
  // =================================================================
  const GH_RUNS = 'https://api.github.com/repos/kaikomziu/mixall-data/actions/runs?per_page=5';
  function usageHtml(u) {
    const db = (u && u.db) || {};
    const det = u && u.detail;
    let h = Number.isFinite(Number(db.dbMB)) && Number(db.limitDbMB) > 0
      ? meter('データベース容量（Supabase）', Math.round(Number(db.dbMB) * 10) / 10, Number(db.limitDbMB), 'MB')
      : '<p class="muted">データベース容量を取得できませんでした。</p>';
    if (!det) return `${h}<p class="muted">詳しい内訳はまだありません（Supabase に mixall_usage_detail() を入れると表示されます）。</p>`;
    const stores = (det.stores || []).slice().sort((a, b) => (Number(b.bytes) || 0) - (Number(a.bytes) || 0)).slice(0, 15);
    const max = Math.max(1, ...stores.map((s) => Number(s.bytes) || 0));
    const failed = Number(det.cron_failed_24h) || 0;
    h += `<div class="mx-stat-grid">
        <div class="mx-stat"><b>${fmtBytes(det.db_bytes)}</b><span>DB全体（実測）</span></div>
        <div class="mx-stat"><b>${num(det.kv_rows)}</b><span>kv の行数</span></div>
        <div class="mx-stat"><b>${num(det.cron_runs_24h)}</b><span>cron の実行（24時間）</span></div>
        <div class="mx-stat${failed > 0 ? ' mx-bad' : ''}"><b>${num(failed)}</b><span>cron の失敗（24時間）</span></div>
      </div>
      <h3>ストアごとの容量（上位15）</h3>
      <div class="mx-use-bars">${stores.length ? stores.map((s) => `<div class="mx-use-bar"><span class="name" title="${esc(s.store)}">${esc(s.store)}</span><span class="track"><i style="width:${((100 * (Number(s.bytes) || 0)) / max).toFixed(1)}%"></i></span><span class="val">${fmtBytes(s.bytes)}<small>${num(s.rows)}行</small></span></div>`).join('') : '<p class="muted">データがありません。</p>'}</div>`;
    return h;
  }
  async function archiveRuns() {
    const r = await fetch(GH_RUNS, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub の取得回数の上限です（しばらくすると戻ります）' : `GitHub エラー (${r.status})`);
    const d = await r.json();
    return Array.isArray(d.workflow_runs) ? d.workflow_runs : [];
  }
  function runLabel(run) {
    if (run.status !== 'completed') return ['実行中', 'run'];
    return ({ success: ['成功', 'ok'], failure: ['失敗', 'bad'], timed_out: ['時間切れ', 'bad'], startup_failure: ['失敗', 'bad'], cancelled: ['中止', 'skip'], skipped: ['スキップ', 'skip'] })[run.conclusion] || [run.conclusion || '不明', 'skip'];
  }
  function runsHtml(runs) {
    if (!runs.length) return '<p class="muted">実行の記録がありません。</p>';
    return `<ul class="mx-use-runs">${runs.map((run) => {
      const [label, cls] = runLabel(run);
      const link = /^https:\/\/github\.com\//.test(String(run.html_url || '')) ? run.html_url : '';
      const name = esc(run.display_title || run.name || 'archive');
      return `<li><span class="mx-run ${cls}">${label}</span><span class="when">${esc(when(run.run_started_at || run.created_at))}</span>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${name}</a>` : `<span>${name}</span>`}</li>`;
    }).join('')}</ul>`;
  }
  // EdgeOne の応答速度: /api/site-state を3回続けて取り、平均を出す
  async function measurePing() {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const r = await fetch('/api/site-state', { cache: 'no-store' });
      await r.text();
      if (!r.ok) throw new Error(`site-state エラー (${r.status})`);
      times.push(performance.now() - t0);
    }
    return times;
  }
  function pingHtml(times) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const cls = avg < 400 ? 'ok' : avg < 1000 ? 'warn' : 'bad';
    return `<div class="mx-use-ping ${cls}"><b>${Math.round(avg)}</b><small>ms</small></div><p class="muted" style="margin:4px 0 0">3回の平均（${times.map((t) => Math.round(t)).join(' / ')} ms）</p>`;
  }

  async function loadUsage(card) {
    const gen = String(Date.now() + Math.random());
    card.dataset.gen = gen;
    card.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">📈 使用量パネル</h2><button type="button" class="secondary" data-reload>更新</button></div>
      <div data-part="db"><p class="muted">データベースの使用量を読み込み中...</p></div>
      <div class="mx-use-cols">
        <div><h3>アーカイブ（GitHub）の最新実行</h3><div data-part="archive"><p class="muted">読み込み中...</p></div></div>
        <div><h3>EdgeOne の応答速度</h3><div data-part="ping"><p class="muted">測定中...</p></div></div>
      </div>`;
    card.querySelector('[data-reload]').onclick = () => loadUsage(card);
    // 3つは別々に取り、失敗したところだけ「取れなかった」と出す（あとから押した「更新」の結果を古い結果で上書きしない）
    const put = (name, html) => { if (card.dataset.gen === gen) card.querySelector(`[data-part="${name}"]`).innerHTML = html; };
    plus('usage', {}, 'GET').then((u) => put('db', usageHtml(u)), (e) => put('db', `<p class="muted">使用量を読み込めませんでした: ${esc(e.message)}</p>`));
    archiveRuns().then((runs) => put('archive', runsHtml(runs)), (e) => put('archive', `<p class="muted">取得できませんでした: ${esc(e.message)}</p>`));
    measurePing().then((t) => put('ping', pingHtml(t)), (e) => put('ping', `<p class="muted">測定できませんでした: ${esc(e.message)}</p>`));
  }

  async function render() {
    const el = host();
    if (!el) return;
    let stats; let ann = null;
    try { [stats, ann] = await Promise.all([plus('adminStats', {}, 'GET'), plus('announcement', {}, 'GET').then((d) => d.announcement)]); }
    catch (e) { el.innerHTML = `<div class="card"><p class="muted">統計を読み込めませんでした: ${esc(e.message)}</p></div>`; return; }
    const t = stats.totals; const u = stats.usage;
    el.innerHTML = `
      <div class="card"><h2 style="margin-top:0">📊 MixAll + ダッシュボード</h2>
        <div class="mx-stat-grid">
          <div class="mx-stat"><b>${t.users}</b><span>登録アカウント</span></div>
          <div class="mx-stat"><b>${t.active24}</b><span>24時間以内に利用</span></div>
          <div class="mx-stat"><b>${t.active7}</b><span>7日以内に利用</span></div>
          <div class="mx-stat"><b>${t.ghostPosts}</b><span>Ghost投稿</span></div>
          <div class="mx-stat"><b>${t.uchPosts}</b><span>Uch書き込み</span></div>
          <div class="mx-stat"><b>${t.openReports}</b><span>未対応の通報</span></div>
        </div>
        ${meter('データベース容量（Supabase）', u.dbMB, u.limitDbMB, 'MB')}
        <h3>新規登録（直近30日）</h3>${bars(stats.series.signups, '#8b6bff')}
        <h3>Ghost投稿</h3>${bars(stats.series.ghost, '#4fdcff')}
        <h3>Uch書き込み</h3>${bars(stats.series.uch, '#3dffb8')}
        <h3>通報</h3>${bars(stats.series.reports, '#ff5c9a')}
      </div>
      <div class="card"><h2 style="margin-top:0">📢 お知らせバナー</h2>
        <p class="muted">全員の画面上部に表示されます（各自が×で閉じるまで）。空にして配信すると取り下げます。</p>
        ${ann ? `<p>配信中: <strong>${esc(ann.text)}</strong>${ann.expiresAt ? `（${esc(new Date(ann.expiresAt).toLocaleString('ja-JP'))}まで）` : ''}</p>` : '<p class="muted">いまは配信していません。</p>'}
        <textarea id="mxAnnText" placeholder="例: 10/25 22:00〜23:00 にメンテナンスを行います">${esc(ann ? ann.text : '')}</textarea>
        <div class="row">
          <select id="mxAnnLevel" style="width:auto;margin:0"><option value="info">お知らせ</option><option value="success">うれしいお知らせ</option><option value="warning">注意</option><option value="danger">重要</option></select>
          <select id="mxAnnHours" style="width:auto;margin:0"><option value="0">期限なし</option><option value="6">6時間</option><option value="24">1日</option><option value="72">3日</option><option value="168">1週間</option></select>
          <input type="url" id="mxAnnLink" placeholder="リンク（任意）" value="${esc(ann ? ann.link : '')}" style="flex:1;min-width:160px;margin:0">
        </div>
        <div class="row" style="margin-top:10px"><button type="button" id="mxAnnSend">配信する</button>${ann ? '<button type="button" class="secondary" id="mxAnnClear">取り下げる</button>' : ''}</div>
      </div>`;
    if (ann) el.querySelector('#mxAnnLevel').value = ann.level;

    // ---- 運営から個別に連絡 ----
    const warn = document.createElement('div');
    warn.className = 'card';
    warn.innerHTML = `<h2 style="margin-top:0">✉️ 運営から個別に連絡</h2>
      <p class="muted">相手が次にサイトを開いたとき、「確認しました」を押すまで閉じられない表示で出ます（通知も届きます）。</p>
      <input type="email" id="mxWarnTo" placeholder="相手のアドレス（例: someone@bix.3erver）">
      <div class="row"><select id="mxWarnLevel" style="width:auto;margin:0"><option value="notice">お知らせ</option><option value="warning" selected>警告</option><option value="final">最終警告</option></select>
        <select id="mxWarnTpl" style="width:auto;margin:0"><option value="">テンプレート…</option><option value="spam">連投・スパム</option><option value="abuse">悪口・誹謗中傷</option><option value="nsfw">年齢に合わない投稿</option><option value="other">その他</option></select></div>
      <input type="text" id="mxWarnTitle" placeholder="件名" style="margin-top:8px">
      <textarea id="mxWarnBody" placeholder="本文"></textarea>
      <div class="row"><button type="button" id="mxWarnSend">送る</button></div>
      <h3>送った連絡</h3><div id="mxWarnList" class="muted">読み込み中...</div>`;
    el.appendChild(warn);
    const TPL = {
      spam: ['連投・スパムについて', '短時間に同じような投稿をくり返す行為が確認されました。ほかの利用者の迷惑になるため、控えてください。'],
      abuse: ['ことばづかいについて', '他の利用者への悪口・誹謗中傷にあたる投稿が確認されました。MixAll + では禁止されています。今後は控えてください。'],
      nsfw: ['投稿内容について', '年齢に合わない内容の投稿が確認されました。投稿の前に内容をご確認ください。'],
      other: ['運営からのお知らせ', '']
    };
    warn.querySelector('#mxWarnTpl').onchange = (e) => { const tp = TPL[e.target.value]; if (tp) { warn.querySelector('#mxWarnTitle').value = tp[0]; warn.querySelector('#mxWarnBody').value = tp[1]; } };
    const loadWarns = async () => {
      try {
        const d = await plus('warningsSent', {}, 'GET');
        warn.querySelector('#mxWarnList').innerHTML = d.items.length ? d.items.map((w) => `<div class="admin-item"><strong>${esc(w.title)}</strong> → ${esc(w.to)}<br><span class="muted">${esc({ notice: 'お知らせ', warning: '警告', final: '最終警告' }[w.level])} ・ ${new Date(w.createdAt).toLocaleString('ja-JP')} ・ ${w.ackAt ? '確認済み' : '未確認'}</span></div>`).join('') : 'まだありません';
      } catch (e) { warn.querySelector('#mxWarnList').textContent = e.message; }
    };
    warn.querySelector('#mxWarnSend').onclick = async () => {
      const to = warn.querySelector('#mxWarnTo').value.trim();
      const body = warn.querySelector('#mxWarnBody').value.trim();
      if (!to || !body) { toast('相手のアドレスと本文を入れてください', { kind: 'error' }); return; }
      if (!(await window.MixAllDialog.confirm(`${to} に送りますか？`, { okLabel: '送る', danger: false }))) return;
      try { await plus('sendWarning', { email: to, level: warn.querySelector('#mxWarnLevel').value, title: warn.querySelector('#mxWarnTitle').value, body }); toast('送りました'); warn.querySelector('#mxWarnBody').value = ''; loadWarns(); }
      catch (e) { toast(e.message, { kind: 'error' }); }
    };
    loadWarns();

    // ---- 通報の受付箱（個別連絡の上）・使用量パネル（いちばん下） ----
    const rep = document.createElement('div');
    rep.className = 'card mx-rep';
    el.insertBefore(rep, warn);
    loadReports(rep, warn);
    const use = document.createElement('div');
    use.className = 'card mx-use';
    el.appendChild(use);
    loadUsage(use);

    const send = async (text) => {
      try {
        await plus('setAnnouncement', { text, level: el.querySelector('#mxAnnLevel').value, hours: Number(el.querySelector('#mxAnnHours').value), link: el.querySelector('#mxAnnLink').value });
        sessionStorage.removeItem('mixall.announcement');
        toast(text ? 'お知らせを配信しました' : 'お知らせを取り下げました');
      } catch (e) { toast(e.message, { kind: 'error' }); }
      render();
    };
    el.querySelector('#mxAnnSend').onclick = () => send(el.querySelector('#mxAnnText').value.trim());
    const clear = el.querySelector('#mxAnnClear');
    if (clear) clear.onclick = async () => { if (await window.MixAllDialog.confirm('お知らせを取り下げますか？')) send(''); };
  }

  function boot() {
    const s = session();
    if (!s || !(s.isAdmin || s.isDeputyAdmin) || !/^\/admin\/?(index\.html)?$/i.test(location.pathname)) return;
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 400), { once: true });
  else setTimeout(boot, 400);
})();
