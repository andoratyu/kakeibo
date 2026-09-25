// Service Worker
// キャッシュバスティングのため、更新時はCACHE_VERSIONを変える

const CACHE_VERSION = 'v2'; // ← 更新時はここを v3, v4 と上げる
const CACHE_NAME = `kakeibo-${CACHE_VERSION}`;

const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/db.js',
  'js/app.js',
  'icons/apple-touch-icon.png',
  'icons/web-app-manifest-192x192.png',
  'icons/web-app-manifest-512x512.png',
  'icons/favicon.ico',
  'icons/favicon.svg',
  'icons/favicon-96x96.png'
];

// インストール時
self.addEventListener('install', event => {
  console.log(`Service Worker インストール: ${CACHE_VERSION}`);
  self.skipWaiting(); // 新版が入ったら即座に有効化
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// アクティベート時: 古いキャッシュ削除
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
    }).then(() => self.clients.claim()) // 既存のタブも即座に新版を使う
  );
});

// フェッチ時: ネットワーク優先、失敗したらキャッシュ
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // ネットワーク成功: キャッシュも更新して返す
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // ネットワーク失敗: キャッシュから返す（オフライン時）
        return caches.match(event.request);
      })
  );
});