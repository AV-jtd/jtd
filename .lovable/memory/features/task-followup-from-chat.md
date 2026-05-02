---
name: Task follow-up from chat
description: Закрытие задачи из TaskChat + создание связанной (follow_up_of)
type: feature
---
**TaskChat workflow «закрыл → создал связанную»**:
- Кнопка «Закрыть задачу / Открыть снова» в шапке TaskChat (inline и full варианты).
- При закрытии — toast + автооткрытие inline-формы создания follow-up задачи.
- Новая задача наследует group_id источника, `follow_up_of = src.id`.
- Системные карточки в обоих чатах:
  - в источнике: `__sys_task_followup__:<newId>|<newTitle>` (амбер ↗ «Закрыта → продолжение»).
  - в новой:    `__sys_task_source__:<srcId>|<srcTitle>` (синий ← «Продолжение задачи»).
- `parseAnySystemMessage` парсит created/followup/source.
- toggleTask в useTasks инвалидирует `task_statuses` и `messenger_threads`.
- MessengerPanel синхронизирует activeThread с актуальной версией из threads (taskCompleted updates live).

**Схема:** `tasks.follow_up_of uuid REFERENCES tasks(id) ON DELETE SET NULL`, индекс `tasks_follow_up_of_idx` (partial WHERE NOT NULL).
**TODO:** распространить аналогичный workflow на основной TaskItem (отдельная задача).
