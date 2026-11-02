/**
 * TASKFLOW AI — HIGH-PERFORMANCE SERVICE WORKER
 * Stale-While-Revalidate caching for instant asset loading.
 * Network-First bypass for real-time /api/* endpoints.
 */

const CACHE_NAME = "taskflow-ai-v4.1.0";
const PRECACHE_ASSETS = [
  "./",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./css/styles.css?v=4.1.0",
  "./css/slack-shell.css?v=4.1.0",
  "./src/ui/main.mjs?v=4.1.0",
  "./src/ui/slackShell.mjs?v=4.1.0",
  "./src/ui/realtimeSlack.mjs?v=4.1.0",
  "./src/ui/channels.mjs?v=4.1.0",
  "./src/domain/taskEntities.mjs?v=4.1.0",
  "./src/domain/taskBoardStore.mjs?v=4.1.0",
  "./src/domain/deterministicNlp.mjs?v=4.1.0"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API requests, non-GET, or third-party auth scripts
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Stale-While-Revalidate for local static assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      });
    })
  );
});
