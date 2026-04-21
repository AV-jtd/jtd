import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, type TaskGroup, type Task } from "@/hooks/useTasks";
import { getStmStages, type StmFlow, type StmMeta } from "../lib/stages";
import { toast } from "sonner";

/**
 * Fetch STM stage tasks directly. We can't reuse useTasks() because it hides
 * task_type='stm_stage' from global lists (so they don't pollute Inbox/Today).
 */
function useStmStageTasks() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["stm-stage-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("task_type", "stm_stage")
        .order("position");
      if (error) throw error;
      return data as Task[];
    },
    enabled: !loading && !!user,
    staleTime: 30_000,
  });
}

export interface StmProject {
  group: TaskGroup;
  meta: StmMeta;
  flow: StmFlow;
  stageTasks: Task[];
  progress: number;
  /** Currently active stage (first not completed). */
  currentStageKey: string | null;
}

/**
 * Returns all task_groups marked as STM SKU projects, joined with their stage tasks.
 * SKU = a task_group where project_subtype = 'npd_stm'. Each stage = a task with stage_key set.
 */
export function useStmProjects() {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useStmStageTasks();

  return useMemo<StmProject[]>(() => {
    const stmGroups = groups.filter(g => (g as any).project_subtype === "npd_stm" && !g.closed_at);
    return stmGroups.map(g => {
      const meta = ((g as any).stm_meta || {}) as StmMeta;
      const flow: StmFlow = meta.flow === "out" ? "out" : "in";
      const stages = getStmStages(flow);
      const stageTasks = allTasks.filter(t => t.group_id === g.id && (t as any).stage_key);
      const stageKeys = new Set(stages.map(s => s.key));
      const filtered = stageTasks.filter(t => stageKeys.has((t as any).stage_key as string));
      const total = stages.length;
      const done = stages.filter(s => filtered.some(t => (t as any).stage_key === s.key && t.is_completed)).length;
      const currentStage = stages.find(s => !filtered.some(t => (t as any).stage_key === s.key && t.is_completed));
      return {
        group: g,
        meta,
        flow,
        stageTasks: filtered,
        progress: total ? Math.round((done / total) * 100) : 0,
        currentStageKey: currentStage?.key ?? null,
      };
    });
  }, [groups, allTasks]);
}

/** Create a new SKU project with all stage tasks pre-generated. */
export function useCreateStmSku() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { name: string; flow: StmFlow; meta?: StmMeta; parentId?: string | null }) => {
      if (!user) throw new Error("not authenticated");
      const meta: StmMeta = { flow: input.flow, ...(input.meta || {}) };

      const { data: group, error: gErr } = await supabase
        .from("task_groups")
        .insert({
          name: input.name,
          user_id: user.id,
          project_type: "npd",
          project_subtype: "npd_stm",
          stm_meta: meta as any,
          parent_id: input.parentId ?? null,
          icon: "🏷️",
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      const stages = getStmStages(input.flow);
      const tasksToInsert = stages.map((s, idx) => ({
        title: s.title,
        user_id: user.id,
        group_id: group.id,
        stage_key: s.key,
        stm_flow: input.flow,
        task_type: "stm_stage",
        position: idx,
      } as any));
      const { error: tErr } = await supabase.from("tasks").insert(tasksToInsert);
      if (tErr) throw tErr;

      return group;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("SKU создан");
    },
    onError: (e: any) => toast.error(`Не удалось создать SKU: ${e.message}`),
  });
}

/** Toggle a single stage cell (complete/uncomplete the underlying task). */
export function useToggleStmStage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { taskId: string; isCompleted: boolean }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          is_completed: input.isCompleted,
          completed_at: input.isCompleted ? new Date().toISOString() : null,
        })
        .eq("id", input.taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}