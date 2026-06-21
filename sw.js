/* ============================================================================
 * Puppy Runner — Service Worker
 * App-shell precache + cache-first serving so the whole game works offline and
 * is installable. Bump CACHE on releases to invalidate old assets.
 * ==========================================================================*/
const CACHE = 'puppy-runner-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './assets/Logo.png',
  './assets/puppy/classic.frames.png',
  './js/data.js',
  './js/assets.js',
  './js/storage.js',
  './js/audio.js',
  './js/game.js',
  './js/ui.js',
  './js/main.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // runtime-cache same-origin successful responses
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
