// Service Worker
// このファイルはPWAをオフライン動作させるための最小構成です

const CACHE_NAME = 'kakeibo-v1';
const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'icons/apple-touch-icon.png',
  'icons/web-app-manifest-192x192.png',
  'icons/web-app-manifest-512x512.png',
  'icons/favicon.ico',
  'icons/favicon.svg',
  'icons/favicon-96x96.png'
];

// インストール時：ファイルをキャッシュに保存
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('キャッシュを開きました');
        return cache.addAll(urlsToCache);
      })
  );
});

// ネットワークリクエスト時：キャッシュがあればそれを返す（オフライン対応）
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュがあればキャッシュを返す
        if (response) {
          return response;
        }
        // なければネットワークから取得
        return fetch(event.request);
      })
  );
});

// アクティベート時：古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});