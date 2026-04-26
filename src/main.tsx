import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ---------------------------------------------------------------------------
// Safari/PWA white-screen guard: stale lazy chunks after deploy
// ---------------------------------------------------------------------------
// When a new build is deployed, the user's HTML may still reference old JS
// chunk hashes via the Service Worker cache. Calling import() on a missing
// chunk throws (vite emits a `vite:preloadError` event). Without handling,
// React renders nothing → user sees a white screen (especially on Safari,
// where SW caches are aggressive).
//
// Strategy: on first preload failure, drop SW caches and hard-reload.
let reloadingForChunkError = false;
const handleChunkError = async (reason: unknown) => {
  const msg = String((reason as any)?.message || reason || "");
  const isChunkError =
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Unable to preload");
  if (!isChunkError || reloadingForChunkError) return;
  reloadingForChunkError = true;
  console.warn("[main] Stale chunk detected, clearing SW caches and reloading", reason);
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}
  // Cache-busting query so Safari doesn't serve a memory-cached HTML.
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
};
window.addEventListener("vite:preloadError", (e) => handleChunkError((e as any).payload));
window.addEventListener("unhandledrejection", (e) => handleChunkError(e.reason));
window.addEventListener("error", (e) => handleChunkError(e.error || e.message));

// Guard: unregister service workers in iframe/preview contexts to avoid stale caches
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else {
  // Register PWA quietly. Updates must not force a reload: offline-light access
  // is more important than immediately switching every tab to the newest build.
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        // New version is available; it will be picked up on a normal reload.
      },
      onOfflineReady() {
        // Silent
      },
    });
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
