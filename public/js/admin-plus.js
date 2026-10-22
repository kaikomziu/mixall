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

    // ---- 20. 運営からの警告・お知らせ（個別） ----
    const warn = document.createElement('div');
    warn.className = 'card';
    warn.innerHTML = `<h2 style="margin-top:0">✉️ 運営から個別に連絡</h2>
      <p class="muted">相手が次にサイトを開いたとき、「確認しました」を押すまで閉じられない表示で出ます（プッシュ通知も届きます）。</p>
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
      abuse: ['ことばづかいについて', '他の利用者への悪口・誹謗中傷にあたる投稿が確認されました。MixAll+ では禁止されています。今後は控えてください。'],
      nsfw: ['投稿内容について', '年齢に合わない内容の投稿が確認されました。投稿の前に内容をご確認ください。'],
      other: ['運営からのお知らせ', '']
    };
    warn.querySelector('#mxWarnTpl').onchange = (e) => { const t = TPL[e.target.value]; if (t) { warn.querySelector('#mxWarnTitle').value = t[0]; warn.querySelector('#mxWarnBody').value = t[1]; } };
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

    // ---- GitHub のデータ置き場（添付ファイルなど重いものの退避先） ----
    const arch = document.createElement('div');
    arch.className = 'card';
    el.appendChild(arch);
    const mb = (b) => `${(Number(b || 0) / 1048576).toFixed(1)}MB`;
    const loadArch = async () => {
      let st;
      try { st = await plus('archiveStatus', {}, 'GET'); } catch (e) { arch.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
      arch.innerHTML = `<h2 style="margin-top:0">🗄️ データ置き場（GitHub）</h2>
        <p class="muted">添付ファイルなど重いデータは、保存から1時間たつと非公開のGitHubリポジトリへ自動で移り、Supabaseには目印だけが残ります。開くときはサーバーがGitHubから取ってきます。</p>
        <div class="mx-stat-grid">
          <div class="mx-stat"><b>${st.archived}</b><span>GitHubへ移した数（${mb(st.archivedBytes)}）</span></div>
          <div class="mx-stat"><b>${st.pending}</b><span>まだSupabaseにある数（${mb(st.pendingBytes)}）</span></div>
        </div>
        <p>${st.configured ? `設定済み: <strong>${esc(st.repo)}</strong>（トークン ${esc(st.token)}）` : '<span class="error">まだ設定されていません</span>'}</p>
        <input type="text" id="mxArchRepo" placeholder="非公開リポジトリ（例: kaikomziu/mixall-data）" value="${esc(st.repo || '')}">
        <input type="password" id="mxArchToken" autocomplete="new-password" placeholder="fine-grained token（変更するときだけ入力）">
        <div class="row"><button type="button" id="mxArchSave">設定を保存</button>${st.configured ? '<button type="button" class="secondary" id="mxArchRun">今すぐ移す</button>' : ''}</div>`;
      arch.querySelector('#mxArchSave').onclick = async () => {
        try { await plus('saveArchiveSettings', { repo: arch.querySelector('#mxArchRepo').value, ghToken: arch.querySelector('#mxArchToken').value }); toast('保存しました'); loadArch(); }
        catch (e) { toast(e.message, { kind: 'error' }); }
      };
      const run = arch.querySelector('#mxArchRun');
      if (run) run.onclick = async () => {
        run.disabled = true; run.textContent = '移しています…';
        try { const r = await plus('runArchive', {}); toast(r.errors && r.errors.length ? `一部失敗: ${r.errors[0]}` : `${r.moved}件（${mb(r.freedBytes)}）移しました。残り ${r.remaining}件`); }
        catch (e) { toast(e.message, { kind: 'error' }); }
        loadArch();
      };
    };
    loadArch();
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
