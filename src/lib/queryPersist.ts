import { get, set, del } from "idb-keyval";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

// Bump this version whenever data shape changes to invalidate stale cache
const CACHE_VERSION = 4;
const IDB_KEY = "REACT_QUERY_OFFLINE_CACHE";
const VERSION_KEY = "REACT_QUERY_CACHE_VERSION";

export const idbPersister = {
  persistClient: async (client: PersistedClient) => {
    await set(VERSION_KEY, CACHE_VERSION);
    await set(IDB_KEY, client);
  },
  restoreClient: async (): Promise<PersistedClient | undefined> => {
    const version = await get<number>(VERSION_KEY);
    if (version !== CACHE_VERSION) {
      await del(IDB_KEY);
      await set(VERSION_KEY, CACHE_VERSION);
      return undefined;
    }
    return await get<PersistedClient>(IDB_KEY);
  },
  removeClient: async () => {
    await del(IDB_KEY);
  },
};
