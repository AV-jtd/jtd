-- Загрузка таблиц, зависящих от auth.users
-- Все FK и триггеры отключены через session_replication_role = 'replica'
-- CSV-файлы должны быть в /tmp/csv/ внутри контейнера

BEGIN;
SET session_replication_role = 'replica';

-- Базовые пользовательские данные
COPY public.profiles (id,display_name,email,created_at,telegram_username,work_email,telegram_chat_id,username,is_approved,organization,department_id,contractor_id,client_id,deleted_at,deleted_by,max_user_id,max_chat_id)
  FROM '/tmp/csv/profiles.csv' WITH (FORMAT csv, HEADER true);

COPY public.user_roles (id,user_id,role)
  FROM '/tmp/csv/user_roles.csv' WITH (FORMAT csv, HEADER true);

COPY public.user_settings (id,user_id,setting_key,setting_value,created_at,updated_at)
  FROM '/tmp/csv/user_settings.csv' WITH (FORMAT csv, HEADER true);

-- Теги (зависят от auth.users через user_id)
COPY public.tags (id,user_id,name,color,created_at,category_id)
  FROM '/tmp/csv/tags.csv' WITH (FORMAT csv, HEADER true);

COPY public.tag_access (id,tag_id,user_id,granted_by,created_at)
  FROM '/tmp/csv/tag_access.csv' WITH (FORMAT csv, HEADER true);

-- Проекты и структуры
COPY public.task_groups (id,user_id,name,color,icon,position,created_at,linked_tag_id,parent_id,description,project_type,closed_at,baseline_status,baseline_approver_id,baseline_locked_at,baseline_auto_lock_hours,draft_status,protocol_meta,logo_url,project_subtype,stm_meta,archive_comment,view_mode,telegram_group_chat_id,max_group_chat_id,chat_mirror_enabled,client_id)
  FROM '/tmp/csv/task_groups.csv' WITH (FORMAT csv, HEADER true);

COPY public.project_milestones (id,group_id,name,description,planned_date,actual_date,status,color,created_by,created_at,updated_at,gate_key,position)
  FROM '/tmp/csv/project_milestones.csv' WITH (FORMAT csv, HEADER true);

COPY public.department_directors (director_user_id,department_id,created_at,created_by)
  FROM '/tmp/csv/department_directors.csv' WITH (FORMAT csv, HEADER true);

-- Задачи
COPY public.tasks (id,user_id,group_id,title,description,deadline,is_completed,is_important,assigned_to,position,completed_at,created_at,updated_at,recurrence,recurrence_end_date,parent_recurring_id,priority,original_deadline,deferred_until,task_type,client_id,start_at,delegated_from,requires_approval,approval_status,closure_result,closure_attachments,source_protocol_id,is_draft,external_ref,external_assignee,status_meta,protocol_scope,department_id,contractor_id,stage_key,stm_flow,follow_up_of)
  FROM '/tmp/csv/tasks.csv' WITH (FORMAT csv, HEADER true);

COPY public.subtasks (id,task_id,title,is_completed,position,created_at,deadline,assigned_to)
  FROM '/tmp/csv/subtasks.csv' WITH (FORMAT csv, HEADER true);

COPY public.task_participants (id,task_id,user_id,role,created_at)
  FROM '/tmp/csv/task_participants.csv' WITH (FORMAT csv, HEADER true);

COPY public.task_tags (task_id,tag_id)
  FROM '/tmp/csv/task_tags.csv' WITH (FORMAT csv, HEADER true);

COPY public.task_dependencies (id,predecessor_id,successor_id,dependency_type,lag_days,created_at,created_by,predecessor_entity_type,successor_entity_type)
  FROM '/tmp/csv/task_dependencies.csv' WITH (FORMAT csv, HEADER true);

-- Комментарии (самая большая таблица)
COPY public.task_comments (id,task_id,user_id,content,created_at,updated_at,kind,meta,reply_to)
  FROM '/tmp/csv/task_comments.csv' WITH (FORMAT csv, HEADER true);

-- Группы и сообщения
COPY public.group_members (id,group_id,user_id,invited_by,created_at,role)
  FROM '/tmp/csv/group_members.csv' WITH (FORMAT csv, HEADER true);

COPY public.group_messages (id,group_id,user_id,reply_to,content,source,created_at,updated_at,external_author,external_message_id)
  FROM '/tmp/csv/group_messages.csv' WITH (FORMAT csv, HEADER true);

COPY public.group_tags (group_id,tag_id)
  FROM '/tmp/csv/group_tags.csv' WITH (FORMAT csv, HEADER true);

-- Команды
COPY public.team_members (id,team_id,user_id,role,created_at)
  FROM '/tmp/csv/team_members.csv' WITH (FORMAT csv, HEADER true);

-- Решения
COPY public.decisions (id,user_id,protocol_id,source_task_id,title,body,decided_at,status,superseded_by,visibility,created_at,updated_at)
  FROM '/tmp/csv/decisions.csv' WITH (FORMAT csv, HEADER true);

COPY public.decision_projects (decision_id,group_id)
  FROM '/tmp/csv/decision_projects.csv' WITH (FORMAT csv, HEADER true);

-- Kanban и папки
COPY public.kanban_card_positions (board_id,task_id,column_id,position,updated_at)
  FROM '/tmp/csv/kanban_card_positions.csv' WITH (FORMAT csv, HEADER true);

COPY public.npd_card_positions (id,user_id,gate_key,group_id,position,created_at)
  FROM '/tmp/csv/npd_card_positions.csv' WITH (FORMAT csv, HEADER true);

COPY public.project_folder_items (id,folder_id,group_id,user_id,position,created_at)
  FROM '/tmp/csv/project_folder_items.csv' WITH (FORMAT csv, HEADER true);

-- Telegram
COPY public.telegram_group_chats (id,telegram_chat_id,telegram_chat_title,group_id,linked_by,created_at,updated_at)
  FROM '/tmp/csv/telegram_group_chats.csv' WITH (FORMAT csv, HEADER true);

COPY public.telegram_pending_context (id,chat_id,user_id,context_type,group_id,group_name,created_at,template_key,protocol_name,awaiting_axis,collected_axes,parsed_payload,raw_messages,last_message_at)
  FROM '/tmp/csv/telegram_pending_context.csv' WITH (FORMAT csv, HEADER true);

-- Wiki
COPY public.wiki_pages (id,group_id,user_id,parent_page_id,title,content,icon,page_type,position,created_at,updated_at)
  FROM '/tmp/csv/wiki_pages.csv' WITH (FORMAT csv, HEADER true);

COPY public.wiki_structured_sections (id,group_id,user_id,section_key,content,position,created_at,updated_at)
  FROM '/tmp/csv/wiki_structured_sections.csv' WITH (FORMAT csv, HEADER true);

-- Прочее
COPY public.chat_link_tokens (code,group_id,channel,created_by,created_at,expires_at)
  FROM '/tmp/csv/chat_link_tokens.csv' WITH (FORMAT csv, HEADER true);

SET session_replication_role = 'origin';

-- Итоговая проверка
SELECT tablename,
  (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM public.%I', tablename), false, true, '')))[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

COMMIT;
