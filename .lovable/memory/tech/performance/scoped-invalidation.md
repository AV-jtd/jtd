---
name: scoped-invalidation
description: Scoped React Query invalidation for protocol/project edits — refresh global + this groupId only, not all per-group caches.
type: tech
---
# Scoped Query Invalidation

Helper: `src/lib/queryInvalidation.ts`
- `invalidateTasksScoped(qc, groupId)` — invalidates only `["tasks", *, groupId, ...]` queries + the global one (`groupId == null`). Other group-scoped queries left intact.
- `invalidateTaskGroups(qc)` — refreshes the user-wide groups list.

Used in:
- `ProtocolImportDialog`, `NewProtocolDialog` — pass freshly-created `group.id`.
- `TopicCell`, `ExternalRowInternalLayer` — pass `task.group_id`.
- `SmartImportDialog`, `ImportProjectDialog` — pass `result.groupId`.

Why: bare `qc.invalidateQueries({ queryKey: ["tasks"] })` forces refetch of every cached task list (5-8 MB per action). Scoped invalidation cuts redundant traffic when an edit affects one group only.

When NOT to use: bulk operations spanning many groups, or when a cross-group derived view (Calendar, DashboardView) must update — there bare `["tasks"]` invalidation is correct.
