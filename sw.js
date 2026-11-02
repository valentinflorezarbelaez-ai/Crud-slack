/**
 * TASKFLOW AI — SELF-HEALING SERVICE WORKER
 * Automatically de-registers any stale worker and purges caches
 * to guarantee instant, clean page loads without white screens.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Do not intercept — allow native browser fetch
self.addEventListener("fetch", () => {
  // Pass-through: browser performs standard network fetch
});
