import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/** Schedule work for the browser's idle period (with a fallback timeout). */
function runWhenIdle(cb: () => void, timeout = 1500) {
  const ric =
    typeof window !== "undefined" &&
    (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(cb, { timeout });
  else setTimeout(cb, 200);
}

const PREFETCH_LOCK_PREFIX = "jtd_prefetch_lock:";
const PREFETCH_DONE_PREFIX = "jtd_prefetch_done:";
const PREFETCH_LOCK_TTL_MS = 2 * 60 * 1000;
const PREFETCH_DONE_TTL_MS = 10 * 60 * 1000;

function shouldRunPrefetch(userId: string) {
  try {
    const now = Date.now();
    const doneAt = Number(localStorage.getItem(PREFETCH_DONE_PREFIX + userId) || 0);
    if (doneAt && now - doneAt < PREFETCH_DONE_TTL_MS) return false;

    const lockKey = PREFETCH_LOCK_PREFIX + userId;
    const lockedAt = Number(localStorage.getItem(lockKey) || 0);
    if (lockedAt && now - lockedAt < PREFETCH_LOCK_TTL_MS) return false;

    localStorage.setItem(lockKey, String(now));
    return true;
  } catch {
    return true;
  }
}

function finishPrefetch(userId: string) {
  try {
    localStorage.setItem(PREFETCH_DONE_PREFIX + userId, String(Date.now()));
    localStorage.removeItem(PREFETCH_LOCK_PREFIX + userId);
  } catch {}
}

/**
 * Prefetches lightweight reference data after login.
 *
 * Important: do NOT prefetch the global tasks table here. The task list has
 * its own paginated/windowed query key; the old eager prefetch used a different
 * key and fetched the entire task history, including STM stages and old
 * completed rows. On clean devices that meant a duplicate multi-megabyte boot
 * query racing the real first paint and often ending in "Не удалось загрузить
 * задачи" before the useful query could settle.
 */
export function usePrefetchData() {
  const { user } = useAuth();
  const qc = useQueryClient();
  // Guard against re-runs (StrictMode double-mount, qc identity changes, etc.)
  const prefetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (prefetchedFor.current === user.id) return;
    prefetchedFor.current = user.id;

    // Defer until the browser is idle so we don't compete with the first
    // paint or block the main thread while the user is trying to interact.
    const prefetch = async () => {
      if (document.visibilityState === "hidden" || !shouldRunPrefetch(user.id)) return;

      const prefetches = [
        () => qc.prefetchQuery({
          queryKey: ["task_groups", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("task_groups")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        () => qc.prefetchQuery({
          queryKey: ["tags", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("tags")
              .select("*")
              .order("name");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        () => qc.prefetchQuery({
          queryKey: ["tag_categories", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("tag_categories")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        () => qc.prefetchQuery({
          queryKey: ["project_folders", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("project_folders")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        () => qc.prefetchQuery({
          queryKey: ["project_folder_items", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("project_folder_items")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        () => qc.prefetchQuery({
          queryKey: ["clients", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("clients")
              .select("*")
              .order("name");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
      ];

      for (const run of prefetches) {
        if (document.hidden) break;
        await run().catch(() => undefined);
      }
      finishPrefetch(user.id);
    };

    runWhenIdle(() => { void prefetch(); });
  }, [user?.id, qc]);
}
