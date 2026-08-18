import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type Milestone = Tables<"project_milestones">;
type MilestoneInsert = TablesInsert<"project_milestones">;
type MilestoneUpdate = TablesUpdate<"project_milestones">;

export function useMilestones() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["milestones", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_milestones")
        .select("*")
        .order("position")
        .order("planned_date");
      if (error) throw error;
      return data as Milestone[];
    },
    enabled: !!user,
  });
}

export function useMilestoneMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const addMilestone = useMutation({
    mutationFn: async (ms: { name: string; group_id: string; planned_date?: string; description?: string; color?: string; gate_key?: string | null; position?: number }) => {
      const { data: lastMilestone, error: positionError } = await supabase
        .from("project_milestones")
        .select("position")
        .eq("group_id", ms.group_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (positionError) throw positionError;

      const payload: MilestoneInsert = {
        name: ms.name,
        group_id: ms.group_id,
        planned_date: ms.planned_date || new Date().toISOString(),
        description: ms.description || null,
        color: ms.color || "#3b82f6",
        created_by: user!.id,
        gate_key: ms.gate_key || null,
        position: ms.position ?? (lastMilestone?.position ?? 0) + 1,
      };

      const { error } = await supabase.from("project_milestones").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Веха создана");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; planned_date?: string; description?: string; color?: string; status?: string; actual_date?: string | null; gate_key?: string | null; group_id?: string; position?: number }) => {
      const payload: MilestoneUpdate = updates;
      // .select() + row-count check: without it, an RLS-filtered 0-row UPDATE
      // returns error=null and looks like a successful save (see the same
      // fix applied to useTasks.tsx's updateTask/toggleTask).
      const { data: updated, error } = await supabase.from("project_milestones").update(payload).eq("id", id).select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("Нет прав на изменение этой вехи");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Веха обновлена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Веха удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { addMilestone, updateMilestone, deleteMilestone };
}
