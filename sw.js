// Service worker: deixa o app abrir rápido e funcionar como aplicativo instalado.
// Arquivos do app ficam em cache; dados (api/, data/) sempre buscam a versão mais nova.
const VERSAO = "frances-v13";
const ARQUIVOS = ["./", "index.html", "app.js", "base.css", "manifest.webmanifest",
  "assets/site/logo_frances_fm.svg", "assets/site/icone.svg", "assets/site/play.svg", "assets/site/pause.svg", "assets/site/live.svg",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;          // streams, YouTube e Instagram passam direto
  if (url.pathname.includes("/api/") || url.pathname.includes("/data/")) {           // dados: rede primeiro
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // rede primeiro: sempre a versão mais nova; o cache só entra quando estiver sem internet
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
