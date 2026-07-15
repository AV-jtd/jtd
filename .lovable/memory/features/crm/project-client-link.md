---
name: Привязка проекта к CRM-клиенту
description: Целый проект (task_groups.client_id) можно привязать к CRM-клиенту из настроек проекта. Даёт логотип клиента на проекте, наследование клиента в задачи (триггер + каскад), появление в «Комнате клиента».
type: feature
---

# Привязка проекта к клиенту

## Где
- Пикер «Клиент» в `ProjectDetailPanel` (компонент `src/components/ProjectClientPicker.tsx`), рядом с модулями CRM/NPD.
- Мутация `linkGroupClient` в `useTaskMutations` (useTasks.tsx).

## Что делает привязка (`task_groups.client_id`)
1. **Логотип клиента на проекте** — `useTaskGroups` обогащает каждую группу `client_logo_url`/`client_name` (join к `clients`). `ProjectIcon` показывает `client_logo_url` приоритетнее собственного `logo_url` → лого клиента везде (сайдбар, шапки, карточки, чат-лист мессенджера).
2. **Наследование в задачи** — при привязке каскадно проставляется `tasks.client_id` для задач проекта и всех подпроектов, у которых клиент ещё пуст. Новые задачи наследуют клиента через триггер `trg_inherit_group_client` (BEFORE INSERT на tasks: если client_id NULL и есть group_id → берём client_id группы).
3. **«Комната клиента»** — `ClientRoomCenter` уже собирает проекты по `task_groups.client_id`, поэтому проект появляется там автоматически.

## Мессенджер
- `useMessenger`: `clientLogoMap` заполняется для ВСЕХ групп с `client_id` (не только `project_type='crm_client'`).

## Важно
- Не путать `task_groups.client_id` (привязка проекта) с `task_groups.protocol_meta.client_id` (протоколы) и `project_type='crm_client'` (комната-клиент как отдельный проект).
