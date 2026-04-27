import { useEffect, useState, useRef } from "react";

/**
 * Online status with active verification.
 *
 * `navigator.onLine` is unreliable: it goes false on Wi-Fi/VPN flicker,
 * proxy hiccups, system suspend/resume — even when the internet is fine.
 * To avoid showing "Нет подключения" spuriously, we verify suspected
 * offline events with a real network ping before reporting offline.
 *
 * - Online → offline: requires 2 consecutive failed pings (≈3s apart)
 * - Offline → online: trusted immediately (false positives here are harmless)
 * - Periodic background re-check every 30s while marked offline.
 */

const PING_URL = "/version.json"; // small, cache-busted, same-origin
const PING_TIMEOUT_MS = 4000;
const VERIFY_DELAY_MS = 1500;
const BACKGROUND_RECHECK_MS = 30_000;

async function ping(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    const res = await fetch(`${PING_URL}?_=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok || res.status === 304;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const verifyTimer = useRef<number | null>(null);
  const recheckTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clearVerify = () => {
      if (verifyTimer.current) {
        window.clearTimeout(verifyTimer.current);
        verifyTimer.current = null;
      }
    };
    const clearRecheck = () => {
      if (recheckTimer.current) {
        window.clearInterval(recheckTimer.current);
        recheckTimer.current = null;
      }
    };

    const verifyOffline = async () => {
      // Two-phase check: wait, ping, if fail wait, ping again.
      const first = await ping();
      if (cancelled) return;
      if (first) {
        setIsOnline(true);
        return;
      }
      verifyTimer.current = window.setTimeout(async () => {
        const second = await ping();
        if (cancelled) return;
        if (second) {
          setIsOnline(true);
        } else {
          setIsOnline(false);
          // Schedule background re-checks while offline.
          clearRecheck();
          recheckTimer.current = window.setInterval(async () => {
            const ok = await ping();
            if (!cancelled && ok) {
              setIsOnline(true);
              clearRecheck();
            }
          }, BACKGROUND_RECHECK_MS);
        }
      }, VERIFY_DELAY_MS);
    };

    const onOffline = () => {
      // Don't trust the browser — verify.
      clearVerify();
      verifyTimer.current = window.setTimeout(verifyOffline, VERIFY_DELAY_MS);
    };

    const onOnline = () => {
      clearVerify();
      clearRecheck();
      setIsOnline(true);
    };

    const onVisibility = () => {
      // Tab returned to focus — re-verify in case we slept while "offline".
      if (document.visibilityState === "visible" && !navigator.onLine) {
        verifyOffline();
      } else if (document.visibilityState === "visible") {
        // Trust browser optimistically; ping in background to confirm.
        ping().then((ok) => {
          if (!cancelled && ok) setIsOnline(true);
        });
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearVerify();
      clearRecheck();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return isOnline;
}
