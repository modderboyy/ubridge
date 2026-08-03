self.addEventListener('push', (event) => {
  let data = { title: 'UBridge', body: 'New activity', url: '/' };
  try { data = event.data.json(); } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'UBridge', {
    body: data.body || '', icon: '/ubridge-logo.svg', badge: '/ubridge-logo.svg', data: { url: data.url || '/' }, tag: data.tag || 'ubridge', renotify: true
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
