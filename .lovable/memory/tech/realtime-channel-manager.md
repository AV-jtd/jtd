---
name: realtime-channel-manager
description: LRU-менеджер Supabase Realtime каналов для чатов (useGroupChat, useComments) с лимитом 5 активных и reference counting.
type: feature
---

`src/lib/channelManager.ts` — общий LRU-менеджер для подписок чатов (групповые сообщения и комментарии задач).

**Зачем:** при клике по 20 разным проектам/задачам подряд раньше открывалось/закрывалось 20 каналов или (если оставлять) копилось 20 подписок. Теперь живёт максимум **5** одновременно.

**Как работает:**
- `channelManager.subscribe(key, factory, onMessage)` — регистрирует слушателя.
- Если канал с таким `key` уже есть — переиспользуется (bumped в LRU).
- Если каналов больше `MAX_ACTIVE = 5` — закрывается самый старый, у которого `refs === 0`.
- Если у самого старого ещё есть активные подписчики, он не закрывается (cap может временно расти).
- Тёрдоwn ленивый: на unmount канал не закрывается сразу, чтобы StrictMode/route-flips переиспользовали его.
- Несколько подписчиков на один `key` шарят один канал, события фанятся через `notify(key)`.

**Используется в:** `useTaskComments` (key: `task-comments-<id>`), `useGroupMessages` (key: `group_messages_<id>`).

**Не используется** для глобальных каналов (subtasks, group_members, unread) — они в `useRealtimeSubscriptions` как singleton.
