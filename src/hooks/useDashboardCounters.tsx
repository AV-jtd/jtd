import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Все сводные числа дашборда одним вызовом `get_dashboard_counters`
 * (миграция 20260930120000), с теми же фильтрами, что у дашборда.
 *
 * Зачем. Числа считались длиной загруженного массива, а он обрывается на
 * 2000 задач (незакрытые первыми). Замер 30.09: «выполнено за неделю» 22
 * вместо 45, дрифт 386 вместо 465. При фильтрах по людям и тегам сервер не
 * участвовал вовсе. Функция SECURITY INVOKER — считает только видимое
 * пользователю, как и прямой SELECT.
 *
 * Кэш и обновление — как у useGroupTaskStats: ключ по отсортированным id,
 * 30 с свежести, помечается устаревшим при событиях realtime по `tasks`.
 */
export interface DashboardCounters {
  total: number;
  completed: number;
  overdue: number;
  drift: number;
  upcoming_7d: number;
  completed_7d: number;
  completed_prev_7d: number;
  overdue_week_ago: number;
  drift_week_ago: number;
  unassigned: number;
  no_deadline: number;
}

const sortedUnique = (ids: string[] | null | undefined) =>
  ids && ids.length ? Array.from(new Set(ids)).sort() : [];

export function useDashboardCounters(
  groupIds: string[] | null | undefined,
  assigneeIds?: string[],
  tagIds?: string[],
  participantIds?: string[],
) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const key = useMemo(
    () => ({
      groups: sortedUnique(groupIds),
      assignees: sortedUnique(assigneeIds),
      tags: sortedUnique(tagIds),
      participants: sortedUnique(participantIds),
    }),
    [groupIds, assigneeIds, tagIds, participantIds],
  );

  const query = useQuery({
    queryKey: ["dashboard_counters", user?.id, key],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_counters" as any, {
        _group_ids: key.groups,
        _assignee_ids: key.assignees.length ? key.assignees : null,
        _tag_ids: key.tags.length ? key.tags : null,
        _participant_ids: key.participants.length ? key.participants : null,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as DashboardCounters | undefined;
      return row ?? null;
    },
    enabled: !!user && key.groups.length > 0,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!user) return;
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const k = event.query.queryKey as readonly unknown[];
      if (k[0] === "tasks") {
        qc.invalidateQueries({ queryKey: ["dashboard_counters", user.id], refetchType: "none" });
      }
    });
    return unsubscribe;
  }, [qc, user]);

  return query;
}
