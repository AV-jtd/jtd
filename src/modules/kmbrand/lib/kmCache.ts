import type { QueryClient } from "@tanstack/react-query";
import type { TaskGroup, Task } from "@/hooks/useTasks";

/**
 * Single source of truth for KM Brand Control React Query cache keys & updates.
 * Mirrors stmCache.ts — see that file for the "why a dedicated layer" rationale.
 *
 * Key conventions:
 * - task_groups: ["task_groups"] (shared with STM/everything else — matched by prefix)
 * - km-stage-tasks: ["km-stage-tasks", userId] (exact match required for
 *   setQueryData; invalidate by prefix is OK). Also mirrored into
 *   useTasks.tsx's shared cache-sync helpers so edits via the generic task
 *   editor reach this cache too.
 */

export const KM_KEYS = {
  groups: () => ["task_groups"] as const,
  stageTasks: (userId?: string) => ["km-stage-tasks", userId] as const,
  stageTasksAll: () => ["km-stage-tasks"] as const,
  structureNodes: () => ["km-structure-nodes"] as const,
} as const;

/** Patch every cached task_groups query in place (no refetch). */
export function patchGroupInCache(
  qc: QueryClient,
  groupId: string,
  patch: Partial<TaskGroup>,
): Array<[readonly unknown[], TaskGroup[]]> {
  const snapshots: Array<[readonly unknown[], TaskGroup[]]> = [];
  qc.getQueriesData<TaskGroup[]>({ queryKey: KM_KEYS.groups() }).forEach(([key, data]) => {
    if (!Array.isArray(data)) return;
    snapshots.push([key, data]);
    qc.setQueryData<TaskGroup[]>(
      key,
      data.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    );
  });
  return snapshots;
}

/** Roll back a previous patchGroupInCache snapshot. */
export function restoreGroupSnapshots(
  qc: QueryClient,
  snapshots: Array<[readonly unknown[], TaskGroup[]]>,
): void {
  snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
}

/** Patch a single stage task in the user's stage-tasks cache. */
export function patchStageTaskInCache(
  qc: QueryClient,
  userId: string | undefined,
  taskId: string,
  patch: Partial<Task>,
): Task[] | undefined {
  const key = KM_KEYS.stageTasks(userId);
  const prev = qc.getQueryData<Task[]>(key);
  if (!prev) return undefined;
  qc.setQueryData<Task[]>(
    key,
    prev.map((t) => (t.id === taskId ? ({ ...t, ...patch } as Task) : t)),
  );
  return prev;
}

/**
 * Invalidate every cache that the KM Brand Control matrix reads from.
 * Use after mutations whose effect can't be reliably mirrored optimistically
 * (creates, deletes, multi-row writes). For simple updates prefer the
 * patch helpers above — they are instant and avoid network round-trips.
 */
export function invalidateKmCaches(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: KM_KEYS.groups() });
  qc.invalidateQueries({ queryKey: KM_KEYS.stageTasksAll() });
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["task_dependencies"] });
  qc.invalidateQueries({ queryKey: ["milestones"] });
}
