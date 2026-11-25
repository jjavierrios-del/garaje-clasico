// Funciona sin conexión: la app se sirve desde caché y se actualiza en segundo plano.
const CACHE = "garaje-v20";
const CORE = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "catalog/index.json", "datos/garaje.json", "vendor/zxing-0.21.3.min.js"];

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

// Avisos al móvil: el servicio manda un toque sin contenido y aquí se pide el texto del día
const AVISOS_URL = "https://avisos-garaje.jjavierrios.workers.dev";
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let d = { titulo: "Garaje Clásico", texto: "Tienes avisos pendientes en la app." };
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint)));
      const id = Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
      const r = await fetch(AVISOS_URL + "/hoy?id=" + id, { cache: "no-store" });
      if (r.ok) d = await r.json();
    } catch (err) {}
    await self.registration.showNotification(d.titulo || "Garaje Clásico", { body: d.texto, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "garaje-avisos", data: { coche: d.coche || "" } });
  })());
});
// Al tocarla se abre la app (en la ficha del vehículo si el aviso es de uno solo)
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const coche = e.notification.data?.coche, url = new URL("./" + (coche ? "#coche=" + encodeURIComponent(coche) : ""), self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) return c.focus().then(w => (w || c).navigate ? (w || c).navigate(url) : null).catch(() => clients.openWindow(url));
    return clients.openWindow(url);
  }));
});
