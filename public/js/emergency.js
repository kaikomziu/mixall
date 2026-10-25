(() => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const DB = 'mixall-emergency-db';
  const STORE = 'messages';
  const $ = (id) => document.getElementById(id);
  let lowPower = localStorage.getItem('mixall_emergency_low_power') === 'true';
  let battery = null;
  let alertActive = false;
  let apkPrepared = Boolean(localStorage.getItem('mixall_apk_prepared_at'));

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function allMessages() {
    const db = await openDb();
    return new Promise((resolve, reject) => { const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => resolve((r.result || []).sort((a,b) => a.createdAt - b.createdAt)); r.onerror = () => reject(r.error); });
  }
  async function putMessage(message) {
    const db = await openDb();
    return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(message); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  async function replaceMessages(messages) {
    const db = await openDb();
    return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); store.clear(); messages.forEach((item) => store.put(item)); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setStatus(text, kind = '') { const el = $('emergencyStatus'); el.textContent = text; el.dataset.kind = kind; }
  function renderBattery() {
    document.body.dataset.lowPower = lowPower ? 'true' : 'false';
    $('lowPowerToggle').checked = lowPower;
    $('powerModeLabel').textContent = lowPower ? '省電力モード: ON（自動通信なし）' : '省電力モード: OFF';
    if (battery && Number.isFinite(battery.level)) $('batteryLevel').textContent = `電池残量: ${Math.round(battery.level * 100)}%${battery.charging ? '（充電中）' : ''}`;
  }
  async function renderMessages() {
    const messages = await allMessages();
    $('messageList').innerHTML = messages.map((m) => `<article class="emergency-message"><div><strong>${escapeHtml(m.author || '匿名')}</strong><small>${new Date(m.createdAt).toLocaleString('ja-JP')}</small></div><p>${escapeHtml(m.text)}</p></article>`).join('') || '<p class="muted">まだ緊急メモはありません。この端末内だけに保存されます。</p>';
    $('messageCount').textContent = `${messages.length}件 / この端末に保存`;
  }
  async function probeNetwork() {
    if (lowPower) return;
    try { await fetch('/manus-routes.json?emergencyProbe=' + Date.now(), { cache:'no-store' }); setStatus('オンライン（サーバー到達を確認）', 'online'); }
    catch (_) { setStatus('オフライン（ローカル緊急モード）', 'offline'); }
  }
  async function cacheCore() {
    if (!('caches' in window)) throw new Error('このブラウザーはオフラインキャッシュに対応していません');
    const cache = await caches.open('mixall-emergency-v2');
    await cache.addAll(['/emergency.html','/emergency-peer.html','/downloads/mixall-emergency.html','/js/emergency.js','/js/emergency-peer.js','/js/mesh-persistence.js','/js/emergency-monitor.js','/css/style.css','/manifest.webmanifest','/manus-routes.json']);
  }
  $('openEmergencyPeer')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const link = event.currentTarget;
    const label = link.textContent;
    link.textContent = '緊急通信HTMLを準備中…';
    link.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(link.href, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (!/MixAll 緊急通信/.test(html) || !/<html[\s>]/i.test(html)) throw new Error('緊急通信HTMLの内容を確認できません');
      // 緊急モードのURLは data URL(ページの中身そのものをURLにしたもの)。サーバーに頼らず、サイトが落ちていても開ける。
      const bytes = new TextEncoder().encode(html); let bin = ''; for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
      const dataUrl = 'data:text/html;charset=utf-8;base64,' + btoa(bin);
      const box = $('dataUrlBox'), ta = $('dataUrlText'); if (ta) ta.value = dataUrl; if (box) box.hidden = false;
      setStatus('緊急モードのデータURLを作りました(下のURLをコピーして、ブラウザのアドレス欄に貼り付けるか、ブックマークしてください)', 'local');
      link.textContent = label; link.removeAttribute('aria-busy');
      try { window.location.assign(dataUrl); } catch (_) {} // ブラウザによっては、ページからのdata:移動は禁止される(その場合は上のURLをコピーして使う)
    } catch (error) {
      link.textContent = label;
      link.removeAttribute('aria-busy');
      setStatus(`緊急通信HTMLを開けませんでした: ${error.message}`, 'error');
    }
  });
  $('copyDataUrl')?.addEventListener('click', async () => { const ta = $('dataUrlText'); if (!ta || !ta.value) return; try { await navigator.clipboard.writeText(ta.value); } catch (_) { ta.select(); document.execCommand && document.execCommand('copy'); } $('copyDataUrl').textContent = '✓ コピーしました'; setTimeout(() => { $('copyDataUrl').textContent = 'データURLをコピー'; }, 1500); });
  function connectionIsWeak() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return false;
    return ['slow-2g', '2g'].includes(connection.effectiveType) || Number(connection.downlink) > 0 && Number(connection.downlink) <= 1.5 || Number(connection.rtt) >= 500;
  }
  function downloadApk(reason = '手動準備') {
    if (!navigator.onLine) { $('apkStatus').textContent = '現在オフラインのためAPKを取得できません。通信が戻ったら再試行してください。'; return; }
    const link = document.createElement('a'); link.href = '/downloads/MixAll-APK-1.0.apk'; link.download = 'MixAll-APK-1.0.apk'; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove();
    apkPrepared = true; localStorage.setItem('mixall_apk_prepared_at', new Date().toISOString()); $('apkStatus').textContent = `APKのダウンロードを開始しました（${reason}）。Android側でインストールを確認してください。`;
  }
  function maybePrepareApk(reason) {
    if (apkPrepared || !navigator.onLine || lowPower) return;
    $('apkStatus').textContent = `準備条件を検知: ${reason}。APKをダウンロードします。ブラウザの確認が必要な場合は下のボタンを押してください。`;
    setTimeout(() => { if (!apkPrepared) downloadApk(reason); }, 800);
  }
  async function checkEmergencyAlert() {
    if (lowPower) return;
    try {
      const response = await fetch('/emergency-alert.json?ts=' + Date.now(), { cache: 'no-store' });
      const data = await response.json(); alertActive = data.active === true;
      if (alertActive) maybePrepareApk(`災害警報: ${data.title || '注意情報'}`);
      else if (!apkPrepared) $('apkStatus').textContent = '警報フラグは未発令。通信品質を監視中です。';
    } catch (_) { if (!apkPrepared) $('apkStatus').textContent = '警報情報を取得できません。通信回復後に再確認します。'; }
  }
  function checkConnectionQuality() { if (connectionIsWeak()) maybePrepareApk('通信品質の低下'); }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

  $('messageForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const author = $('author').value.trim() || '匿名'; const text = $('message').value.trim(); if (!text) return;
    await putMessage({ id: crypto.randomUUID(), author, text, createdAt: Date.now() }); $('message').value = ''; await renderMessages(); setStatus('端末内に保存しました。近距離メッシュ送信は未接続です。', 'local');
  });
  $('exportButton').addEventListener('click', async () => { const payload = {format:'mixall-emergency-local', version:1, exportedAt:new Date().toISOString(), messages:await allMessages()}; download(`mixall-emergency-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), 'application/json'); });
  $('importFile').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const data=JSON.parse(await file.text()); if(data.format !== 'mixall-emergency-local' || !Array.isArray(data.messages)) throw new Error('緊急メモ形式ではありません'); await replaceMessages(data.messages.slice(-500)); await renderMessages(); setStatus('緊急メモを端末へ復元しました。', 'local'); } catch(error) { setStatus(`復元失敗: ${error.message}`, 'error'); } event.target.value=''; });
  $('clearButton').addEventListener('click', async () => { if (!confirm('この端末の緊急メモをすべて削除しますか？')) return; await replaceMessages([]); await renderMessages(); });
  $('cacheButton').addEventListener('click', async () => { try { await cacheCore(); setStatus('緊急モードの起動ファイルを更新しました。', 'online'); } catch(error) { setStatus(`キャッシュ更新失敗: ${error.message}`, 'error'); } });
  $('apkDownloadButton').addEventListener('click', () => downloadApk('手動操作'));
  $('enableMonitorButton').addEventListener('click', () => { window.MixAllEmergencyMonitor?.enable(); $('monitorStatus').textContent = '危険監視を有効化しました。位置情報の許可を確認してください。'; });
  $('distressButton').addEventListener('click', () => { window.MixAllEmergencyMonitor?.setDistress(true); $('monitorStatus').textContent = '遭難モードをONにしました。危険条件の成立を監視します。'; });
  $('clearEmergencyButton').addEventListener('click', () => { window.MixAllEmergencyMonitor?.clearEmergency(); window.MixAllEmergencyMonitor?.setDistress(false); $('monitorStatus').textContent = '通常モードへ戻しました。危険監視は継続しています。'; });
  $('lowPowerToggle').addEventListener('change', (event) => { lowPower = event.target.checked; localStorage.setItem('mixall_emergency_low_power', String(lowPower)); renderBattery(); if (lowPower) setStatus('省電力モードを有効化しました。自動通信を停止します。', 'local'); else probeNetwork(); });
  window.addEventListener('online', probeNetwork); window.addEventListener('offline', () => setStatus('オフライン（ローカル緊急モード）', 'offline'));
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) connection.addEventListener?.('change', checkConnectionQuality);
  if ('getBattery' in navigator) navigator.getBattery().then((value) => { battery=value; renderBattery(); value.addEventListener('levelchange', renderBattery); value.addEventListener('chargingchange', renderBattery); }).catch(() => {});
  renderBattery(); renderMessages(); probeNetwork(); checkConnectionQuality(); checkEmergencyAlert();
  if (window.MixAllEmergencyMonitor) $('monitorStatus').textContent = JSON.stringify(window.MixAllEmergencyMonitor.status());
  if (!lowPower) setInterval(() => { probeNetwork(); checkConnectionQuality(); checkEmergencyAlert(); }, 60000);
})();
