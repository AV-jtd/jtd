// Custom service worker additions:
//   1. Orphan-cache cleanup (versioned cache GC)
//   2. Web Push notifications
//
// Loaded via Workbox's `importScripts` in vite.config.ts. The build version
// is appended as a query string (?v=…) so each deploy ships a fresh copy.

// ---------------------------------------------------------------------------
// 1. Orphan-cache cleanup
// ---------------------------------------------------------------------------
// Vite PWA versions our runtime caches with the build hash (app-chunks-XYZ,
// app-images-XYZ) and Workbox versions the precache (workbox-precache-…-jtd-XYZ).
// On activation we delete any cache that doesn't match the current build,
// except for long-lived shared caches (Google Fonts) — preventing unbounded
// cache growth on mobile across deploys.

// Read current build hash from the importScripts query string.
const SW_URL = new URL(self.location.href);
const SW_VERSION = SW_URL.searchParams.get("v") || "";

// Caches that should survive across deploys (shared, immutable assets).
const PRESERVED_CACHES = new Set(["google-fonts-cache", "gstatic-fonts-cache"]);

function isCurrentVersionCache(name) {
  if (!SW_VERSION) return true; // no version info → don't risk deleting
  // Workbox precache name contains the cacheId we set in vite.config.ts.
  if (name.includes(`jtd-${SW_VERSION}`)) return true;
  // Our explicitly-versioned runtime caches.
  if (name.endsWith(`-${SW_VERSION}`)) return true;
  return false;
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map(async (name) => {
          if (PRESERVED_CACHES.has(name)) return;
          if (isCurrentVersionCache(name)) return;
          // Stale cache from a previous deploy — drop it.
          await caches.delete(name);
        }),
      );
    })(),
  );
});

// ---------------------------------------------------------------------------
// 1b. Controlled SKIP_WAITING
// ---------------------------------------------------------------------------
// Workbox is configured with skipWaiting: false so a freshly-installed SW
// stays in the "waiting" state and does NOT interrupt in-progress work
// (uploads, edits) of users with the app already open. The page calls
// `registration.waiting.postMessage({ type: "SKIP_WAITING" })` at a SAFE
// moment (tab becomes hidden, network drops, or the app explicitly decides
// to refresh). At that point the new SW takes over, and `controllerchange`
// in the page triggers a clean hard-reload.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ---------------------------------------------------------------------------
// 2. Web Push notifications
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = { title: "JustTODOit", body: "" };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    vibrate: [100, 50, 100],
    data: { url: "/" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

