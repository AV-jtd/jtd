import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { checkForUpdates } from "./lib/versionCheck";

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
  // Register PWA. We use registerType: "prompt" + skipWaiting: false in
  // vite.config.ts, so a freshly-installed SW stays "waiting" and never
  // interrupts in-progress work. The actual activation is orchestrated by
  // `checkForUpdates()` (src/lib/versionCheck.ts), which:
  //   • polls /version.json every minute
  //   • calls registration.update() every 5 min
  //   • when a waiting SW appears, sends SKIP_WAITING the moment the tab
  //     goes into the background (or after 10 min of foreground idle)
  //   • on `controllerchange`, performs a clean hard-reload so the HTML
  //     and JS chunks always come from the same build.
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        // Handled by versionCheck → safe activation pipeline.
      },
      onOfflineReady() {
        // Silent
      },
    });
  }).catch(() => {});

  // Start version polling + SW update orchestration.
  checkForUpdates().catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
