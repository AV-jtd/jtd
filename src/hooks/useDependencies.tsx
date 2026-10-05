import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { wouldCreateCycle } from "@/lib/dependencyGraph";
import { cascade, fetchDependencies } from "@/lib/cascadeScope";

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
      // Лимит явно: без него PostgREST молча отдаёт первую тысячу строк.
      const { data, error } = await supabase
        .from("task_dependencies")
        .select("*")
        .limit(5000);
      if (error) throw error;
      return data as TaskDependency[];
    },
    enabled: !!user,
  });
}

/**
 * Пересчёт сроков после создания или правки связи — по связной компоненте этой
 * связи, тем же кодом, что в коннекторе (lib/cascadeScope.ts). Раньше здесь
 * выгружались все задачи одним запросом (первая тысяча из 5720) и правились
 * нарушения по всему графу компании.
 */
async function autoResolveAfterDepChange(seeds: string[]) {
  const deps = await fetchDependencies(supabase as never);
  if ("error" in deps) throw new Error(deps.error);
  const r = await cascade(supabase as never, deps, seeds);
  if ("error" in r) throw new Error(r.error);
  return {
    taskUpdates: r.shifted.filter((x) => x.kind === "task").length,
    msUpdates: r.shifted.filter((x) => x.kind === "milestone").length,
  };
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
      // Cycle protection — по всем связям (с лимитом, а не первой тысячей).
      const existing = await fetchDependencies(supabase as never);
      if ("error" in existing) throw new Error(existing.error);
      if (wouldCreateCycle(dep.predecessor_id, dep.successor_id, existing as never)) {
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
      return await autoResolveAfterDepChange([dep.predecessor_id, dep.successor_id]);
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
      const { data: edge, error } = await supabase
        .from("task_dependencies").update(updates).eq("id", id)
        .select("predecessor_id,successor_id").maybeSingle();
      if (error) throw error;
      if (!edge) return { taskUpdates: 0, msUpdates: 0 };
      return await autoResolveAfterDepChange([edge.predecessor_id, edge.successor_id]);
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
