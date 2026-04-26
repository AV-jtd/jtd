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
