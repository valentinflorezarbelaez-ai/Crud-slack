// TaskFlow AI Recovery Shield: Purge stale Service Worker and clear old caches
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    for (var i = 0; i < regs.length; i++) {
      regs[i].unregister();
    }
  }).catch(function () {});
  if (window.caches) {
    caches.keys().then(function (keys) {
      for (var j = 0; j < keys.length; j++) {
        caches.delete(keys[j]);
      }
    }).catch(function () {});
  }
}
