import type { QueryClient } from "@tanstack/react-query";

/**
 * Scoped invalidation for task-related queries when changes affect only
 * a specific protocol/project (groupId).
 *
 * Why: invalidating the bare ["tasks"] key forces refetch of EVERY task list
 * in the cache (global + per-group). For protocol edits/imports that touch a
 * single group, this caused 5-8MB of redundant traffic per action.
 *
 * useTasks query key shape: ["tasks", userId, groupId, filterTags, completedWindowDays].
 * We invalidate only:
 *   - the global query (groupId = null/undefined) — so global lists stay accurate
 *   - queries scoped to this groupId
 * Other group-scoped queries (other protocols/projects) are left intact.
 */
export function invalidateTasksScoped(qc: QueryClient, groupId: string | null | undefined) {
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey as unknown[];
      if (k[0] !== "tasks") return false;
      const keyGroupId = k[2];
      // Always refresh the global list (it includes/excludes tasks from this group too).
      if (keyGroupId == null) return true;
      return keyGroupId === groupId;
    },
  });
}

/**
 * Scoped invalidation for task_groups: refetch the list (it's user-wide and small).
 * task_groups is keyed as ["task_groups", userId] — there's only one per user, so a
 * single invalidate is fine. Provided as a sibling helper for symmetry.
 */
export function invalidateTaskGroups(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["task_groups"] });
}