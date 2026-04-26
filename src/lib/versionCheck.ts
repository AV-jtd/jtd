/**
 * Build-time version check.
 * On app load, fetches /version.json from the server.
 * If the server version differs from the embedded build version,
 * clears all caches and forces a hard reload.
 */

// Injected at build time by Vite (see vite.config.ts define)
const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION as string | undefined;

const RELOAD_FLAG = "jtd_version_reload";
const POLL_INTERVAL_MS = 60_000; // check every 60s
const SW_UPDATE_INTERVAL_MS = 5 * 60_000; // ask SW to recheck every 5 min

// Tracks the most-recently-seen waiting registration so we can activate it
// at a safe moment (tab hidden / long idle) instead of mid-session.
let pendingRegistration: ServiceWorkerRegistration | null = null;
let activationScheduled = false;

function activateWaitingWorker(reg: ServiceWorkerRegistration | null) {
  const waiting = reg?.waiting;
  if (!waiting) return;
  // Tell the new SW to take over. The page's `controllerchange` listener
  // will then perform a clean hard-reload.
  try {
    waiting.postMessage({ type: "SKIP_WAITING" });
  } catch {
    // ignore — controllerchange path or next pollOnce will retry
  }
}

function scheduleSafeActivation(reg: ServiceWorkerRegistration) {
  pendingRegistration = reg;
  if (activationScheduled) return;
  activationScheduled = true;

  // 1) Activate as soon as the tab goes into the background — the user
  //    won't see a flash, and on return the fresh SW is already in control.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      activateWaitingWorker(pendingRegistration);
    }
  });

  // 2) Safety net: if the tab stays open for a long time, activate after
  //    10 minutes so long-lived sessions don't drift far behind production.
  const idleDeadline = Date.now() + 10 * 60_000;
  const tick = window.setInterval(() => {
    if (!pendingRegistration?.waiting) {
      window.clearInterval(tick);
      return;
    }
    if (Date.now() >= idleDeadline) {
      window.clearInterval(tick);
      activateWaitingWorker(pendingRegistration);
    }
  }, 60_000);
}

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
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    const regs = await navigator.serviceWorker?.getRegistrations();
    if (regs) await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // ignore — proceed to reload regardless
  }

  // Hard reload (bypass cache). Append cache-buster to be safe on iOS.
  const url = new URL(window.location.href);
  url.searchParams.set("_v", Date.now().toString(36));
  window.location.replace(url.toString());
}

async function pollOnce() {
  try {
    const res = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || !BUILD_VERSION) return;
    if (version !== BUILD_VERSION) {
      console.log(`[Version] Mismatch: built=${BUILD_VERSION}, server=${version}. Hard reload…`);
      await hardReload();
    }
  } catch {
    // Network error — ignore, will retry on next interval
  }
}

export async function checkForUpdates() {
  if (isSkippableContext()) return;

  // 1) Initial check on load
  await pollOnce();

  // 2) Periodic background polling
  setInterval(pollOnce, POLL_INTERVAL_MS);

  // 3) Re-check when tab becomes visible again (catches long-idle tabs)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pollOnce();
  });
  window.addEventListener("focus", pollOnce);
  window.addEventListener("online", pollOnce);

  // 4) When a new SW takes control, force a hard reload so HTML/JS match SW cache
  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      hardReload();
    });

    // 5) Watch for new SW versions and schedule safe activation.
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // SW already waiting from a previous session.
      if (reg.waiting) scheduleSafeActivation(reg);

      // New SW found via update() or browser auto-check.
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            scheduleSafeActivation(reg);
          }
        });
      });

      // Periodic update poll — guarantees long-lived tabs pick up new builds
      // within minutes (browsers also auto-check, but this is more reliable).
      const pollUpdate = () => {
        reg.update().catch(() => {});
      };
      setInterval(pollUpdate, SW_UPDATE_INTERVAL_MS);
      window.addEventListener("focus", pollUpdate);
      window.addEventListener("online", pollUpdate);
    }).catch(() => {});
  }
}
