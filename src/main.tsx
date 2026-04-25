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
  // Register PWA with auto-update (skipWaiting is enabled).
  // We capture the ServiceWorkerRegistration so we can drive background
  // refresh ourselves — important on mobile where the browser may not
  // poll for new SWs aggressively (esp. in standalone/PWA mode).
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        startBackgroundSwRefresh(registration);
      },
      onNeedRefresh() {
        // skipWaiting: true → new SW activates; controllerchange handler in
        // versionCheck.ts will perform the hard reload (clears caches + cache-buster).
      },
      onOfflineReady() {
        // Silent
      },
    });
    void updateSW;
  }).catch(() => {});
}

/**
 * Drive the service worker to look for a new version in the background.
 *
 * `registration.update()` asks the browser to refetch the SW script — if the
 * bytes differ, the new SW installs and (because `skipWaiting: true`) takes
 * over, firing `controllerchange` which our versionCheck handler turns into
 * a hard reload.
 *
 * Triggers:
 *   - every 15 min while the tab is alive
 *   - whenever the tab becomes visible / focused / regains network
 *   - via Periodic Background Sync (Android Chrome PWA, when granted)
 */
function startBackgroundSwRefresh(registration: ServiceWorkerRegistration) {
  const SW_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

  const tryUpdate = () => {
    // `update()` is a no-op if the SW script hasn't changed.
    registration.update().catch(() => {});
  };

  setInterval(tryUpdate, SW_REFRESH_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryUpdate();
  });
  window.addEventListener("focus", tryUpdate);
  window.addEventListener("online", tryUpdate);

  // Periodic Background Sync — fires even when the page is closed, on
  // browsers that support it (Chrome on Android, installed PWA, with
  // permission granted). Tag is handled in custom-sw.js.
  void registerPeriodicSwRefresh(registration);
}

async function registerPeriodicSwRefresh(registration: ServiceWorkerRegistration) {
  try {
    // periodicSync is still experimental — typed loosely.
    const periodicSync = (registration as unknown as {
      periodicSync?: {
        register: (tag: string, opts: { minInterval: number }) => Promise<void>;
        getTags: () => Promise<string[]>;
      };
    }).periodicSync;
    if (!periodicSync) return;

    const status = await navigator.permissions
      .query({ name: "periodic-background-sync" as PermissionName })
      .catch(() => null);
    if (!status || status.state !== "granted") return;

    const tags = await periodicSync.getTags();
    if (tags.includes("sw-refresh")) return;

    await periodicSync.register("sw-refresh", {
      minInterval: 24 * 60 * 60 * 1000, // browser may run less often
    });
  } catch {
    // Unsupported / not installed as PWA — silently skip.
  }
}

// Check for new version and force-reload if stale (production only)
import("@/lib/versionCheck").then(({ checkForUpdates }) => checkForUpdates()).catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
