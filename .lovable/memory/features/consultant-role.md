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
