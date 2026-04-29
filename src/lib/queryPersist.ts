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

// If IndexedDB hangs or fails, keep silently disabling persistence for the
// rest of the session. This dramatically improves performance on broken-IDB
// clients (Safari Private Mode, corrupted storage, etc.).
let idbBroken = false;
let warnedOnce = false;

// Serialize all IDB operations through a single chain so we don't fire 8
// parallel writes on boot — when the storage is broken, parallel writes
// produce 8 simultaneous timeouts and 16+ seconds of useless work.
let chain: Promise<unknown> = Promise.resolve();

function runSerial<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  if (idbBroken) return Promise.resolve(fallback);
  const next = chain.then(() => {
    if (idbBroken) return fallback;
    return Promise.race([
      fn().catch((err) => {
        idbBroken = true;
        if (!warnedOnce) {
          warnedOnce = true;
          console.warn(`[queryPersist] ${label} failed — disabling persistence:`, err);
        }
        return fallback;
      }),
      new Promise<T>((resolve) =>
        setTimeout(() => {
          idbBroken = true;
          if (!warnedOnce) {
            warnedOnce = true;
            console.warn(`[queryPersist] ${label} timed out — disabling persistence`);
          }
          resolve(fallback);
        }, IDB_TIMEOUT_MS),
      ),
    ]);
  });
  // Keep the chain alive even if fn throws.
  chain = next.catch(() => undefined);
  return next as Promise<T>;
}

export const idbPersister = {
  persistClient: async (client: PersistedClient) => {
    await runSerial(
      async () => {
        await set(VERSION_KEY, CACHE_VERSION);
        await set(IDB_KEY, client);
      },
      undefined,
      "persistClient",
    );
  },
  restoreClient: async (): Promise<PersistedClient | undefined> => {
    const version = await runSerial(() => get<number>(VERSION_KEY), undefined, "restoreClient:version");
    if (idbBroken) return undefined;
    if (version !== CACHE_VERSION) {
      await runSerial(() => del(IDB_KEY), undefined, "restoreClient:del");
      await runSerial(() => set(VERSION_KEY, CACHE_VERSION), undefined, "restoreClient:setVersion");
      return undefined;
    }
    return await runSerial(() => get<PersistedClient>(IDB_KEY), undefined, "restoreClient:get");
  },
  removeClient: async () => {
    await runSerial(() => del(IDB_KEY), undefined, "removeClient");
  },
};
