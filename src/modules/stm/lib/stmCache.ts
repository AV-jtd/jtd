import type { QueryClient } from "@tanstack/react-query";
import type { TaskGroup, Task } from "@/hooks/useTasks";

/**
 * Single source of truth for STM-related React Query cache keys & updates.
 *
 * Why a dedicated layer:
 * - The matrix reads from TWO independent caches: ["task_groups"] (SKU rows)
 *   and ["stm-stage-tasks", userId] (stage cells). A mutation that updates a
 *   group MUST touch both, otherwise the row appears stale until the next
 *   refetch — exactly the "lag" users complained about.
 * - Spreading invalidate/setQueryData calls across components made it easy
 *   to forget one, so we centralize them here.
 *
 * Key conventions:
 * - task_groups: ["task_groups"] (we use a prefix; user.id is appended in
 *   the query key by useTaskGroups, but invalidate matches by prefix).
 * - stm-stage-tasks: ["stm-stage-tasks", userId] (exact match required for
 *   setQueryData; invalidate by prefix is OK).
 */

export const STM_KEYS = {
  groups: () => ["task_groups"] as const,
  stageTasks: (userId?: string) => ["stm-stage-tasks", userId] as const,
  stageTasksAll: () => ["stm-stage-tasks"] as const,
  structureNodes: () => ["stm-structure-nodes"] as const,
} as const;

/** Patch every cached task_groups query in place (no refetch). */
export function patchGroupInCache(
  qc: QueryClient,
  groupId: string,
  patch: Partial<TaskGroup>,
): Array<[readonly unknown[], TaskGroup[]]> {
  const snapshots: Array<[readonly unknown[], TaskGroup[]]> = [];
  qc.getQueriesData<TaskGroup[]>({ queryKey: STM_KEYS.groups() }).forEach(([key, data]) => {
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
  const key = STM_KEYS.stageTasks(userId);
  const prev = qc.getQueryData<Task[]>(key);
  if (!prev) return undefined;
  qc.setQueryData<Task[]>(
    key,
    prev.map((t) => (t.id === taskId ? ({ ...t, ...patch } as Task) : t)),
  );
  return prev;
}

/**
 * Invalidate every cache that the STM matrix reads from.
 * Use after mutations whose effect can't be reliably mirrored optimistically
 * (creates, deletes, multi-row writes). For simple updates prefer the
 * patch helpers above — they are instant and avoid network round-trips.
 */
export function invalidateStmCaches(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: STM_KEYS.groups() });
  qc.invalidateQueries({ queryKey: STM_KEYS.stageTasksAll() });
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["task_dependencies"] });
  qc.invalidateQueries({ queryKey: ["milestones"] });
}