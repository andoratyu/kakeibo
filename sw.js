// Service Worker

const CACHE_VERSION = 'v6';
const CACHE_NAME = `kakeibo-${CACHE_VERSION}`;

const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/db.js',
  'js/holidays.js',
  'js/app.js',
  'icons/apple-touch-icon.png',
  'icons/web-app-manifest-192x192.png',
  'icons/web-app-manifest-512x512.png',
  'icons/favicon.ico',
  'icons/favicon.svg',
  'icons/favicon-96x96.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  console.log(`Service Worker インストール: ${CACHE_VERSION}`);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.error('キャッシュ登録失敗:', err))
  );
});

self.addEventListener('activate', event => {
  console.log(`Service Worker アクティベート: ${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('古いキャッシュ削除:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});