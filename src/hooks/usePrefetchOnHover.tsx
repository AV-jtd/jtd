import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Hover/focus-driven prefetch for a single project/protocol's task list.
 *
 * Pattern: when the user hovers a project row in the sidebar or a protocol
 * card in the list, we fire off the same query that the destination page
 * will run on mount and warm the React Query cache. By the time the click
 * navigates to /protocols/:id (or /projects/:id), data is already there
 * and the page renders instantly without a spinner.
 *
 * Key shape MUST match `useTasks(groupId)` exactly:
 *   ["tasks", user.id, groupId, undefined, null]
 * (filterTags = undefined, completedWindowDays = null)
 *
 * Safety:
 *  - Deduplication happens at the React Query level — `prefetchQuery` is a
 *    no-op when the cache already has fresh data within `staleTime`.
 *  - We additionally debounce per-id with a 120ms intent delay so brief
 *    cursor passes don't trigger network calls.
 *  - Per-id "started" set prevents repeat fires while one is in flight.
 */
export function usePrefetchOnHover() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const startedRef = useRef<Set<string>>(new Set());

  const prefetchTasks = useCallback(
    (groupId: string | null | undefined) => {
      if (!user || !groupId) return;
      const key = groupId;
      if (startedRef.current.has(key)) return;
      // Cancel any pending timer for this key (re-hover before fire).
      const existing = timersRef.current.get(key);
      if (existing) clearTimeout(existing);

      const t = setTimeout(() => {
        timersRef.current.delete(key);
        startedRef.current.add(key);
        void qc
          .prefetchQuery({
            queryKey: ["tasks", user.id, groupId, undefined, null],
            queryFn: async () => {
              const { data, error } = await supabase
                .from("tasks")
                .select("*, subtasks(*), task_tags(tag_id)")
                .eq("group_id", groupId)
                .order("is_completed", { ascending: true })
                .order("position")
                .order("created_at", { ascending: false })
                .range(0, 999);
              if (error) throw error;
              return data ?? [];
            },
            staleTime: 1000 * 60 * 5,
          })
          .catch(() => {
            // If the prefetch fails the eventual real fetch will retry —
            // we just allow re-prefetch on next hover.
            startedRef.current.delete(key);
          });
      }, 120);
      timersRef.current.set(key, t);
    },
    [qc, user],
  );

  const cancelPrefetch = useCallback((groupId: string | null | undefined) => {
    if (!groupId) return;
    const t = timersRef.current.get(groupId);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(groupId);
    }
  }, []);

  return { prefetchTasks, cancelPrefetch };
}