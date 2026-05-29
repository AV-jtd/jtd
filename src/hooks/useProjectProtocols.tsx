import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TaskGroup } from "@/hooks/useTasks";

/**
 * Загружает протоколы совещаний, привязанные к проекту через
 * protocol_meta.context_project_id. Используется секцией «Протоколы»
 * в карточке проекта (ProjectDetailPanel), чтобы показать решения и
 * задачи встреч прямо в проекте, не превращая протокол в подпроект.
 */
export function useProjectProtocols(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project-protocols", projectId],
    enabled: !!user?.id && !!projectId,
    staleTime: 30_000,
    queryFn: async (): Promise<TaskGroup[]> => {
      const { data, error } = await supabase
        .from("task_groups")
        .select("*")
        .eq("project_type", "protocol")
        .eq("protocol_meta->>context_project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskGroup[];
    },
  });
}
