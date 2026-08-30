const CACHE_NAME = 'strongman-next-v1.3.4';
const SHARED_SUBMISSION_CACHE = 'strongman-next-shared-submission-v1';
const SHARED_SUBMISSION_PATH = '__shared-submission__';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './src/app.js',
  './src/app.js?v=1.3.4',
  './src/help.js',
  './src/competitor-data.js',
  './src/competitor-profile-data.js',
  './src/competitor-submission.js',
  './src/competitors.js',
  './src/data.js',
  './src/events-data.js',
  './src/image-tools.js',
  './src/scoring.js',
  './src/season.js',
  './src/season-export.js',
  './src/season-data.js',
  './src/shared-import.js',
  './src/results-delivery.js',
  './src/storage.js',
  './src/styles.css',
  './src/styles.css?v=1.3.4',
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
      .then(keys => Promise.all(keys.filter(key => ![CACHE_NAME, SHARED_SUBMISSION_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method === 'POST' && requestUrl.pathname.endsWith('/share-target')) {
    event.respondWith(receiveSharedSubmission(event.request));
    return;
  }
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

async function receiveSharedSubmission(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('submission');
    const filename = String(file?.name || 'zawodnik.json');
    const validName = /\.(?:json|json\.txt|txt)$/i.test(filename);
    if (!file || typeof file.text !== 'function' || !validName || file.size < 2 || file.size > 15 * 1024 * 1024) {
      return Response.redirect(new URL('./?shared-submission=error', request.url).href, 303);
    }
    const text = await file.text();
    const cache = await caches.open(SHARED_SUBMISSION_CACHE);
    const key = new URL(`./${SHARED_SUBMISSION_PATH}`, request.url).href;
    await cache.put(key, new Response(text, {
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'x-shared-filename': encodeURIComponent(filename)
      }
    }));
    return Response.redirect(new URL('./?shared-submission=1', request.url).href, 303);
  } catch {
    return Response.redirect(new URL('./?shared-submission=error', request.url).href, 303);
  }
}
