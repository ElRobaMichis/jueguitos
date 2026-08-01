/* Service worker: la app abre al instante y funciona aunque la señal esté
   fatal. Estrategia:
     - archivos propios  -> cache primero, y se actualizan en segundo plano
     - todo lo demás     -> red (el tráfico del juego nunca pasa por aquí) */

/* Al subir una corrección hay que cambiar este número: el navegador detecta
   el service worker nuevo, se instala, toma el control y la app se recarga
   sola con la versión nueva (si no, habría que borrar datos a mano). */
const VERSION = 'jueguitos-v14';
const CORE = [
  './', './index.html',
  './css/app.css', './css/games.css',
  './vendor/mqtt.min.js',
  './js/main.js',
  './js/core/emitter.js', './js/core/store.js', './js/core/ui.js', './js/core/engine.js',
  './js/net/net.js',
  './js/games/registry.js', './js/games/lib/kit.js',
  './js/games/lib/loteria-art.js',
  './manifest.webmanifest', './assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(CORE.map(async (u) => {
        // cache:'reload' es la clave: sin esto una versión nueva se instalaba
        // con los archivos viejos del caché del navegador y no cambiaba nada.
        const res = await fetch(u, { cache: 'reload' });
        if(res.ok) await c.put(u, res);
      })))
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
