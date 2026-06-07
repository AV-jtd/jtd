---
name: My Tasks dashboard in chat list
description: Pinned "Мои задачи" manager mini-dashboard at top of chat rooms list, opens in chat center pane
type: feature
---
Закреплённый пункт «Мои задачи» в самом верху списка чатов (ChatRoomsList, вне фильтров/поиска). Открывает мини-дашборд менеджера в центральной панели ChatFullscreen через URL `?view=mytasks` (работает на /chat и /chat/:groupId, шарится ссылкой).

- Компонент: `src/components/chat/MyTasksDashboard.tsx`; данные: `src/hooks/useMyTasksDashboard.tsx`.
- Блоки (клик раскрывает список задач инлайн): Просрочено (deadline<today, ⚠ red), Сегодня, Непрочитанные обсуждения (`isThreadUnread('task-<id>')`), Делегировано мне (assigned_to=me & delegated_from≠null), Делегировано мной (delegated_from=me, assignee≠me).
- Охват через тумблер в шапке: «Я участник» (все из task_participants, т.к. assigned_to синкается туда) vs «Исполнитель» (assigned_to=me). Делегирование от тумблера не зависит.
- Клик по задаче → openTask (открывает чат задачи, очищает view).
- Данные: задачи через task_participants (chunk по 150) + delegated_from=me; is_completed=false, is_draft=false.
---
ChatRoomsList props: onOpenMyTasks, myTasksActive.