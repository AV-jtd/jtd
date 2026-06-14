import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, type TaskGroup, type Task } from "@/hooks/useTasks";
import { getStmStages, type StmFlow, type StmMeta, type StmStage, type StmStageStatus } from "../lib/stages";
import { STM_KEYS, invalidateStmCaches, patchStageTaskInCache } from "../lib/stmCache";
import { toast } from "sonner";

/** Default cadence between stages (in days) when no real plan is set. */
const DEFAULT_STAGE_GAP_DAYS = 5;

/**
 * Fetch STM stage tasks directly. We can't reuse useTasks() because it hides
 * task_type='stm_stage' from global lists (so they don't pollute Inbox/Today).
 *
 * IMPORTANT: Supabase caps a single response at 1000 rows. With many SKUs
 * we easily exceed that (12 stages × N SKUs), so we paginate via .range()
 * until the page is short. Without this, tail SKUs silently lose their
 * tasks → matrix shows "нет даты" while the Gantt (which reads
 * project_milestones) still has the date.
 */
function useStmStageTasks() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: STM_KEYS.stageTasks(user?.id),
    queryFn: async () => {
      const PAGE = 1000;
      const all: Task[] = [];
      let from = 0;
      // Loop until we get a short page (< PAGE rows).
      // Hard upper bound to avoid infinite loops in case of unexpected behavior.
      for (let safety = 0; safety < 50; safety++) {
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("task_type", "stm_stage")
          .order("position")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const chunk = (data ?? []) as Task[];
        all.push(...chunk);
        if (chunk.length < PAGE) break;
        from += PAGE;
      }
      return all;
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
  /** Archive timestamp (task_groups.closed_at). null = active. */
  archivedAt: string | null;
  /** Mandatory comment captured at the moment of archiving. */
  archiveComment: string | null;
}

/**
 * Returns all task_groups marked as STM SKU projects (active + archived), joined with their stage tasks.
 * SKU = a task_group where project_subtype = 'npd_stm'. Each stage = a task with stage_key set.
 */
export function useStmProjects() {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useStmStageTasks();

  return useMemo<StmProject[]>(() => {
    // Include archived SKUs too — UI applies the active/archived filter on top.
    const stmGroups = groups.filter(g => (g as any).project_subtype === "npd_stm");
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
        archivedAt: g.closed_at ?? null,
        archiveComment: (g as any).archive_comment ?? null,
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
      // Pre-plan deadlines: today + N*GAP days, so the matrix has visible dates immediately.
      const baseTime = new Date();
      baseTime.setHours(18, 0, 0, 0);
      const tasksToInsert = stages.map((s, idx) => {
        const deadline = new Date(baseTime);
        deadline.setDate(deadline.getDate() + (idx + 1) * DEFAULT_STAGE_GAP_DAYS);
        const startAt = new Date(deadline);
        startAt.setDate(startAt.getDate() - DEFAULT_STAGE_GAP_DAYS);
        return {
          title: s.title,
          user_id: user.id,
          group_id: group.id,
          stage_key: s.key,
          stm_flow: input.flow,
          task_type: "stm_stage",
          position: idx,
          start_at: startAt.toISOString(),
          deadline: deadline.toISOString(),
          original_deadline: deadline.toISOString(),
        } as any;
      });
      const { data: insertedTasks, error: tErr } = await supabase
        .from("tasks")
        .insert(tasksToInsert)
        .select("id, stage_key");
      if (tErr) throw tErr;

      // Map stage_key -> task id (and find the deadline for milestone-bearing stages).
      const idByStage = new Map<string, string>();
      (insertedTasks ?? []).forEach((t: any) => idByStage.set(t.stage_key, t.id));
      const deadlineByStage = new Map<string, string>();
      tasksToInsert.forEach((t: any) => deadlineByStage.set(t.stage_key, t.deadline));

      // FS dependencies between consecutive stages (cascade).
      const deps: any[] = [];
      for (let i = 0; i < stages.length - 1; i++) {
        const predId = idByStage.get(stages[i].key);
        const succId = idByStage.get(stages[i + 1].key);
        if (predId && succId) {
          deps.push({
            predecessor_id: predId,
            successor_id: succId,
            dependency_type: "FS",
            lag_days: 0,
            predecessor_entity_type: "task",
            successor_entity_type: "task",
            created_by: user.id,
          });
        }
      }
      if (deps.length) {
        const { error: dErr } = await supabase.from("task_dependencies").insert(deps);
        if (dErr) console.warn("[STM] dep insert failed:", dErr);
      }

      // Two control milestones tied to "approval" and "order_release" stages (input flow only).
      if (input.flow === "in") {
        const milestoneSeeds: { name: string; stageKey: string; color: string }[] = [
          { name: "Утверждён в сети", stageKey: "approval",      color: "#10b981" },
          { name: "Первый заказ",     stageKey: "order_release", color: "#3b82f6" },
        ];
        const milestoneRows = milestoneSeeds
          .map((m, idx) => {
            const dl = deadlineByStage.get(m.stageKey);
            if (!dl) return null;
            return {
              group_id: group.id,
              created_by: user.id,
              name: m.name,
              planned_date: dl,
              color: m.color,
              position: idx,
            } as any;
          })
          .filter(Boolean) as any[];
        if (milestoneRows.length) {
          const { data: insertedMs, error: mErr } = await supabase
            .from("project_milestones")
            .insert(milestoneRows)
            .select("id, name");
          if (mErr) {
            console.warn("[STM] milestones insert failed:", mErr);
          } else if (insertedMs) {
            // FS deps: stage task -> milestone (task finishes → milestone reachable)
            const msDeps = insertedMs.map((ms: any, i: number) => {
              const seed = milestoneSeeds[i];
              const stageId = idByStage.get(seed.stageKey);
              if (!stageId) return null;
              return {
                predecessor_id: stageId,
                successor_id: ms.id,
                dependency_type: "FS",
                lag_days: 0,
                predecessor_entity_type: "task",
                successor_entity_type: "milestone",
                created_by: user.id,
              };
            }).filter(Boolean);
            if (msDeps.length) {
              const { error: mdErr } = await supabase.from("task_dependencies").insert(msDeps as any);
              if (mdErr) console.warn("[STM] milestone deps failed:", mdErr);
            }
          }
        }
      }

      return group;
    },
    onSuccess: () => {
      // Create touches groups + tasks + deps + milestones — invalidate them all.
      invalidateStmCaches(qc);
      toast.success("SKU создан");
    },
    onError: (e: any) => toast.error(`Не удалось создать SKU: ${e.message}`),
  });
}

/**
 * Toggle a single stage cell (complete/uncomplete the underlying task).
 * Returns the next stage key (if any) so callers can auto-advance the focus.
 */
export function useToggleStmStage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { taskId: string; isCompleted: boolean }) => {
      // Look up cached task first (avoids extra round-trip — cache is the source of truth here).
      const cached = qc.getQueryData<Task[]>(STM_KEYS.stageTasks(user?.id)) ?? [];
      const task = cached.find(t => t.id === input.taskId) ?? null;

      const { error } = await supabase
        .from("tasks")
        .update({
          is_completed: input.isCompleted,
          completed_at: input.isCompleted ? new Date().toISOString() : null,
        })
        .eq("id", input.taskId);
      if (error) throw error;

      // Compute next stage to focus on — purely from cache, no extra fetch.
      let nextStageKey: string | null = null;
      if (input.isCompleted && task?.stage_key && task.group_id) {
        const flow = (task as any).stm_flow === "out" ? "out" : "in";
        const stages: StmStage[] = getStmStages(flow);
        const idx = stages.findIndex(s => s.key === task.stage_key);
        const groupTasks = cached.filter(t => t.group_id === task.group_id);
        const completedSet = new Set(
          groupTasks
            .filter(t => (t.id === input.taskId ? input.isCompleted : t.is_completed))
            .map(t => (t as any).stage_key as string),
        );
        // Next: first non-completed stage AFTER current index.
        for (let i = idx + 1; i < stages.length; i++) {
          if (!completedSet.has(stages[i].key)) { nextStageKey = stages[i].key; break; }
        }
      }

      return { nextStageKey, groupId: task?.group_id ?? null };
    },
    // Optimistic update: flip the cell instantly. Cache is the source of truth
    // for the matrix, so we don't need to wait for a refetch to see the change.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: STM_KEYS.stageTasks(user?.id) });
      const prev = patchStageTaskInCache(qc, user?.id, input.taskId, {
        is_completed: input.isCompleted,
        completed_at: input.isCompleted ? new Date().toISOString() : null,
      });
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      // Roll back on failure.
      if (ctx?.prev) qc.setQueryData(STM_KEYS.stageTasks(user?.id), ctx.prev);
      toast.error("Не удалось обновить этап");
    },
    // No invalidate on success: optimistic state already matches the server.
    // Other views (Gantt, project page) re-read on their own staleTime cycle.
  });
}

/**
 * Create a single stage task for an existing SKU (when user clicks an empty
 * "не создано" cell). Wires the new task into the existing FS chain so
 * cascading date shifts keep working.
 */
export function useCreateStmStage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      stageKey: string;
      flow: StmFlow;
      deadline: Date;
    }) => {
      if (!user) throw new Error("not authenticated");
      const stages = getStmStages(input.flow);
      const stage = stages.find(s => s.key === input.stageKey);
      if (!stage) throw new Error("unknown stage_key");
      const idx = stages.findIndex(s => s.key === input.stageKey);

      const deadlineIso = input.deadline.toISOString();
      const startAt = new Date(input.deadline);
      startAt.setDate(startAt.getDate() - DEFAULT_STAGE_GAP_DAYS);

      const { data: task, error: tErr } = await supabase
        .from("tasks")
        .insert({
          title: stage.title,
          user_id: user.id,
          group_id: input.groupId,
          stage_key: input.stageKey,
          stm_flow: input.flow,
          task_type: "stm_stage",
          position: idx,
          start_at: startAt.toISOString(),
          deadline: deadlineIso,
          original_deadline: deadlineIso,
        } as any)
        .select("id, stage_key, group_id, stm_flow, deadline, original_deadline, position, is_completed, completed_at, start_at, title")
        .single();
      if (tErr) throw tErr;

      // Re-wire FS chain: connect to neighboring stage tasks (if they exist).
      const groupTasks = (qc.getQueryData<Task[]>(["stm-stage-tasks", user.id]) ?? [])
        .filter(t => t.group_id === input.groupId);
      const taskByStage = new Map<string, string>();
      groupTasks.forEach(t => {
        const k = (t as any).stage_key as string | null;
        if (k) taskByStage.set(k, t.id);
      });
      taskByStage.set(input.stageKey, task.id);

      const deps: any[] = [];
      // pred -> new
      for (let i = idx - 1; i >= 0; i--) {
        const predId = taskByStage.get(stages[i].key);
        if (predId) {
          deps.push({
            predecessor_id: predId, successor_id: task.id,
            dependency_type: "FS", lag_days: 0,
            predecessor_entity_type: "task", successor_entity_type: "task",
            created_by: user.id,
          });
          break;
        }
      }
      // new -> succ
      for (let i = idx + 1; i < stages.length; i++) {
        const succId = taskByStage.get(stages[i].key);
        if (succId) {
          deps.push({
            predecessor_id: task.id, successor_id: succId,
            dependency_type: "FS", lag_days: 0,
            predecessor_entity_type: "task", successor_entity_type: "task",
            created_by: user.id,
          });
          break;
        }
      }
      if (deps.length) {
        const { error: dErr } = await supabase.from("task_dependencies").insert(deps);
        if (dErr) console.warn("[STM] dep insert failed:", dErr);
      }

      return task as Task;
    },
    onSuccess: (task) => {
      // Append to cache instantly so the matrix re-renders without a refetch.
      const key = ["stm-stage-tasks", user?.id] as const;
      const prev = qc.getQueryData<Task[]>(key) ?? [];
      qc.setQueryData<Task[]>(key, [...prev, task]);
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      toast.success("Этап создан");
    },
    onError: (e: any) => toast.error(`Не удалось создать этап: ${e.message}`),
  });
}

/**
 * Shift a stage's deadline. If `cascade` is true (default), all downstream
 * stages of the same SKU are pushed by the same delta — matches Gantt
 * cascade behavior so dates stay consistent across views.
 */
export function useShiftStmStageDate() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { taskId: string; newDeadline: Date; cascade?: boolean }) => {
      const cached = qc.getQueryData<Task[]>(["stm-stage-tasks", user?.id]) ?? [];
      const task = cached.find(t => t.id === input.taskId);
      if (!task) throw new Error("task not found in cache");

      const oldDeadline = task.deadline ? new Date(task.deadline) : null;
      const deltaMs = oldDeadline ? input.newDeadline.getTime() - oldDeadline.getTime() : 0;

      // Update the target task.
      const { error } = await supabase
        .from("tasks")
        .update({ deadline: input.newDeadline.toISOString() })
        .eq("id", input.taskId);
      if (error) throw error;

      // Cascade: shift all later stages of the same SKU by the same delta.
      const cascade = input.cascade !== false && deltaMs !== 0;
      const cascadeUpdates: { id: string; newDeadline: string }[] = [];
      if (cascade && task.group_id && (task as any).stage_key) {
        const flow: StmFlow = (task as any).stm_flow === "out" ? "out" : "in";
        const stages = getStmStages(flow);
        const idx = stages.findIndex(s => s.key === (task as any).stage_key);
        const laterKeys = new Set(stages.slice(idx + 1).map(s => s.key));
        const later = cached.filter(t =>
          t.group_id === task.group_id &&
          (t as any).stage_key &&
          laterKeys.has((t as any).stage_key) &&
          t.deadline,
        );
        for (const t of later) {
          const newDl = new Date(new Date(t.deadline as string).getTime() + deltaMs).toISOString();
          cascadeUpdates.push({ id: t.id, newDeadline: newDl });
        }
        // Run shifts in parallel — they're independent.
        await Promise.all(cascadeUpdates.map(u =>
          supabase.from("tasks").update({ deadline: u.newDeadline }).eq("id", u.id),
        ));
      }
      return { taskId: input.taskId, newDeadline: input.newDeadline.toISOString(), cascadeUpdates };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["stm-stage-tasks", user?.id] });
      const key = ["stm-stage-tasks", user?.id] as const;
      const prev = qc.getQueryData<Task[]>(key);
      if (!prev) return { prev };

      const target = prev.find(t => t.id === input.taskId);
      const oldDl = target?.deadline ? new Date(target.deadline) : null;
      const deltaMs = oldDl ? input.newDeadline.getTime() - oldDl.getTime() : 0;
      const flow: StmFlow = (target as any)?.stm_flow === "out" ? "out" : "in";
      const stages = getStmStages(flow);
      const idx = target ? stages.findIndex(s => s.key === (target as any).stage_key) : -1;
      const laterKeys = new Set(idx >= 0 ? stages.slice(idx + 1).map(s => s.key) : []);

      qc.setQueryData<Task[]>(key, prev.map(t => {
        if (t.id === input.taskId) {
          return { ...t, deadline: input.newDeadline.toISOString() };
        }
        if (
          input.cascade !== false &&
          deltaMs !== 0 &&
          t.group_id === target?.group_id &&
          (t as any).stage_key &&
          laterKeys.has((t as any).stage_key) &&
          t.deadline
        ) {
          return { ...t, deadline: new Date(new Date(t.deadline).getTime() + deltaMs).toISOString() };
        }
        return t;
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["stm-stage-tasks", user?.id], ctx.prev);
      toast.error("Не удалось перенести дату");
    },
    onSuccess: () => toast.success("Дата перенесена"),
  });
}