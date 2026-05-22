/**
 * Build-time version check.
 * On app load, fetches /version.json from the server.
 * If the server version differs from the embedded build version,
 * marks an update and applies it only after the tab is backgrounded.
 */

// Injected at build time by Vite (see vite.config.ts define)
const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION as string | undefined;

const RELOAD_FLAG = "jtd_version_reload";
const POLL_INTERVAL_MS = 5 * 60_000; // check every 5 min; avoid noisy foreground polling
const SW_UPDATE_INTERVAL_MS = 5 * 60_000;
let lastPollAt = 0;

function isSkippableContext(): boolean {
  if (import.meta.env.DEV) return true;
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  if (isInIframe) return true;
  const isPreview =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");
  return isPreview;
}

async function hardReload() {
  // Prevent infinite reload loops
  const reloadedAt = sessionStorage.getItem(RELOAD_FLAG);
  if (reloadedAt && Date.now() - Number(reloadedAt) < 30_000) return;
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));

  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    const currentOrigin = window.location.origin;
    if (regs) {
      await Promise.all(
        regs.map((reg) => {
          const activeUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
          return activeUrl && !activeUrl.startsWith(currentOrigin) ? reg.unregister() : Promise.resolve(true);
        }),
      );
    }
  } catch {
    // ignore — proceed to reload regardless
  }

  // Hard reload (bypass cache). Append cache-buster to be safe on iOS.
  const url = new URL(window.location.href);
  url.searchParams.set("_v", Date.now().toString(36));
  window.location.replace(url.toString());
}

function markUpdateAvailable() {
  try { sessionStorage.setItem("jtd_update_available", String(Date.now())); } catch {}
  try {
    window.dispatchEvent(new CustomEvent("jtd:update-available"));
  } catch {}
}

function clearUpdateAvailable() {
  try { sessionStorage.removeItem("jtd_update_available"); } catch {}
}

/**
 * Manually trigger the pending update. Called from the in-app "Обновить сейчас"
 * button so users don't have to wait for the tab to be backgrounded.
 */
export async function applyUpdateNow() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      try { await reg.update(); } catch {}
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
  } catch {}
  await hardReload();
}

export function isUpdateAvailable(): boolean {
  try { return sessionStorage.getItem("jtd_update_available") !== null; } catch { return false; }
}

async function hardReloadOnlyWhenHidden() {
  markUpdateAvailable();
  if (document.visibilityState !== "hidden") return;
  await hardReload();
}

function requestWaitingWorkerActivation(reg: ServiceWorkerRegistration) {
  if (!reg.waiting) return;
  reg.waiting.postMessage({ type: "SKIP_WAITING" });
}

function scheduleSafeActivation(reg: ServiceWorkerRegistration) {
  if (!reg.waiting) return;

  if (document.visibilityState === "hidden") {
    requestWaitingWorkerActivation(reg);
    return;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") requestWaitingWorkerActivation(reg);
  }, { once: true });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const reg = await navigator.serviceWorker.register("/sw.js");
  try { await reg.update(); } catch {}
  if (reg.waiting) scheduleSafeActivation(reg);

  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        scheduleSafeActivation(reg);
      }
    });
  });

  window.setInterval(() => { void reg.update(); }, SW_UPDATE_INTERVAL_MS);
}

async function pollOnce() {
  lastPollAt = Date.now();
  try {
    const res = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || !BUILD_VERSION) return;
    if (version !== BUILD_VERSION) {
      console.log(`[Version] Mismatch: built=${BUILD_VERSION}, server=${version}. Update postponed until tab is hidden.`);
      markUpdateAvailable();
      if (document.visibilityState === "hidden") {
        await hardReload();
        return;
      }
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) scheduleSafeActivation(reg);
      }
    } else {
      clearUpdateAvailable();
    }
  } catch {
    // Network error — ignore, will retry on next interval
  }
}

export async function checkForUpdates() {
  if (isSkippableContext()) return;

  try {
    await registerServiceWorker();
  } catch (err) {
    console.warn("[Version] Service worker registration failed:", err);
  }

  // 1) Initial check on load
  await pollOnce();

  // 2) Periodic background polling
  setInterval(pollOnce, POLL_INTERVAL_MS);

  // 3) Re-check when tab becomes visible again (catches long-idle tabs)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && sessionStorage.getItem("jtd_update_available")) {
      void hardReload();
      return;
    }
    if (document.visibilityState === "visible" && Date.now() - lastPollAt > POLL_INTERVAL_MS) pollOnce();
  });
  window.addEventListener("focus", () => {
    if (Date.now() - lastPollAt > POLL_INTERVAL_MS) pollOnce();
  });
  window.addEventListener("online", () => {
    if (Date.now() - lastPollAt > POLL_INTERVAL_MS) pollOnce();
  });

  // 4) When a new SW takes control, reload only once the tab is backgrounded.
  // Reloading immediately on controllerchange was causing full app resets while
  // users were actively working, especially with several tabs open.
  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      void hardReloadOnlyWhenHidden();
    });
  }
}
