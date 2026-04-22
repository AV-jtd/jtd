import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Возвращает все задачи указанного отдела (department_id), независимо от членства в проектах.
 * RLS-политика "Department members can view department tasks" даёт SELECT-доступ
 * любому пользователю, у которого profiles.department_id совпадает с tasks.department_id.
 */
export function useDepartmentTasks(departmentId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["department-tasks", departmentId],
    enabled: !!user && !!departmentId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id,title,description,deadline,assigned_to,department_id,contractor_id,is_completed,is_important,priority,group_id,source_protocol_id,status_meta,completed_at,created_at,updated_at,user_id"
        )
        .eq("department_id", departmentId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Профиль текущего пользователя — возвращает department_id (если задан) */
export function useMyDepartmentId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-department-id", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("department_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.department_id ?? null) as string | null;
    },
  });
}
