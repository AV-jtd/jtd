/**
 * Shared stale-chunk recovery with a HARD attempt cap.
 *
 * Previously each entry point kept its own time-based cooldown and
 * lazyWithRetry cleared the guard on every successful chunk. When one chunk
 * loaded fine but another consistently failed, that reset the guard and the
 * page reloaded forever — the browser surfaces this as ERR_TOO_MANY_REDIRECTS.
 *
 * Now we count recovery attempts in sessionStorage and stop after MAX_ATTEMPTS,
 * letting the ErrorBoundary show a manual "reload" UI instead of looping.
 */

const ATTEMPT_KEY = "jtd-chunk-recovery-attempts";
const MAX_ATTEMPTS = 2;

export function getRecoveryAttempts(): number {
  try {
    return Number(sessionStorage.getItem(ATTEMPT_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function canAttemptRecovery(): boolean {
  return getRecoveryAttempts() < MAX_ATTEMPTS;
}

/**
 * Reset the counter once the app has proven stable (called from main.tsx after
 * a successful boot settles). Never call this per-chunk — that re-enables the
 * infinite reload loop.
 */
export function resetRecoveryAttempts(): void {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // ignore
  }
}

export function isStaleChunkError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? "");
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    /Cannot read propert(y|ies) of undefined \(reading ['"]default['"]\)/i.test(msg)
  );
}

/**
 * Unregister service workers, clear caches, and hard-reload with a cache
 * buster. Increments the attempt counter first so the cap is enforced across
 * reloads. Returns true if a reload was triggered, false if the cap was hit.
 */
export async function recoverFromStaleChunk(): Promise<boolean> {
  if (!canAttemptRecovery()) return false;

  try {
    sessionStorage.setItem(ATTEMPT_KEY, String(getRecoveryAttempts() + 1));
  } catch {
    // If we can't persist the counter we must NOT reload — otherwise we loop
    // forever. Bail out and let the error surface in the UI instead.
    return false;
  }

  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.allSettled((regs ?? []).map((reg) => reg.unregister()));
  } catch {
    // Continue with cache cleanup and a cache-busted reload.
  }

  try {
    if ("caches" in window) {
      const names = await window.caches.keys();
      await Promise.allSettled(names.map((name) => window.caches.delete(name)));
    }
  } catch {
    // Reload even if Cache Storage is unavailable.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_v", Date.now().toString(36));
  window.location.replace(url.toString());
  return true;
}
