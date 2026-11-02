/**
 * TASKFLOW AI — SERVICE WORKER (OFFLINE PWA CAPABILITY)
 * Cache-first for local static assets; Network-first with offline fallback for API requests.
 */

const CACHE_NAME = "taskflow-ai-v2.3.0";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/slack-shell.css",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./src/ui/main.mjs",
  "./src/ui/slackShell.mjs",
  "./src/ui/channels.mjs",
  "./src/ui/presets.mjs",
  "./src/ui/preferences.mjs",
  "./src/domain/taskEntities.mjs",
  "./src/domain/deterministicNlp.mjs",
  "./src/domain/groundingVerifier.mjs",
  "./src/domain/taskBoardStore.mjs",
  "./src/application/analyzeRequest.mjs",
  "./src/application/exportTasks.mjs",
  "./src/infrastructure/channelStore.mjs",
  "./src/infrastructure/storageAdapter.mjs"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) => {
            if (k !== CACHE_NAME) return caches.delete(k);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: Network-first, return JSON error fallback if offline
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            JSON.stringify({
              ok: false,
              offline: true,
              error: "Modo sin conexión. TaskFlow AI utilizará el motor neuro-simbólico local."
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" }
            }
          )
      )
    );
    return;
  }

  // Static Assets: Cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
