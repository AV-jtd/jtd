---
name: STM SKU inline stages workflow
description: Клик по SKU в матрице раскрывает 12 stage-задач инлайн через TaskItem (шаги/сроки/ответственные), вместо перехода в Гантт.
type: feature
---
В STM Mission Control (`/npd/stm`) клик по строке SKU не уводит в Гантт, а раскрывает инлайн-панель под строкой.

- 1 этап (gate) = 1 задача (`task_type='stm_stage'`, `stage_key=...`).
- Раскрытая панель рендерит каждую stage-задачу через стандартный `TaskItem`, что даёт назначение ответственных, сроков, шагов (subtasks), комментариев — без перехода в другой модуль.
- Краткая визуальная сводка (12 ячеек статусов) над раскрытой панелью сохраняется как «глазная диагностика» этапа.
- Кнопка «Открыть Гантт» в шапке раскрытой панели ведёт на `/pmo/project/:id` для тех, кому нужен таймлайн.
- Только один SKU раскрыт одновременно (toggle `expandedSku` в `StmMatrixView`).

Файлы: `src/modules/stm/components/StmMatrixRow.tsx`, `src/modules/stm/pages/StmMatrixView.tsx`.
