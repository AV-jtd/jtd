---
name: Protocol internal scope (внутренний контур)
description: Внутренний контур протокола. (1) Самостоятельные внутренние задачи — `tasks.protocol_scope='internal'`, рендер ProtocolInternalSection. (2) Внутренний контекст внешней строки — `status_meta.linked_project_id` + `linked_stream_key`, рендер ExternalRowInternalLayer в раскрытой строке. Триггер sync_linked_project_participants авто-добавляет владельца проекта и создателя задачи в task_participants.
type: feature
---

# Protocol internal scope

## Два механизма внутреннего контура

### 1. Самостоятельная внутренняя задача
- `tasks.protocol_scope` ENUM `'external'` (default) | `'internal'`
- Создаётся через `ProtocolInternalSection` (под таблицей протокола или внутри раскрытой строки)
- `group_id = protocolId`, `source_protocol_id = protocolId`
- Опционально: `status_meta.linked_project_id` — привязка к PMO/NPD-проекту
- При создании из раскрытой строки: `status_meta.parent_external_task_id = <id внешней>`

### 2. Внутренний контекст внешней строки (двухсторонняя привязка)
**Принцип «одна задача — два контекста»**: внешняя строка физически остаётся в протоколе
(`group_id = protocolId`), но дополнительно через `status_meta` привязывается к внутреннему
проекту NPD/PMO/CRM, не теряя видимости для партнёра.

Хранится в `tasks.status_meta` существующей внешней задачи:
- `linked_project_id: uuid` — внутренний проект (NPD/PMO/CRM)
- `linked_stream_key: string` — стрим NPD-матрицы (только если linked-проект `project_type='npd'`).
  Список: Продакт, Реклама, RnD, СКК, Производство, Закупки, Продажи, Покупка оборудования.

Партнёр видит у такой задачи только: `title / assigned_to / external_assignee / deadline / status / description / closure_result`.
Поля `linked_*` ОБЯЗАНЫ фильтроваться при экспорте партнёру.

### Триггер `sync_linked_project_participants`
PostgreSQL-триггер на `tasks` (AFTER INSERT/UPDATE OF status_meta).
При появлении или смене `status_meta.linked_project_id` автоматически добавляет
в `task_participants`:
- владельца linked-проекта (`task_groups.user_id`)
- создателя задачи (`tasks.user_id`)

Использует `INSERT ... ON CONFLICT DO NOTHING` (требует уникальный индекс
`task_participants_task_user_uniq` на `(task_id, user_id)`).
Удаление `linked_project_id` участников не убирает.

## UI унификация
Везде, где отображается внутренний контур:
- Цвет: `border-l-4 border-red-500/60 bg-red-500/5`
- Заголовок: «Внутренние задачи» / «Внутренний контекст этой строки»
- Иконка: `<Lock />` red-600
- Чип справа: «не уходит партнёру» (red-500/10)

Внутри раскрытой внешней строки:
- Сверху — мини-секция «Внутренний контекст этой строки» с чипами
  `[Проект] [Стрим — только для NPD] [Участники]`
- Ниже — `ProtocolInternalSection` для дочерних подзадач (форма «Привязать задачу»)

## Места рендера
- **ProtocolInternalSection** (top-level, под таблицей в `ProtocolDetailPage`) — самостоятельные внутренние задачи
- **ExternalRowInternalLayer** (в раскрытой внешней строке `ProtocolTableView`) — внутренний контекст + дочерние подзадачи
- **CrmReportPlaceholder** — серая заглушка справа от внутренней секции

## Бизнес-правила
- CRM-доска (`CrmBoard`) фильтрует `.neq("protocol_scope", "internal")` — самостоятельные внутренние не попадают в воронку клиента.
- Экспорт партнёру (когда появится) обязан:
  - исключать строки с `protocol_scope='internal'`
  - вырезать поля `status_meta.linked_*` у внешних строк
- Внутренние самостоятельные задачи всё равно `group_id = protocolId` и попадают в обычные списки исполнителей.

## Видимость linked-задач в NPD-матрице
- `NpdSwimlaneMatrix` грузит две пачки задач: (1) `group_id ∈ descendants`, (2) `status_meta->>linked_project_id ∈ descendants`. Дедуп по id.
- `getTaskStream` для linked-задач берёт `status_meta.linked_stream_key`; `getTaskGate` — gate из linked-проекта.
- В `MatrixTaskRow` бейдж «📋 <название протокола>» (красный) ведёт на `/protocols/:id`.
- TODO: аналогично для CRM-доски (через `client_id` уже работает; для linked — добавить ИЛИ-условие).
