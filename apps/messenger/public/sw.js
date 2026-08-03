self.addEventListener('push', (event) => {
  let data = { title: 'UBridge', body: 'New activity', url: '/', kind: 'message' };
  try { data = event.data.json(); } catch {}
  const isCall = data.kind === 'call';
  event.waitUntil(self.registration.showNotification(data.title || 'UBridge', {
    body: data.body || '',
    icon: '/ubridge-logo.svg',
    badge: '/ubridge-logo.svg',
    data: { url: data.url || '/', kind: data.kind || 'message' },
    tag: isCall ? 'ubridge-call' : (data.tag || 'ubridge-message'),
    renotify: true,
    requireInteraction: isCall,
    vibrate: isCall ? [240, 120, 240, 120, 360] : [80, 40, 80],
    actions: isCall ? [
      { action: 'answer', title: 'Answer' },
      { action: 'decline', title: 'Decline' }
    ] : []
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const base = event.notification.data?.url || '/';
  const url = event.action === 'answer' ? `${base}?answerCall=1` : base;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
