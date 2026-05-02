import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight bulk fetcher for task completion status.
 * Used in chats (TaskChat system dividers, ProjectChat created-task cards,
 * MessengerPanel thread list) to render closed tasks struck-through with
 * a "Закрыта" pill, without pulling the full task payload.
 *
 * Returns a stable Map<taskId, isCompleted>. Missing ids = unknown (treated
 * as not completed by callers).
 */
export function useTaskStatuses(taskIds: string[]) {
  // Stable key: sorted unique ids.
  const ids = Array.from(new Set(taskIds.filter(Boolean))).sort();
  const key = ids.join(",");

  return useQuery({
    queryKey: ["task_statuses", key],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, is_completed")
        .in("id", ids);
      if (error) throw error;
      const map = new Map<string, boolean>();
      for (const r of (data as { id: string; is_completed: boolean }[]) || []) {
        map.set(r.id, !!r.is_completed);
      }
      return map;
    },
  });
}