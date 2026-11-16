// Retrait d'urgence : copier ce fichier à la place de sw.js et déployer. Le téléphone désinstalle le service worker,
// vide ses copies et recharge l'appli au prochain passage. Les notifications cessent d'arriver.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k)
  await self.registration.unregister()
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url)
})()))
