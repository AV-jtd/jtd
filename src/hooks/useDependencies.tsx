import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type TaskDependency = {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
  created_by: string;
  created_at: string;
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
    mutationFn: async (dep: { predecessor_id: string; successor_id: string; dependency_type?: string }) => {
      const { error } = await supabase.from("task_dependencies").insert({
        predecessor_id: dep.predecessor_id,
        successor_id: dep.successor_id,
        dependency_type: dep.dependency_type || "FS",
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      toast.success("Зависимость создана");
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

  return { addDependency, deleteDependency };
}
