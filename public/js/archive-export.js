// 運営画面「データ書き出し」: Supabaseのデータを、データ置き場サイト(mixall-data.edgeone.dev)へ移すためのZIPを作る。
// 流れ: ①一覧を読み込む → ②ZIPを書き出す(データ置き場に今ある内容 + Supabaseの追加・変更・削除を合わせた「全部入り」)
//       → ③そのZIPを mixall-data にそのまま再アップロード(置き換え) → ④「確認してSupabaseから削除」
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const session = () => window.Netrify && Netrify.getSession && Netrify.getSession();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const call = async (body) => {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try { return await Netrify.api('/api/archive', { token: session().token, ...body }); }
      catch (e) { lastErr = e; if (/主運営のみ|不正|対象外/.test(String(e && e.message))) throw e; await sleep(800 * (attempt + 1)); }
    }
    throw lastErr;
  };
  const u8 = (s) => fflate.strToU8(s);
  let stores = [];
  let dataSite = '';

  const bar = window.MxProgress ? MxProgress.lazy(() => $('archiveLog')) : { set() {}, busy() {}, done() {}, hide() {} };
  function log(msg) { $('archiveLog').textContent = msg; }
  function render() {
    $('archiveTable').innerHTML = '<label style="display:block;margin:4px 0;font-weight:bold;"><input type="checkbox" id="archiveSelectAll"> すべて選択</label>' + stores.map((s) => `<label style="display:block;margin:4px 0;"><input type="checkbox" data-store="${esc(s.store)}"> ${esc(s.label)} <small class="muted">(${esc(s.store)}) Supabase: ${s.count}件 / データ置き場: ${s.archived}件${s.hot ? ' ・更新が多いので注意' : ''}</small></label>`).join('');
    const all = $('archiveSelectAll'); if (all) all.onchange = () => document.querySelectorAll('#archiveTable [data-store]').forEach((el) => { el.checked = all.checked; });
  }
  async function load() {
    log('読み込み中...'); bar.busy('一覧を読み込み中');
    try { const r = await call({ action: 'info' }); stores = r.stores; dataSite = r.site; render(); log(`読み込みました(データ置き場: ${r.site})`); bar.hide(); }
    catch (e) { log('失敗: ' + e.message); bar.hide(); }
  }
  const selected = () => [...document.querySelectorAll('#archiveTable [data-store]:checked')].map((el) => el.dataset.store);
  const archivedStores = () => stores.filter((s) => s.archived > 0).map((s) => s.store);
  const unique = (list) => Array.from(new Set(list));

  function download(name, bytes) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // データ置き場サイトに入れる土台のファイル(索引ページ・検索避け・キャッシュ設定)
  function scaffold(files) {
    files['index.html'] = u8('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>MixAll data</title><p>MixAll data store</p>');
    files['robots.txt'] = u8('User-agent: *\nDisallow: /\n');
    files['edgeone.json'] = u8(JSON.stringify({ headers: [{ source: '/data/*', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }, { key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }] }, null, 2));
  }

  // 1ストア分: データ置き場の既存ファイル + Supabaseの追加・変更(選んだときだけ) - 削除済み
  async function collectStore(store, isSelected, files, onP = () => {}) {
    const storeCount = (stores.find((x) => x.store === store) || {}).count || 1;
    const keySet = new Set(); const nameOfKey = new Map(); const existingNames = [];
    for (let offset = 0; ;) {
      const r = await call({ action: 'existing', store, offset, limit: 1500 });
      r.keys.forEach((k, i) => { keySet.add(k); nameOfKey.set(k, r.names[i]); existingNames.push(r.names[i]); });
      offset += r.keys.length;
      if (!r.keys.length || offset >= r.total) break;
    }
    onP(0.1);
    const have = {};
    for (let i = 0; i < existingNames.length;) {
      const r = await call({ action: 'copy', store, names: existingNames.slice(i, i + 200) });
      if (!r.processed) throw new Error(`${store}: データ置き場のファイルを取得できませんでした`);
      Object.assign(have, r.files); i += r.processed;
      log(`${store}: データ置き場の既存分 ${Math.min(i, existingNames.length)}/${existingNames.length}件 取得中...`); onP(0.1 + 0.4 * Math.min(1, i / Math.max(1, existingNames.length)));
    }
    const tombMap = new Map(((await call({ action: 'tombs', store })).tombs || []).map((t) => [t.key, t.name]));
    let changed = 0;
    if (isSelected) {
      for (let after = ''; ;) {
        const r = await call({ action: 'export', store, after });
        for (const row of r.rows) {
          have[row.name] = JSON.stringify(row.box); keySet.add(row.key); nameOfKey.set(row.key, row.name);
          tombMap.delete(row.key); changed += 1; // 削除後に作り直されたものは残す
        }
        log(`${store}: Supabaseの追加・変更分 ${changed}件 取得中...`); onP(0.5 + 0.45 * Math.min(1, changed / storeCount));
        if (r.done || !r.next) break;
        after = r.next;
      }
    }
    let removed = 0;
    for (const [key, name] of tombMap) { if (keySet.delete(key)) { delete have[name]; removed += 1; } }
    if (!keySet.size && !existingNames.length) return { total: 0, changed, removed };
    for (const [name, text] of Object.entries(have)) files[`data/${store}/${name}.json`] = u8(text);
    const idx = await call({ action: 'sealIndex', store, keys: [...keySet] });
    files[`data/${store}/_index.json`] = u8(JSON.stringify(idx.box)); onP(1);
    return { total: keySet.size, changed, removed };
  }

  async function exportSelected(allMode) {
    if (allMode && !stores.length) await load();
    if (!stores.length) { log('一覧を読み込めませんでした'); return; }
    const sel = allMode ? stores.filter((s) => s.count > 0 || s.archived > 0).map((s) => s.store) : selected();
    const all = unique([...archivedStores(), ...sel]);
    if (!all.length) { log(allMode ? '書き出すデータがありません' : '書き出すストアを選んでください'); return; }
    $('archiveExport').disabled = true; $('archiveExportAll').disabled = true;
    try {
      const files = {}; let changed = 0, removed = 0, total = 0; const skipped = [];
      let n = 0; const frac = {}; let finished = 0;
      const total0 = all.length; const upd = (txt) => bar.set((finished + Object.values(frac).reduce((a, b) => a + b, 0)) / total0, txt);
      bar.set(0, '書き出し');
      const runStore = async (store) => {
        n += 1; const idx = n;
        const info = stores.find((x) => x.store === store) || {};
        try {
          const r = await collectStore(store, sel.includes(store), files, (f) => { frac[store] = f; upd(`${finished}/${total0}ストア完了`); });
          changed += r.changed; removed += r.removed; total += r.total;
          log(`(${idx}/${all.length}) ${store}: 完了(合計 ${r.total}件 / 追加・変更 ${r.changed}件 / 削除反映 ${r.removed}件)`);
        } catch (e) {
          // データ置き場に既存分があるストアが欠けると、置き換えで消えてしまうため中止。まだ何も置いていないストアだけ飛ばして続行する
          if (info.archived > 0) throw new Error(`${store}: ${e.message}`);
          for (const k of Object.keys(files)) if (k.startsWith(`data/${store}/`)) delete files[k];
          skipped.push(`${store}(${e.message})`);
          log(`(${idx}/${all.length}) ${store}: 失敗のため飛ばしました - ${e.message}`);
        }
        delete frac[store]; finished += 1; upd(`${finished}/${total0}ストア完了`);
      };
      { let next = 0; await Promise.all(Array.from({ length: Math.min(4, all.length) }, async () => { while (next < all.length) await runStore(all[next++]); })); }
      scaffold(files);
      log('ZIPを作成中...'); bar.busy('ZIPを作成中');
      download('mixall-data.zip', fflate.zipSync(files, { level: 0 }));
      bar.done('書き出し完了 100%'); log(`完了。mixall-data.zip を作りました(全${total}件・追加/変更${changed}件・削除反映${removed}件)。このZIPを ${dataSite || 'データ置き場'} にそのまま再アップロード(置き換え)してください。アップロード後に「確認してSupabaseから削除」を押します。` + (skipped.length ? `\n飛ばしたストア: ${skipped.join(' / ')}(これらはSupabaseに残っています)` : ''));
    } catch (e) { bar.hide(); log('失敗: ' + e.message + '(ZIPは作っていません。データ置き場は変更されません)'); }
    $('archiveExport').disabled = false; $('archiveExportAll').disabled = false;
  }

  // Supabase内のデータを圧縮して置き直す(容量節約。内容は変わらず、読み出し時に自動で展開される)
  async function compressAll() {
    if (!stores.length) await load();
    const list = stores.filter((s) => s.count > 0).map((s) => s.store);
    if (!list.length) { log('圧縮するデータがありません'); return; }
    if (!confirm('Supabase内のテキストデータを圧縮して置き直します(内容は変わりません)。今のデプロイが反映済みであることを確認してから実行してください。続けますか?')) return;
    const btn = $('archiveCompress'); if (btn) btn.disabled = true;
    let saved = 0, done = 0, rows = 0, scanned = 0;
    const totalRows = stores.filter((s) => s.count > 0).reduce((a, s) => a + s.count, 0) || 1;
    bar.set(0, '圧縮');
    try {
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, list.length) }, async () => {
        while (next < list.length) {
          const store = list[next++]; let after = '';
          for (;;) {
            const r = await call({ action: 'compress', store, after });
            saved += r.saved; rows += r.compressed; scanned += r.scanned; bar.set(scanned / totalRows, `圧縮 ${rows}件`);
            log(`圧縮中... ${store} / ここまでに ${rows}件・約${(saved / 1048576).toFixed(1)}MB 削減`);
            if (r.done || !r.next) break;
            after = r.next;
          }
          done += 1;
        }
      }));
      bar.done('圧縮完了 100%'); log(`完了。${rows}件を圧縮し、約${(saved / 1048576).toFixed(1)}MB 削減しました。(Supabaseの容量表示は少し遅れて更新されます)`); await load();
    } catch (e) { bar.hide(); log('失敗: ' + e.message); }
    if (btn) btn.disabled = false;
  }

  async function purgeSelected(allMode) {
    if (allMode && !stores.length) await load();
    const list = allMode ? stores.filter((s) => s.count > 0 && s.archived > 0).map((s) => s.store) : selected();
    if (!list.length && !archivedStores().length) { log('対象のストアを選んでください'); return; }
    if (!confirm('データ置き場に同じ内容があることを確認できたデータだけ、Supabaseから削除します。続けますか?(先に mixall-data へ再アップロードし、公開されてから1分ほど待ってください)')) return;
    $('archivePurge').disabled = true; $('archivePurgeAll').disabled = true;
    const purgeTotal = list.reduce((a, st) => a + ((stores.find((x) => x.store === st) || {}).count || 0), 0) || 1; let purgeDone = 0;
    bar.set(0, '削除確認');
    try {
      for (const store of list) {
        let after = '', deleted = 0, failed = 0;
        for (;;) {
          const r = await call({ action: 'purge', store, after });
          deleted += r.deleted; failed += r.failed.length; purgeDone += r.deleted + r.failed.length; bar.set(purgeDone / purgeTotal, '削除確認');
          log(`${store}: 削除 ${deleted}件 / 未確認で残した ${failed}件`);
          if (r.done || !r.next) break;
          after = r.next;
        }
      }
      let tombs = 0;
      for (const store of unique([...archivedStores(), ...list])) { const r = await call({ action: 'purgeTombs', store }); tombs += r.removed || 0; }
      bar.done('削除完了 100%'); log(`完了。「未確認で残した」ものは、データ置き場へアップロードされていないか内容が違うため削除していません。(削除記録の整理: ${tombs}件)`); await load();
    } catch (e) { bar.hide(); log('失敗: ' + e.message); }
    $('archivePurge').disabled = false; $('archivePurgeAll').disabled = false;
  }
  window.addEventListener('DOMContentLoaded', () => {
    if (!$('archiveCard')) return;
    $('archiveLoad').onclick = load; if ($('archiveCompress')) $('archiveCompress').onclick = compressAll; $('archiveExport').onclick = () => exportSelected(false); $('archiveExportAll').onclick = () => exportSelected(true); $('archivePurge').onclick = () => purgeSelected(false); $('archivePurgeAll').onclick = () => purgeSelected(true);
  });
})();
