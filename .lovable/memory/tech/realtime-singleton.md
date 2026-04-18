---
name: realtime-singleton
description: Все базовые Supabase Realtime каналы (subtasks, group_members, unread) монтируются один раз через useRealtimeSubscriptions в App.tsx, с debounce 500ms.
type: feature
---

Глобальные Supabase Realtime подписки вынесены в singleton-хук `useRealtimeSubscriptions`, который вызывается один раз в `AppContent` (App.tsx).

Раньше каналы открывались внутри `useTasks`, `useTaskGroups`, `useUnreadMessages` — а эти хуки вызываются в 16+ компонентах, что приводило к 15-20 одновременным WebSocket-подпискам и каскаду рефетчей.

Каналы:
- `global-subtasks-realtime` — слушает все subtasks, инвалидирует `["tasks"]` (с debounce 500ms).
- `global-group-members` — фильтр `user_id=eq.<me>`, инвалидирует `["task_groups"]` и `["group_members"]`.
- `global-unread-badge` — INSERT по group_messages/task_comments, диспатчит `window` event `jtd:unread-invalidate`, на который подписан `useUnreadMessages`.

Все инвалидации дебаунсятся (500ms), чтобы серия событий (offline-sync replay, массовые операции) сворачивалась в один рефетч.
