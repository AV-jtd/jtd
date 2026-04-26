---
name: consultant-role
description: Роль consultant для внешних подрядчиков. Авто-назначение по contractor_id в Админке. RLS режет видимость задач/людей/тегов/проектов. UI скрывает PMO/NPD/CRM/STM/Протоколы/Wiki/Сообщество/Команду/Дашборд/Архив/Мой отдел.
type: feature
---

# Роль «Консультант»

## Модель
- `app_role` enum: `admin | user | consultant`
- Триггер `sync_consultant_role` на `profiles.contractor_id`: задал contractor_id → роль consultant; снял → роль удалена.
- Назначение через селект «Подрядчик» в `UserCard` (Админка). Никакого отдельного UI.

## Stage 2 — UI faded-buttons (текущий слой)
- AppHeader: Search/AI/Messenger у консультанта рендерятся как `disabled` faded-кнопки (`text-muted-foreground/40`, `cursor-not-allowed`) с tooltip «… доступен только сотрудникам компании».
- ModuleLayout + Index.tsx: Cmd+K shortcut и оверлеи (GlobalSearch, AiAssistant, MessengerPanel) полностью неактивны для consultant (early-return в useEffect, условный рендер).
- Index.tsx: ProjectChat внутри проекта дополнительно скрыт.
- AssigneePicker: вкладки «Отдел» и «Подрядчик» автоматически скрываются (`effHideDepartment`/`effHideContractor`) — консультант делегирует только конкретным людям.
- Settings: разделы Делегирование, Тэги (управление), Импорт/Экспорт, Команды, AdminApproval, подписка на календарь — скрыты. Доступны: профиль, тема, уведомления.

## Stage 2.1 — Общая инфраструктура (ОБЯЗАТЕЛЬНО для всех новых UI)

### Где живут правила
- **`src/lib/consultantRestrictions.ts`** — единый конфиг:
  - `CONSULTANT_LOCKED_MESSAGE` — стандартный текст tooltip
  - `CONSULTANT_FADED_CLASS` — Tailwind-классы faded-состояния
  - `ConsultantRestrictedArea` — типизированный список областей
  - `AREA_LABELS` — человекочитаемые названия
  - `CONSULTANT_BLOCKED_ROUTES` — список закрытых роутов (для App.tsx ConsultantBlocked)
  - `CONSULTANT_VISIBLE_NAV_IDS` — белый список боковой навигации
  - `consultantTooltip(area)` — формирует текст tooltip

### Компонент
- **`<ConsultantGuard area="..." mode="hide|faded">`** (`src/components/consultant/ConsultantGuard.tsx`):
  - `mode="hide"` (по умолчанию) — скрывает children для consultant
  - `mode="faded"` — оборачивает одиночный child в disabled+faded+tooltip
  - `useConsultantBlocked()` — хук-хелпер для условной логики вне JSX

### Правило для новых фичей
1. Любая новая кнопка/раздел/секция, недоступная внешним пользователям → оборачивается в `<ConsultantGuard area="...">`. НЕ писать `{!isConsultant && (...)}` напрямую.
2. Новая закрытая область → добавить ключ в `ConsultantRestrictedArea` и `AREA_LABELS`.
3. Новый закрытый роут → добавить в `CONSULTANT_BLOCKED_ROUTES` и обернуть в `<ConsultantBlocked>` в App.tsx.
4. Новый пункт боковой навигации, доступный consultant → добавить id в `CONSULTANT_VISIBLE_NAV_IDS`.

### Текущие потребители (мигрированы)
- `AppHeader` — Search/AI/Messenger через `<ConsultantGuard mode="faded">`
- `Settings` — все приватные разделы через `<ConsultantGuard mode="hide">`
- `AssigneePicker` — inline faded-tabs с `CONSULTANT_FADED_CLASS` + `consultantTooltip("delegation")`
- `MainNav` — фильтр через `CONSULTANT_VISIBLE_NAV_IDS`

## Хелперы (SQL, SECURITY DEFINER)
- `is_consultant(uid)`
- `consultant_company(uid)` → contractor_id
- `consultant_can_see_task(uid, task_id)` — owner/assignee/participant/contractor совпадает
- `consultant_can_see_user(viewer, target)` — себя / коллега по contractor_id / участник общей задачи
- `consultant_can_see_tag(uid, tag_id)` — свой тег или используется в видимой задаче
- `consultant_can_see_group(uid, group_id)` — есть видимая задача в группе

## RLS-стратегия
RESTRICTIVE-политики `Consultant restriction on <table>` поверх существующих:
- `tasks` / `subtasks` / `task_comments` / `task_participants` / `task_tags` / `task_groups` — узкая видимость через хелперы
- `task_dependencies` — обе стороны должны быть видны (только task↔task)
- `message_reactions` — только на видимых task_comment
- `profiles` / `tags` / `tag_categories` / `contractors` — открытые SELECT-политики разделены на «non-consultant» и «consultant»-узкую
- `departments` — скрыто
- Полный блок: `group_members`, `group_messages`, `group_tags`, `project_milestones`, `project_folders`, `project_folder_items`, `npd_card_positions`, `report_pages`, `wiki_pages`, `wiki_structured_sections`, `protocol_templates`, `clients`, `team_members`, `teams`, `dashboard_reports`
- Свои настройки (notifications, push, settings, calendar_tokens, ai_conversations, chat_read_status) — без изменений

## UI (этап 1)
- `useAuth().isConsultant`
- `MainNav` для consultant: только `all/inbox/myday/assigned/deferred/calendar`
- `App.tsx` `<ConsultantBlocked>` оборачивает /pmo /crm /npd /protocols /my-department /wiki-demo
- `Index.tsx` — useEffect: если activeView не в whitelist → "all"

## Этап 2 (TODO)
- Скрыть кнопки в `AppHeader`: GlobalSearch, AiAssistant, Messenger
- `AssigneePicker`: для consultant убрать табы Отдел/Подрядчик
- `TaskCreateBar` / `Settings`: скрыть DelegationPanel, TagManagementPanel, TeamSection, AdminApproval
- Edge-функции: `telegram-webhook`, `calendar-feed`, `ai-assistant`, `ai-insights`, `dashboard-report` — добавить проверку роли (сейчас обходят RLS через service role)
- ProjectChat / групповой мессенджер — скрыть
