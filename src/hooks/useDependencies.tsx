import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { wouldCreateCycle, resolveAllViolations, type GraphEntity } from "@/lib/dependencyGraph";

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

/**
 * Fetch entities (tasks + milestones) needed for cascade calculation and apply
 * `resolveAllViolations` updates back to DB. Called after dep creation.
 */
async function autoResolveAfterDepChange() {
  const [{ data: deps }, { data: tasks }, { data: milestones }] = await Promise.all([
    supabase.from("task_dependencies").select("*"),
    supabase.from("tasks").select("id,start_at,deadline"),
    supabase.from("project_milestones").select("id,planned_date"),
  ]);
  if (!deps || !tasks || !milestones) return { taskUpdates: 0, msUpdates: 0 };

  const entities = new Map<string, GraphEntity>();
  tasks.forEach((t: any) => entities.set(t.id, { id: t.id, start_at: t.start_at, deadline: t.deadline }));
  milestones.forEach((m: any) => entities.set(m.id, { id: m.id, deadline: m.planned_date }));

  const taskIds = new Set(tasks.map((t: any) => t.id));
  const msIds = new Set(milestones.map((m: any) => m.id));

  const updates = resolveAllViolations(deps as TaskDependency[], entities);
  let taskUpdates = 0, msUpdates = 0;
  for (const [id, upd] of updates) {
    if (taskIds.has(id)) {
      const payload: any = {};
      if (upd.deadline) payload.deadline = upd.deadline;
      if (upd.start_at) payload.start_at = upd.start_at;
      if (Object.keys(payload).length) {
        await supabase.from("tasks").update(payload).eq("id", id);
        taskUpdates++;
      }
    } else if (msIds.has(id) && upd.deadline) {
      await supabase.from("project_milestones").update({ planned_date: upd.deadline }).eq("id", id);
      msUpdates++;
    }
  }
  return { taskUpdates, msUpdates };
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
      // Cycle protection
      const { data: existing } = await supabase.from("task_dependencies").select("*");
      if (existing && wouldCreateCycle(dep.predecessor_id, dep.successor_id, existing as any)) {
        throw new Error("Создание этой связи приведёт к циклу зависимостей");
      }
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
      // Auto-resolve violations introduced by this new edge
      return await autoResolveAfterDepChange();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["milestones"] });
      qc.invalidateQueries({ queryKey: ["npd-matrix-tasks"] });
      const shifted = (result?.taskUpdates || 0) + (result?.msUpdates || 0);
      if (shifted > 0) {
        toast.success(`Зависимость создана. Сдвинуто ${shifted} элем.`);
      } else {
        toast.success("Зависимость создана");
      }
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
      return await autoResolveAfterDepChange();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["milestones"] });
      const shifted = (result?.taskUpdates || 0) + (result?.msUpdates || 0);
      toast.success(shifted > 0 ? `Зависимость обновлена. Сдвинуто ${shifted}.` : "Зависимость обновлена");
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
