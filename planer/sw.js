// Service Worker des Planers.
// Mit Internet: immer die aktuelle Fassung vom Server (Updates kommen sofort an).
// Ohne Internet: die zuletzt gespeicherte Fassung aus dem Cache.
// Bei Änderungen VERSION erhöhen.
const VERSION = 'planer-v8';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'style.css', 'app.js', 'icons.js', 'sync.js', 'config.js', 'vendor/supabase.js',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon.svg',
];

self.addEventListener('install', e => {
  // cache: 'reload' umgeht den Browser-Zwischenspeicher, damit keine alten Dateien in den neuen Cache geraten.
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('planer-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // Sync-Anfragen (Supabase) nie über den Cache
  e.respondWith((async () => {
    try {
      // Neue Anfrage statt req weiterzureichen: Seitenaufrufe (mode 'navigate') erlauben keine geänderten Optionen.
      const res = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    } catch {
      return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('index.html')) || Response.error();
    }
  })());
});
