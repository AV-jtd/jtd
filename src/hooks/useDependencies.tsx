import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { addDays, parseISO, differenceInCalendarDays } from "date-fns";

export type EntityType = "task" | "milestone" | "project";
export type DependencyType = "FS" | "SS" | "FF" | "SF";

export type TaskDependency = {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
  created_by: string;
  created_at: string;
  predecessor_entity_type: EntityType;
  successor_entity_type: EntityType;
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
      predecessor_entity_type?: EntityType;
      successor_entity_type?: EntityType;
    }) => {
      const { error } = await supabase.from("task_dependencies").insert({
        predecessor_id: dep.predecessor_id,
        successor_id: dep.successor_id,
        dependency_type: dep.dependency_type || "FS",
        lag_days: dep.lag_days || 0,
        predecessor_entity_type: dep.predecessor_entity_type || "task",
        successor_entity_type: dep.successor_entity_type || "task",
        created_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      toast.success("Зависимость создана");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateDependency = useMutation({
    mutationFn: async (dep: { id: string; dependency_type?: string; lag_days?: number }) => {
      const updates: any = {};
      if (dep.dependency_type !== undefined) updates.dependency_type = dep.dependency_type;
      if (dep.lag_days !== undefined) updates.lag_days = dep.lag_days;
      const { error } = await supabase.from("task_dependencies").update(updates).eq("id", dep.id);
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

/**
 * Cascading push: when a task's deadline shifts by daysDelta,
 * push all FS successors forward recursively if needed.
 */
export function computeCascadingUpdates(
  changedTaskId: string,
  daysDelta: number,
  allDependencies: TaskDependency[],
  allTasks: { id: string; deadline: string | null; created_at: string }[],
): { id: string; deadline: string }[] {
  if (daysDelta <= 0) return []; // only push forward

  const updates: Map<string, string> = new Map();
  const taskMap = new Map(allTasks.map(t => [t.id, t]));

  const pushSuccessors = (predId: string, delta: number) => {
    const fsDeps = allDependencies.filter(
      d => d.predecessor_id === predId
        && d.predecessor_entity_type === "task"
        && d.successor_entity_type === "task"
        && d.dependency_type === "FS"
    );

    for (const dep of fsDeps) {
      const succ = taskMap.get(dep.successor_id);
      if (!succ || !succ.deadline) continue;

      const currentDeadline = parseISO(succ.deadline);
      const newDeadline = addDays(currentDeadline, delta + dep.lag_days);
      const existingUpdate = updates.get(succ.id);
      const effectiveNew = existingUpdate ? parseISO(existingUpdate) : currentDeadline;

      if (newDeadline > effectiveNew) {
        updates.set(succ.id, newDeadline.toISOString());
        // Recursively push this successor's successors
        pushSuccessors(succ.id, differenceInCalendarDays(newDeadline, currentDeadline));
      }
    }
  };

  pushSuccessors(changedTaskId, daysDelta);
  return Array.from(updates.entries()).map(([id, deadline]) => ({ id, deadline }));
}
