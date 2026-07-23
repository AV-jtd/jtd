import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, type TaskGroup, type Task } from "@/hooks/useTasks";
import { KM_STAGES, resolveKmLifecycle, type KmLifecycle, type KmMeta, type KmStageStatus } from "../lib/stages";
import { KM_KEYS, invalidateKmCaches, patchStageTaskInCache } from "../lib/kmCache";
import { toast } from "sonner";

/** Default cadence between stages (in days) when no real plan is set. */
const DEFAULT_STAGE_GAP_DAYS = 5;

/**
 * Fetch KM Brand Control stage tasks directly. We can't reuse useTasks()
 * because it hides task_type='km_stage' from global lists (so they don't
 * pollute Inbox/Today).
 *
 * IMPORTANT: Supabase caps a single response at 1000 rows. With many SKUs
 * we easily exceed that (18 stages × N SKUs), so we paginate via .range()
 * until the page is short. Without this, tail SKUs silently lose their
 * tasks → matrix shows "нет даты".
 */
function useKmStageTasks() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: KM_KEYS.stageTasks(user?.id),
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
          .eq("task_type", "km_stage")
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

export interface KmProject {
  group: TaskGroup;
  meta: KmMeta;
  stageTasks: Task[];
  progress: number;
  /** Currently active stage (first not completed). */
  currentStageKey: string | null;
  /** Archive timestamp (task_groups.closed_at). null = active. */
  archivedAt: string | null;
  /** Mandatory comment captured at the moment of archiving. */
  archiveComment: string | null;
  /** Effective SKU lifecycle status. */
  lifecycle: KmLifecycle;
}

/**
 * Returns all task_groups marked as KM Brand Control SKU projects (active +
 * archived), joined with their stage tasks.
 * SKU = a task_group where project_subtype = 'npd_km'. Each stage = a task with stage_key set.
 */
export function useKmProjects() {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useKmStageTasks();

  return useMemo<KmProject[]>(() => {
    // Include archived SKUs too — UI applies the active/archived filter on top.
    const kmGroups = groups.filter(g => (g as any).project_subtype === "npd_km");
    return kmGroups.map(g => {
      const meta = ((g as any).km_meta || {}) as KmMeta;
      const stageTasks = allTasks.filter(t => t.group_id === g.id && (t as any).stage_key);
      const stageKeys = new Set(KM_STAGES.map(s => s.key));
      const filtered = stageTasks.filter(t => stageKeys.has((t as any).stage_key as string));
      const total = KM_STAGES.length;
      const done = KM_STAGES.filter(s => filtered.some(t => (t as any).stage_key === s.key && t.is_completed)).length;
      const currentStage = KM_STAGES.find(s => !filtered.some(t => (t as any).stage_key === s.key && t.is_completed));
      const archivedAt = g.closed_at ?? null;
      return {
        group: g,
        meta,
        stageTasks: filtered,
        progress: total ? Math.round((done / total) * 100) : 0,
        currentStageKey: currentStage?.key ?? null,
        archivedAt,
        archiveComment: (g as any).archive_comment ?? null,
        lifecycle: resolveKmLifecycle(meta, !!archivedAt),
      };
    });
  }, [groups, allTasks]);
}

/** Create a new SKU project with all stage tasks pre-generated. */
export function useCreateKmSku() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { name: string; meta?: KmMeta; parentId?: string | null }) => {
      if (!user) throw new Error("not authenticated");
      const meta: KmMeta = { ...(input.meta || {}) };

      const { data: group, error: gErr } = await supabase
        .from("task_groups")
        .insert({
          name: input.name,
          user_id: user.id,
          project_type: "npd",
          project_subtype: "npd_km",
          km_meta: meta as any,
          parent_id: input.parentId ?? null,
          icon: "🏷️",
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      // Pre-plan deadlines: today + N*GAP days, so the matrix has visible dates immediately.
      const baseTime = new Date();
      baseTime.setHours(18, 0, 0, 0);
      const tasksToInsert = KM_STAGES.map((s, idx) => {
        const deadline = new Date(baseTime);
        deadline.setDate(deadline.getDate() + (idx + 1) * DEFAULT_STAGE_GAP_DAYS);
        const startAt = new Date(deadline);
        startAt.setDate(startAt.getDate() - DEFAULT_STAGE_GAP_DAYS);
        return {
          title: s.title,
          user_id: user.id,
          group_id: group.id,
          stage_key: s.key,
          task_type: "km_stage",
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
      for (let i = 0; i < KM_STAGES.length - 1; i++) {
        const predId = idByStage.get(KM_STAGES[i].key);
        const succId = idByStage.get(KM_STAGES[i + 1].key);
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
        if (dErr) console.warn("[KM] dep insert failed:", dErr);
      }

      // Control milestones tied to every "flag"/"medal" (milestone) stage.
      const milestoneStages = KM_STAGES.filter(s => s.milestone);
      const milestoneRows = milestoneStages
        .map((s, idx) => {
          const dl = deadlineByStage.get(s.key);
          if (!dl) return null;
          return {
            group_id: group.id,
            created_by: user.id,
            name: s.title,
            planned_date: dl,
            color: s.milestone === "medal" ? "#f59e0b" : "#10b981",
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
          console.warn("[KM] milestones insert failed:", mErr);
        } else if (insertedMs) {
          // FS deps: stage task -> milestone (task finishes → milestone reachable)
          const msDeps = insertedMs.map((ms: any, i: number) => {
            const seed = milestoneStages[i];
            const stageId = idByStage.get(seed.key);
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
            if (mdErr) console.warn("[KM] milestone deps failed:", mdErr);
          }
        }
      }

      return group;
    },
    onSuccess: () => {
      // Create touches groups + tasks + deps + milestones — invalidate them all.
      invalidateKmCaches(qc);
      toast.success("SKU создан");
    },
    onError: (e: any) => toast.error(`Не удалось создать SKU: ${e.message}`),
  });
}

/**
 * Toggle a single stage cell (complete/uncomplete the underlying task).
 */
export function useToggleKmStage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { taskId: string; isCompleted: boolean }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          is_completed: input.isCompleted,
          completed_at: input.isCompleted ? new Date().toISOString() : null,
          stage_status: input.isCompleted ? "done" : "in_progress",
        })
        .eq("id", input.taskId);
      if (error) throw error;
    },
    // Optimistic update: flip the cell instantly. Cache is the source of truth
    // for the matrix, so we don't need to wait for a refetch to see the change.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KM_KEYS.stageTasks(user?.id) });
      const prev = patchStageTaskInCache(qc, user?.id, input.taskId, {
        is_completed: input.isCompleted,
        completed_at: input.isCompleted ? new Date().toISOString() : null,
        stage_status: input.isCompleted ? "done" : "in_progress",
      } as Partial<Task>);
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      // Roll back on failure.
      if (ctx?.prev) qc.setQueryData(KM_KEYS.stageTasks(user?.id), ctx.prev);
      toast.error("Не удалось обновить этап");
    },
    // No invalidate on success: optimistic state already matches the server.
  });
}

/**
 * Create a single stage task for an existing SKU (when user clicks an empty
 * "не создано" cell). Wires the new task into the existing FS chain so
 * cascading date shifts keep working.
 */
export function useCreateKmStage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      stageKey: string;
      deadline: Date;
    }) => {
      if (!user) throw new Error("not authenticated");
      const stage = KM_STAGES.find(s => s.key === input.stageKey);
      if (!stage) throw new Error("unknown stage_key");
      const idx = KM_STAGES.findIndex(s => s.key === input.stageKey);

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
          task_type: "km_stage",
          position: idx,
          start_at: startAt.toISOString(),
          deadline: deadlineIso,
          original_deadline: deadlineIso,
        } as any)
        .select("id, stage_key, group_id, deadline, original_deadline, position, is_completed, completed_at, start_at, title")
        .single();
      if (tErr) throw tErr;

      // Re-wire FS chain: connect to neighboring stage tasks (if they exist).
      const groupTasks = (qc.getQueryData<Task[]>(KM_KEYS.stageTasks(user.id)) ?? [])
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
        const predId = taskByStage.get(KM_STAGES[i].key);
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
      for (let i = idx + 1; i < KM_STAGES.length; i++) {
        const succId = taskByStage.get(KM_STAGES[i].key);
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
        if (dErr) console.warn("[KM] dep insert failed:", dErr);
      }

      return task as Task;
    },
    onSuccess: (task) => {
      // Append to cache instantly so the matrix re-renders without a refetch.
      const key = KM_KEYS.stageTasks(user?.id);
      const prev = qc.getQueryData<Task[]>(key) ?? [];
      qc.setQueryData<Task[]>(key, [...prev, task]);
      qc.invalidateQueries({ queryKey: ["task_dependencies"] });
      toast.success("Этап создан");
    },
    onError: (e: any) => toast.error(`Не удалось создать этап: ${e.message}`),
  });
}

/**
 * Shift a stage's deadline. If `cascade` is true (default), downstream
 * stages of the same SKU that were already scheduled chronologically after
 * this one are pushed by the same delta — matches Gantt cascade behavior so
 * dates stay consistent across views.
 *
 * Stage ARRAY position alone is not used to decide what cascades: it's only
 * the nominal/average process order, not a real per-SKU dependency chain.
 * A later-position stage can legitimately have been dated (independently,
 * manually) earlier in real time than the stage being edited. Only stages
 * whose stored deadline was already after the edited stage's OLD deadline
 * are treated as real downstream successors and shifted; anything dated
 * earlier is left untouched.
 */
export function useShiftKmStageDate() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { taskId: string; newDeadline: Date; cascade?: boolean }) => {
      const cached = qc.getQueryData<Task[]>(KM_KEYS.stageTasks(user?.id)) ?? [];
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
        const idx = KM_STAGES.findIndex(s => s.key === (task as any).stage_key);
        const laterKeys = new Set(KM_STAGES.slice(idx + 1).map(s => s.key));
        const later = cached.filter(t =>
          t.group_id === task.group_id &&
          (t as any).stage_key &&
          laterKeys.has((t as any).stage_key) &&
          t.deadline &&
          oldDeadline && new Date(t.deadline).getTime() > oldDeadline.getTime(),
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
      await qc.cancelQueries({ queryKey: KM_KEYS.stageTasks(user?.id) });
      const key = KM_KEYS.stageTasks(user?.id);
      const prev = qc.getQueryData<Task[]>(key);
      if (!prev) return { prev };

      const target = prev.find(t => t.id === input.taskId);
      const oldDl = target?.deadline ? new Date(target.deadline) : null;
      const deltaMs = oldDl ? input.newDeadline.getTime() - oldDl.getTime() : 0;
      const idx = target ? KM_STAGES.findIndex(s => s.key === (target as any).stage_key) : -1;
      const laterKeys = new Set(idx >= 0 ? KM_STAGES.slice(idx + 1).map(s => s.key) : []);

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
          t.deadline &&
          oldDl && new Date(t.deadline).getTime() > oldDl.getTime()
        ) {
          return { ...t, deadline: new Date(new Date(t.deadline).getTime() + deltaMs).toISOString() };
        }
        return t;
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KM_KEYS.stageTasks(user?.id), ctx.prev);
      toast.error("Не удалось перенести дату");
    },
    onSuccess: () => toast.success("Дата перенесена"),
  });
}

/**
 * Set the workflow status of a single stage cell (pending / in_progress /
 * blocked / done). "done" keeps is_completed in sync so progress, cascades
 * and the Gantt stay consistent — stage_status is a layer on top, not a
 * replacement for the completion flag.
 */
export function useSetKmStageStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: { taskId: string; status: KmStageStatus }) => {
      const isDone = input.status === "done";
      const patch: Record<string, unknown> = {
        stage_status: input.status,
        is_completed: isDone,
        completed_at: isDone ? new Date().toISOString() : null,
      };
      const { error } = await supabase
        .from("tasks")
        .update(patch as any)
        .eq("id", input.taskId);
      if (error) throw error;
      return input;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KM_KEYS.stageTasks(user?.id) });
      const isDone = input.status === "done";
      const prev = patchStageTaskInCache(qc, user?.id, input.taskId, {
        stage_status: input.status,
        is_completed: isDone,
        completed_at: isDone ? new Date().toISOString() : null,
      } as Partial<Task>);
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(KM_KEYS.stageTasks(user?.id), ctx.prev);
      toast.error("Не удалось обновить статус этапа");
    },
  });
}

/** Metadata dimension editable from the group header. */
export type KmGroupField = "retailer" | "brand" | "drop" | "project";

/**
 * "Empty placeholder" structure node — a named Brand/Project/Drop/Retailer
 * that exists before any SKU is attached to it, so the matrix can show the
 * (empty) group up front. Merges naturally with real SKU groups by value.
 */
export interface KmStructureNode {
  id: string;
  field: KmGroupField;
  value: string;
}

/** All placeholder structure nodes. */
export function useKmStructureNodes() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: KM_KEYS.structureNodes(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("km_structure_nodes" as any)
        .select("id, field, value");
      if (error) throw error;
      return (data ?? []) as unknown as KmStructureNode[];
    },
    enabled: !loading && !!user,
    staleTime: 30_000,
  });
}

/** Create an empty placeholder group (Brand / Project / Drop / Retailer). */
export function useCreateKmStructureNode() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { field: KmGroupField; value: string }) => {
      if (!user) throw new Error("not authenticated");
      const value = input.value.trim();
      if (!value) throw new Error("empty value");
      const { error } = await supabase
        .from("km_structure_nodes" as any)
        .insert({ user_id: user.id, field: input.field, value } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KM_KEYS.structureNodes() });
      toast.success("Группа создана");
    },
    onError: (e: any) => {
      if (e?.code === "23505") toast.error("Такая группа уже существует");
      else toast.error(`Не удалось создать: ${e.message}`);
    },
  });
}

/** Delete an empty placeholder group. */
export function useDeleteKmStructureNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("km_structure_nodes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KM_KEYS.structureNodes() });
      toast.success("Группа удалена");
    },
    onError: (e: any) => toast.error(`Не удалось удалить: ${e.message}`),
  });
}

/**
 * Bulk-rename a group's meta dimension across all its SKUs.
 * Renaming to an existing group's value naturally merges the SKUs into it.
 */
export function useUpdateKmGroupMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupIds: string[]; field: KmGroupField; value: string }) => {
      const value = input.value.trim();
      // Read current meta per group from the groups cache, patch the field, write back.
      const groups = (qc.getQueryData<TaskGroup[]>(KM_KEYS.groups()) ?? []) as TaskGroup[];
      for (const id of input.groupIds) {
        const g = groups.find(x => x.id === id);
        const meta = { ...(((g as any)?.km_meta) || {}) } as KmMeta;
        if (value) (meta as any)[input.field] = value;
        else delete (meta as any)[input.field];
        const { data, error } = await supabase
          .from("task_groups")
          .update({ km_meta: meta as any })
          .eq("id", id)
          .select("id");
        if (error) throw error;
        // RLS can silently no-op an update (0 rows, no error) instead of
        // throwing — that would look like a successful save which then
        // reverts on the next refetch. Surface it as a real failure.
        if (!data || data.length === 0) {
          throw new Error("нет прав на изменение этого SKU");
        }
      }
      return { count: input.groupIds.length };
    },
    onSuccess: ({ count }) => {
      invalidateKmCaches(qc);
      toast.success(`Обновлено SKU: ${count}`);
    },
    onError: (e: any) => toast.error(`Не удалось обновить: ${e.message}`),
  });
}

/** Set the same responsible manager (km_meta.manager_id) on all SKUs of a group. */
export function useSetKmGroupManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupIds: string[]; managerId: string | null }) => {
      const groups = (qc.getQueryData<TaskGroup[]>(KM_KEYS.groups()) ?? []) as TaskGroup[];
      for (const id of input.groupIds) {
        const g = groups.find(x => x.id === id);
        const meta = { ...(((g as any)?.km_meta) || {}) } as KmMeta;
        if (input.managerId) (meta as any).manager_id = input.managerId;
        else delete (meta as any).manager_id;
        const { data, error } = await supabase
          .from("task_groups")
          .update({ km_meta: meta as any })
          .eq("id", id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("нет прав на изменение этого SKU");
        }
      }
      return { count: input.groupIds.length };
    },
    onSuccess: ({ count }) => {
      invalidateKmCaches(qc);
      toast.success(`Ответственный назначен для ${count} SKU`);
    },
    onError: (e: any) => toast.error(`Не удалось назначить: ${e.message}`),
  });
}

/**
 * Add participants (role 'participant') to every stage task of every SKU in a group.
 * Additive & idempotent: existing (task_id, user_id) pairs are skipped.
 */
export function useAddKmGroupParticipants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { groupIds: string[]; userIds: string[] }) => {
      if (input.userIds.length === 0 || input.groupIds.length === 0) return { added: 0, skuCount: 0 };

      // All stage tasks of the target groups.
      const { data: tasks, error: tErr } = await supabase
        .from("tasks")
        .select("id, group_id")
        .eq("task_type", "km_stage")
        .in("group_id", input.groupIds);
      if (tErr) throw tErr;
      const taskIds = (tasks ?? []).map((t: any) => t.id);
      if (taskIds.length === 0) return { added: 0, skuCount: input.groupIds.length };

      // Existing participant pairs to avoid duplicates.
      const { data: existing, error: eErr } = await supabase
        .from("task_participants")
        .select("task_id, user_id")
        .in("task_id", taskIds)
        .in("user_id", input.userIds);
      if (eErr) throw eErr;
      const existingSet = new Set((existing ?? []).map((r: any) => `${r.task_id}:${r.user_id}`));

      const rows: any[] = [];
      for (const tid of taskIds) {
        for (const uid of input.userIds) {
          if (existingSet.has(`${tid}:${uid}`)) continue;
          rows.push({ task_id: tid, user_id: uid, role: "participant" });
        }
      }
      if (rows.length) {
        const { error: iErr } = await supabase.from("task_participants").insert(rows);
        if (iErr) throw iErr;
      }
      return { added: input.userIds.length, skuCount: input.groupIds.length };
    },
    onSuccess: ({ added, skuCount }) => {
      invalidateKmCaches(qc);
      if (added > 0) toast.success(`Участники (${added}) добавлены к ${skuCount} SKU`);
    },
    onError: (e: any) => toast.error(`Не удалось добавить участников: ${e.message}`),
  });
}
