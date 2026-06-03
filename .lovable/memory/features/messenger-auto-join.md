---
name: messenger-auto-join
description: Любой пишущий в привязанном чате (Telegram/MAX) авто-добавляется участником проекта JTD.
type: feature
---

Любой пользователь, который пишет в привязанном к проекту групповом чате (Telegram или MAX) и имеет аккаунт в JTD (matched по telegram_username/telegram_chat_id или max_user_id), автоматически добавляется в `group_members` проекта как `participant`.

- Telegram: блок `[auto-join]` в начале `isGroupChat` в `telegram-webhook` (срабатывает на любые сообщения, включая команды).
- MAX: в `max-webhook` перед `handleGroupMessage` (matched по `max_user_id`).
- Общий хелпер `ensureGroupMembership(supabase, groupId, userId, invitedBy)` экспортируется из `messenger-core.ts` (идемпотентен, пропускает владельца и существующих).
- Также `createBulkTasks` и `/task @mention` используют глобальный фолбэк `findApprovedProfileGlobally` + `ensureGroupMembership` для авто-добавления ответственного/участников по имени, если их нет в проекте.
- Пользователи без аккаунта JTD не добавляются (нет user_id).
