import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { addDays, parseISO } from "date-fns";

export type TaskDependency = {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
  created_by: string;
  created_at: string;
  predecessor_entity_type: string;
  successor_entity_type: string;
};

export function useDependencies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["task_dependencies", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_dependencies")
        .select("*");
      if (error) throw error;
      return data as TaskDependency[];
    },
    enabled: !!user,
  });
}

export function useDependencyMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const addDependency = useMutation({
    mutationFn: async (dep: {
      predecessor_id: string;
      successor_id: string;
      dependency_type?: string;
      lag_days?: number;
      predecessor_entity_type?: string;
      successor_entity_type?: string;
    }) => {
      const { error } = await supabase.from("task_dependencies").insert({
        predecessor_id: dep.predecessor_id,
        successor_id: dep.successor_id,
        dependency_type: dep.dependency_type || "FS",
        lag_days: dep.lag_days || 0,
        predecessor_entity_type: dep.predecessor_entity_type || "task",
        successor_entity_type: dep.successor_entity_type || "task",
        created_by: user!.id,
      });
      if (error) throw error;

      // For FS dependencies: if successor has no start_at, set it from predecessor's deadline
      const depType = dep.dependency_type || "FS";
      if (depType === "FS") {
        const predType = dep.predecessor_entity_type || "task";
        const succType = dep.successor_entity_type || "task";
        const lagDays = dep.lag_days || 0;

        // Fetch predecessor deadline
        let predDeadline: string | null = null;
        if (predType === "task") {
          const { data: pred } = await supabase.from("tasks").select("deadline").eq("id", dep.predecessor_id).single();
          predDeadline = pred?.deadline || null;
        }

        if (predDeadline) {
          // Fetch successor to check start_at and deadline
          if (succType === "task") {
            const { data: succ } = await supabase.from("tasks").select("start_at, deadline").eq("id", dep.successor_id).single();
            if (succ) {
              const newStartAt = addDays(parseISO(predDeadline), lagDays);
              const updates: Record<string, string> = {};

              // Set start_at if missing
              if (!succ.start_at) {
                updates.start_at = newStartAt.toISOString();
              }

              // Push deadline forward if it's before predecessor's deadline + lag
              if (succ.deadline && parseISO(succ.deadline) < newStartAt) {
                const duration = succ.start_at
                  ? Math.max(1, Math.round((parseISO(succ.deadline).getTime() - parseISO(succ.start_at).getTime()) / 86400000))
                  : 1;
                updates.deadline = addDays(newStartAt, duration).toISOString();
              } else if (!succ.deadline) {
                // If no deadline, set it to start + 1 day
                updates.deadline = addDays(newStartAt, 1).toISOString();
              }

              if (Object.keys(updates).length > 0) {
                await supabase.from("tasks").update(updates).eq("id", dep.successor_id);
              }
            }
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Зависимость создана");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateDependency = useMutation({
    mutationFn: async ({ id, dependency_type, lag_days }: { id: string; dependency_type?: string; lag_days?: number }) => {
      const updates: Record<string, any> = {};
      if (dependency_type !== undefined) updates.dependency_type = dependency_type;
      if (lag_days !== undefined) updates.lag_days = lag_days;
      const { error } = await supabase.from("task_dependencies").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      toast.success("Зависимость обновлена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDependency = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_dependencies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      toast.success("Зависимость удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { addDependency, updateDependency, deleteDependency };
}
