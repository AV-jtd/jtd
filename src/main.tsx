import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
  // Register PWA with auto-update (skipWaiting is enabled)
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      onNeedRefresh() {
        // skipWaiting: true → new SW activates; controllerchange handler in
        // versionCheck.ts will perform the hard reload (clears caches + cache-buster).
      },
      onOfflineReady() {
        // Silent
      },
    });
  }).catch(() => {});
}

// Check for new version and force-reload if stale (production only)
import("@/lib/versionCheck").then(({ checkForUpdates }) => checkForUpdates()).catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
