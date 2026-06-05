/**
 * Cross-tab cache + deduplication for auth metadata (is_approved, roles, admin mode).
 *
 * Why: Opening multiple tabs of the app caused each tab to independently hit
 * Supabase for the same `profiles` / `user_roles` / `admin_exists` / `admin_mode_state`
 * rows. With slow networks this multiplied auth latency by N tabs and made
 * the UI sit on a spinner.
 *
 * Strategy:
 *  1. localStorage holds a short-lived snapshot per userId (TTL 60s). On boot,
 *     a tab can paint immediately from cache while it revalidates in the
 *     background.
 *  2. A BroadcastChannel ("auth-meta") lets the tab that finished the
 *     network round-trip push fresh values to its siblings — no extra
 *     fetches needed.
 *  3. A localStorage "lock" (in-flight marker, TTL 5s) lets a tab know that
 *     a sibling is already fetching. Late tabs await the broadcast instead
 *     of duplicating the request.
 */

export interface AuthMetaSnapshot {
  isApproved: boolean;
  isAdmin: boolean;
  isConsultant: boolean;
  adminModeDisabled: boolean;
  /** epoch ms */
  fetchedAt: number;
}

const STORAGE_PREFIX = "auth_meta_v1:";
const LOCK_PREFIX = "auth_meta_lock_v1:";
const TTL_MS = 60 * 1000; // 60s — fresh enough, still avoids storms on tab fan-out
const LOCK_TTL_MS = 5 * 1000; // 5s — a fetch should never realistically take longer
const CHANNEL_NAME = "auth-meta-v1";

function key(userId: string) { return STORAGE_PREFIX + userId; }
function lockKey(userId: string) { return LOCK_PREFIX + userId; }

export function readAuthMeta(userId: string): AuthMetaSnapshot | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthMetaSnapshot;
    if (typeof parsed?.fetchedAt !== "number") return null;
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read the snapshot regardless of TTL. Used for stale-while-revalidate on a
 * cold start: even an expired snapshot lets us paint the app instantly (roles,
 * approval) while the real network fetch refreshes values in the background.
 * This avoids the 20–30s "stuck spinner" when the proxy/network is slow.
 */
export function readAuthMetaStale(userId: string): AuthMetaSnapshot | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthMetaSnapshot;
    if (typeof parsed?.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuthMeta(userId: string, snap: Omit<AuthMetaSnapshot, "fetchedAt">) {
  const full: AuthMetaSnapshot = { ...snap, fetchedAt: Date.now() };
  try { localStorage.setItem(key(userId), JSON.stringify(full)); } catch {}
  try { getChannel()?.postMessage({ type: "meta", userId, snap: full }); } catch {}
  return full;
}

export function clearAuthMeta(userId?: string) {
  try {
    if (userId) {
      localStorage.removeItem(key(userId));
      localStorage.removeItem(lockKey(userId));
    } else {
      // Wipe all auth-meta entries
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(STORAGE_PREFIX) || k.startsWith(LOCK_PREFIX))) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch {}
}

/**
 * Try to acquire a cross-tab lock for fetching this user's auth meta.
 * Returns true if this tab should perform the fetch, false if another tab
 * is already on it.
 */
export function acquireFetchLock(userId: string): boolean {
  try {
    const k = lockKey(userId);
    const existing = localStorage.getItem(k);
    if (existing) {
      const ts = parseInt(existing, 10);
      if (Number.isFinite(ts) && Date.now() - ts < LOCK_TTL_MS) {
        return false; // someone else is fetching, and the lock is fresh
      }
    }
    localStorage.setItem(k, String(Date.now()));
    return true;
  } catch {
    return true; // if storage fails, just fetch
  }
}

export function releaseFetchLock(userId: string) {
  try { localStorage.removeItem(lockKey(userId)); } catch {}
}

// --- BroadcastChannel singleton -----------------------------------------

let channel: BroadcastChannel | null = null;
let channelInitFailed = false;

function getChannel(): BroadcastChannel | null {
  if (channel || channelInitFailed) return channel;
  if (typeof BroadcastChannel === "undefined") {
    channelInitFailed = true;
    return null;
  }
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channelInitFailed = true;
  }
  return channel;
}

type MetaMessage = { type: "meta"; userId: string; snap: AuthMetaSnapshot };

/**
 * Subscribe to cross-tab auth meta updates. Returns an unsubscribe fn.
 * The handler is called when *another* tab finishes fetching meta for
 * `userId` — so this tab can update its own state without a request.
 */
export function subscribeAuthMeta(userId: string, onUpdate: (snap: AuthMetaSnapshot) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (ev: MessageEvent<MetaMessage>) => {
    const msg = ev.data;
    if (!msg || msg.type !== "meta" || msg.userId !== userId) return;
    onUpdate(msg.snap);
  };
  ch.addEventListener("message", handler);
  return () => {
    try { ch.removeEventListener("message", handler); } catch {}
  };
}
