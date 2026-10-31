/* Ancienne adresse de test : ce service worker se retire et vide son cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("climbtrack-v2-")).map((k) => caches.delete(k)));
    await self.registration.unregister();
  })());
});
