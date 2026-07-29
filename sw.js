/* Service worker: la app abre al instante y funciona aunque la señal esté
   fatal. Estrategia:
     - archivos propios  -> cache primero, y se actualizan en segundo plano
     - todo lo demás     -> red (el tráfico del juego nunca pasa por aquí) */

const VERSION = 'jueguitos-v1';
const CORE = [
  './', './index.html',
  './css/app.css', './css/games.css',
  './vendor/mqtt.min.js',
  './js/main.js',
  './js/core/emitter.js', './js/core/store.js', './js/core/ui.js', './js/core/engine.js',
  './js/net/net.js',
  './js/games/registry.js', './js/games/lib/kit.js',
  './manifest.webmanifest', './assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      // Revalidamos contra el servidor (no contra el caché HTTP del navegador),
      // así una corrección llega en el siguiente arranque y no en 10 minutos.
      const fresh = fetch(e.request, { cache: 'no-cache' })
        .then(res => {
          if(res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => hit);
      if(hit) e.waitUntil(fresh.catch(() => {}));
      return hit || fresh;                       // rápido con mala señal, y se actualiza solo
    })
  );
});
