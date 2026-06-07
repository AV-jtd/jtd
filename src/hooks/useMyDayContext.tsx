import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface CrossSignal {
  count: number;
  items: { title: string; ref: string | null }[];
}

export interface MyDayContext {
  protocols: CrossSignal;
  drift: CrossSignal;
  npd: CrossSignal;
}

const EMPTY: MyDayContext = {
  protocols: { count: 0, items: [] },
  drift: { count: 0, items: [] },
  npd: { count: 0, items: [] },
};

/**
 * Кросс-ап сигналы для экрана «Мой день» — одним запросом:
 *  - protocols: незакрытые экшен-айтемы из протоколов совещаний (source_protocol_id);
 *  - drift: задачи со сдвигом срока относительно базлайна (original_deadline);
 *  - npd: задачи NPD-проектов в зоне риска (просрочены).
 * RLS ограничивает выборку доступными пользователю задачами.
 */
export function useMyDayContext() {
  const { user } = useAuth();
  const uid = user?.id;

  return useQuery({
    queryKey: ["my_day_context", uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<MyDayContext> => {
      if (!uid) return EMPTY;
      const { data } = await supabase
        .from("tasks")
        .select(
          "id, title, deadline, original_deadline, source_protocol_id, group:task_groups!tasks_group_id_fkey(name, project_type), protocol:task_groups!tasks_source_protocol_id_fkey(name)",
        )
        .eq("is_completed", false)
        .eq("is_draft", false)
        .or("source_protocol_id.not.is.null,original_deadline.not.is.null")
        .limit(400);

      const rows = (data ?? []) as any[];
      const now = new Date();

      const protocols = rows.filter((r) => r.source_protocol_id);
      const drift = rows.filter(
        (r) => r.original_deadline && r.deadline && new Date(r.deadline) > new Date(r.original_deadline),
      );
      const npd = rows.filter(
        (r) => r.group?.project_type === "npd" && r.deadline && new Date(r.deadline) < now,
      );

      const map = (arr: any[], refKey: "protocol" | "group"): CrossSignal => ({
        count: arr.length,
        items: arr.slice(0, 8).map((r) => ({ title: r.title, ref: r[refKey]?.name ?? null })),
      });

      return {
        protocols: map(protocols, "protocol"),
        drift: map(drift, "group"),
        npd: map(npd, "group"),
      };
    },
  });
}