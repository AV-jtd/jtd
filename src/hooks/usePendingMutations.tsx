import { useSyncExternalStore, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Returns the count of pending (paused) mutations in the React Query mutation cache.
 * These are mutations queued while offline that will replay on reconnect.
 */
export function usePendingMutations() {
  const qc = useQueryClient();
  const mc = qc.getMutationCache();

  const subscribe = useCallback(
    (cb: () => void) => mc.subscribe(cb),
    [mc]
  );

  const getSnapshot = useCallback(() => {
    return mc.getAll().filter((m) => m.state.isPaused).length;
  }, [mc]);

  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
