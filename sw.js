/* ClimbTrack v2 — mode hors-ligne (réseau d'abord, sinon cache).
 * Augmenter VERSION à chaque mise en ligne. */
const VERSION = "climbtrack-2026-10-31g";
const PREFIX = "climbtrack-";
const FILES = ["./", "index.html", "app.css", "app.js", "lib/qrcode.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(FILES.map((f) => cache.add(new Request(f, { cache: "reload" })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL("./", self.location).pathname;
  if (!url.pathname.startsWith(scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
      ]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const home = await cache.match("index.html");
        if (home) return home;
      }
      throw err;
    }
  })());
});
