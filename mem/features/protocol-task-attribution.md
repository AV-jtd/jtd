---
name: protocol-task-attribution
description: Поручения из протоколов привязываются к проектам через tasks.attributed_group_id, без реальных подпроектов
type: feature
---
- Поле `tasks.attributed_group_id` (uuid, nullable, индекс). Задача физически остаётся в `group_id = protocolId`, а поле указывает на проект-получатель.
- НЕ создаём реальные подпроекты `parent_id=projectId` — иерархия PMO остаётся чистой.
- RLS: участники/владельцы attributed-проекта имеют SELECT и UPDATE на такие задачи. Перевешивать привязку защищено WITH CHECK.
- UI протокола: колонка «Проект» с `TaskProjectPicker` (поиск + inline-create нового проекта через `task_groups` insert + auto-tag + owner-membership; протоколы исключаются через `excludeTypes=["protocol"]`).
- TODO: сворачиваемый аккордеон «📋 Из протоколов · N» внизу списка задач проекта, сгруппирован по протоколу-источнику.
- TODO: в DashboardView/Gantt/Portfolio расширить выборку — включать `attributed_group_id = projectId` наравне с `group_id`.
