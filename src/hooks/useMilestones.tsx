import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type Milestone = Tables<"project_milestones">;

export function useMilestones() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["milestones", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_milestones")
        .select("*")
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
    mutationFn: async (ms: { name: string; group_id: string; planned_date: string; description?: string; color?: string }) => {
      const { error } = await supabase.from("project_milestones").insert({
        name: ms.name,
        group_id: ms.group_id,
        planned_date: ms.planned_date,
        description: ms.description || null,
        color: ms.color || "#3b82f6",
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      toast.success("Веха создана");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; planned_date?: string; description?: string; color?: string; status?: string; actual_date?: string | null }) => {
      const { error } = await supabase.from("project_milestones").update(updates).eq("id", id);
      if (error) throw error;
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
