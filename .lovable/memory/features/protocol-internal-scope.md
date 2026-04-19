---
name: Protocol internal scope (внутренний контур)
description: Поле tasks.protocol_scope разделяет строки протокола на external (видно партнёру, идёт в CRM-доску) и internal (только команда Дороничей). UI красная заливка, отдельная секция и мини-триаж в раскрытой строке.
type: feature
---

# Protocol internal scope

## Модель
- `tasks.protocol_scope text` ENUM-check: `'external'` (default) | `'internal'`
- Индекс `idx_tasks_source_protocol_scope (source_protocol_id, protocol_scope) WHERE source_protocol_id IS NOT NULL`
- Привязка проекта внутренней задачи: `tasks.status_meta.linked_project_id` (без миграции)
- Привязка к родительской внешней строке: `tasks.status_meta.parent_external_task_id`

## UI
- **ProtocolTableView** фильтрует `protocol_scope !== 'internal'` — основная таблица показывает только внешние.
- **ProtocolInternalSection** (новый компонент):
  - Под таблицей в `ProtocolDetailPage` — отдельный блок с красной левой полосой `border-l-4 border-red-500/60 bg-red-500/5`, быстрый ввод (название + ответственный + срок + проект).
  - В раскрытой строке внешней задачи — компактный mode с `parentExternalTaskId`, мини-триаж по этой строке.
- **CrmReportPlaceholder** — серая карточка-заглушка справа от внутренней секции (полноценный CRM-отчёт по итогам встречи — TODO).
- **TaskItem badge** «🔴 внутреннее» (red-500/40) рядом с фиолетовым «из протокола от ДД МММ».

## Бизнес-правила
- CRM-доска (`CrmBoard`) фильтрует `.neq("protocol_scope", "internal")` в обоих select'ах — внутренние не попадают в воронку клиента.
- Экспорт партнёру (когда появится) обязан фильтровать `scope='external'`.
- Внутренние задачи всё равно `group_id = protocolId` и `source_protocol_id = protocolId` — попадают в обычные списки исполнителей с бейджем «🔴 внутреннее».
