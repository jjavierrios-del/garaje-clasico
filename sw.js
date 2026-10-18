// Funciona sin conexión: la app se sirve desde caché y se actualiza en segundo plano.
const CACHE = "garaje-v7";
const CORE = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "catalog/index.json", "datos/garaje.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Red primero (para recibir despieces y mejoras nuevas); si no hay cobertura, caché.
  e.respondWith(
    fetch(req).then(res => {
      const u = new URL(req.url);
      const keep = (res.ok && (u.origin === location.origin || u.host.includes("fonts.g"))) || u.host === "upload.wikimedia.org";
      if (keep) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
