const CACHE_NAME = 'mixall-emergency-v4';
const CORE = [
  '/emergency.html',
  '/emergency-peer.html',
  '/downloads/mixall-emergency.html',
  '/js/emergency.js',
  '/js/emergency-peer.js',
  '/js/mesh-persistence.js',
  '/js/emergency-monitor.js',
  '/css/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/manus-routes.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.allSettled(CORE.map((u) => cache.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const dest = request.destination;
  const isNav = request.mode === 'navigate';
  const isStatic = dest === 'script' || dest === 'style' || dest === 'image' || dest === 'font' || dest === 'manifest';
  if (!isNav && !isStatic) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const refresh = fetch(request).then((response) => { if (response && response.ok) cache.put(request, response.clone()).catch(() => {}); return response; });
    if (isStatic) {
      // 画面の部品(JS/CSS/画像)は保存済みのものをすぐ出し、裏で最新版に更新する
      if (cached) { refresh.catch(() => {}); return cached; }
      try { return await refresh; } catch (_) { return Response.error(); }
    }
    // ページ本体: 通信が速ければ最新、遅い(2秒以上)ときは保存済みを先に出す
    try {
      if (!cached) return await refresh;
      return await Promise.race([refresh, new Promise((resolve) => setTimeout(() => resolve(cached), 2000))]);
    } catch (_) {
      return cached || (await caches.match('/emergency.html')) || Response.error();
    }
  })());
});

// ---- バックグラウンド通知(Web Push): アプリ・タブを閉じていても届く ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { try { data = { body: event.data.text() }; } catch (__) {} }
  const title = data.title || 'MixAll';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '新しいお知らせがあります',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'mixall',
    renotify: true,
    data: { url: data.url || '/Notifications/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/Notifications/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url === url && 'focus' in c) return c.focus(); }
    for (const c of all) { if ('navigate' in c && 'focus' in c) { try { await c.navigate(url); return c.focus(); } catch (_) {} } }
    return self.clients.openWindow(url);
  })());
});
