---
name: hover-prefetch
description: usePrefetchOnHover — warms task cache for project/protocol on row hover/focus, instant navigation.
type: tech
---
# Hover Prefetch

`src/hooks/usePrefetchOnHover.tsx` — debounced (120ms) intent-based prefetch of `useTasks(groupId)` cache when user hovers a project row.

Wired in:
- `src/components/sidebar/GroupItem.tsx` — every project row in the sidebar tree (mouseenter/mouseleave/focus).
- `src/modules/protocols/pages/ProtocolsList.tsx` `ProtocolRow` — protocol cards.

Key invariants:
- Query key MUST stay in sync with `useTasks` shape: `["tasks", userId, groupId, undefined, null]`.
- React Query's prefetch is a no-op when cache is fresh (staleTime 5 min) — safe to fire repeatedly.
- Per-id "started" set + 120ms debounce avoid network spam on cursor pass-through.

Result: clicks on project/protocol rows now render the task list instantly when the user hovered for >120ms first.
