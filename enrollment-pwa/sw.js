// SmartAttend Enrollment PWA — Service Worker
const CACHE_NAME = 'smartattend-enroll-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { mode: 'no-cors' });
      })).catch(err => {
        console.warn('Cache install warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Don't intercept CDN requests (JSZip) during development
  if (event.request.url.includes('cdnjs.cloudflare.com')) return;
  if (event.request.url.includes('fonts.gstatic.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
