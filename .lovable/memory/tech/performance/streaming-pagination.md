---
name: streaming-pagination
description: useTasks streams paginated results to cache via setQueryData — first page paints in ~half the time on accounts with 1500+ tasks.
type: tech
---
# Streaming Pagination for useTasks

`src/hooks/useTasks.tsx` uses `fetchAllPagesStreaming` instead of the old blocking `fetchAllPages`. After every page (1000 rows) lands, the accumulated array is pushed to the React Query cache via `qc.setQueryData(queryKey, ...)`. Subscribers re-render immediately while remaining pages keep streaming in.

## Why
Before: `useQuery` was blocked until ALL pages resolved. On accounts with 1500+ globally-visible tasks (2 pages × 1000), users stared at a spinner for 4–6s on slow networks.

After: First page paints in ~half the time. Late pages append silently behind the scenes. UI doesn't notice — `useQuery`'s eventual resolution just overwrites the streamed data with the post-processed final array.

## Constraints (do NOT break)
- **Streaming is OFF when `filterTags` is non-empty.** The tag-filter pass needs the FULL accumulated array to do project-hierarchy expansion (tag → linked project → subprojects). Publishing partial pre-tag-filter data would briefly show wrong rows. Code path: `canStream = !filterTags || filterTags.length === 0`.
- **Final page is NOT streamed** — `useQuery` itself publishes the post-processed final array. Streaming the final page would race with that and could leave unfiltered drafts/stm_stage rows visible for a frame.
- **Intermediate results pass through `filterChunk`** — same client-side filter as the final pass (drops drafts and stm_stage in global lists). Keeps streamed pages visually consistent with the final array.

## Cache key contract
Streaming writes to the SAME `queryKey` as the active `useQuery`:
```
["tasks", userId, groupId, filterTags, completedWindowDays]
```
If you ever change the key shape, update both the `useQuery` call AND the `setQueryData` call inside the streaming callback in lockstep.

## Per-group queries (groupId set)
Streaming is technically active but has no measurable effect — per-group lists almost always fit in one page. No reason to disable it: the cost of one extra `setQueryData` is negligible.
