const CACHE_NAME = 'quick-recap-v13';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/storage.js',
  './js/mcq.js',
  './js/swipe.js',
  './database/curriculum.json',
  './database/manifest.json',
  './database/cardiology_rapid_recall_all_99_explained.json',
  './database/dermatology.json',
  './database/endocrinology.json',
  './database/envenomation.json',
  './database/environmental_medicine.json',
  './database/gastroenterology.json',
  './database/geriatrics.json',
  './database/haematology.json',
  './database/immunology.json',
  './database/infectious_diseases.json',
  './database/nephrology.json',
  './database/neurology_rapid_recall_all_46_explained.json',
  './database/nutrition_and_metabolism.json',
  './database/psychiatry.json',
  './database/respiratory_rapid_recall_all_70_explained.json',
  './database/rheumatology.json',
  './database/toxicology.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache newly fetched database files
        if (response.status === 200 && event.request.url.includes('/database/')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback
      return caches.match('./index.html');
    })
  );
});
