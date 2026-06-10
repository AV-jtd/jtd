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

## Импорт из Excel

`StmExcelImportDialog` (`src/modules/stm/components/StmExcelImportDialog.tsx`) принимает `.xlsx` со множеством листов (каждый лист = одна сеть/кампания):
- Авто-детект строки заголовков (≥4 непустых ячеек + ключевое слово «Наименование/№ п/п/Бренд/ТМ»).
- Авто-выбор крупнейшего листа, авто-предзаполнение поля «Сеть» из имени листа, авто-flow по ключевым словам (Вывод/Закрытие → out).
- AI-маппинг через `ai-assistant` action `map_stm_columns`: возвращает либо meta-поле, либо `stage_key` текущего flow.
- Колонки-даты этапов → задачи `task_type='stm_stage'` с `is_completed=true`, `completed_at`+`deadline` = эта дата.
- Кнопка «Импорт Excel» рядом с «+ SKU» в верхнем баре `StmMatrixView`.
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

## Масштаб (под сотни SKU)

- **Виртуализация** строк через `@tanstack/react-virtual` (`useVirtualizer` в `StmMatrixView`): плоский список `flatItems` (group-header | row), абсолютное позиционирование внутри обёртки фикс. ширины `matrixWidth = 320 + stages*80 + 260`, sticky-колонки SKU/комментарий работают через scroll-container. `measureElement` для динамических высот (раскрытые строки).
- **Плотность** (`stm:density` в localStorage): «Комфортный» (полная строка) ↔ «Плотный» (одна строка ~37px, тепловая карта статус-точек: синяя=текущий, серые=ожидание, зелёная=готово, красная=просрочено, ромб=веха). Тумблер Rows3/Rows2 в верхнем баре. Компактные точки — `StmMatrixCell compact`.
- **Агрегаты-первыми**: при группировке группы по умолчанию свёрнуты (auto-collapse при отсутствии сохранённого `stm:collapsedGroups:<mode>`). Шапка группы показывает метрики: count SKU + бар ср.прогресса + ⚠ кол-во просроченных. Метрики считает `stat()` в `StmMatrixView` (использует `isStmProjectOverdue`).

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