/* WebKasir Kita - Service Worker
   Naikkan VERSION setiap kali ada perubahan besar agar cache lama dibersihkan. */
const VERSION = "wk-v8";
const SHELL = "shell-" + VERSION;      // halaman + ikon (network-first, ada cadangan offline)
const LIBS = "libs-" + VERSION;        // pustaka CDN & font (cache-first / stale-while-revalidate)
const PRECACHE = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/splash-logo.png", "/offline"];
const CDN_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, LIBS].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;                                   // tulis data tidak pernah dicegat
  if (url.origin === location.origin && (url.pathname.startsWith("/api/") || url.pathname === "/sw.js")) return; // pembayaran & server selalu langsung
  // Firebase SDK (versi tetap) boleh di-cache; Firestore/Auth (googleapis) TIDAK pernah dicegat
  const isFirebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  const isCdn = CDN_HOSTS.includes(url.hostname) || isFirebaseSdk;

  if (url.origin === location.origin && (url.pathname.startsWith("/__/") || url.pathname.startsWith("/app-login"))) return; // login Google tidak dicegat
  if (req.mode === "navigate") {                                      // halaman: utamakan versi terbaru, offline pakai cadangan
    e.respondWith(
      fetch(req).then(res => { if (url.pathname === "/" && res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put("/", copy)); } return res; })
        .catch(() => caches.match("/").then(r => r || caches.match("/offline")))
    );
    return;
  }
  if (url.origin === location.origin) {                               // ikon, manifest: cepat dari cache, perbarui di belakang
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  if (isCdn) { e.respondWith(staleWhileRevalidate(req, LIBS)); }
});

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
}

self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
