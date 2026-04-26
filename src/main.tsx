import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { checkForUpdates } from "./lib/versionCheck";

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
  // Register PWA. When a new version is available, activate it immediately —
  // stale bundles cause data-loading failures because RLS/schema can change
  // between deploys. The version-check poll below will hard-reload the tab
  // once the new SW takes control.
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Auto-activate the waiting SW. `controllerchange` in versionCheck.ts
        // will then trigger a hard reload to load the matching JS/HTML.
        updateSW(true);
      },
      onOfflineReady() {
        // Silent
      },
    });
  }).catch(() => {});

  // Build-version polling: catches mismatches even if the SW update fails.
  checkForUpdates();
}

createRoot(document.getElementById("root")!).render(<App />);
