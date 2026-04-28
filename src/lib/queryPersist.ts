import { get, set, del } from "idb-keyval";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

// Bump this version whenever data shape changes to invalidate stale cache
// v8: useUnreadMessages switched from per-thread Map cache to server-aggregated
// `unread_threads` array — old persisted shape would crash useQuery on restore.
const CACHE_VERSION = 8;
const IDB_KEY = "REACT_QUERY_OFFLINE_CACHE";
const VERSION_KEY = "REACT_QUERY_CACHE_VERSION";

// Hard timeout for any IndexedDB operation. Some browser modes (Safari Private,
// Firefox with strict storage, corrupted IDB) can leave requests pending
// forever. Without a timeout, PersistQueryClientProvider never unblocks the
// app and the user sees a permanent white screen on Mac Safari/Chrome.
const IDB_TIMEOUT_MS = 2_000;

// If IndexedDB hangs once on boot (corrupted IDB, Safari Private Mode,
// browser storage policy), keep silently disabling persistence for the rest
// of the session instead of timing out on every persistClient call (which
// happens every few seconds as React Query syncs). This dramatically improves
// performance on broken-IDB clients.
let idbBroken = false;

function withTimeout<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  return Promise.race([
    p.catch((err) => {
      console.warn(`[queryPersist] ${label} failed:`, err);
      idbBroken = true;
      return fallback;
    }),
    new Promise<T>((resolve) =>
      setTimeout(() => {
        console.warn(`[queryPersist] ${label} timed out — skipping persistence`);
        idbBroken = true;
        resolve(fallback);
      }, IDB_TIMEOUT_MS),
    ),
  ]);
}

export const idbPersister = {
  persistClient: async (client: PersistedClient) => {
    if (idbBroken) return;
    try {
      await withTimeout(
        (async () => {
          await set(VERSION_KEY, CACHE_VERSION);
          await set(IDB_KEY, client);
        })(),
        undefined,
        "persistClient",
      );
    } catch (err) {
      console.warn("[queryPersist] persistClient swallowed error:", err);
    }
  },
  restoreClient: async (): Promise<PersistedClient | undefined> => {
    try {
      const version = await withTimeout(get<number>(VERSION_KEY), undefined, "restoreClient:version");
      if (idbBroken) return undefined;
      if (version !== CACHE_VERSION) {
        await withTimeout(del(IDB_KEY), undefined, "restoreClient:del");
        await withTimeout(set(VERSION_KEY, CACHE_VERSION), undefined, "restoreClient:setVersion");
        return undefined;
      }
      return await withTimeout(get<PersistedClient>(IDB_KEY), undefined, "restoreClient:get");
    } catch (err) {
      console.warn("[queryPersist] restoreClient failed, starting fresh:", err);
      return undefined;
    }
  },
  removeClient: async () => {
    if (idbBroken) return;
    try {
      await withTimeout(del(IDB_KEY), undefined, "removeClient");
    } catch (err) {
      console.warn("[queryPersist] removeClient failed:", err);
    }
  },
};
