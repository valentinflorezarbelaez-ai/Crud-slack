/**
 * TASKFLOW AI — SERVICE WORKER (NETWORK-FIRST WITH CACHE PURGE)
 * Ensures user always gets the latest deployed code in real-time.
 */

const CACHE_NAME = "taskflow-ai-v3.5.0";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Always fetch from network first so updates are instant
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
