# Аудит: чего не хватает в БД VPS относительно того, что запрашивает фронтенд

> Обновлено: 2026-07-06. Метод: сграплены все `.from('...')` и `.rpc('...')`
> из `src/` и `supabase/functions/`, сравнены со списком таблиц/функций,
> реально существующих в БД VPS. Отдельно колонки каждой таблицы сверены с
> автогенерированным `src/integrations/supabase/types.ts` (отражает реальную
> схему Lovable) против `information_schema.columns` в нашей БД.

## Таблицы: отсутствующих нет

Все 61 таблица, которую использует фронтенд/edge-функции через `.from(...)`,
физически существуют в БД VPS:

```
ai_conversations, calendar_tokens, chat_link_tokens, client_assignments,
clients, client_team, contractors, dashboard_reports, decision_clients,
decision_projects, decisions, decision_tags, department_directors,
departments, email_send_log, email_send_state, group_members,
group_messages, group_tags, kanban_boards, kanban_card_positions,
kanban_columns, max_link_tokens, message_reactions,
messenger_list_context, notification_preferences, npd_card_positions,
profile_audit_log, profiles, project_folder_items, project_folders,
project_milestones, protocol_templates, push_subscriptions, report_pages,
stm_structure_nodes, subtasks, tag_access, tag_categories, tags,
task_comments, task_dependencies, task_group_linked_tags, task_groups,
task_participants, tasks, task_tags, team_members, teams,
telegram_2fa_codes, telegram_bot_chats, telegram_group_chats,
telegram_pending_context, user_departments, user_roles, user_settings,
vapid_keys, weekly_send_log, wiki_pages, wiki_structured_sections,
admin_mode_state
```

(включая `clients`, `task_step_templates`, `client_team`,
`client_assignments`, `decision_clients`, `stm_structure_nodes`,
`weekly_send_log` — восстановлены/добавлены в рамках инцидента 2026-07-05/06)

## RPC-функции: отсутствующих нет

Все 18 RPC, вызываемых через `.rpc(...)`, присутствуют в БД:

```
admin_hard_delete_user, admin_restore_user, admin_set_users_department,
admin_soft_delete_user, delete_email, enqueue_email,
get_group_task_stats, get_my_auth_meta, get_my_profile_approval,
get_unread_threads, get_user_visible_departments, is_consultant,
manage_client_team, mark_thread_read, move_to_dlq, read_email_batch,
seed_protocol_status_for_user, upsert_client_by_name
```

## Колонки: 1 подтверждённый пробел

### `public.task_dependencies` — не хватает 2 колонок

- `predecessor_entity_type` — text, NOT NULL (судя по `types.ts`). Значения
  в реальных данных (CSV-бэкап, 307 строк): `task`, `milestone`, `project`
- `successor_entity_type` — text, NOT NULL. Значения: `task`, `milestone`

Позволяет задачам зависеть не только от задач, но и от вех проекта
(`project_milestones`) — судя по функции `trigger_resolve_dependencies()` и
политике `can_access_dependency`, которые уже ссылаются на эти колонки.

Данные в CSV-бэкапе ЕСТЬ (все 307 строк `task_dependencies` содержат оба
значения) — при исходной загрузке они были молча пропущены
(`load_tables_smart.py` пропускает CSV-колонки, которых нет в целевой
таблице БД).

**Нужно от Lovable**: точный DDL этих 2 колонок из `information_schema`
(тип, DEFAULT, NOT NULL, возможный CHECK/enum на допустимые значения) —
чтобы добавить колонку и корректно восстановить все 307 значений из бэкапа.

## Дополнительный контекст: та же природа проблемы у clients/task_step_templates

При инциденте с 404 на `/rest/v1/clients` (2026-07-05) обнаружено, что в
экспортированном `schema.sql` (и во ВСЕХ 223 файлах `supabase/migrations/`
в main) отсутствует `CREATE TABLE` для:

- `public.clients`
- `public.task_step_templates`
- колонка `public.task_groups.project_type`

Множество более поздних `ALTER TABLE`/`CREATE POLICY`/`CREATE TRIGGER` в
дампе ссылаются на них как на уже существующие — то есть эти объекты
создавались вручную (Lovable UI / SQL-редактор), в обход системы миграций,
и поэтому никогда не попадали в git ни в одну ветку.

Мы временно реконструировали их структуру по косвенным свидетельствам (все
ALTER-выражения, CSV-заголовки, паттерны похожих таблиц) — колонки совпали
1-в-1 с `types.ts` при повторной проверке, но RLS-политики и триггеры —
лучшее приближение, не гарантированно точное. Если у Lovable есть точный
DDL этих объектов (`information_schema` + `pg_policies` + `pg_trigger` на
живой базе) — стоит сверить и поправить точечно, особенно политики,
дописанные по аналогии, а не найденные в дампе:

- `clients`: политика "Users manage own clients" (владелец управляет своими)
- `task_step_templates`: политики "Users manage own step templates",
  "Non-consultants view step templates" — вообще не найдены в дампе,
  добавлены по аналогии с другими таблицами (могут не совпадать с
  реальными правами доступа в проде)

### `task_groups.project_type` — добавлена без CHECK

Добавлена колонка как обычный `text` без ограничения на значения — в дампе
видны два противоречивых списка (старый `IN ('npd','crm','stm','protocol')`
и отдельно `'crm_client'`). Данные из бэкапа для этой колонки НЕ
восстановлены (отдельная задача, как и с `task_dependencies` выше) — 10 из
1334 строк `task_groups.csv` имеют непустое значение `project_type`.

## Готовый промпт для передачи в Lovable

См. запросы к `information_schema`/`pg_catalog` и контекст — переслать
Lovable для получения точного DDL и последующей точечной доливки данных.

```sql
-- 1. Колонки task_dependencies, clients, task_step_templates
SELECT table_name, column_name, data_type, is_nullable, column_default,
       character_maximum_length, numeric_precision
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('task_dependencies', 'clients', 'task_step_templates')
ORDER BY table_name, ordinal_position;

-- 2. CHECK-constraints (особенно entity_type-колонки и project_type)
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'public.task_dependencies'::regclass,
  'public.clients'::regclass,
  'public.task_step_templates'::regclass,
  'public.task_groups'::regclass
)
AND contype = 'c';

-- 3. RLS-политики на clients и task_step_templates
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'task_step_templates')
ORDER BY tablename, policyname;

-- 4. Триггеры на clients и task_step_templates
SELECT tgname, tgrelid::regclass AS table_name, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid IN ('public.clients'::regclass, 'public.task_step_templates'::regclass)
  AND NOT tgisinternal;

-- 5. Индексы на этих 4 таблицах
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('task_dependencies', 'clients', 'task_step_templates', 'task_groups')
ORDER BY tablename, indexname;
```

## Формат ответа

Один SQL-файл `missing-objects.sql`, который можно выполнить на self-hosted
БД, в порядке зависимостей (родительские таблицы раньше дочерних). Данные
не нужны — только структура (DDL). Данные для `task_dependencies` заберём
отдельно из уже имеющегося CSV-бэкапа (см. раздел выше — 307 строк с обоими
значениями уже есть, нужен только точный тип колонки).
