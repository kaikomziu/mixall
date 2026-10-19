// public/js/admin-plus.js
// 運営画面に追加するカード: 統計グラフ / Supabase無料枠の使用量 / お知らせバナーの配信
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = () => { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch (_) { return null; } };
  const toast = (m, o) => window.MixAllUX && window.MixAllUX.toast(m, o);
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

  async function render() {
    const el = host();
    if (!el) return;
    let stats; let ann = null;
    try { [stats, ann] = await Promise.all([plus('adminStats', {}, 'GET'), plus('announcement', {}, 'GET').then((d) => d.announcement)]); }
    catch (e) { el.innerHTML = `<div class="card"><p class="muted">統計を読み込めませんでした: ${esc(e.message)}</p></div>`; return; }
    const t = stats.totals; const u = stats.usage;
    el.innerHTML = `
      <div class="card"><h2 style="margin-top:0">📊 MixAll+ ダッシュボード</h2>
        <div class="mx-stat-grid">
          <div class="mx-stat"><b>${t.users}</b><span>登録アカウント</span></div>
          <div class="mx-stat"><b>${t.active24}</b><span>24時間以内に利用</span></div>
          <div class="mx-stat"><b>${t.active7}</b><span>7日以内に利用</span></div>
          <div class="mx-stat"><b>${t.ghostPosts}</b><span>Ghost投稿</span></div>
          <div class="mx-stat"><b>${t.uchPosts}</b><span>Uch書き込み</span></div>
          <div class="mx-stat"><b>${t.openReports}</b><span>未対応の通報</span></div>
        </div>
        <h3>新規登録（直近30日）</h3>${bars(stats.series.signups, '#8b6bff')}
        <h3>Ghost投稿</h3>${bars(stats.series.ghost, '#4fdcff')}
        <h3>Uch書き込み</h3>${bars(stats.series.uch, '#3dffb8')}
        <h3>通報</h3>${bars(stats.series.reports, '#ff5c9a')}
      </div>
      <div class="card"><h2 style="margin-top:0">🧮 Supabase 無料枠の使用量</h2>
        <p class="muted">8割・95%を超えると運営アカウントに通知（プッシュ通知含む）が届きます。データベースはMOD Wikiなど同じプロジェクトの他のサイトと共用です。</p>
        ${meter('今月のAPI呼び出し（MixAll+分）', u.monthRequests, u.limitRequests, '回')}
        ${meter('データベース容量（プロジェクト全体）', u.dbMB, u.limitDbMB, 'MB')}
        ${u.daily && u.daily.length ? `<h3>1日ごとのAPI呼び出し</h3>${bars(u.daily.map((x) => ({ day: x.day, n: x.n })), '#ffcc4d')}` : ''}
        <div class="row"><button type="button" class="secondary" id="mxCheckUsage">今すぐ確認する</button></div>
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
    el.querySelector('#mxCheckUsage').onclick = async () => { try { const r = await plus('checkUsage', {}); toast(r.alerts.length ? `通知しました: ${r.alerts.join(' / ')}` : '使用量は問題ありません'); } catch (e) { toast(e.message, { kind: 'error' }); } };
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
    if (!s || !(s.isAdmin || s.isDeputyAdmin) || !window.MixAllPlus) return;
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 400), { once: true });
  else setTimeout(boot, 400);
})();
