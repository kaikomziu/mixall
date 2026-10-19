const CACHE_NAME = 'mixall-emergency-v5';
const CORE = [
  '/emergency.html',
  '/emergency-peer.html',
  '/downloads/mixall-emergency.html',
  '/js/emergency.js',
  '/js/emergency-peer.js',
  '/js/mesh-persistence.js',
  '/js/emergency-monitor.js',
  '/js/mixall-base.js',
  '/js/chat-vault.js',
  '/js/mixall-ux.js',
  '/js/google-drive-sync.js',
  '/images/logo-mark.svg',
  '/images/logo-loader.svg',
  '/css/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && (request.mode === 'navigate' || request.destination === 'script' || request.destination === 'style' || request.destination === 'manifest')) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request);
      return cached || (request.mode === 'navigate' ? caches.match('/emergency.html') : Response.error());
    }
  })());
});

// ---- MixAll+ プッシュ通知 ----
// サーバー（server/plus.js）から届いた通知を表示し、タップで該当ページを開く。
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'MixAll+';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '新しいお知らせがあります',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-48.png',
    tag: data.tag || 'mixall',
    renotify: true,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (client.url === url && 'focus' in client) return client.focus();
    }
    for (const client of all) {
      if ('navigate' in client && 'focus' in client) { await client.navigate(url); return client.focus(); }
    }
    return clients.openWindow(url);
  })());
});
