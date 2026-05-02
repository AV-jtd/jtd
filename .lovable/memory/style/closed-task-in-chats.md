---
name: Closed task visual in chats
description: Закрытые задачи в чатах перечёркнуты + pill «Закрыта» (зелёный)
type: design
---
В чатах при упоминании задачи: `is_completed=true` → название `line-through text-muted-foreground` + `<ClosedTaskPill />` (зелёный, bg-emerald-500/10).
Места: TaskChat SystemDivider, ProjectChat CreatedTaskCard, MessengerPanel (список + шапка активного треда).
Статусы: `useTaskStatuses(taskIds)` (id+is_completed, staleTime 30s). В `Thread.taskCompleted` приходит из useMessenger.
