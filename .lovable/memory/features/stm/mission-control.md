---
name: stm-mission-control
description: Модуль СТМ (Private Label) Mission Control — матрица SKU × этапы. Темный «Architectural Glass» интерфейс, два потока (Ввод/Вывод).
type: feature
---

# СТМ Mission Control

Подмодуль NPD для управления частной торговой маркой (СТМ / Private Label). Открывается на `/npd/stm`. Внутри NPD сверху — переключатель **«NPD проекты ↔ СТМ Mission Control»** (одинаковый и в NpdBoard, и в StmMatrixView).

## Модель данных

- `task_groups.project_subtype = 'npd_stm'` — маркер SKU-проекта.
- `task_groups.stm_meta` (JSONB): `{ flow: 'in'|'out', retailer, brand, contract_id, drop, weight_kg, package_type, barcode, sku_code_1c, plu, manager_id, target_price, shelf_life, purpose }`.
- `tasks.stage_key` + `tasks.stm_flow` — этап конвейера. `task_type = 'stm_stage'`.
- Один SKU = один проект (`task_group`). Все этапы = задачи в этом проекте.

## Потоки (workflows)

- **`in` (Ввод SKU)** — 12 этапов: brief → sample_request → sample_send → tasting_1 → calc_initial → rework → approval → branch_open → production_run → calc_final → label_design → order_release.
- **`out` (Вывод SKU)** — 3 этапа: notify → sell_off → close.

Этапы определены в `src/modules/stm/lib/stages.ts`. Не редактировать вручную: добавление этапа — миграция комментария к колонке `tasks.stage_key`.

## UI

- Эстетика **Architectural Glass**: всегда тёмный (даже в светлой теме приложения), глассморфизм. Токены `--stm-bg / --stm-card / --stm-glass / --stm-border / --stm-fg / --stm-accent / --stm-success / --stm-warn / --stm-danger` в `index.css`, классы `bg-stm-*` / `text-stm-*` в `tailwind.config.ts`.
- Sticky левая колонка SKU (260px) + sticky шапка этапов. Ячейка 80px ширина.
- Цвета ячеек: серый (ожидает), голубой glow (текущий этап = первый невыполненный), зелёный (готово), красный пульс (просрочено).
- Группировка: «Без / По сети / По бренду / По дропу» (`stm_meta.retailer|brand|drop`).
- Поиск по имени SKU + meta полям.
- Клик по ячейке = toggle complete у задачи. Клик по SKU = переход на `/pmo/project/:id`.

## Файлы

- `src/modules/stm/lib/stages.ts` — этапы и helpers.
- `src/modules/stm/hooks/useStmProjects.tsx` — `useStmProjects()`, `useCreateStmSku()`, `useToggleStmStage()`.
- `src/modules/stm/components/StmMatrixHeader|Row|Cell.tsx`.
- `src/modules/stm/components/StmCreateSkuDialog.tsx` — мастер с табами Ввод/Вывод.
- `src/modules/stm/pages/StmMatrixView.tsx` — собственно матрица.
- `src/pages/StmMatrix.tsx` + роут `/npd/stm` в `src/App.tsx`.

## Что осталось (Phase 3)

- Импорт «ассортимент_ввод_и_вывод.xlsx» через адаптер в `SmartImportDialog`: одна строка → один SKU-проект (создание через `useCreateStmSku`), мапинг колонок в `stm_meta`, заполнение дат на этапах.
- Подтягивание `manager_id` через `useAvailableUsers`.
- Telegram-команда `/stm <название>` для быстрого создания SKU.