(() => {
  if (window.MixAllEmergencyMonitor) return;
  const POLICY_URL = '/emergency-policy.json';
  let policy = null;
  let watchId = null;
  let weatherTimer = null;
  let lastPosition = null;

  const readFlag = (key) => localStorage.getItem(key) === 'true';
  const isEmergency = () => readFlag('mixall_emergency_mode');
  const enabled = () => readFlag('mixall_emergency_monitor_enabled');
  const network = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const weakNetwork = () => {
    const c = network();
    if (!c) return false;
    return ['slow-2g', '2g'].includes(c.effectiveType) || (Number(c.downlink) > 0 && Number(c.downlink) <= Number(policy?.network?.downlinkMbps || 1.5)) || Number(c.rtt) >= Number(policy?.network?.rttMs || 500);
  };
  const distanceMeters = (a, b) => {
    const rad = Math.PI / 180; const dLat = (b.lat - a.latitude) * rad; const dLon = (b.lon - a.longitude) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  const inDangerZone = (position) => (policy?.dangerZones || []).some((zone) => distanceMeters(position.coords, zone) <= Number(zone.radiusMeters || 1000));
  const nativeDistress = () => { try { return Boolean(window.AndroidEmergency?.isDistress?.()); } catch (_) { return false; } };
  const distressFlag = () => readFlag('mixall_distress_mode') || nativeDistress();
  const reasonFor = () => {
    const reasons = [];
    if (distressFlag() && lastPosition && inDangerZone(lastPosition)) reasons.push('遭難フラグ＋危険位置');
    if (distressFlag() && weakNetwork()) reasons.push('遭難フラグ＋通信品質低下');
    if (window.__mixallWeatherDanger) reasons.push(window.__mixallWeatherReason || '位置情報に基づく気象警報');
    return reasons;
  };
  function showBanner(reason) {
    if (document.getElementById('mixallEmergencyBanner')) return;
    document.body.classList.add('mixall-emergency-active');
    const banner = document.createElement('div'); banner.id = 'mixallEmergencyBanner'; banner.setAttribute('role', 'alert');
    banner.innerHTML = `<strong>緊急モード</strong><span>${String(reason).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span><a href="/emergency.html">緊急画面を開く</a>`;
    document.body.prepend(banner);
  }
  function activate(reason) {
    if (!isEmergency()) { localStorage.setItem('mixall_emergency_mode', 'true'); localStorage.setItem('mixall_emergency_reason', reason); }
    showBanner(reason);
    if (!location.pathname.endsWith('/emergency.html')) location.replace('/emergency.html?reason=' + encodeURIComponent(reason));
  }
  function evaluate() { if (!enabled() || isEmergency()) { if (isEmergency()) showBanner(localStorage.getItem('mixall_emergency_reason') || '安全確認が必要です'); return; } const reasons = reasonFor(); if (reasons.length) activate(reasons.join(' / ')); }
  async function checkWeather() {
    if (!enabled() || !lastPosition || !policy?.weather?.endpoint || document.body.dataset.lowPower === 'true') return;
    try {
      const url = new URL(policy.weather.endpoint, location.origin); url.searchParams.set('lat', lastPosition.coords.latitude); url.searchParams.set('lon', lastPosition.coords.longitude);
      const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) return; const data = await response.json();
      const danger = data.danger === true || Number(data.alertLevel || 0) >= Number(policy.weather.minAlertLevel || 3);
      window.__mixallWeatherDanger = danger; window.__mixallWeatherReason = data.reason || '位置情報に基づく気象警報'; evaluate();
    } catch (_) { /* 災害監視の失敗だけで緊急モードへ切り替えない */ }
  }
  function start() {
    if (!enabled()) return;
    if ('geolocation' in navigator && watchId === null) watchId = navigator.geolocation.watchPosition((position) => { lastPosition = position; evaluate(); checkWeather(); }, () => {}, { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 });
    const c = network(); if (c) c.addEventListener?.('change', evaluate);
    checkWeather(); if (!weatherTimer) weatherTimer = setInterval(checkWeather, Number(policy?.weather?.intervalMs || 600000));
    evaluate();
  }
  async function init() {
    try { policy = await fetch(POLICY_URL, { cache: 'no-store' }).then((r) => r.json()); } catch (_) { policy = { dangerZones: [], weather: {}, network: {} }; }
    if (enabled()) start();
  }
  window.MixAllEmergencyMonitor = {
    enable() { localStorage.setItem('mixall_emergency_monitor_enabled', 'true'); init(); },
    disable() { localStorage.removeItem('mixall_emergency_monitor_enabled'); if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; },
    setDistress(value) { localStorage.setItem('mixall_distress_mode', String(Boolean(value))); evaluate(); },
    clearEmergency() { localStorage.removeItem('mixall_emergency_mode'); localStorage.removeItem('mixall_emergency_reason'); document.body.classList.remove('mixall-emergency-active'); document.getElementById('mixallEmergencyBanner')?.remove(); },
    status() { return { enabled: enabled(), emergency: isEmergency(), distress: distressFlag(), weakNetwork: weakNetwork(), lastPosition }; }
  };
  const style = document.createElement('style'); style.textContent = '#mixallEmergencyBanner{position:sticky;top:0;z-index:9999;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 16px;background:#7f1d1d;color:#fff;font-weight:700}#mixallEmergencyBanner a{color:#fff;text-decoration:underline;margin-left:auto}.mixall-emergency-active{--accent:#ef4444}'; document.head.appendChild(style);
  init();
})();
