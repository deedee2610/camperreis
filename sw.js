// Service Worker — Camperreis Scandinavië 2026
// Strategie: Cache-as-you-go voor OSM kaarttegels (cache first, network fallback)
// Tegels worden gecached wanneer ze voor het eerst worden geladen — niet massaal vooraf.
// OSM-beleid: geen bulkpre-caching van tegels. Cache-as-you-go is toegestaan.

const TILE_CACHE = 'osm-tiles-v1';
const STATIC_CACHE = 'static-v2'; // bump bij elke shell-wijziging zodat oude cache wordt opgeruimd

// Statische resources die bij installatie worden gecached
const STATIC_ASSETS = [
  './',
  './index.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Verwijder oude caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== TILE_CACHE && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // OSM kaarttegels: cache first, network fallback
  if (url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // Statische app-shell (index.html): NETWORK-FIRST.
  // Zo komen nieuwe deploys ALTIJD door (was cache-first → maskeerde elke update).
  // Val terug op cache als er geen netwerk is, zodat het dashboard onderweg offline werkt.
  if (url.endsWith('/') || url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Al het overige (weer-API, OSRM, fonts): netwerk first, geen cache
  // (dynamische data moet vers zijn)
});
