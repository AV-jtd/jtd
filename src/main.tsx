import { createRoot } from "react-dom/client";
import "./lib/authRefreshSingleflight";
import App from "./App.tsx";
import "./index.css";
import { checkForUpdates } from "./lib/versionCheck";

// Guard: unregister service workers in iframe/preview contexts to avoid stale caches.
// In production (custom domain / published URL), vite-plugin-pwa's auto-injected
// registration script takes over and installs the real Workbox service worker.
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
  void checkForUpdates();
}

createRoot(document.getElementById("root")!).render(<App />);
