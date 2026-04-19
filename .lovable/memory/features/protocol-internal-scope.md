---
name: Protocol internal scope (внутренний контур)
description: Внутренний контур протокола разделён на два механизма. (1) Самостоятельные внутренние задачи — `tasks.protocol_scope='internal'`, рендерятся секцией ProtocolInternalSection под таблицей. (2) Слой "также внутренняя" поверх внешней строки — `status_meta.also_internal=true` + also_internal_project_id / also_internal_user_ids / also_internal_notes, рендерится ExternalRowInternalLayer в раскрытой строке. Везде единый красный визуал и заголовок "Внутренние задачи / Внутренний контур этой строки" + чип "не уходит партнёру".
type: feature
---

# Protocol internal scope

## Два механизма внутреннего контура

### 1. Самостоятельная внутренняя задача
- `tasks.protocol_scope` ENUM `'external'` (default) | `'internal'`
- Создаётся через `ProtocolInternalSection` (под таблицей протокола)
- `group_id = protocolId`, `source_protocol_id = protocolId`
- Опционально: `status_meta.linked_project_id` — привязка к PMO/NPD-проекту
- Не имеет внешнего двойника, существует только во внутреннем поле зрения команды

### 2. Слой "также внутренняя" поверх внешней строки
Хранится в `tasks.status_meta` существующей внешней задачи:
- `also_internal: boolean` — флаг наличия слоя
- `also_internal_project_id: uuid` — внутренний проект (PMO/NPD), куда строка падает дублем
- `also_internal_user_ids: uuid[]` — внутренние участники (наша команда), скрытые от партнёра
- `also_internal_notes: string` — внутренние заметки (НЕ description задачи)

Партнёр видит у такой задачи только: `title / assigned_to / external_assignee / deadline / status / description / closure_result`.
Поля `also_internal_*` ОБЯЗАНЫ фильтроваться при экспорте партнёру.

## UI унификация
Везде, где отображается внутренний контур:
- Цвет: `border-l-4 border-red-500/60 bg-red-500/5`
- Заголовок: "Внутренние задачи" (под таблицей) / "Внутренний контур этой строки" (в раскрытой строке)
- Иконка: `<Lock />` red-600
- Чип справа: "не уходит партнёру" (red-500/10)
- Создание задачи унифицировано: `Plus + input + AssigneeChip + DeadlineChip + ProjectChip + Добавить` — одинаково в основной секции и в compact-режиме (если используется)

## Места рендера
- **ProtocolInternalSection** (top-level, под таблицей в `ProtocolDetailPage`) — для самостоятельных внутренних задач
- **ExternalRowInternalLayer** (в раскрытой внешней строке `ProtocolTableView`) — для слоя "также внутренняя"
- **CrmReportPlaceholder** — серая заглушка справа от внутренней секции

## Бизнес-правила
- CRM-доска (`CrmBoard`) фильтрует `.neq("protocol_scope", "internal")` — самостоятельные внутренние не попадают в воронку клиента.
- Экспорт партнёру (когда появится) обязан:
  - исключать строки с `protocol_scope='internal'`
  - вырезать поля `status_meta.also_internal_*` у внешних строк
- Внутренние самостоятельные задачи всё равно `group_id = protocolId` и попадают в обычные списки исполнителей с бейджем «🔴 внутреннее» (TaskItem).
- Внешняя задача с `also_internal=true` остаётся внешней, но дополнительно «прозванивается» во внутренний проект и подключает наших участников через `task_participants` (через сам `also_internal_user_ids` — TODO: автосинк в `task_participants`).
