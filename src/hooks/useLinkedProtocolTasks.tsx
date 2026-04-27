import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Загружает задачи, физически живущие в протоколах (project_type='protocol'),
 * но привязанные к проектам через status_meta.linked_project_id.
 *
 * Используется для тогл-фильтра «Из протоколов» в TaskList и ProjectPage.
 * Запрос не выполняется пока enabled=false — экономим payload.
 */
export function useLinkedProtocolTasks(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["linked-protocol-tasks", user?.id],
    enabled: !!user?.id && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .not("status_meta->>linked_project_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });
}