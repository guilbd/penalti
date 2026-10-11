/* Service worker do Pênalti: só recebe as notificações (desafios, duelos e lembrete da pergunta do dia).
   Não guarda páginas em cache, para que cada visita pegue a versão nova do jogo. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Pênalti', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Pênalti', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'assets/icons/penalti-192.png', badge: 'assets/icons/penalti-32.png',
    data: { url: new URL(d.url || 'quiz.html', self.registration.scope).href }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url === url && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
