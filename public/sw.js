// Ouvrir l'appli sans réseau : la page et ses fichiers sont gardés ; les données passent par l'appli (copie locale).
const CACHE = 'orga-v1'
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png']).catch(() => {}))) })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== 'GET' || u.origin !== location.origin) return
  if (r.mode === 'navigate') {   // la page : réseau d'abord, copie si pas de réseau
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put('/', cl)) } return res }).catch(() => caches.match('/')))
    return
  }
  if (u.pathname.startsWith('/assets/')) {   // fichiers versionnés : copie d'abord
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(r, cl)) } return res })))
  }
})

// Notifications : le serveur envoie { title, body, url, tag } ; un même tag remplace la notif précédente (le « en retard » remplace le rappel).
// Le toucher ouvre l'écran exact ; la notif ne coche jamais rien d'elle-même.
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: e.data?.text() || 'Epicure' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Epicure', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/#/mes-rappels' }
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/#/mes-rappels', self.location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).origin === self.location.origin)
    if (c) return c.focus().then(w => (w || c).navigate ? (w || c).navigate(url) : null).catch(() => self.clients.openWindow(url))
    return self.clients.openWindow(url)
  }))
})
