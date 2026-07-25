const CACHE_NAME = 'pocket-shogi-v4';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './online.js',
  './engine/shogi.js', './engine/cpu.js', './engine/opening-book.js', './engine/dqn-client.js',
  './engine/ai-controller.js',
  './engine/alphasho/constants.js', './engine/alphasho/encoder.js',
  './engine/alphasho/policy-label.js', './engine/alphasho/mcts.js',
  './engine/alphasho/client.js', './engine/alphasho/worker.js',
  './manifest.webmanifest', './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    }),
  );
});
