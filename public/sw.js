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
