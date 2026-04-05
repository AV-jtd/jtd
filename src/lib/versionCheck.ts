/**
 * Build-time version check.
 * On app load, fetches /version.json from the server.
 * If the server version differs from the embedded build version,
 * clears all caches and forces a hard reload.
 */

// Injected at build time by Vite (see vite.config.ts define)
const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION as string | undefined;

const RELOAD_FLAG = "jtd_version_reload";

export async function checkForUpdates() {
  // Skip in dev, iframe, or preview contexts
  if (import.meta.env.DEV) return;

  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  if (isInIframe) return;

  const isPreview =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");
  if (isPreview) return;

  // Prevent infinite reload loops
  const reloadedAt = sessionStorage.getItem(RELOAD_FLAG);
  if (reloadedAt && Date.now() - Number(reloadedAt) < 30_000) return;

  try {
    const res = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;

    const { version } = await res.json();
    if (!version || !BUILD_VERSION) return;

    if (version !== BUILD_VERSION) {
      console.log(`[Version] Mismatch: built=${BUILD_VERSION}, server=${version}. Reloading…`);
      sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));

      // Clear SW caches
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }

      // Unregister service workers
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));

      // Hard reload (bypass cache)
      window.location.reload();
    }
  } catch {
    // Network error — ignore, will retry next load
  }
}
