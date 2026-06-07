import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type MyTask = {
  id: string;
  title: string;
  deadline: string | null;
  group_id: string | null;
  assigned_to: string | null;
  delegated_from: string | null;
  groupName: string | null;
};

const SELECT = "id, title, deadline, group_id, assigned_to, delegated_from, task_groups:group_id(name)";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalize(rows: any[]): MyTask[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    deadline: r.deadline ?? null,
    group_id: r.group_id ?? null,
    assigned_to: r.assigned_to ?? null,
    delegated_from: r.delegated_from ?? null,
    groupName: r.task_groups?.name ?? null,
  }));
}

/**
 * Загружает активные задачи текущего пользователя для мини-дашборда «Мои задачи».
 * Возвращает два массива:
 *  - involved: задачи, где я исполнитель или участник (assigned_to синкается в
 *    task_participants, поэтому достаточно одного среза по участникам);
 *  - delegatedByMe: задачи, которые я делегировал другим (delegated_from = я).
 */
export function useMyTasksDashboard() {
  const { user } = useAuth();
  const uid = user?.id;

  return useQuery({
    queryKey: ["my_tasks_dashboard", uid],
    enabled: !!uid,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<{ involved: MyTask[]; delegatedByMe: MyTask[] }> => {
      if (!uid) return { involved: [], delegatedByMe: [] };

      // 1) Задачи, где я участник/исполнитель.
      const { data: parts } = await supabase
        .from("task_participants")
        .select("task_id")
        .eq("user_id", uid);
      const ids = [...new Set((parts ?? []).map((p: any) => p.task_id))];

      const involved: MyTask[] = [];
      for (const part of chunk(ids, 150)) {
        if (part.length === 0) continue;
        const { data } = await supabase
          .from("tasks")
          .select(SELECT)
          .in("id", part)
          .eq("is_completed", false)
          .eq("is_draft", false);
        involved.push(...normalize(data ?? []));
      }

      // 2) Задачи, делегированные мной другим.
      const { data: deleg } = await supabase
        .from("tasks")
        .select(SELECT)
        .eq("delegated_from", uid)
        .eq("is_completed", false)
        .eq("is_draft", false);
      const delegatedByMe = normalize(deleg ?? []).filter((t) => t.assigned_to !== uid);

      return { involved, delegatedByMe };
    },
  });
}

/** Границы «сегодня» в локальном времени. */
export function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}