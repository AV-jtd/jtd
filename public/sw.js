const CACHE_KILL_VERSION = "jtd-sw-kill-2026-04-28";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch {}

    try {
      await self.registration.unregister();
    } catch {}

    try {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        client.postMessage({ type: "JTD_SW_KILLED", version: CACHE_KILL_VERSION });
      }
    } catch {}
  })());
});

self.addEventListener("fetch", () => {
  // Intentionally no respondWith: while this temporary killer is active, every
  // request must go to the network instead of an offline cache.
});