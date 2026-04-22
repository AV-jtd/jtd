---
name: STM milestone → deadline mapping
description: Источник истины для milestone-этапов STM (Утв./Заказ) — tasks.deadline соответствующего stm_stage. project_milestones.planned_date — производная копия, синхронизируется триггером sync_stm_milestone_from_stage_task. UI fallback не используется: если deadline=null, ячейка показывает «нет даты».
type: feature
---
## Правило (single source of truth)

Для STM SKU milestone-этапов «Утверждение» (`stage_key='approval'`) и «Отгрузка / релиз» (`stage_key='order_release'`):

1. **Источник истины — `tasks.deadline`** задачи `task_type='stm_stage'`.
2. **`project_milestones.planned_date` — производная копия** для отображения вехи на Гантте.
3. **Синхронизация — серверный триггер** `trg_sync_stm_milestone_from_stage_task` (AFTER INSERT OR UPDATE OF deadline).
   - Маппинг по имени: `approval` → "Утверждён в сети", `order_release` → "Первый заказ".
   - Не создаёт milestone, если его нет (legacy SKU оставляем как есть).
4. **UI не делает fallback**: `StmMatrixCell` читает только `task.deadline`. Если null — показывается «нет даты» в акцентном цвете.

## Что это даёт
- Правка даты в матрице STM моментально обновляет веху на диаграмме Гантт.
- Нет двух мест записи — невозможно случайно рассинхронизировать.
- Drift считается от `original_deadline` той же задачи, тоже без участия milestone.

## Файлы
- `supabase/functions ...` (нет, чисто триггер) — миграция `sync_stm_milestone_from_stage_task`.
- `src/modules/stm/components/StmMatrixCell.tsx` — UI читает только `task.deadline`.
- `src/modules/stm/hooks/useStmProjects.tsx` — `useCreateStmSku` создаёт milestone один раз при создании SKU; дальше им управляет триггер.
