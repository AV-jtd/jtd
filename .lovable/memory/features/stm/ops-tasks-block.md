---
name: STM SKU operational tasks block
description: В раскрытой карточке SKU под Chronograph-этапами — блок «Операционные задачи»: TaskCreateBar (как в «Все задачи») + 2 секции (Операционные / Из протоколов). В Гантте задачи из протоколов помечены 📋. Задачи живут в tasks с group_id=SKU, task_type≠'stm_stage'.
type: feature
---
В STM SKU (`/npd/stm`, раскрытая карточка) под grid'ом 12 этапов добавлен блок `StmOpsTasks`:

## Источники
- **Операционные** — `tasks.group_id = SKU AND task_type != 'stm_stage' AND source_protocol_id IS NULL`
- **Из протоколов** — `tasks.group_id = SKU AND source_protocol_id IS NOT NULL`. Над каждой задачей отображается ссылка на протокол-источник (`task_groups` где `id = source_protocol_id`).
- Stage-задачи (`task_type='stm_stage'`) специально исключены — они уже отображаются в Chronograph выше.

## UI
- Inline-создание через `TaskCreateBar` (тот же, что в «Все задачи»): @имя, +Nд, до DD.MM, !.
- Каждая задача рендерится через `TaskItem sortable={false}` — единый воркфлоу с глобальным списком (шаги, комментарии, дедлайн, ответственный).
- Сворачиваемые секции с счётчиками. «Из протоколов» показывается только когда есть такие задачи.

## Гантт
- STM-задачи (включая stage_key) подгружаются дополнительным запросом для выбранного STM-проекта (см. предыдущий патч в GanttView.tsx).
- В левой панели рядом с названием задачи бейдж 📋, если `source_protocol_id IS NOT NULL`.

## Файлы
- `src/modules/stm/components/StmOpsTasks.tsx` — новый компонент.
- `src/modules/stm/components/StmExpandedRow.tsx` — рендер `<StmOpsTasks groupId={group.id} />` в конце.
- `src/modules/pmo/components/GanttLeftPanel.tsx` — иконка 📋 для протокольных задач.
