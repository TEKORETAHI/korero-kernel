const CACHE = 'infinity-frontier-v0.2-app-2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './mobile-fix.css',
  './manifest.webmanifest',
  './icon.svg',
  './src/polyfills.js',
  './src/main.js',
  './src/config.js',
  './src/core/nor.js',
  './src/core/rng.js',
  './src/core/state.js',
  './src/core/save.js',
  './src/systems/enemies.js',
  './src/systems/progression.js',
  './src/systems/combat.js',
  './src/systems/turrets.js',
  './src/systems/waves.js',
  './src/systems/skills.js',
  './src/systems/audio.js',
  './src/render/effects.js',
  './src/render/renderer.js',
  './src/ui/ui.js',
  './src/ui/coreLens.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
