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
  requires_approval: boolean;
  approval_status: string | null;
  is_important: boolean;
  priority: number | null;
};

const SELECT =
  "id, title, deadline, group_id, assigned_to, delegated_from, requires_approval, approval_status, is_important, priority, task_groups:group_id(name)";

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
    requires_approval: !!r.requires_approval,
    approval_status: r.approval_status ?? null,
    is_important: !!r.is_important,
    priority: r.priority ?? null,
    groupName: r.task_groups?.name ?? null,
  }));
}

/** Постранично читает все строки запроса, обходя дефолтный лимит в 1000. */
async function fetchAll<T>(
  build: (from: number, to: number) => any,
  page = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
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

      // 1) Задачи, где я участник (assigned_to синкается в task_participants).
      //    Читаем постранично, чтобы не упереться в лимит 1000 строк.
      const parts = await fetchAll<{ task_id: string }>((from, to) =>
        supabase.from("task_participants").select("task_id").eq("user_id", uid).range(from, to),
      );
      const ids = [...new Set(parts.map((p) => p.task_id))];

      const byId = new Map<string, MyTask>();
      for (const part of chunk(ids, 150)) {
        if (part.length === 0) continue;
        const { data } = await supabase
          .from("tasks")
          .select(SELECT)
          .in("id", part)
          .eq("is_completed", false)
          .eq("is_draft", false);
        for (const t of normalize(data ?? [])) byId.set(t.id, t);
      }

      // 1b) Подстраховка от рассинхрона task_participants: добавляем задачи,
      //     где я указан исполнителем, но строки участника может не быть.
      const assigned = await fetchAll<any>((from, to) =>
        supabase
          .from("tasks")
          .select(SELECT)
          .eq("assigned_to", uid)
          .eq("is_completed", false)
          .eq("is_draft", false)
          .range(from, to),
      );
      for (const t of normalize(assigned)) byId.set(t.id, t);

      const involved = [...byId.values()];

      // 2) Задачи, делегированные мной другим.
      const deleg = await fetchAll<any>((from, to) =>
        supabase
          .from("tasks")
          .select(SELECT)
          .eq("delegated_from", uid)
          .eq("is_completed", false)
          .eq("is_draft", false)
          .range(from, to),
      );
      const delegatedByMe = normalize(deleg).filter((t) => t.assigned_to !== uid);

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