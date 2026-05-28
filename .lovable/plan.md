## План реализации: Канбан-доски (поэтапно)

Разобью на 3 этапа, чтобы каждый можно было проверить и откатить независимо. Сейчас предлагаю стартовать с **Этапа 1**.

---

### Этап 1 — Базовый MVP (Personal + Project, status-driven) ⬅️ сейчас

**Цель**: рабочие канбан-доски с DnD по статусам, без CRM/NPD-рефакторинга.

**Миграция БД:**
- `kanban_boards` (id, name, icon, owner_id, board_type, group_id, group_by, is_archived, created_at, updated_at)
- `kanban_columns` (id, board_id, name, color, position, wip_limit, mapping_json, status_value)
- `kanban_card_positions` (board_id, task_id, column_id, position) — PK (board_id, task_id)
- GRANTs + RLS: personal — owner_id; project — `has_project_access(group_id)`
- Триггер: при создании board авто-генерация 4 дефолтных колонок (Inbox → Active → Review → Done), маппинг на `tasks.status`

**Frontend:**
- Маршрут `/kanban` (список досок) и `/kanban/:boardId` (канва)
- Сайдбар: пункт "Канбан" в фазе ACT, под ним — personal-доски + project-доски, к которым есть доступ
- Компоненты:
  - `KanbanBoardPage` — канва с колонками
  - `KanbanColumn` — обёртка над `BoardColumn`, WIP-индикатор
  - `KanbanCard` — компактная карточка задачи (reuse `TaskCard` mini)
  - `BoardSettingsDialog` — переименование, добавление/удаление/цвет колонок, WIP
  - `CreateBoardDialog` — выбор типа (Personal / Project)
- DnD: переиспользуем `useBoardDnd` + `DraggableWrapper`
  - Drop → update `tasks.status` (status-driven) + upsert в `kanban_card_positions` (ручная сортировка)
- Клик по карточке → открывает `ProjectDetailPanel` (desktop) / `TaskDetailSheet` (mobile)
- Источник задач: для Personal — задачи юзера; для Project — задачи проекта (reuse существующих хуков)

**Что НЕ делаем на этом этапе:**
- Smart boards (filter_json)
- Swimlanes (group_by)
- Рефакторинг CRM pipeline и NPD matrix (продолжают работать как есть)
- Шаблоны, дублирование, автоматизации

---

### Этап 2 — Smart boards + Swimlanes (после проверки Этапа 1)

- `board_type = 'smart'` с `filter_json` (теги, assignee, дедлайн)
- `group_by` (assignee / tag / due_week) — swimlanes
- Шаблоны досок (Scrum, GTD)

---

### Этап 3 — Унификация CRM/NPD (отдельное обсуждение)

- CRM pipeline становится системной project-доской с `mapping_json` → `crm_status`
- NPD matrix — то же с `npd_gate`, `kanban_card_positions` поглощает `npd_card_positions`
- Требует осторожной миграции данных — будем решать отдельно

---

### Технические детали

- **Доска без колонок**: блок при создании невозможен — триггер сразу создаёт 4 дефолтные
- **WIP-лимит**: визуальный (красная рамка колонки), не блокирует drop
- **Сортировка**: при drop пересчитываем `position` соседей (шаг 1000, как в `npd_card_positions`)
- **Realtime**: подписка на `kanban_card_positions` + `tasks` (через существующий singleton)
- **Мобилка**: горизонтальный скролл колонок, ширина колонки 280px

---

После одобрения начну с миграции БД, потом сайдбар + страница списка, потом канва с DnD.