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
  }
}
