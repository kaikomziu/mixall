// ぽけっとの位置情報: 「現在地」と「目的地」の2種類を送れる。
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  let leafletReady = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET_CSS; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = LEAFLET_JS; js.onload = resolve; js.onerror = () => { leafletReady = null; reject(new Error('地図を読み込めませんでした')); };
      document.head.appendChild(js);
    });
    return leafletReady;
  }
  function currentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('この端末では位置情報を利用できません')); return; }
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => reject(new Error('位置情報を取得できませんでした')), { enableHighAccuracy: true, timeout: 15000 });
    });
  }
  function overlay(html) {
    document.getElementById('pocketLocationOverlay')?.remove();
    const box = document.createElement('div');
    box.id = 'pocketLocationOverlay';
    box.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px;';
    box.innerHTML = `<div class="card" style="max-width:520px;width:100%;max-height:92vh;overflow:auto;">${html}</div>`;
    document.body.appendChild(box);
    return box;
  }
  // 戻り値: { kind:'current'|'destination', lat, lng, label } か null(キャンセル)
  function pick() {
    return new Promise((resolve) => {
      const box = overlay(`<h3>位置情報を送る</h3>
        <button type="button" class="secondary" id="plCurrent" style="display:block;width:100%;margin:8px 0;">📍 現在地を送る</button>
        <button type="button" class="secondary" id="plDest" style="display:block;width:100%;margin:8px 0;">🚩 目的地を地図で選ぶ</button>
        <div class="error" id="plError"></div>
        <button type="button" class="ghost" id="plCancel">キャンセル</button>`);
      const done = (v) => { box.remove(); resolve(v); };
      box.querySelector('#plCancel').onclick = () => done(null);
      box.querySelector('#plCurrent').onclick = async () => {
        try { const pos = await currentPosition(); done({ kind: 'current', lat: pos.lat, lng: pos.lng, label: '現在地' }); }
        catch (e) { box.querySelector('#plError').textContent = e.message; }
      };
      box.querySelector('#plDest').onclick = async () => {
        const card = box.firstElementChild;
        card.innerHTML = `<h3>目的地を選ぶ</h3><p class="muted">場所を検索するか、地図をタップしてピンを立てます。ピンはドラッグで動かせます。</p>
          <form id="plSearchForm" class="row" style="gap:6px;margin-bottom:6px;"><input type="search" id="plSearch" placeholder="場所・住所を検索（例: 東京駅）" style="flex:1;min-width:0;" /><button type="submit" class="secondary">検索</button><button type="button" class="ghost" id="plHere" title="現在地へ移動">📍</button></form>
          <div id="plResults" style="max-height:120px;overflow:auto;"></div>
          <div id="plMap" style="height:300px;border-radius:10px;"></div>
          <input type="text" id="plLabel" placeholder="目的地の名前（例: 駅前の広場）" maxlength="60" style="margin-top:8px;" />
          <div class="error" id="plError"></div>
          <div class="row"><button type="button" id="plOk" disabled>この場所を共有する</button><button type="button" class="ghost" id="plCancel2">キャンセル</button></div>`;
        card.querySelector('#plCancel2').onclick = () => done(null);
        try {
          await loadLeaflet();
          let start = { lat: 35.681236, lng: 139.767125 }, zoom = 12;
          try { start = await currentPosition(); zoom = 15; } catch (_) {}
          const map = window.L.map(card.querySelector('#plMap')).setView([start.lat, start.lng], zoom);
          window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
          let marker = null, chosen = null;
          const place = (latlng, name) => {
            chosen = { lat: latlng.lat, lng: latlng.lng };
            if (marker) marker.setLatLng(latlng);
            else {
              marker = window.L.marker(latlng, { draggable: true }).addTo(map);
              marker.on('dragend', () => { const p = marker.getLatLng(); chosen = { lat: p.lat, lng: p.lng }; });
            }
            if (name && !card.querySelector('#plLabel').value.trim()) card.querySelector('#plLabel').value = String(name).slice(0, 60);
            card.querySelector('#plOk').disabled = false;
          };
          map.on('click', (ev) => place(ev.latlng));
          card.querySelector('#plHere').onclick = async () => { try { const p = await currentPosition(); map.setView([p.lat, p.lng], 16); } catch (e) { card.querySelector('#plError').textContent = e.message; } };
          card.querySelector('#plSearchForm').onsubmit = async (ev) => {
            ev.preventDefault();
            const q = card.querySelector('#plSearch').value.trim(); if (!q) return;
            const out = card.querySelector('#plResults'); out.textContent = '検索中...';
            try {
              const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ja&q=' + encodeURIComponent(q));
              const list = await res.json();
              if (!Array.isArray(list) || !list.length) { out.textContent = '見つかりませんでした'; return; }
              out.innerHTML = list.map((r, n) => `<button type="button" class="ghost" data-n="${n}" style="display:block;width:100%;text-align:left;margin:2px 0;">${esc(String(r.display_name || '').slice(0, 80))}</button>`).join('');
              out.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => { const r = list[Number(b.dataset.n)]; const ll = { lat: Number(r.lat), lng: Number(r.lon) }; map.setView([ll.lat, ll.lng], 17); place(ll, String(r.name || r.display_name || '').split(',')[0]); out.textContent = ''; }; });
            } catch (_) { out.textContent = '検索できませんでした'; }
          };
          card.querySelector('#plOk').onclick = () => { if (chosen) done({ kind: 'destination', lat: chosen.lat, lng: chosen.lng, label: card.querySelector('#plLabel').value.trim() || '目的地' }); };
          setTimeout(() => map.invalidateSize(), 150);
        } catch (e) { card.querySelector('#plError').textContent = e.message; }
      };
    });
  }
  function renderHtml(a) {
    const lat = Number(a.lat), lng = Number(a.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    const dest = a.kind === 'destination';
    const d = 0.004;
    const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
    const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(lat + ',' + lng)}`;
    const open = `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
    const route = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
    const title = dest ? `🚩 目的地: ${esc(a.label && a.label !== '目的地' ? a.label : '')}` : '📍 現在地';
    return `<div class="attachment-link location-card"><strong>${title}</strong><br>
      <iframe src="${esc(embed)}" loading="lazy" style="width:100%;max-width:320px;height:180px;border:0;border-radius:8px;margin:6px 0;" referrerpolicy="no-referrer"></iframe><br>
      <a href="${esc(open)}" target="_blank" rel="noopener noreferrer">地図で開く</a>${dest ? ` ・ <a href="${esc(route)}" target="_blank" rel="noopener noreferrer">ここへのルート</a>` : ''}</div>`;
  }
  window.PocketLocation = { pick, renderHtml };
})();
