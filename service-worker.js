/**
 * service-worker.js
 * Caches the app shell (HTML/CSS/JS) so the interface loads offline.
 * Report data itself is handled by the IndexedDB offline queue (js/offline.js),
 * not by this cache — dynamic API responses are intentionally not cached here
 * to avoid showing stale emergency data.
 */

const CACHE_NAME = "paunawa-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/config.js",
  "./js/utils.js",
  "./js/blockchain.js",
  "./js/supabaseClient.js",
  "./js/api.js",
  "./js/offline.js",
  "./js/theme.js",
  "./js/i18n.js",
  "./js/notifications.js",
  "./js/map.js",
  "./js/reports.js",
  "./js/facilities.js",
  "./js/dashboard.js",
  "./js/sos.js",
  "./js/admin.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache calls to Supabase — always go to network for fresh data
  // (both the REST/RPC calls and the realtime websocket).
  if (url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in")) {
    return;
  }

  // App shell: cache-first, falling back to network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request)
            .then((response) => {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              return response;
            })
            .catch(() => cached)
      )
    );
    return;
  }

  // Third-party CDN assets (Leaflet, Chart.js, tiles): network-first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
