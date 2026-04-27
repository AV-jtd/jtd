import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Aggregated per-group task stats fetched server-side via the
 * `get_group_task_stats(uuid[])` SQL function.
 *
 * Why: PMO portfolio cards and the NPD board used to load EVERY task
 * (including the entire history of completed tasks) just to compute
 * `total / completed / overdue / drift / upcoming` numbers per project.
 * On heavy accounts that meant fetching tens of thousands of rows.
 * This hook replaces that with a single RPC that returns one row per
 * project — the dashboards still get accurate numbers without any
 * completed history on the wire.
 *
 * Visibility: the SQL function is `SECURITY INVOKER STABLE`, so it
 * runs under the calling user's RLS — same scope as a direct SELECT
 * on `tasks`. No new privileges.
 *
 * Cache strategy:
 *  - keyed by sorted group_ids → identical inputs share a cache entry
 *  - 30 s staleTime → the same dashboard re-rendering doesn't refetch
 *  - invalidated on `tasks` realtime events (handled below)
 */
export interface GroupTaskStats {
  group_id: string;
  total: number;
  completed: number;
  active: number;
  overdue: number;
  drift: number;
  upcoming_7d: number;
  last_completed_at: string | null;
  earliest_start: string | null;
  max_drift_days: number;
}

const EMPTY_MAP: Record<string, GroupTaskStats> = Object.freeze({});

function makeEmpty(group_id: string): GroupTaskStats {
  return {
    group_id,
    total: 0,
    completed: 0,
    active: 0,
    overdue: 0,
    drift: 0,
    upcoming_7d: 0,
    last_completed_at: null,
    earliest_start: null,
    max_drift_days: 0,
  };
}

export function useGroupTaskStats(groupIds: string[] | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Stable, sorted, deduped key — order of input shouldn't blow up the cache.
  const sortedIds = useMemo(() => {
    if (!groupIds || groupIds.length === 0) return [] as string[];
    return Array.from(new Set(groupIds)).sort();
  }, [groupIds]);

  const query = useQuery({
    queryKey: ["group_task_stats", user?.id, sortedIds],
    queryFn: async () => {
      if (sortedIds.length === 0) return [] as GroupTaskStats[];
      const { data, error } = await supabase.rpc("get_group_task_stats" as any, {
        _group_ids: sortedIds,
      });
      if (error) throw error;
      return (data || []) as unknown as GroupTaskStats[];
    },
    enabled: !!user && sortedIds.length > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  // Invalidate when ANY tasks query is invalidated by realtime.
  // useRealtimeSubscriptions already debounces tasks invalidations to ~500ms,
  // so this just piggy-backs on the same channel without opening a new one.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const key = event.query.queryKey as readonly unknown[];
      if (key[0] === "tasks") {
        // Mark stale only — actual refetch happens on next render of a
        // dashboard that uses this hook.
        qc.invalidateQueries({
          queryKey: ["group_task_stats", user.id],
          refetchType: "none",
        });
      }
    });
    return unsubscribe;
  }, [qc, user]);

  // Convenience map: group_id → stats. Missing groups return zeros so callers
  // don't have to null-check.
  const byId = useMemo(() => {
    const data = query.data;
    if (!data || data.length === 0) return EMPTY_MAP;
    const map: Record<string, GroupTaskStats> = {};
    for (const row of data) {
      map[row.group_id] = row;
    }
    return map;
  }, [query.data]);

  const get = (id: string | null | undefined): GroupTaskStats =>
    (id && byId[id]) || makeEmpty(id || "");

  return { ...query, byId, get };
}