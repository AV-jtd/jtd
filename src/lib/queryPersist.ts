import { get, set, del } from "idb-keyval";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

const IDB_KEY = "REACT_QUERY_OFFLINE_CACHE";

export const idbPersister = {
  persistClient: async (client: PersistedClient) => {
    await set(IDB_KEY, client);
  },
  restoreClient: async (): Promise<PersistedClient | undefined> => {
    return await get<PersistedClient>(IDB_KEY);
  },
  removeClient: async () => {
    await del(IDB_KEY);
  },
};
