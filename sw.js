// Service Worker: legt alle Dateien beim ersten Besuch im Cache ab, danach läuft die App ohne Internet.
// Bei Änderungen an der App VERSION erhöhen, damit Geräte die neue Fassung laden.
const VERSION = 'spielstand-v4';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'style.css',
  'app.js', 'util.js',
  'index.js', 'common.js', 'dart.js', 'wizard.js', 'phase10.js',
  'kniffel.js', 'skipbo.js', 'romme.js', 'custom.js',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
