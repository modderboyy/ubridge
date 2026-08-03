/* UBridge PWA Service Worker - Offline-first, P2P, Notifications, Call handling */
const CACHE_NAME = 'ubridge-v3-pwa';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/ubridge-logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install - precache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate - clean old
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Fetch - network first for API, cache first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Skip non-GET
  if (event.request.method !== 'GET') return;
  // Skip supabase API - always network
  if (url.hostname.includes('supabase')) return;
  // Static assets - cache first
  if (STATIC_ASSETS.some(a => url.pathname === a || url.pathname.startsWith('/_next/') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png'))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
  // Pages - network first with cache fallback (offline support)
  event.respondWith(
    fetch(event.request).then((res) => {
      // cache successful HTML
      if (res.ok && event.request.headers.get('accept')?.includes('text/html')) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return res;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('/')))
  );
});

// Push - handle P2P messages, calls, video calls
self.addEventListener('push', (event) => {
  let data = { title: 'UBridge', body: 'New secure message', url: '/', kind: 'message', tag: 'ubridge-message' };
  try {
    if (event.data) {
      const json = event.data.json();
      data = { ...data, ...json };
    }
  } catch {}
  const isCall = data.kind === 'call';
  const isVideo = data.kind === 'video';
  const isFile = data.kind === 'file';

  let title = data.title || 'UBridge';
  let body = data.body || '';
  let vibrate = [80, 40, 80];
  let actions = [];
  let requireInteraction = false;
  let tag = data.tag || 'ubridge-message';

  if (isCall) {
    title = data.title || 'Incoming voice call';
    body = data.body || 'Tap to answer encrypted P2P call';
    vibrate = [300, 100, 300, 100, 600];
    actions = [
      { action: 'answer', title: '✅ Answer' },
      { action: 'decline', title: '❌ Decline' }
    ];
    requireInteraction = true;
    tag = 'ubridge-call';
  } else if (isVideo) {
    title = data.title || 'Incoming video call';
    body = data.body || 'Tap to answer video call';
    vibrate = [300, 100, 300, 100, 600];
    actions = [
      { action: 'answer-video', title: '📹 Answer' },
      { action: 'decline', title: '❌ Decline' }
    ];
    requireInteraction = true;
    tag = 'ubridge-video-call';
  } else if (isFile) {
    title = data.title || 'New file';
    body = data.body || 'Someone sent you a file via P2P';
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/ubridge-logo.svg',
      image: isVideo ? undefined : undefined,
      data: { url: data.url || '/', kind: data.kind, from: data.from, peerId: data.peerId },
      tag,
      renotify: true,
      requireInteraction,
      vibrate,
      actions,
      silent: false,
      timestamp: Date.now(),
    })
  );
});

// Notification click - handle calls, messages
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  let url = data.url || '/';

  if (action === 'decline') {
    // Notify sender via clients? Could postMessage to send hangup signal
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'UBRIDGE_CALL_DECLINED', peerId: data.peerId }));
      })
    );
    return;
  }

  if (action === 'answer' || action === 'answer-video') {
    url = `/?answerCall=1&peer=${data.peerId || ''}&video=${action === 'answer-video' ? '1' : '0'}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Focus existing window if possible
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'UBRIDGE_NOTIFICATION_CLICK', data, action });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Background sync - for queued P2P messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'ubridge-outbox-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'UBRIDGE_SYNC_OUTBOX' }));
      })
    );
  }
});

// Message from client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.ports?.[0]?.postMessage({ version: CACHE_NAME });
});
