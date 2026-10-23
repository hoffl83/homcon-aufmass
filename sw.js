// Offline-Cache: App-Dateien und Schriften werden beim ersten Aufruf gespeichert.
// Versionsnummer = Zahl hinter "aufmass-v"; muss mit APP_VERSION in index.html übereinstimmen
const CACHE = "aufmass-v17";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Anmeldung (Cloudflare-Passwortschutz) nie aus dem Cache beantworten
  const path = new URL(e.request.url).pathname;
  if (path.endsWith("/__auth") || path.endsWith("/login")) return;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(res => { if (res && (res.ok || res.type === "opaque")) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
