const CACHE_NAME = 'strongman-next-v0.2.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './src/app.js',
  './src/competitors.js',
  './src/data.js',
  './src/scoring.js',
  './src/storage.js',
  './src/styles.css',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo-strong-man.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
  );
});
