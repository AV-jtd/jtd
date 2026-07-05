-- ============================================================
-- LIVE PUBLIC SCHEMA DDL (reconstructed from pg_catalog)
-- Generated: 2026-07-05T21:29:56Z
-- Source DB: postgres
-- ============================================================

-- ========== EXTENSIONS ==========
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgmq WITH SCHEMA pgmq;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ========== ENUM / COMPOSITE TYPES ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'consultant', 'director');
CREATE TYPE public.kanban_board_type AS ENUM ('personal', 'project', 'smart');

-- ========== TABLES ==========
CREATE TABLE public.admin_mode_state (
  user_id uuid NOT NULL,
  admin_disabled boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.ai_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  context_type text DEFAULT 'assistant'::text NOT NULL,
  context_id text,
  title text,
  messages jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.calendar_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.chat_link_tokens (
  code text NOT NULL,
  group_id uuid NOT NULL,
  channel text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL
);
CREATE TABLE public.chat_read_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  thread_id text NOT NULL,
  last_read_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.client_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  manager_id uuid,
  group_id uuid,
  tag_id uuid,
  territory_tag_id uuid,
  retail_type_tag_id uuid,
  rank_tag_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.client_team (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text,
  added_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  tag_id uuid,
  group_id uuid,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  manager_id uuid,
  city text,
  territory_tag_id uuid,
  retail_type_tag_id uuid,
  rank_tag_id uuid,
  logo_url text,
  website text
);
CREATE TABLE public.contractors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  organization text,
  contact_name text,
  email text,
  phone text,
  notes text,
  color text DEFAULT '#f59e0b'::text,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.dashboard_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
  title text DEFAULT 'Отчёт по портфелю'::text NOT NULL,
  report_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  ai_summary text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL
);
CREATE TABLE public.decision_clients (
  decision_id uuid NOT NULL,
  client_id uuid NOT NULL
);
CREATE TABLE public.decision_projects (
  decision_id uuid NOT NULL,
  group_id uuid NOT NULL
);
CREATE TABLE public.decision_tags (
  decision_id uuid NOT NULL,
  tag_id uuid NOT NULL
);
CREATE TABLE public.decision_viewers (
  decision_id uuid NOT NULL,
  user_id uuid NOT NULL
);
CREATE TABLE public.decisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  protocol_id uuid NOT NULL,
  source_task_id uuid,
  title text NOT NULL,
  body text,
  decided_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  superseded_by uuid,
  visibility text DEFAULT 'protocol'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.department_directors (
  director_user_id uuid NOT NULL,
  department_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);
CREATE TABLE public.departments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6366f1'::text,
  icon text DEFAULT 'building-2'::text,
  head_user_id uuid,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  parent_department_id uuid
);
CREATE TABLE public.email_send_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id text,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.email_send_state (
  id integer DEFAULT 1 NOT NULL,
  retry_after_until timestamp with time zone,
  batch_size integer DEFAULT 10 NOT NULL,
  send_delay_ms integer DEFAULT 200 NOT NULL,
  auth_email_ttl_minutes integer DEFAULT 15 NOT NULL,
  transactional_email_ttl_minutes integer DEFAULT 60 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.email_unsubscribe_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  used_at timestamp with time zone
);
CREATE TABLE public.group_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  role text DEFAULT 'participant'::text NOT NULL
);
CREATE TABLE public.group_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid,
  reply_to uuid,
  content text NOT NULL,
  source text DEFAULT 'web'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  external_author text,
  external_message_id text
);
CREATE TABLE public.group_tags (
  group_id uuid NOT NULL,
  tag_id uuid NOT NULL
);
CREATE TABLE public.kanban_boards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  icon text DEFAULT 'LayoutGrid'::text NOT NULL,
  owner_id uuid NOT NULL,
  board_type kanban_board_type DEFAULT 'personal'::kanban_board_type NOT NULL,
  group_id uuid,
  filter_json jsonb,
  group_by text,
  is_archived boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.kanban_card_positions (
  board_id uuid NOT NULL,
  task_id uuid NOT NULL,
  column_id uuid NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.kanban_columns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  board_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3B82F6'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  wip_limit integer,
  status_value text,
  mapping_json jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.max_link_tokens (
  token text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL
);
CREATE TABLE public.message_reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_type text NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.messenger_list_context (
  channel text NOT NULL,
  external_id text NOT NULL,
  user_id uuid NOT NULL,
  task_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  push_task_assigned boolean DEFAULT true NOT NULL,
  push_task_completed boolean DEFAULT true NOT NULL,
  push_task_commented boolean DEFAULT false NOT NULL,
  push_deadline_approaching boolean DEFAULT false NOT NULL,
  push_added_to_group boolean DEFAULT false NOT NULL,
  telegram_task_assigned boolean DEFAULT false NOT NULL,
  telegram_task_completed boolean DEFAULT false NOT NULL,
  telegram_task_commented boolean DEFAULT false NOT NULL,
  telegram_deadline_approaching boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  push_task_participant_added boolean DEFAULT true NOT NULL,
  push_new_task_in_group boolean DEFAULT false NOT NULL,
  telegram_task_participant_added boolean DEFAULT false NOT NULL,
  telegram_added_to_group boolean DEFAULT false NOT NULL,
  telegram_new_task_in_group boolean DEFAULT false NOT NULL,
  push_task_delegated boolean DEFAULT true NOT NULL,
  telegram_task_delegated boolean DEFAULT false NOT NULL,
  telegram_weekly_report boolean DEFAULT false NOT NULL,
  telegram_weekly_ai_review boolean DEFAULT true NOT NULL,
  telegram_group_chat_message boolean DEFAULT false NOT NULL,
  push_user_mentioned boolean DEFAULT true NOT NULL,
  telegram_user_mentioned boolean DEFAULT false NOT NULL,
  max_task_assigned boolean DEFAULT false NOT NULL,
  max_task_completed boolean DEFAULT false NOT NULL,
  max_task_commented boolean DEFAULT false NOT NULL,
  max_deadline_approaching boolean DEFAULT false NOT NULL,
  max_group_chat_message boolean DEFAULT false NOT NULL
);
CREATE TABLE public.npd_card_positions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  gate_key text NOT NULL,
  group_id uuid NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.profile_audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  changed_by uuid,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  action text DEFAULT 'update'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text,
  email text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  telegram_username text,
  work_email text,
  telegram_chat_id bigint,
  username text,
  is_approved boolean DEFAULT false NOT NULL,
  organization text,
  department_id uuid,
  contractor_id uuid,
  client_id uuid,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  max_user_id bigint,
  max_chat_id bigint
);
CREATE TABLE public.project_folder_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  folder_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_folders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text,
  icon text DEFAULT 'folder'::text,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.project_milestones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  planned_date timestamp with time zone NOT NULL,
  actual_date timestamp with time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  color text DEFAULT '#3b82f6'::text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  gate_key text,
  "position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.protocol_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '📋'::text,
  is_system boolean DEFAULT false NOT NULL,
  system_key text,
  required_axes text[] DEFAULT ARRAY[]::text[] NOT NULL,
  optional_axes text[] DEFAULT ARRAY[]::text[] NOT NULL,
  default_columns jsonb DEFAULT '[]'::jsonb NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.report_pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid,
  user_id uuid NOT NULL,
  title text DEFAULT 'Новый отчёт'::text NOT NULL,
  blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
  cover_color text DEFAULT '#3b82f6'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.stm_structure_nodes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  flow text NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.subtasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  title text NOT NULL,
  is_completed boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  deadline timestamp with time zone,
  assigned_to uuid
);
CREATE TABLE public.suppressed_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  reason text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.tag_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tag_id uuid NOT NULL,
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.tag_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text,
  "position" integer DEFAULT 0 NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  parent_id uuid,
  is_system boolean DEFAULT false NOT NULL,
  system_key text,
  icon text
);
CREATE TABLE public.tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  category_id uuid
);
CREATE TABLE public.task_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  kind text DEFAULT 'message'::text NOT NULL,
  meta jsonb,
  reply_to uuid
);
CREATE TABLE public.task_dependencies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  predecessor_id uuid NOT NULL,
  successor_id uuid NOT NULL,
  dependency_type text DEFAULT 'FS'::text NOT NULL,
  lag_days integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid NOT NULL,
  predecessor_entity_type text DEFAULT 'task'::text NOT NULL,
  successor_entity_type text DEFAULT 'task'::text NOT NULL
);
CREATE TABLE public.task_group_linked_tags (
  group_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid
);
CREATE TABLE public.task_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3b82f6'::text,
  icon text DEFAULT 'list'::text,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  linked_tag_id uuid,
  parent_id uuid,
  description text,
  project_type text DEFAULT 'standard'::text NOT NULL,
  closed_at timestamp with time zone,
  baseline_status text DEFAULT 'planning'::text NOT NULL,
  baseline_approver_id uuid,
  baseline_locked_at timestamp with time zone,
  baseline_auto_lock_hours integer DEFAULT 48 NOT NULL,
  draft_status text DEFAULT 'published'::text NOT NULL,
  protocol_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
  logo_url text,
  project_subtype text,
  stm_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
  archive_comment text,
  view_mode text DEFAULT 'container'::text NOT NULL,
  telegram_group_chat_id bigint,
  max_group_chat_id text,
  chat_mirror_enabled boolean DEFAULT true NOT NULL,
  client_id uuid
);
CREATE TABLE public.task_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'participant'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.task_step_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  steps jsonb DEFAULT '[]'::jsonb NOT NULL,
  group_id uuid,
  is_global boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.task_tags (
  task_id uuid NOT NULL,
  tag_id uuid NOT NULL
);
CREATE TABLE public.tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  group_id uuid,
  title text NOT NULL,
  description text,
  deadline timestamp with time zone,
  is_completed boolean DEFAULT false NOT NULL,
  is_important boolean DEFAULT false NOT NULL,
  assigned_to uuid,
  "position" integer DEFAULT 0 NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  recurrence text,
  recurrence_end_date timestamp with time zone,
  parent_recurring_id uuid,
  priority smallint,
  original_deadline timestamp with time zone,
  deferred_until timestamp with time zone,
  task_type text DEFAULT 'standard'::text NOT NULL,
  client_id uuid,
  start_at timestamp with time zone,
  delegated_from uuid,
  requires_approval boolean DEFAULT false NOT NULL,
  approval_status text,
  closure_result text,
  closure_attachments jsonb DEFAULT '[]'::jsonb,
  source_protocol_id uuid,
  is_draft boolean DEFAULT false NOT NULL,
  external_ref text,
  external_assignee jsonb,
  status_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
  protocol_scope text DEFAULT 'external'::text NOT NULL,
  department_id uuid,
  contractor_id uuid,
  stage_key text,
  stm_flow text,
  follow_up_of uuid,
  stage_status text,
  rework_count integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.team_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.teams (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  invite_code text DEFAULT "substring"((gen_random_uuid())::text, 1, 8) NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.telegram_2fa_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  telegram_username text NOT NULL,
  code text NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
  verified boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.telegram_bot_chats (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  telegram_username text NOT NULL,
  chat_id bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.telegram_group_chats (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  telegram_chat_id bigint NOT NULL,
  telegram_chat_title text,
  group_id uuid NOT NULL,
  linked_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.telegram_pending_context (
  id integer DEFAULT nextval('telegram_pending_context_id_seq'::regclass) NOT NULL,
  chat_id bigint NOT NULL,
  user_id uuid NOT NULL,
  context_type text DEFAULT 'spisok'::text NOT NULL,
  group_id uuid,
  group_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  template_key text,
  protocol_name text,
  awaiting_axis text,
  collected_axes jsonb DEFAULT '{}'::jsonb NOT NULL,
  parsed_payload jsonb,
  raw_messages jsonb DEFAULT '[]'::jsonb NOT NULL,
  last_message_at timestamp with time zone
);
CREATE TABLE public.user_departments (
  user_id uuid NOT NULL,
  department_id uuid NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL
);
CREATE TABLE public.user_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  setting_key text NOT NULL,
  setting_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.vapid_keys (
  id integer DEFAULT 1 NOT NULL,
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.weekly_send_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_type text NOT NULL,
  chat_id bigint NOT NULL,
  recipient_id uuid,
  week_start date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.wiki_pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid,
  user_id uuid NOT NULL,
  parent_page_id uuid,
  title text DEFAULT 'Новая страница'::text NOT NULL,
  content text DEFAULT ''::text,
  icon text DEFAULT '📄'::text,
  page_type text DEFAULT 'wiki'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.wiki_structured_sections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  section_key text NOT NULL,
  content text DEFAULT ''::text,
  "position" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ========== PRIMARY KEYS / UNIQUE / CHECK / FK ==========
ALTER TABLE public.admin_mode_state ADD CONSTRAINT admin_mode_state_pkey PRIMARY KEY (user_id);
ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.calendar_tokens ADD CONSTRAINT calendar_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_link_tokens ADD CONSTRAINT chat_link_tokens_pkey PRIMARY KEY (code);
ALTER TABLE public.chat_read_status ADD CONSTRAINT chat_read_status_pkey PRIMARY KEY (id);
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.client_team ADD CONSTRAINT client_team_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.contractors ADD CONSTRAINT contractors_pkey PRIMARY KEY (id);
ALTER TABLE public.dashboard_reports ADD CONSTRAINT dashboard_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.decision_clients ADD CONSTRAINT decision_clients_pkey PRIMARY KEY (decision_id, client_id);
ALTER TABLE public.decision_projects ADD CONSTRAINT decision_projects_pkey PRIMARY KEY (decision_id, group_id);
ALTER TABLE public.decision_tags ADD CONSTRAINT decision_tags_pkey PRIMARY KEY (decision_id, tag_id);
ALTER TABLE public.decision_viewers ADD CONSTRAINT decision_viewers_pkey PRIMARY KEY (decision_id, user_id);
ALTER TABLE public.decisions ADD CONSTRAINT decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.department_directors ADD CONSTRAINT department_directors_pkey PRIMARY KEY (director_user_id, department_id);
ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);
ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_pkey PRIMARY KEY (id);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.group_tags ADD CONSTRAINT group_tags_pkey PRIMARY KEY (group_id, tag_id);
ALTER TABLE public.kanban_boards ADD CONSTRAINT kanban_boards_pkey PRIMARY KEY (id);
ALTER TABLE public.kanban_card_positions ADD CONSTRAINT kanban_card_positions_pkey PRIMARY KEY (board_id, task_id);
ALTER TABLE public.kanban_columns ADD CONSTRAINT kanban_columns_pkey PRIMARY KEY (id);
ALTER TABLE public.max_link_tokens ADD CONSTRAINT max_link_tokens_pkey PRIMARY KEY (token);
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);
ALTER TABLE public.messenger_list_context ADD CONSTRAINT messenger_list_context_pkey PRIMARY KEY (channel, external_id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.npd_card_positions ADD CONSTRAINT npd_card_positions_pkey PRIMARY KEY (id);
ALTER TABLE public.profile_audit_log ADD CONSTRAINT profile_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.project_folder_items ADD CONSTRAINT project_folder_items_pkey PRIMARY KEY (id);
ALTER TABLE public.project_folders ADD CONSTRAINT project_folders_pkey PRIMARY KEY (id);
ALTER TABLE public.project_milestones ADD CONSTRAINT project_milestones_pkey PRIMARY KEY (id);
ALTER TABLE public.protocol_templates ADD CONSTRAINT protocol_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.report_pages ADD CONSTRAINT report_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.stm_structure_nodes ADD CONSTRAINT stm_structure_nodes_pkey PRIMARY KEY (id);
ALTER TABLE public.subtasks ADD CONSTRAINT subtasks_pkey PRIMARY KEY (id);
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_pkey PRIMARY KEY (id);
ALTER TABLE public.tag_access ADD CONSTRAINT tag_access_pkey PRIMARY KEY (id);
ALTER TABLE public.tag_categories ADD CONSTRAINT tag_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);
ALTER TABLE public.task_group_linked_tags ADD CONSTRAINT task_group_linked_tags_pkey PRIMARY KEY (group_id, tag_id);
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.task_participants ADD CONSTRAINT task_participants_pkey PRIMARY KEY (id);
ALTER TABLE public.task_step_templates ADD CONSTRAINT task_step_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.task_tags ADD CONSTRAINT task_tags_pkey PRIMARY KEY (task_id, tag_id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);
ALTER TABLE public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE public.telegram_2fa_codes ADD CONSTRAINT telegram_2fa_codes_pkey PRIMARY KEY (id);
ALTER TABLE public.telegram_bot_chats ADD CONSTRAINT telegram_bot_chats_pkey PRIMARY KEY (id);
ALTER TABLE public.telegram_group_chats ADD CONSTRAINT telegram_group_chats_pkey PRIMARY KEY (id);
ALTER TABLE public.telegram_pending_context ADD CONSTRAINT telegram_pending_context_pkey PRIMARY KEY (id);
ALTER TABLE public.user_departments ADD CONSTRAINT user_departments_pkey PRIMARY KEY (user_id, department_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.vapid_keys ADD CONSTRAINT vapid_keys_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_send_log ADD CONSTRAINT weekly_send_log_pkey PRIMARY KEY (id);
ALTER TABLE public.wiki_pages ADD CONSTRAINT wiki_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.wiki_structured_sections ADD CONSTRAINT wiki_structured_sections_pkey PRIMARY KEY (id);
ALTER TABLE public.calendar_tokens ADD CONSTRAINT calendar_tokens_token_key UNIQUE (token);
ALTER TABLE public.calendar_tokens ADD CONSTRAINT calendar_tokens_user_id_key UNIQUE (user_id);
ALTER TABLE public.chat_read_status ADD CONSTRAINT chat_read_status_user_id_thread_id_key UNIQUE (user_id, thread_id);
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_user_client_uniq UNIQUE (user_id, client_id);
ALTER TABLE public.client_team ADD CONSTRAINT client_team_client_id_user_id_key UNIQUE (client_id, user_id);
ALTER TABLE public.dashboard_reports ADD CONSTRAINT dashboard_reports_token_key UNIQUE (token);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);
ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_token_key UNIQUE (token);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_unique UNIQUE (message_type, message_id, user_id, emoji);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);
ALTER TABLE public.npd_card_positions ADD CONSTRAINT npd_card_positions_user_id_gate_key_group_id_key UNIQUE (user_id, gate_key, group_id);
ALTER TABLE public.project_folder_items ADD CONSTRAINT project_folder_items_user_id_group_id_key UNIQUE (user_id, group_id);
ALTER TABLE public.protocol_templates ADD CONSTRAINT protocol_templates_system_key_unique UNIQUE (user_id, system_key);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_email_key UNIQUE (email);
ALTER TABLE public.tag_access ADD CONSTRAINT tag_access_tag_id_user_id_key UNIQUE (tag_id, user_id);
ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_predecessor_id_successor_id_key UNIQUE (predecessor_id, successor_id);
ALTER TABLE public.task_participants ADD CONSTRAINT task_participants_task_id_user_id_key UNIQUE (task_id, user_id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);
ALTER TABLE public.teams ADD CONSTRAINT teams_invite_code_key UNIQUE (invite_code);
ALTER TABLE public.telegram_bot_chats ADD CONSTRAINT telegram_bot_chats_telegram_username_key UNIQUE (telegram_username);
ALTER TABLE public.telegram_group_chats ADD CONSTRAINT telegram_group_chats_telegram_chat_id_key UNIQUE (telegram_chat_id);
ALTER TABLE public.telegram_pending_context ADD CONSTRAINT telegram_pending_context_chat_id_key UNIQUE (chat_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_setting_key_key UNIQUE (user_id, setting_key);
ALTER TABLE public.weekly_send_log ADD CONSTRAINT weekly_send_log_unique UNIQUE (report_type, chat_id, week_start);
ALTER TABLE public.wiki_structured_sections ADD CONSTRAINT wiki_structured_sections_group_id_section_key_key UNIQUE (group_id, section_key);
ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])));
ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_id_check CHECK ((id = 1));
ALTER TABLE public.group_members ADD CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['assignee'::text, 'participant'::text, 'viewer'::text])));
ALTER TABLE public.kanban_boards ADD CONSTRAINT kanban_boards_project_has_group CHECK (((board_type <> 'project'::kanban_board_type) OR (group_id IS NOT NULL)));
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_type_check CHECK ((message_type = ANY (ARRAY['task_comment'::text, 'group_message'::text])));
ALTER TABLE public.stm_structure_nodes ADD CONSTRAINT stm_structure_nodes_field_check CHECK ((field = ANY (ARRAY['retailer'::text, 'brand'::text, 'drop'::text, 'project'::text])));
ALTER TABLE public.stm_structure_nodes ADD CONSTRAINT stm_structure_nodes_flow_check CHECK ((flow = ANY (ARRAY['in'::text, 'out'::text])));
ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'bounce'::text, 'complaint'::text])));
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_kind_check CHECK ((kind = ANY (ARRAY['message'::text, 'system'::text, 'log'::text])));
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_draft_status_check CHECK ((draft_status = ANY (ARRAY['draft'::text, 'published'::text])));
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_view_mode_check CHECK ((view_mode = ANY (ARRAY['container'::text, 'lens'::text])));
ALTER TABLE public.task_participants ADD CONSTRAINT task_participants_role_check CHECK ((role = ANY (ARRAY['assignee'::text, 'participant'::text, 'creator'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_protocol_scope_check CHECK ((protocol_scope = ANY (ARRAY['external'::text, 'internal'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_stage_status_check CHECK (((stage_status IS NULL) OR (stage_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'blocked'::text, 'done'::text]))));
ALTER TABLE public.vapid_keys ADD CONSTRAINT vapid_keys_id_check CHECK ((id = 1));
ALTER TABLE public.chat_link_tokens ADD CONSTRAINT chat_link_tokens_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_rank_tag_id_fkey FOREIGN KEY (rank_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_retail_type_tag_id_fkey FOREIGN KEY (retail_type_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.client_assignments ADD CONSTRAINT client_assignments_territory_tag_id_fkey FOREIGN KEY (territory_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.client_team ADD CONSTRAINT client_team_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_rank_tag_id_fkey FOREIGN KEY (rank_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_retail_type_tag_id_fkey FOREIGN KEY (retail_type_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_territory_tag_id_fkey FOREIGN KEY (territory_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.decision_clients ADD CONSTRAINT decision_clients_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.decision_clients ADD CONSTRAINT decision_clients_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE;
ALTER TABLE public.decision_projects ADD CONSTRAINT decision_projects_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE;
ALTER TABLE public.decision_projects ADD CONSTRAINT decision_projects_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.decision_tags ADD CONSTRAINT decision_tags_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE;
ALTER TABLE public.decision_tags ADD CONSTRAINT decision_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE public.decision_viewers ADD CONSTRAINT decision_viewers_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES decisions(id) ON DELETE CASCADE;
ALTER TABLE public.decisions ADD CONSTRAINT decisions_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.decisions ADD CONSTRAINT decisions_source_task_id_fkey FOREIGN KEY (source_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE public.decisions ADD CONSTRAINT decisions_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES decisions(id) ON DELETE SET NULL;
ALTER TABLE public.department_directors ADD CONSTRAINT department_directors_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE public.departments ADD CONSTRAINT departments_parent_department_id_fkey FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES group_messages(id) ON DELETE SET NULL;
ALTER TABLE public.group_tags ADD CONSTRAINT group_tags_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_tags ADD CONSTRAINT group_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE public.kanban_boards ADD CONSTRAINT kanban_boards_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.kanban_card_positions ADD CONSTRAINT kanban_card_positions_board_id_fkey FOREIGN KEY (board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE;
ALTER TABLE public.kanban_card_positions ADD CONSTRAINT kanban_card_positions_column_id_fkey FOREIGN KEY (column_id) REFERENCES kanban_columns(id) ON DELETE CASCADE;
ALTER TABLE public.kanban_card_positions ADD CONSTRAINT kanban_card_positions_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public.kanban_columns ADD CONSTRAINT kanban_columns_board_id_fkey FOREIGN KEY (board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE;
ALTER TABLE public.npd_card_positions ADD CONSTRAINT npd_card_positions_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.project_folder_items ADD CONSTRAINT project_folder_items_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES project_folders(id) ON DELETE CASCADE;
ALTER TABLE public.project_folder_items ADD CONSTRAINT project_folder_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.project_milestones ADD CONSTRAINT project_milestones_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.report_pages ADD CONSTRAINT report_pages_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.stm_structure_nodes ADD CONSTRAINT stm_structure_nodes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subtasks ADD CONSTRAINT subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tag_access ADD CONSTRAINT tag_access_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE public.tag_categories ADD CONSTRAINT tag_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES tag_categories(id) ON DELETE CASCADE;
ALTER TABLE public.tags ADD CONSTRAINT tags_category_id_fkey FOREIGN KEY (category_id) REFERENCES tag_categories(id) ON DELETE SET NULL;
ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES task_comments(id) ON DELETE SET NULL;
ALTER TABLE public.task_comments ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_linked_tag_id_fkey FOREIGN KEY (linked_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.task_groups ADD CONSTRAINT task_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.task_participants ADD CONSTRAINT task_participants_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_step_templates ADD CONSTRAINT task_step_templates_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.task_step_templates ADD CONSTRAINT task_step_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.task_tags ADD CONSTRAINT task_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE public.task_tags ADD CONSTRAINT task_tags_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_follow_up_of_fkey FOREIGN KEY (follow_up_of) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_parent_recurring_id_fkey FOREIGN KEY (parent_recurring_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_source_protocol_id_fkey FOREIGN KEY (source_protocol_id) REFERENCES task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.telegram_group_chats ADD CONSTRAINT telegram_group_chats_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.telegram_pending_context ADD CONSTRAINT telegram_pending_context_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.user_departments ADD CONSTRAINT user_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.wiki_pages ADD CONSTRAINT wiki_pages_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.wiki_pages ADD CONSTRAINT wiki_pages_parent_page_id_fkey FOREIGN KEY (parent_page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE;
ALTER TABLE public.wiki_pages ADD CONSTRAINT wiki_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.wiki_structured_sections ADD CONSTRAINT wiki_structured_sections_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE CASCADE;
ALTER TABLE public.wiki_structured_sections ADD CONSTRAINT wiki_structured_sections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ========== INDEXES (non-constraint) ==========
CREATE INDEX idx_ai_conversations_user ON public.ai_conversations USING btree (user_id, updated_at DESC);
CREATE INDEX client_assignments_client_idx ON public.client_assignments USING btree (client_id);
CREATE INDEX client_assignments_user_idx ON public.client_assignments USING btree (user_id);
CREATE INDEX client_team_client_id_idx ON public.client_team USING btree (client_id);
CREATE UNIQUE INDEX clients_lower_name_uniq ON public.clients USING btree (lower(name));
CREATE UNIQUE INDEX contractors_user_name_lower_idx ON public.contractors USING btree (user_id, lower(name));
CREATE INDEX idx_decision_clients_client ON public.decision_clients USING btree (client_id);
CREATE INDEX idx_decision_projects_group ON public.decision_projects USING btree (group_id);
CREATE INDEX idx_decision_tags_tag ON public.decision_tags USING btree (tag_id);
CREATE INDEX idx_decision_viewers_user ON public.decision_viewers USING btree (user_id);
CREATE INDEX idx_decisions_protocol ON public.decisions USING btree (protocol_id);
CREATE INDEX idx_decisions_source_task ON public.decisions USING btree (source_task_id);
CREATE INDEX idx_decisions_user ON public.decisions USING btree (user_id);
CREATE INDEX idx_department_directors_dept ON public.department_directors USING btree (department_id);
CREATE INDEX idx_department_directors_user ON public.department_directors USING btree (director_user_id);
CREATE UNIQUE INDEX departments_user_name_lower_idx ON public.departments USING btree (user_id, lower(name));
CREATE INDEX idx_departments_parent ON public.departments USING btree (parent_department_id);
CREATE INDEX idx_email_send_log_created ON public.email_send_log USING btree (created_at DESC);
CREATE INDEX idx_email_send_log_message ON public.email_send_log USING btree (message_id);
CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);
CREATE INDEX idx_email_send_log_recipient ON public.email_send_log USING btree (recipient_email);
CREATE INDEX idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens USING btree (token);
CREATE INDEX idx_group_members_user ON public.group_members USING btree (user_id);
CREATE INDEX idx_group_members_user_id ON public.group_members USING btree (user_id);
CREATE INDEX idx_group_messages_created_at ON public.group_messages USING btree (group_id, created_at);
CREATE UNIQUE INDEX idx_group_messages_external_dedup ON public.group_messages USING btree (source, external_message_id) WHERE (external_message_id IS NOT NULL);
CREATE INDEX idx_group_messages_group_id ON public.group_messages USING btree (group_id);
CREATE INDEX idx_group_messages_reply_to ON public.group_messages USING btree (reply_to);
CREATE INDEX idx_kanban_boards_group ON public.kanban_boards USING btree (group_id) WHERE (group_id IS NOT NULL);
CREATE INDEX idx_kanban_boards_owner ON public.kanban_boards USING btree (owner_id);
CREATE INDEX idx_kanban_card_positions_column ON public.kanban_card_positions USING btree (column_id, "position");
CREATE INDEX idx_kanban_columns_board ON public.kanban_columns USING btree (board_id, "position");
CREATE INDEX idx_message_reactions_msg ON public.message_reactions USING btree (message_type, message_id);
CREATE INDEX idx_message_reactions_user ON public.message_reactions USING btree (user_id);
CREATE INDEX idx_profile_audit_profile_id ON public.profile_audit_log USING btree (profile_id, created_at DESC);
CREATE INDEX idx_profiles_client_id ON public.profiles USING btree (client_id);
CREATE INDEX idx_profiles_contractor_id ON public.profiles USING btree (contractor_id);
CREATE INDEX idx_profiles_department_id ON public.profiles USING btree (department_id);
CREATE UNIQUE INDEX idx_profiles_max_user_id ON public.profiles USING btree (max_user_id) WHERE (max_user_id IS NOT NULL);
CREATE UNIQUE INDEX idx_profiles_telegram_username ON public.profiles USING btree (telegram_username) WHERE (telegram_username IS NOT NULL);
CREATE INDEX profiles_deleted_at_idx ON public.profiles USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree (username) WHERE (username IS NOT NULL);
CREATE INDEX idx_project_folder_items_folder ON public.project_folder_items USING btree (folder_id);
CREATE INDEX idx_project_folder_items_user ON public.project_folder_items USING btree (user_id);
CREATE INDEX idx_project_folders_user ON public.project_folders USING btree (user_id);
CREATE INDEX idx_protocol_templates_system_key ON public.protocol_templates USING btree (system_key) WHERE (is_system = true);
CREATE INDEX idx_protocol_templates_user_id ON public.protocol_templates USING btree (user_id);
CREATE UNIQUE INDEX stm_structure_nodes_unique ON public.stm_structure_nodes USING btree (flow, field, lower(value));
CREATE INDEX idx_subtasks_task_id ON public.subtasks USING btree (task_id);
CREATE INDEX idx_suppressed_emails_email ON public.suppressed_emails USING btree (email);
CREATE INDEX idx_tag_access_user ON public.tag_access USING btree (user_id);
CREATE UNIQUE INDEX idx_tag_categories_user_system_key ON public.tag_categories USING btree (user_id, system_key) WHERE (system_key IS NOT NULL);
CREATE UNIQUE INDEX tags_system_category_name_uniq ON public.tags USING btree (category_id, lower(name));
CREATE INDEX task_comments_reply_to_idx ON public.task_comments USING btree (reply_to);
CREATE INDEX task_comments_task_kind_idx ON public.task_comments USING btree (task_id, kind, created_at DESC);
CREATE INDEX idx_tglt_group ON public.task_group_linked_tags USING btree (group_id);
CREATE INDEX idx_tglt_tag ON public.task_group_linked_tags USING btree (tag_id);
CREATE INDEX idx_task_groups_client_id ON public.task_groups USING btree (client_id) WHERE (client_id IS NOT NULL);
CREATE INDEX idx_task_groups_draft_status ON public.task_groups USING btree (draft_status) WHERE (draft_status = 'draft'::text);
CREATE UNIQUE INDEX idx_task_groups_max_group ON public.task_groups USING btree (max_group_chat_id) WHERE (max_group_chat_id IS NOT NULL);
CREATE INDEX idx_task_groups_parent ON public.task_groups USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX idx_task_groups_parent_id ON public.task_groups USING btree (parent_id);
CREATE INDEX idx_task_groups_project_type ON public.task_groups USING btree (project_type) WHERE (project_type = 'protocol'::text);
CREATE INDEX idx_task_groups_subtype ON public.task_groups USING btree (project_subtype) WHERE (project_subtype IS NOT NULL);
CREATE UNIQUE INDEX idx_task_groups_tg_group ON public.task_groups USING btree (telegram_group_chat_id) WHERE (telegram_group_chat_id IS NOT NULL);
CREATE INDEX idx_task_groups_user_id ON public.task_groups USING btree (user_id);
CREATE INDEX idx_task_groups_view_mode_linked_tag ON public.task_groups USING btree (view_mode, linked_tag_id) WHERE (view_mode = 'lens'::text);
CREATE UNIQUE INDEX uniq_npd_stream_subproject_per_parent ON public.task_groups USING btree (parent_id, name) WHERE ((project_type = 'npd'::text) AND (parent_id IS NOT NULL) AND (name = ANY (ARRAY['Продакт'::text, 'Реклама'::text, 'RnD'::text, 'СКК'::text, 'Производство'::text, 'Закупки'::text, 'Продажи'::text, 'Покупка оборудования'::text])));
CREATE UNIQUE INDEX uq_task_groups_crm_client ON public.task_groups USING btree (client_id) WHERE ((project_type = 'crm_client'::text) AND (client_id IS NOT NULL));
CREATE INDEX idx_task_participants_user ON public.task_participants USING btree (user_id);
CREATE UNIQUE INDEX task_participants_one_assignee_per_task ON public.task_participants USING btree (task_id) WHERE (role = 'assignee'::text);
CREATE UNIQUE INDEX task_participants_task_user_uniq ON public.task_participants USING btree (task_id, user_id);
CREATE INDEX idx_task_tags_tag ON public.task_tags USING btree (tag_id);
CREATE INDEX idx_task_tags_task ON public.task_tags USING btree (task_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to) WHERE (assigned_to IS NOT NULL);
CREATE INDEX idx_tasks_client_id ON public.tasks USING btree (client_id) WHERE (client_id IS NOT NULL);
CREATE INDEX idx_tasks_completed_at ON public.tasks USING btree (completed_at DESC) WHERE ((is_completed = true) AND (completed_at IS NOT NULL));
CREATE INDEX idx_tasks_completion_position ON public.tasks USING btree (is_completed, "position", created_at DESC);
CREATE INDEX idx_tasks_contractor_id ON public.tasks USING btree (contractor_id) WHERE (contractor_id IS NOT NULL);
CREATE INDEX idx_tasks_deferred_until ON public.tasks USING btree (deferred_until) WHERE (deferred_until IS NOT NULL);
CREATE INDEX idx_tasks_department ON public.tasks USING btree (department_id) WHERE (department_id IS NOT NULL);
CREATE INDEX idx_tasks_department_id ON public.tasks USING btree (department_id) WHERE (department_id IS NOT NULL);
CREATE INDEX idx_tasks_dept_inbox ON public.tasks USING btree (department_id, deadline) WHERE ((department_id IS NOT NULL) AND (assigned_to IS NULL) AND (is_completed = false));
CREATE INDEX idx_tasks_external_ref_group ON public.tasks USING btree (group_id, external_ref) WHERE (external_ref IS NOT NULL);
CREATE INDEX idx_tasks_global_no_stm ON public.tasks USING btree (is_completed, "position", created_at DESC) WHERE (task_type IS DISTINCT FROM 'stm_stage'::text);
CREATE INDEX idx_tasks_group_id ON public.tasks USING btree (group_id) WHERE (group_id IS NOT NULL);
CREATE INDEX idx_tasks_group_id_completed ON public.tasks USING btree (group_id, is_completed, "position") WHERE (group_id IS NOT NULL);
CREATE INDEX idx_tasks_is_draft ON public.tasks USING btree (is_draft) WHERE (is_draft = true);
CREATE INDEX idx_tasks_linked_project ON public.tasks USING btree (((status_meta ->> 'linked_project_id'::text))) WHERE (status_meta ? 'linked_project_id'::text);
CREATE INDEX idx_tasks_source_protocol_id ON public.tasks USING btree (source_protocol_id) WHERE (source_protocol_id IS NOT NULL);
CREATE INDEX idx_tasks_source_protocol_scope ON public.tasks USING btree (source_protocol_id, protocol_scope) WHERE (source_protocol_id IS NOT NULL);
CREATE INDEX idx_tasks_stage ON public.tasks USING btree (group_id, stage_key) WHERE (stage_key IS NOT NULL);
CREATE INDEX idx_tasks_stm_flow ON public.tasks USING btree (stm_flow) WHERE (stm_flow IS NOT NULL);
CREATE INDEX idx_tasks_task_type ON public.tasks USING btree (task_type) WHERE (task_type <> 'standard'::text);
CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id);
CREATE INDEX tasks_contractor_id_idx ON public.tasks USING btree (contractor_id) WHERE (contractor_id IS NOT NULL);
CREATE INDEX tasks_department_id_idx ON public.tasks USING btree (department_id) WHERE (department_id IS NOT NULL);
CREATE INDEX tasks_follow_up_of_idx ON public.tasks USING btree (follow_up_of) WHERE (follow_up_of IS NOT NULL);
CREATE UNIQUE INDEX uniq_protocol_review_per_user ON public.tasks USING btree (source_protocol_id, assigned_to) WHERE ((task_type = 'protocol_review'::text) AND (assigned_to IS NOT NULL));
CREATE INDEX idx_telegram_pending_context_awaiting_buffer ON public.telegram_pending_context USING btree (last_message_at) WHERE (awaiting_axis = '__buffer__'::text);
CREATE INDEX idx_telegram_pending_context_chat ON public.telegram_pending_context USING btree (chat_id);
CREATE INDEX idx_user_departments_dept ON public.user_departments USING btree (department_id);
CREATE UNIQUE INDEX idx_user_departments_one_primary ON public.user_departments USING btree (user_id) WHERE (is_primary = true);
CREATE INDEX idx_user_departments_user ON public.user_departments USING btree (user_id);
CREATE INDEX idx_user_departments_user_id ON public.user_departments USING btree (user_id);
CREATE INDEX idx_user_roles_user_role ON public.user_roles USING btree (user_id, role);

-- ========== ENABLE ROW LEVEL SECURITY ==========
ALTER TABLE public.admin_mode_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_directors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.max_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_list_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npd_card_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stm_structure_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_group_linked_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_step_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_2fa_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_bot_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_pending_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vapid_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_structured_sections ENABLE ROW LEVEL SECURITY;

-- ========== RLS POLICIES ==========
CREATE POLICY "Users manage own admin mode" ON public.admin_mode_state AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own conversations" ON public.ai_conversations AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own calendar token" ON public.calendar_tokens AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own chat link tokens" ON public.chat_link_tokens AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = created_by))
  WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "Users manage own read status" ON public.chat_read_status AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to client_assignments" ON public.client_assignments AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on client_assignments" ON public.client_assignments AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Non-consultants view all assignments" ON public.client_assignments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own assignments" ON public.client_assignments AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins manage client team" ON public.client_team AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Non-consultants view client team" ON public.client_team AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Admins full access to clients" ON public.clients AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can create clients" ON public.clients AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT is_consultant(auth.uid())) AND (auth.uid() = user_id)));
CREATE POLICY "Consultant block on clients" ON public.clients AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can view group clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
CREATE POLICY "Group owners can view group clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Non-consultants view all clients" ON public.clients AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Team can update clients" ON public.clients AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own clients" ON public.clients AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to contractors" ON public.contractors AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultants view own contractor" ON public.contractors AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_consultant(auth.uid()) AND (id = consultant_company(auth.uid()))));
CREATE POLICY "Non-consultants view contractors" ON public.contractors AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own contractors" ON public.contractors AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Consultant block on dashboard_reports" ON public.dashboard_reports AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own reports" ON public.dashboard_reports AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access decision_clients" ON public.decision_clients AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Author writes decision_clients" ON public.decision_clients AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_clients.decision_id) AND (d.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_clients.decision_id) AND (d.user_id = auth.uid())))));
CREATE POLICY "View decision_clients if can see decision" ON public.decision_clients AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_see_decision(decision_id, auth.uid()));
CREATE POLICY "Admins full access decision_projects" ON public.decision_projects AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Author writes decision_projects" ON public.decision_projects AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_projects.decision_id) AND (d.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_projects.decision_id) AND (d.user_id = auth.uid())))));
CREATE POLICY "View decision_projects if can see decision" ON public.decision_projects AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_see_decision(decision_id, auth.uid()));
CREATE POLICY "Admins full access decision_tags" ON public.decision_tags AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Author writes decision_tags" ON public.decision_tags AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_tags.decision_id) AND (d.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_tags.decision_id) AND (d.user_id = auth.uid())))));
CREATE POLICY "View decision_tags if can see decision" ON public.decision_tags AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_see_decision(decision_id, auth.uid()));
CREATE POLICY "Admins full access decision_viewers" ON public.decision_viewers AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Author writes decision_viewers" ON public.decision_viewers AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_viewers.decision_id) AND (d.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_viewers.decision_id) AND (d.user_id = auth.uid())))));
CREATE POLICY "Viewers see own viewer rows" ON public.decision_viewers AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM decisions d
  WHERE ((d.id = decision_viewers.decision_id) AND (d.user_id = auth.uid()))))));
CREATE POLICY "Admins full access decisions" ON public.decisions AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated insert own decision" ON public.decisions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Author deletes own decision" ON public.decisions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY "Author updates own decision" ON public.decisions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Consultant block decisions" ON public.decisions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "View decisions if allowed" ON public.decisions AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_see_decision(id, auth.uid()));
CREATE POLICY "Admins manage department_directors" ON public.department_directors AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Non-consultants view department_directors" ON public.department_directors AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Admins full access to departments" ON public.departments AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Non-consultants view departments" ON public.departments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own departments" ON public.departments AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Service role can insert send log" ON public.email_send_log AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read send log" ON public.email_send_log AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can update send log" ON public.email_send_log AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can manage send state" ON public.email_send_state AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Admins full access to group members" ON public.group_members AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on group_members" ON public.group_members AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Members can add members" ON public.group_members AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_group_member(group_id, auth.uid()));
CREATE POLICY "Members can view fellow group members" ON public.group_members AS PERMISSIVE FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Owners can add members" ON public.group_members AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can remove members" ON public.group_members AS PERMISSIVE FOR DELETE TO public
  USING (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can update member roles" ON public.group_members AS PERMISSIVE FOR UPDATE TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can view group members" ON public.group_members AS PERMISSIVE FOR SELECT TO public
  USING (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Users can view own memberships" ON public.group_members AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Admins full access to group messages" ON public.group_messages AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on group_messages" ON public.group_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can insert messages" ON public.group_messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((is_group_member(group_id, auth.uid()) AND (auth.uid() = user_id)));
CREATE POLICY "Group members can view messages" ON public.group_messages AS PERMISSIVE FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Group owners manage messages" ON public.group_messages AS PERMISSIVE FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Parent group members can post in subgroup chats" ON public.group_messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((auth.uid() = user_id) AND is_message_in_parent_member_group(group_id, auth.uid())));
CREATE POLICY "Parent group members can view subgroup messages" ON public.group_messages AS PERMISSIVE FOR SELECT TO public
  USING (is_message_in_parent_member_group(group_id, auth.uid()));
CREATE POLICY "Team can post in STM SKU chats" ON public.group_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT is_consultant(auth.uid())) AND (auth.uid() = user_id) AND is_npd_stm_group(group_id)));
CREATE POLICY "Team can view STM SKU messages" ON public.group_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) AND is_npd_stm_group(group_id)));
CREATE POLICY "Users manage own messages" ON public.group_messages AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to group tags" ON public.group_tags AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on group_tags" ON public.group_tags AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Delegatees can view group tags" ON public.group_tags AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.group_id = group_tags.group_id) AND (t.assigned_to = auth.uid())))));
CREATE POLICY "Group members can view group tags" ON public.group_tags AS PERMISSIVE FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Group owners manage group tags" ON public.group_tags AS PERMISSIVE FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Parent members can view subgroup tags" ON public.group_tags AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM task_groups tg
  WHERE ((tg.id = group_tags.group_id) AND (tg.parent_id IS NOT NULL) AND is_group_member(tg.parent_id, auth.uid())))));
CREATE POLICY "Subgroup members can view parent group tags" ON public.group_tags AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM task_groups tg
  WHERE ((tg.parent_id = group_tags.group_id) AND is_group_member(tg.id, auth.uid())))));
CREATE POLICY "Task group owners can view group tags via ownership" ON public.group_tags AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM task_groups tg
  WHERE ((tg.id = group_tags.group_id) AND (tg.user_id = auth.uid())))));
CREATE POLICY "Admins full access kanban_boards" ON public.kanban_boards AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block kanban_boards" ON public.kanban_boards AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Owner manages smart boards" ON public.kanban_boards AS PERMISSIVE FOR ALL TO authenticated
  USING (((board_type = 'smart'::kanban_board_type) AND (auth.uid() = owner_id)))
  WITH CHECK (((board_type = 'smart'::kanban_board_type) AND (auth.uid() = owner_id)));
CREATE POLICY "Owners manage personal boards" ON public.kanban_boards AS PERMISSIVE FOR ALL TO authenticated
  USING (((board_type = 'personal'::kanban_board_type) AND (auth.uid() = owner_id)))
  WITH CHECK (((board_type = 'personal'::kanban_board_type) AND (auth.uid() = owner_id)));
CREATE POLICY "Project members view project boards" ON public.kanban_boards AS PERMISSIVE FOR SELECT TO authenticated
  USING (((board_type = 'project'::kanban_board_type) AND (group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
CREATE POLICY "Project owners manage project boards" ON public.kanban_boards AS PERMISSIVE FOR ALL TO authenticated
  USING (((board_type = 'project'::kanban_board_type) AND (group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())))
  WITH CHECK (((board_type = 'project'::kanban_board_type) AND (group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Admins full access kanban_card_positions" ON public.kanban_card_positions AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block kanban_card_positions" ON public.kanban_card_positions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Manage positions when board visible" ON public.kanban_card_positions AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM kanban_boards b
  WHERE ((b.id = kanban_card_positions.board_id) AND (((b.board_type = ANY (ARRAY['personal'::kanban_board_type, 'smart'::kanban_board_type])) AND (b.owner_id = auth.uid())) OR ((b.board_type = 'project'::kanban_board_type) AND (b.group_id IS NOT NULL) AND is_group_member(b.group_id, auth.uid())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM kanban_boards b
  WHERE ((b.id = kanban_card_positions.board_id) AND (((b.board_type = ANY (ARRAY['personal'::kanban_board_type, 'smart'::kanban_board_type])) AND (b.owner_id = auth.uid())) OR ((b.board_type = 'project'::kanban_board_type) AND (b.group_id IS NOT NULL) AND is_group_member(b.group_id, auth.uid())))))));
CREATE POLICY "Admins full access kanban_columns" ON public.kanban_columns AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block kanban_columns" ON public.kanban_columns AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Manage columns when can manage board" ON public.kanban_columns AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM kanban_boards b
  WHERE ((b.id = kanban_columns.board_id) AND (((b.board_type = ANY (ARRAY['personal'::kanban_board_type, 'smart'::kanban_board_type])) AND (b.owner_id = auth.uid())) OR ((b.board_type = 'project'::kanban_board_type) AND (b.group_id IS NOT NULL) AND is_group_owner(b.group_id, auth.uid())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM kanban_boards b
  WHERE ((b.id = kanban_columns.board_id) AND (((b.board_type = ANY (ARRAY['personal'::kanban_board_type, 'smart'::kanban_board_type])) AND (b.owner_id = auth.uid())) OR ((b.board_type = 'project'::kanban_board_type) AND (b.group_id IS NOT NULL) AND is_group_owner(b.group_id, auth.uid())))))));
CREATE POLICY "View columns when board visible" ON public.kanban_columns AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM kanban_boards b
  WHERE ((b.id = kanban_columns.board_id) AND (((b.board_type = ANY (ARRAY['personal'::kanban_board_type, 'smart'::kanban_board_type])) AND (b.owner_id = auth.uid())) OR ((b.board_type = 'project'::kanban_board_type) AND (b.group_id IS NOT NULL) AND is_group_member(b.group_id, auth.uid())))))));
CREATE POLICY "Users manage own max link tokens" ON public.max_link_tokens AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Consultant restriction on reactions" ON public.message_reactions AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR ((message_type = 'task_comment'::text) AND (EXISTS ( SELECT 1
   FROM task_comments tc
  WHERE ((tc.id = message_reactions.message_id) AND consultant_can_see_task(auth.uid(), tc.task_id)))))))
  WITH CHECK (((NOT is_consultant(auth.uid())) OR ((user_id = auth.uid()) AND (message_type = 'task_comment'::text) AND (EXISTS ( SELECT 1
   FROM task_comments tc
  WHERE ((tc.id = message_reactions.message_id) AND consultant_can_see_task(auth.uid(), tc.task_id)))))));
CREATE POLICY "Reactions visible to those who see the message" ON public.message_reactions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((message_type = 'task_comment'::text) AND (EXISTS ( SELECT 1
   FROM task_comments tc
  WHERE (tc.id = message_reactions.message_id)))) OR ((message_type = 'group_message'::text) AND (EXISTS ( SELECT 1
   FROM group_messages gm
  WHERE ((gm.id = message_reactions.message_id) AND is_group_member(gm.group_id, auth.uid())))))));
CREATE POLICY "Users add their own reactions" ON public.message_reactions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (((message_type = 'task_comment'::text) AND (EXISTS ( SELECT 1
   FROM task_comments tc
  WHERE (tc.id = message_reactions.message_id)))) OR ((message_type = 'group_message'::text) AND (EXISTS ( SELECT 1
   FROM group_messages gm
  WHERE ((gm.id = message_reactions.message_id) AND is_group_member(gm.group_id, auth.uid()))))))));
CREATE POLICY "Users delete their own reactions" ON public.message_reactions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users manage own preferences" ON public.notification_preferences AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to npd positions" ON public.npd_card_positions AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on npd_card_positions" ON public.npd_card_positions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own card positions" ON public.npd_card_positions AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins can insert audit log" ON public.profile_audit_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view audit log" ON public.profile_audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update any profile approval" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));
CREATE POLICY "Users can view profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_profile(id));
CREATE POLICY "Admins full access to folder items" ON public.project_folder_items AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on project_folder_items" ON public.project_folder_items AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own folder items" ON public.project_folder_items AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to project folders" ON public.project_folders AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on project_folders" ON public.project_folders AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own folders" ON public.project_folders AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to milestones" ON public.project_milestones AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on project_milestones" ON public.project_milestones AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can create milestones" ON public.project_milestones AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((is_group_member(group_id, auth.uid()) AND (auth.uid() = created_by)));
CREATE POLICY "Group members can view milestones" ON public.project_milestones AS PERMISSIVE FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Group owners manage milestones" ON public.project_milestones AS PERMISSIVE FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Milestone creators can update own milestones" ON public.project_milestones AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = created_by));
CREATE POLICY "Admins full access to protocol templates" ON public.protocol_templates AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on protocol_templates" ON public.protocol_templates AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users manage own protocol templates" ON public.protocol_templates AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to reports" ON public.report_pages AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on report_pages" ON public.report_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can view reports" ON public.report_pages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
CREATE POLICY "Group owners can delete reports" ON public.report_pages AS PERMISSIVE FOR DELETE TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Group owners can update reports" ON public.report_pages AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Group owners can view reports" ON public.report_pages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Users manage own reports" ON public.report_pages AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Authenticated can create stm structure nodes" ON public.stm_structure_nodes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Authenticated can delete stm structure nodes" ON public.stm_structure_nodes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);
CREATE POLICY "Authenticated can update stm structure nodes" ON public.stm_structure_nodes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Authenticated can view stm structure nodes" ON public.stm_structure_nodes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Admins full access to subtasks" ON public.subtasks AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant restriction on subtasks" ON public.subtasks AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)))
  WITH CHECK (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)));
CREATE POLICY "Group members can add subtasks to group tasks" ON public.subtasks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = subtasks.task_id) AND (t.group_id IS NOT NULL) AND (is_group_member(t.group_id, auth.uid()) OR is_group_owner(t.group_id, auth.uid()))))));
CREATE POLICY "Group members can delete subtasks of group tasks" ON public.subtasks AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = subtasks.task_id) AND (t.group_id IS NOT NULL) AND (is_group_member(t.group_id, auth.uid()) OR is_group_owner(t.group_id, auth.uid()))))));
CREATE POLICY "Group members can update subtasks of group tasks" ON public.subtasks AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = subtasks.task_id) AND (t.group_id IS NOT NULL) AND (is_group_member(t.group_id, auth.uid()) OR is_group_owner(t.group_id, auth.uid()))))));
CREATE POLICY "Internal attendees can delete draft protocol subtasks" ON public.subtasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));
CREATE POLICY "Internal attendees can edit draft protocol subtasks" ON public.subtasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));
CREATE POLICY "Internal attendees can insert draft protocol subtasks" ON public.subtasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));
CREATE POLICY "Internal attendees can update published protocol subtasks" ON public.subtasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), false))
  WITH CHECK (is_task_in_protocol_attendee_scope(task_id, auth.uid(), false));
CREATE POLICY "Parent group members can delete subgroup subtasks" ON public.subtasks AS PERMISSIVE FOR DELETE TO public
  USING (is_task_in_parent_member_group(task_id, auth.uid()));
CREATE POLICY "Parent group members can insert subgroup subtasks" ON public.subtasks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_task_in_parent_member_group(task_id, auth.uid()));
CREATE POLICY "Parent group members can update subgroup subtasks" ON public.subtasks AS PERMISSIVE FOR UPDATE TO public
  USING (is_task_in_parent_member_group(task_id, auth.uid()));
CREATE POLICY "Task participants can create subtasks" ON public.subtasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_task_participant(task_id, auth.uid()));
CREATE POLICY "Task participants can delete subtasks" ON public.subtasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_task_participant(task_id, auth.uid()));
CREATE POLICY "Task participants can update subtasks" ON public.subtasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_task_participant(task_id, auth.uid()));
CREATE POLICY "Users can see subtasks of visible tasks" ON public.subtasks AS PERMISSIVE FOR SELECT TO public
  USING (((assigned_to = auth.uid()) OR is_task_visible(task_id, auth.uid())));
CREATE POLICY "Users manage subtasks of own tasks" ON public.subtasks AS PERMISSIVE FOR ALL TO public
  USING (is_task_owner(task_id, auth.uid()))
  WITH CHECK (is_task_owner(task_id, auth.uid()));
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Admins full access to tag access" ON public.tag_access AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on tag_access" ON public.tag_access AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR (user_id = auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Tag owners can grant access" ON public.tag_access AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tags t
  WHERE ((t.id = tag_access.tag_id) AND (t.user_id = auth.uid())))));
CREATE POLICY "Tag owners can revoke access" ON public.tag_access AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM tags t
  WHERE ((t.id = tag_access.tag_id) AND (t.user_id = auth.uid())))));
CREATE POLICY "Tag owners can view access" ON public.tag_access AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM tags t
  WHERE ((t.id = tag_access.tag_id) AND (t.user_id = auth.uid())))));
CREATE POLICY "Users can view own tag access" ON public.tag_access AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Admins full access to tag categories" ON public.tag_categories AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can create tag categories" ON public.tag_categories AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Consultants view own tag categories" ON public.tag_categories AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_consultant(auth.uid()) AND (user_id = auth.uid())));
CREATE POLICY "Creators can delete own tag categories" ON public.tag_categories AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY "Creators can update own tag categories" ON public.tag_categories AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY "Non-consultants view tag categories" ON public.tag_categories AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Admins full access to tags" ON public.tags AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can create tags" ON public.tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Consultants view own/visible tags" ON public.tags AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_consultant(auth.uid()) AND ((user_id = auth.uid()) OR consultant_can_see_tag(auth.uid(), id))));
CREATE POLICY "Creators can delete own tags" ON public.tags AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY "Creators can update own tags" ON public.tags AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY "Non-consultants view all tags" ON public.tags AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Admins full access to task comments" ON public.task_comments AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Comment authors can manage own comments" ON public.task_comments AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Consultant restriction on comments" ON public.task_comments AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)))
  WITH CHECK (((NOT is_consultant(auth.uid())) OR ((auth.uid() = user_id) AND consultant_can_see_task(auth.uid(), task_id))));
CREATE POLICY "Group members can add comments" ON public.task_comments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((auth.uid() = user_id) AND is_task_in_member_group(task_id, auth.uid())));
CREATE POLICY "Group members can view task comments" ON public.task_comments AS PERMISSIVE FOR SELECT TO public
  USING (is_task_in_member_group(task_id, auth.uid()));
CREATE POLICY "Internal attendees can comment on protocol tasks" ON public.task_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND is_task_in_protocol_attendee_scope(task_id, auth.uid(), false)));
CREATE POLICY "Internal attendees can view protocol task comments" ON public.task_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), false));
CREATE POLICY "Parent group members can add subgroup task comments" ON public.task_comments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((auth.uid() = user_id) AND is_task_in_parent_member_group(task_id, auth.uid())));
CREATE POLICY "Parent group members can view subgroup task comments" ON public.task_comments AS PERMISSIVE FOR SELECT TO public
  USING (is_task_in_parent_member_group(task_id, auth.uid()));
CREATE POLICY "Supervisors can view subordinate task comments in shared groups" ON public.task_comments AS PERMISSIVE FOR SELECT TO public
  USING (is_supervisor_task_in_shared_group(task_id, auth.uid()));
CREATE POLICY "Task owners can manage comments" ON public.task_comments AS PERMISSIVE FOR ALL TO public
  USING (is_task_owner(task_id, auth.uid()))
  WITH CHECK (is_task_owner(task_id, auth.uid()));
CREATE POLICY "Task participants can add comments" ON public.task_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND is_task_participant(task_id, auth.uid())));
CREATE POLICY "Task participants can view comments" ON public.task_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_task_participant(task_id, auth.uid()));
CREATE POLICY "Admins full access to dependencies" ON public.task_dependencies AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant restriction on dependencies" ON public.task_dependencies AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR (((predecessor_entity_type <> 'task'::text) OR consultant_can_see_task(auth.uid(), predecessor_id)) AND ((successor_entity_type <> 'task'::text) OR consultant_can_see_task(auth.uid(), successor_id)) AND (predecessor_entity_type = 'task'::text) AND (successor_entity_type = 'task'::text))));
CREATE POLICY "Users can create dependencies for own/group tasks" ON public.task_dependencies AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((auth.uid() = created_by) AND (((predecessor_entity_type = 'task'::text) AND (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_dependencies.predecessor_id) AND ((tasks.user_id = auth.uid()) OR ((tasks.group_id IS NOT NULL) AND (is_group_owner(tasks.group_id, auth.uid()) OR is_group_member(tasks.group_id, auth.uid())))))))) OR ((predecessor_entity_type = 'milestone'::text) AND (EXISTS ( SELECT 1
   FROM project_milestones
  WHERE ((project_milestones.id = task_dependencies.predecessor_id) AND (is_group_owner(project_milestones.group_id, auth.uid()) OR is_group_member(project_milestones.group_id, auth.uid()) OR (project_milestones.created_by = auth.uid())))))) OR ((predecessor_entity_type = 'project'::text) AND (EXISTS ( SELECT 1
   FROM task_groups
  WHERE ((task_groups.id = task_dependencies.predecessor_id) AND ((task_groups.user_id = auth.uid()) OR is_group_member(task_groups.id, auth.uid())))))))));
CREATE POLICY "Users can delete dependencies they created" ON public.task_dependencies AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = created_by));
CREATE POLICY "Users can update dependencies they created" ON public.task_dependencies AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = created_by))
  WITH CHECK ((auth.uid() = created_by));
CREATE POLICY "Users can view dependencies for accessible tasks" ON public.task_dependencies AS PERMISSIVE FOR SELECT TO public
  USING (can_access_dependency(id, auth.uid()));
CREATE POLICY "Admins full access to linked tags" ON public.task_group_linked_tags AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on linked tags" ON public.task_group_linked_tags AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can view linked tags" ON public.task_group_linked_tags AS PERMISSIVE FOR SELECT TO public
  USING ((is_group_member(group_id, auth.uid()) OR is_group_owner(group_id, auth.uid())));
CREATE POLICY "Group owners manage linked tags" ON public.task_group_linked_tags AS PERMISSIVE FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can manage linked tags via task_groups" ON public.task_group_linked_tags AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM task_groups tg
  WHERE ((tg.id = task_group_linked_tags.group_id) AND (tg.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM task_groups tg
  WHERE ((tg.id = task_group_linked_tags.group_id) AND (tg.user_id = auth.uid())))));
CREATE POLICY "Admins full access to task groups" ON public.task_groups AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant restriction on groups" ON public.task_groups AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_group(auth.uid(), id) OR (user_id = auth.uid())));
CREATE POLICY "Consultant restriction on groups delete" ON public.task_groups AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR (user_id = auth.uid())));
CREATE POLICY "Consultant restriction on groups update" ON public.task_groups AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR (user_id = auth.uid())));
CREATE POLICY "Consultant restriction on groups write" ON public.task_groups AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT is_consultant(auth.uid())) OR (user_id = auth.uid())));
CREATE POLICY "Delegatees can view task groups" ON public.task_groups AS PERMISSIVE FOR SELECT TO public
  USING (is_delegatee_in_group(id, auth.uid()));
CREATE POLICY "Internal attendees can edit protocol draft" ON public.task_groups AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_protocol_internal_attendee(id, auth.uid()) AND (draft_status = 'draft'::text)))
  WITH CHECK (is_protocol_internal_attendee(id, auth.uid()));
CREATE POLICY "Internal attendees can view protocol" ON public.task_groups AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_protocol_internal_attendee(id, auth.uid()));
CREATE POLICY "Members can view joined groups" ON public.task_groups AS PERMISSIVE FOR SELECT TO public
  USING (is_group_member(id, auth.uid()));
CREATE POLICY "Members can view subgroups of joined groups" ON public.task_groups AS PERMISSIVE FOR SELECT TO public
  USING (((parent_id IS NOT NULL) AND is_full_group_member(parent_id, auth.uid())));
CREATE POLICY "Owners can manage subgroups" ON public.task_groups AS PERMISSIVE FOR ALL TO public
  USING (((parent_id IS NOT NULL) AND is_subgroup_owner(parent_id, auth.uid())))
  WITH CHECK (((parent_id IS NOT NULL) AND is_subgroup_owner(parent_id, auth.uid())));
CREATE POLICY "Owners can view own groups" ON public.task_groups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Subgroup members can view parent group" ON public.task_groups AS PERMISSIVE FOR SELECT TO public
  USING (is_parent_of_member_group(id, auth.uid()));
CREATE POLICY "Users manage own groups" ON public.task_groups AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to task participants" ON public.task_participants AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant restriction on participants" ON public.task_participants AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)));
CREATE POLICY "Group members can manage task participants in group" ON public.task_participants AS PERMISSIVE FOR ALL TO public
  USING (is_task_in_user_group(task_id, auth.uid()))
  WITH CHECK (is_task_in_user_group(task_id, auth.uid()));
CREATE POLICY "Group members can view task participants in group" ON public.task_participants AS PERMISSIVE FOR SELECT TO public
  USING (is_task_in_member_group(task_id, auth.uid()));
CREATE POLICY "Parent group members can manage subgroup task participants" ON public.task_participants AS PERMISSIVE FOR ALL TO public
  USING (is_task_in_parent_member_group(task_id, auth.uid()))
  WITH CHECK (is_task_in_parent_member_group(task_id, auth.uid()));
CREATE POLICY "Supervisors can view subordinate task participants in shared gr" ON public.task_participants AS PERMISSIVE FOR SELECT TO public
  USING (is_supervisor_task_in_shared_group(task_id, auth.uid()));
CREATE POLICY "Task owners manage participants" ON public.task_participants AS PERMISSIVE FOR ALL TO public
  USING (is_task_owner(task_id, auth.uid()))
  WITH CHECK (is_task_owner(task_id, auth.uid()));
CREATE POLICY "Users can view own participation" ON public.task_participants AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Admins full access to step templates" ON public.task_step_templates AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Group members can view group templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
CREATE POLICY "Group owners can view group templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Users can view global templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_global = true));
CREATE POLICY "Users manage own templates" ON public.task_step_templates AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to task tags" ON public.task_tags AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant restriction on task_tags" ON public.task_tags AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)));
CREATE POLICY "Group members can manage task tags in group" ON public.task_tags AS PERMISSIVE FOR ALL TO public
  USING (is_task_in_user_group(task_id, auth.uid()))
  WITH CHECK (is_task_in_user_group(task_id, auth.uid()));
CREATE POLICY "Parent group members can manage subgroup task tags" ON public.task_tags AS PERMISSIVE FOR ALL TO public
  USING (is_task_in_parent_member_group(task_id, auth.uid()))
  WITH CHECK (is_task_in_parent_member_group(task_id, auth.uid()));
CREATE POLICY "Task participants can view task tags" ON public.task_tags AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_task_participant(task_id, auth.uid()));
CREATE POLICY "Users manage task_tags of own tasks" ON public.task_tags AS PERMISSIVE FOR ALL TO public
  USING (is_task_owner(task_id, auth.uid()))
  WITH CHECK (is_task_owner(task_id, auth.uid()));
CREATE POLICY "Admins full access to tasks" ON public.tasks AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant restriction on tasks" ON public.tasks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), id)));
CREATE POLICY "Consultant restriction on tasks delete" ON public.tasks AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR (auth.uid() = user_id)));
CREATE POLICY "Consultant restriction on tasks update" ON public.tasks AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), id)));
CREATE POLICY "Consultant restriction on tasks write" ON public.tasks AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT is_consultant(auth.uid())) OR (auth.uid() = user_id)));
CREATE POLICY "Delegatees can update tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = assigned_to));
CREATE POLICY "Department members can take department tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((department_id IS NOT NULL) AND user_belongs_to_department(auth.uid(), department_id)))
  WITH CHECK ((user_belongs_to_department(auth.uid(), department_id) OR (assigned_to = auth.uid())));
CREATE POLICY "Group members can create tasks in group" ON public.tasks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid()) AND (user_id = auth.uid())));
CREATE POLICY "Group members can update group tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
CREATE POLICY "Group owners can delete group tasks" ON public.tasks AS PERMISSIVE FOR DELETE TO public
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Group owners can update group tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Internal attendees can delete draft protocol tasks" ON public.tasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid()) AND is_protocol_draft(group_id)));
CREATE POLICY "Internal attendees can edit draft protocol tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid()) AND is_protocol_draft(group_id)))
  WITH CHECK (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid())));
CREATE POLICY "Internal attendees can insert draft protocol tasks" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid()) AND is_protocol_draft(group_id) AND (user_id = auth.uid())));
CREATE POLICY "Internal attendees can update published protocol tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid())))
  WITH CHECK (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid())));
CREATE POLICY "Owners manage tasks" ON public.tasks AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Parent group members can create subgroup tasks" ON public.tasks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((group_id IS NOT NULL) AND (user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM task_groups tg
  WHERE ((tg.id = tasks.group_id) AND (tg.parent_id IS NOT NULL) AND is_full_group_member(tg.parent_id, auth.uid()))))));
CREATE POLICY "Parent group members can update subgroup tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (((group_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM task_groups tg
  WHERE ((tg.id = tasks.group_id) AND (tg.parent_id IS NOT NULL) AND is_full_group_member(tg.parent_id, auth.uid()))))));
CREATE POLICY "Parent group owners can delete subgroup tasks" ON public.tasks AS PERMISSIVE FOR DELETE TO public
  USING (((group_id IS NOT NULL) AND is_subgroup_of_owner_group(group_id, auth.uid())));
CREATE POLICY "Parent group owners can update subgroup tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (((group_id IS NOT NULL) AND is_subgroup_of_owner_group(group_id, auth.uid())));
CREATE POLICY "Task participants can update tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_task_participant(id, auth.uid()));
CREATE POLICY "Users can see visible tasks" ON public.tasks AS PERMISSIVE FOR SELECT TO public
  USING (is_task_visible(id, auth.uid()));
CREATE POLICY "Consultant block on team_members" ON public.team_members AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Directors can manage members" ON public.team_members AS PERMISSIVE FOR ALL TO authenticated
  USING (is_team_director(team_id, auth.uid()))
  WITH CHECK (is_team_director(team_id, auth.uid()));
CREATE POLICY "Members can view team members" ON public.team_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_team_member(team_id, auth.uid()));
CREATE POLICY "Users can add self as member" ON public.team_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can leave team" ON public.team_members AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Consultant block on teams" ON public.teams AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Creators can view own teams" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated
  USING ((created_by = auth.uid()));
CREATE POLICY "Directors can delete teams" ON public.teams AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_team_director(id, auth.uid()));
CREATE POLICY "Directors can update teams" ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_team_director(id, auth.uid()));
CREATE POLICY "Members can view teams" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_team_member(id, auth.uid()));
CREATE POLICY "Users can create teams" ON public.teams AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "No public access to 2fa codes" ON public.telegram_2fa_codes AS PERMISSIVE FOR ALL TO public
  USING (false)
  WITH CHECK (false);
CREATE POLICY "Group owners can manage links" ON public.telegram_group_chats AS PERMISSIVE FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Users can view links for own groups" ON public.telegram_group_chats AS PERMISSIVE FOR SELECT TO public
  USING ((is_group_owner(group_id, auth.uid()) OR is_group_member(group_id, auth.uid())));
CREATE POLICY "Admins manage user_departments" ON public.user_departments AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Non-consultants view all user_departments" ON public.user_departments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users view own departments" ON public.user_departments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins can manage roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR (auth.uid() = user_id)));
CREATE POLICY "First user can self-assign admin" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (role = 'admin'::app_role) AND (NOT admin_exists())));
CREATE POLICY "Users can manage their own settings" ON public.user_settings AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admins full access to wiki pages" ON public.wiki_pages AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on wiki_pages" ON public.wiki_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can create wiki pages" ON public.wiki_pages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((is_group_member(group_id, auth.uid()) AND (auth.uid() = user_id)));
CREATE POLICY "Group members can delete own wiki pages" ON public.wiki_pages AS PERMISSIVE FOR DELETE TO public
  USING ((is_group_member(group_id, auth.uid()) AND (auth.uid() = user_id)));
CREATE POLICY "Group members can update wiki pages" ON public.wiki_pages AS PERMISSIVE FOR UPDATE TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Group members can view wiki pages" ON public.wiki_pages AS PERMISSIVE FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Group owners manage wiki pages" ON public.wiki_pages AS PERMISSIVE FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Parent group members can view wiki pages" ON public.wiki_pages AS PERMISSIVE FOR SELECT TO public
  USING (is_subgroup_of_member_group(group_id, auth.uid()));
CREATE POLICY "Task collaborators can create wiki pages in group" ON public.wiki_pages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((group_id IS NOT NULL) AND (auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.group_id = wiki_pages.group_id) AND ((t.user_id = auth.uid()) OR (t.assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
           FROM task_participants tp
          WHERE ((tp.task_id = t.id) AND (tp.user_id = auth.uid()))))))))));
CREATE POLICY "Task collaborators can view wiki pages in group" ON public.wiki_pages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.group_id = wiki_pages.group_id) AND ((t.user_id = auth.uid()) OR (t.assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
           FROM task_participants tp
          WHERE ((tp.task_id = t.id) AND (tp.user_id = auth.uid()))))))))));
CREATE POLICY "Users can create personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can delete personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR DELETE TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can update personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can view personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Admins full access to wiki sections" ON public.wiki_structured_sections AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Consultant block on wiki_structured_sections" ON public.wiki_structured_sections AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can create structured sections" ON public.wiki_structured_sections AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((is_group_member(group_id, auth.uid()) AND (auth.uid() = user_id)));
CREATE POLICY "Group members can update structured sections" ON public.wiki_structured_sections AS PERMISSIVE FOR UPDATE TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Group members can view structured sections" ON public.wiki_structured_sections AS PERMISSIVE FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));
CREATE POLICY "Group owners manage structured sections" ON public.wiki_structured_sections AS PERMISSIVE FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
CREATE POLICY "Parent group members can view structured sections" ON public.wiki_structured_sections AS PERMISSIVE FOR SELECT TO public
  USING (is_subgroup_of_member_group(group_id, auth.uid()));

-- ========== FUNCTIONS ==========
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.admin_soft_delete_user(target_user_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_exists()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  IF public.has_role(target_user_id, 'admin') THEN
    RAISE EXCEPTION 'Cannot delete another administrator';
  END IF;

  INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
  VALUES (target_user_id, auth.uid(), '__deleted__', 'exists', NULL, 'hard_delete');

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_restore_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _deleted_by uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can restore users';
  END IF;

  SELECT deleted_by INTO _deleted_by
  FROM public.profiles
  WHERE id = target_user_id AND deleted_at IS NOT NULL;

  IF _deleted_by IS NULL THEN
    -- Либо не удалён, либо нет такого профиля — выходим
    RETURN;
  END IF;

  -- Право на восстановление: тот, кто удалил, ИЛИ real-admin
  -- (real-admin определяется как admin с выключенной симуляцией админ-режима).
  IF _deleted_by <> auth.uid()
     AND COALESCE((SELECT admin_disabled FROM public.admin_mode_state WHERE user_id = auth.uid()), false) = true
  THEN
     RAISE EXCEPTION 'Only the admin who deleted this user, or a real admin, can restore them';
  END IF;

  INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
  VALUES (target_user_id, auth.uid(), 'deleted_at', 'deleted', NULL, 'restore');

  UPDATE public.profiles
     SET deleted_at = NULL,
         deleted_by = NULL,
         is_approved = true
   WHERE id = target_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_users_department(user_ids uuid[], dept_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can perform bulk operations';
  END IF;

  UPDATE public.profiles
     SET department_id = dept_id
   WHERE id = ANY(user_ids);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  IF public.has_role(target_user_id, 'admin') THEN
    RAISE EXCEPTION 'Cannot delete another administrator';
  END IF;

  -- Идемпотентность: если уже удалён — выходим тихо
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND deleted_at IS NOT NULL) THEN
    RETURN;
  END IF;

  -- Аудит
  INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
  VALUES (target_user_id, auth.uid(), 'deleted_at', NULL, now()::text, 'soft_delete');

  -- Помечаем + снимаем одобрение, чтобы на вход его не пустило
  UPDATE public.profiles
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         is_approved = false
   WHERE id = target_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_project_tag_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cat_id uuid;
BEGIN
  IF NEW.linked_tag_id IS NOT NULL THEN
    SELECT id INTO _cat_id FROM public.tag_categories
    WHERE user_id = NEW.user_id AND name = 'Проекты' AND parent_id IS NULL
    LIMIT 1;
    
    IF _cat_id IS NOT NULL THEN
      UPDATE public.tags SET category_id = _cat_id WHERE id = NEW.linked_tag_id AND category_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_set_source_protocol()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Только если source_protocol_id ещё не задан и есть group_id
  IF NEW.source_protocol_id IS NULL AND NEW.group_id IS NOT NULL THEN
    -- Проверяем, является ли группа протоколом
    IF EXISTS (
      SELECT 1 FROM public.task_groups
      WHERE id = NEW.group_id AND project_type = 'protocol'
    ) THEN
      NEW.source_protocol_id := NEW.group_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.task_dependencies td
    WHERE td.id = _dep_id
    AND (
      -- Task access
      (td.predecessor_entity_type = 'task' AND EXISTS (
        SELECT 1 FROM public.tasks t WHERE t.id = td.predecessor_id AND (
          t.user_id = _user_id
          OR (t.group_id IS NOT NULL AND (is_group_owner(t.group_id, _user_id) OR is_group_member(t.group_id, _user_id)))
        )
      ))
      OR (td.successor_entity_type = 'task' AND EXISTS (
        SELECT 1 FROM public.tasks t WHERE t.id = td.successor_id AND (
          t.user_id = _user_id
          OR (t.group_id IS NOT NULL AND (is_group_owner(t.group_id, _user_id) OR is_group_member(t.group_id, _user_id)))
        )
      ))
      -- Milestone access
      OR (td.predecessor_entity_type = 'milestone' AND EXISTS (
        SELECT 1 FROM public.project_milestones m WHERE m.id = td.predecessor_id AND (
          is_group_owner(m.group_id, _user_id) OR is_group_member(m.group_id, _user_id) OR m.created_by = _user_id
        )
      ))
      OR (td.successor_entity_type = 'milestone' AND EXISTS (
        SELECT 1 FROM public.project_milestones m WHERE m.id = td.successor_id AND (
          is_group_owner(m.group_id, _user_id) OR is_group_member(m.group_id, _user_id) OR m.created_by = _user_id
        )
      ))
      -- Project access
      OR (td.predecessor_entity_type = 'project' AND EXISTS (
        SELECT 1 FROM public.task_groups g WHERE g.id = td.predecessor_id AND (
          g.user_id = _user_id OR is_group_member(g.id, _user_id)
        )
      ))
      OR (td.successor_entity_type = 'project' AND EXISTS (
        SELECT 1 FROM public.task_groups g WHERE g.id = td.successor_id AND (
          g.user_id = _user_id OR is_group_member(g.id, _user_id)
        )
      ))
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
BEGIN
  SELECT id, user_id, protocol_id, visibility
    INTO d
    FROM public.decisions
   WHERE id = _decision_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF d.user_id = _user_id THEN RETURN true; END IF;
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;
  IF public.is_consultant(_user_id) THEN RETURN false; END IF;

  IF d.visibility = 'protocol' THEN
    -- Anyone who can see the protocol group
    IF public.is_group_member(d.protocol_id, _user_id)
       OR public.is_group_owner(d.protocol_id, _user_id) THEN
      RETURN true;
    END IF;
    -- Or a meeting attendee of the protocol (internal_attendees)
    IF public.is_protocol_internal_attendee(d.protocol_id, _user_id) THEN
      RETURN true;
    END IF;
    -- Or attached as participant in any task of the protocol
    IF EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_participants tp ON tp.task_id = t.id
      WHERE t.group_id = d.protocol_id AND tp.user_id = _user_id
    ) THEN RETURN true; END IF;
    -- Or any of the linked projects is visible to the user
    IF EXISTS (
      SELECT 1 FROM public.decision_projects dp
      WHERE dp.decision_id = d.id
        AND (public.is_group_member(dp.group_id, _user_id)
             OR public.is_group_owner(dp.group_id, _user_id))
    ) THEN RETURN true; END IF;
    RETURN false;
  END IF;

  IF d.visibility = 'restricted' THEN
    IF EXISTS (
      SELECT 1 FROM public.decision_viewers dv
      WHERE dv.decision_id = d.id AND dv.user_id = _user_id
    ) THEN RETURN true; END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_task(_user_id uuid, _task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND public.can_see_task_row(
        _user_id, t.user_id, t.assigned_to, t.id, t.group_id, t.department_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_groups uuid[];
  v_depts uuid[];
  v_extra uuid[];
  v_subs uuid[];
  v_protos uuid[];
BEGIN
  -- Самые дешёвые сравнения первыми (без вызовов функций)
  IF _task_user_id = _user_id THEN RETURN TRUE; END IF;
  IF _task_assigned_to = _user_id THEN RETURN TRUE; END IF;
  
  -- Кешированные массивы
  v_groups := public.user_visible_groups_arr(_user_id);
  IF _task_group_id IS NOT NULL AND _task_group_id = ANY(v_groups) THEN RETURN TRUE; END IF;
  
  v_depts := public.user_visible_depts_arr(_user_id);
  IF _task_department_id IS NOT NULL AND _task_department_id = ANY(v_depts) THEN RETURN TRUE; END IF;
  
  v_extra := public.user_extra_tasks_arr(_user_id);
  IF _task_id = ANY(v_extra) THEN RETURN TRUE; END IF;
  
  v_subs := public.user_subordinates_arr(_user_id);
  IF _task_group_id IS NOT NULL 
     AND _task_user_id = ANY(v_subs) 
     AND _task_group_id = ANY(v_groups) THEN RETURN TRUE; END IF;
  
  v_protos := public.user_protocol_groups_arr(_user_id);
  IF _task_group_id IS NOT NULL AND _task_group_id = ANY(v_protos) THEN RETURN TRUE; END IF;
  
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_profile(_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    auth.uid() = _profile_id
    OR (NOT public.is_consultant(auth.uid()))
    OR (public.is_consultant(auth.uid()) AND public.consultant_can_see_user(auth.uid(), _profile_id))
    OR public.is_supervisor_of_user(auth.uid(), _profile_id)
    OR EXISTS (
      SELECT 1 FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid() AND gm2.user_id = _profile_id
    )
    OR EXISTS (
      SELECT 1 FROM public.task_participants tp1
      JOIN public.task_participants tp2 ON tp1.task_id = tp2.task_id
      WHERE tp1.user_id = auth.uid() AND tp2.user_id = _profile_id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm1
      JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = _profile_id
    )
    OR _profile_id IN (SELECT public.delegation_profile_ids(auth.uid()));
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- User created the tag
    SELECT 1 FROM public.tags WHERE id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- User has explicit tag_access
    SELECT 1 FROM public.tag_access WHERE tag_id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- Tag is used on a task in a group the user owns or is member of
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND t.group_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.task_groups tg WHERE tg.id = t.group_id AND tg.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = _user_id)
    )
  ) OR EXISTS (
    -- Tag is used on a task owned by or assigned to the user
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND (t.user_id = _user_id OR t.assigned_to = _user_id)
  ) OR EXISTS (
    -- Tag is linked to a group the user owns or is member of
    SELECT 1 FROM public.task_groups tg
    WHERE tg.linked_tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  ) OR EXISTS (
    -- Tag is assigned to a group (group_tags) the user owns or is member of
    SELECT 1 FROM public.group_tags gt
    JOIN public.task_groups tg ON tg.id = gt.group_id
    WHERE gt.tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.check_department_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d int := 1;
  cur uuid;
BEGIN
  IF NEW.parent_department_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_department_id = NEW.id THEN
    RAISE EXCEPTION 'Department cannot be its own parent';
  END IF;

  -- Проверка глубины и циклов
  cur := NEW.parent_department_id;
  WHILE cur IS NOT NULL LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'Cycle detected in department hierarchy';
    END IF;
    d := d + 1;
    IF d > 3 THEN
      RAISE EXCEPTION 'Department hierarchy depth cannot exceed 3 levels (Дирекция → Отдел → Подотдел)';
    END IF;
    SELECT parent_department_id INTO cur FROM public.departments WHERE id = cur;
  END LOOP;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.task_participants tp
      ON tp.task_id = t.id AND tp.user_id = _user_id
    WHERE t.group_id = _group_id
      AND (
        t.user_id = _user_id
        OR t.assigned_to = _user_id
        OR tp.user_id IS NOT NULL
        OR (
          t.contractor_id IS NOT NULL
          AND t.contractor_id = public.consultant_company(_user_id)
        )
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tags WHERE id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.task_tags tt
    WHERE tt.tag_id = _tag_id
      AND public.consultant_can_see_task(_user_id, tt.task_id)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.task_participants tp
      ON tp.task_id = t.id AND tp.user_id = _user_id
    WHERE t.id = _task_id
      AND (
        t.user_id = _user_id
        OR t.assigned_to = _user_id
        OR tp.user_id IS NOT NULL
        OR (
          t.contractor_id IS NOT NULL
          AND t.contractor_id = public.consultant_company(_user_id)
        )
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _viewer = _target
    OR EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.profiles other ON other.id = _target
      WHERE me.id = _viewer
        AND me.contractor_id IS NOT NULL
        AND me.contractor_id = other.contractor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.task_participants tp1
      JOIN public.task_participants tp2 ON tp2.task_id = tp1.task_id
      WHERE tp1.user_id = _viewer AND tp2.user_id = _target
    )
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_company(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT contractor_id FROM public.profiles WHERE id = _user_id
$function$
;

CREATE OR REPLACE FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _task_id IS NULL OR _protocol_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.task_tags (task_id, tag_id)
  SELECT _task_id, gt.tag_id
  FROM public.group_tags gt
  JOIN public.tags t ON t.id = gt.tag_id
  JOIN public.tag_categories tc ON tc.id = t.category_id
  WHERE gt.group_id = _protocol_id
    AND tc.is_system = true
    AND tc.system_key = ANY (public.protocol_copyable_system_keys())
  ON CONFLICT DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_default_kanban_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.kanban_columns (board_id, name, color, position, mapping_json) VALUES
    (NEW.id, 'Входящие',   '#94A3B8', 0, NULL),
    (NEW.id, 'В работе',   '#3B82F6', 1, NULL),
    (NEW.id, 'На проверке','#F59E0B', 2, NULL),
    (NEW.id, 'Готово',     '#10B981', 3, jsonb_build_object('is_completed', true));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.debug_user_visible_groups(_user_id uuid)
 RETURNS TABLE(group_id uuid, group_name text, parent_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Set the JWT claims to impersonate the user
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  
  RETURN QUERY
  SELECT tg.id, tg.name, tg.parent_id
  FROM task_groups tg
  ORDER BY tg.position;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decisions_set_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- Always force author to authenticated user (prevents spoofing)
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delegation_profile_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT assigned_to FROM public.tasks
   WHERE user_id = _user_id AND assigned_to IS NOT NULL
  UNION
  SELECT user_id FROM public.tasks
   WHERE assigned_to = _user_id AND user_id IS NOT NULL
$function$
;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pgmq', 'public'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.department_depth(_dept_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d int := 1;
  cur uuid := _dept_id;
  parent uuid;
BEGIN
  LOOP
    SELECT parent_department_id INTO parent FROM public.departments WHERE id = cur;
    EXIT WHEN parent IS NULL;
    d := d + 1;
    cur := parent;
    IF d > 10 THEN
      RAISE EXCEPTION 'Department hierarchy cycle or too deep';
    END IF;
  END LOOP;
  RETURN d;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_assignee_exclusivity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Если изменился assigned_to и стал не-null → снимаем отдел/подрядчика
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    NEW.department_id := NULL;
    NEW.contractor_id := NULL;
  END IF;

  -- Если поставили department_id → снимаем подрядчика
  IF NEW.department_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.department_id IS DISTINCT FROM OLD.department_id) THEN
    NEW.contractor_id := NULL;
    -- assigned_to НЕ снимаем автоматически: задача может быть и на сотруднике, и в контексте отдела.
    -- Но для воркфлоу «взять» это решает приложение, а не триггер.
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pgmq', 'public'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_protocol_review_task(_protocol_id uuid, _assignee uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _protocol record;
  _deadline timestamptz;
BEGIN
  IF _assignee IS NULL OR _protocol_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, name, user_id, draft_status, project_type
    INTO _protocol
    FROM public.task_groups
   WHERE id = _protocol_id;

  -- Только для черновых протоколов
  IF _protocol.id IS NULL
     OR _protocol.project_type <> 'protocol'
     OR _protocol.draft_status <> 'draft' THEN
    RETURN;
  END IF;

  -- Срок: завтра 18:00 локального серверного времени
  _deadline := date_trunc('day', now() + interval '1 day') + interval '18 hours';

  INSERT INTO public.tasks (
    user_id, title, description, deadline, assigned_to,
    task_type, source_protocol_id, group_id, is_draft
  )
  VALUES (
    _protocol.user_id,
    'Изучить, доработать протокол: ' || _protocol.name,
    'Черновик протокола ожидает вашего ознакомления и правок до публикации.',
    _deadline,
    _assignee,
    'protocol_review',
    _protocol.id,
    NULL,
    false
  )
  ON CONFLICT (source_protocol_id, assigned_to)
    WHERE task_type = 'protocol_review' AND assigned_to IS NOT NULL
  DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_department_descendants(_dept_id uuid)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE tree AS (
    SELECT d.id FROM public.departments d WHERE d.id = _dept_id
    UNION ALL
    SELECT d.id FROM public.departments d
    JOIN tree t ON d.parent_department_id = t.id
  )
  SELECT id FROM tree
$function$
;

CREATE OR REPLACE FUNCTION public.get_group_task_stats(_group_ids uuid[])
 RETURNS TABLE(group_id uuid, total integer, completed integer, active integer, overdue integer, drift integer, upcoming_7d integer, last_completed_at timestamp with time zone, earliest_start timestamp with time zone, max_drift_days integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ids AS (
    SELECT unnest(_group_ids) AS gid
  ),
  base AS (
    SELECT
      ids.gid AS group_id,
      t.id,
      t.is_completed,
      t.deadline,
      t.original_deadline,
      t.completed_at,
      t.start_at
    FROM ids
    LEFT JOIN tasks t
      ON t.group_id = ids.gid
     AND COALESCE(t.is_draft, false) = false
     AND t.task_type <> 'stm_stage'
  )
  SELECT
    b.group_id,
    COALESCE(COUNT(b.id), 0)::integer AS total,
    COALESCE(COUNT(*) FILTER (WHERE b.is_completed), 0)::integer AS completed,
    COALESCE(COUNT(*) FILTER (WHERE NOT b.is_completed), 0)::integer AS active,
    COALESCE(COUNT(*) FILTER (
      WHERE NOT b.is_completed
        AND b.deadline IS NOT NULL
        AND b.deadline < now()
    ), 0)::integer AS overdue,
    COALESCE(COUNT(*) FILTER (
      WHERE b.original_deadline IS NOT NULL
        AND b.deadline IS NOT NULL
        AND b.original_deadline <> b.deadline
    ), 0)::integer AS drift,
    COALESCE(COUNT(*) FILTER (
      WHERE NOT b.is_completed
        AND b.deadline IS NOT NULL
        AND b.deadline >= now()
        AND b.deadline <= (now() + interval '7 days')
    ), 0)::integer AS upcoming_7d,
    MAX(b.completed_at) FILTER (WHERE b.is_completed) AS last_completed_at,
    LEAST(MIN(b.start_at), MIN(b.deadline)) AS earliest_start,
    COALESCE(
      (
        SELECT (EXTRACT(EPOCH FROM (b2.deadline - b2.original_deadline)) / 86400)::integer
        FROM base b2
        WHERE b2.group_id = b.group_id
          AND b2.original_deadline IS NOT NULL
          AND b2.deadline IS NOT NULL
          AND b2.original_deadline <> b2.deadline
        ORDER BY ABS(EXTRACT(EPOCH FROM (b2.deadline - b2.original_deadline))) DESC
        LIMIT 1
      ),
      0
    )::integer AS max_drift_days
  FROM base b
  GROUP BY b.group_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_auth_meta()
 RETURNS TABLE(is_approved boolean, is_admin boolean, is_consultant boolean, admin_disabled boolean, no_admins_exist boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((
      SELECT p.is_approved
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ), false) AS is_approved,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    ) AS is_admin,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'consultant'
    ) AS is_consultant,
    COALESCE((
      SELECT ams.admin_disabled
      FROM public.admin_mode_state ams
      WHERE ams.user_id = auth.uid()
    ), false) AS admin_disabled,
    NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.role = 'admin'
    ) AS no_admins_exist
  WHERE auth.uid() IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_profile_approval()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT is_approved FROM public.profiles WHERE id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.get_unread_threads()
 RETURNS TABLE(thread_id text, last_message_at timestamp with time zone, unread_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid)
  SELECT
    'group-' || gm.group_id::text AS thread_id,
    MAX(gm.created_at)            AS last_message_at,
    COUNT(*)::int                 AS unread_count
  FROM public.group_messages gm
  JOIN me ON true
  LEFT JOIN public.chat_read_status crs
    ON crs.user_id = me.uid
   AND crs.thread_id = 'group-' || gm.group_id::text
  WHERE gm.user_id <> me.uid
    AND (crs.last_read_at IS NULL OR gm.created_at > crs.last_read_at)
    AND (
      public.has_role(me.uid, 'admin'::app_role)
      OR public.is_group_owner(gm.group_id, me.uid)
      OR public.is_group_member(gm.group_id, me.uid)
      OR public.is_message_in_parent_member_group(gm.group_id, me.uid)
    )
  GROUP BY gm.group_id

  UNION ALL

  SELECT
    'task-' || tc.task_id::text   AS thread_id,
    MAX(tc.created_at)            AS last_message_at,
    COUNT(*)::int                 AS unread_count
  FROM public.task_comments tc
  JOIN me ON true
  LEFT JOIN public.chat_read_status crs
    ON crs.user_id = me.uid
   AND crs.thread_id = 'task-' || tc.task_id::text
  WHERE tc.user_id <> me.uid
    AND COALESCE(tc.kind, 'message') <> 'log'
    AND (crs.last_read_at IS NULL OR tc.created_at > crs.last_read_at)
    AND (
      public.has_role(me.uid, 'admin'::app_role)
      OR public.is_task_owner(tc.task_id, me.uid)
      OR public.is_task_participant(tc.task_id, me.uid)
      OR public.is_task_in_user_group(tc.task_id, me.uid)
      OR public.is_task_in_member_group(tc.task_id, me.uid)
      OR public.is_task_in_parent_member_group(tc.task_id, me.uid)
      OR public.is_task_in_parent_owner_group(tc.task_id, me.uid)
      OR public.is_task_in_protocol_attendee_scope(tc.task_id, me.uid, false)
      OR public.is_supervisor_task_in_shared_group(tc.task_id, me.uid)
    )
  GROUP BY tc.task_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_departments(_user_id uuid)
 RETURNS TABLE(department_id uuid, is_primary boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT department_id, is_primary
  FROM public.user_departments
  WHERE user_id = _user_id
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_visible_departments(_user_id uuid)
 RETURNS TABLE(department_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Отделы, где user — head: всё поддерево
  SELECT desc_id FROM public.departments d
  CROSS JOIN LATERAL public.get_department_descendants(d.id) AS sub(desc_id)
  WHERE d.head_user_id = _user_id

  UNION

  -- Отделы, где user — явный куратор: всё поддерево
  SELECT desc_id FROM public.department_directors dd
  CROSS JOIN LATERAL public.get_department_descendants(dd.department_id) AS sub(desc_id)
  WHERE dd.director_user_id = _user_id

  UNION

  -- Свои основные/доп отделы (для всех)
  SELECT department_id FROM public.user_departments WHERE user_id = _user_id
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tg text;
  v_existing_id uuid;
BEGIN
  v_tg := lower(trim(regexp_replace(coalesce(NEW.raw_user_meta_data->>'telegram_username',''), '^@', '')));
  IF v_tg = '' THEN v_tg := NULL; END IF;

  IF v_tg IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.profiles
    WHERE lower(telegram_username) = v_tg
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Пользователь с Telegram @% уже зарегистрирован. Войдите под существующим аккаунтом или используйте «Забыли пароль».', v_tg
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, telegram_username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_tg
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_onboarding_data(NEW.id);
  PERFORM public.seed_system_tag_categories(NEW.id);
  PERFORM public.seed_protocol_templates(NEW.id);

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _role <> 'admin'
        OR NOT COALESCE(
          (SELECT ams.admin_disabled
             FROM public.admin_mode_state ams
            WHERE ams.user_id = _user_id),
          false
        )
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.tag_access WHERE tag_id = _tag_id AND user_id = _user_id)
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_consultant(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'consultant'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.group_id = _group_id
      AND t.assigned_to = _user_id
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Явный куратор
    SELECT 1 FROM public.department_directors
    WHERE director_user_id = _user_id AND department_id = _dept_id
  ) OR EXISTS (
    -- Head родительского/прародительского отдела
    SELECT 1
    FROM public.departments child
    JOIN public.departments ancestor ON ancestor.id IN (
      SELECT id FROM (
        WITH RECURSIVE up AS (
          SELECT d.id, d.parent_department_id FROM public.departments d WHERE d.id = _dept_id
          UNION ALL
          SELECT d.id, d.parent_department_id
          FROM public.departments d
          JOIN up u ON d.id = u.parent_department_id
        )
        SELECT id FROM up WHERE id <> _dept_id
      ) ancestors
    )
    WHERE child.id = _dept_id
      AND ancestor.head_user_id = _user_id
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _director_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.team_members d
      JOIN public.team_members m ON d.team_id = m.team_id
      WHERE d.user_id = _director_id AND d.role = 'director'
      AND m.user_id = _user_id AND m.role = 'member'
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.group_members 
      WHERE group_id = _group_id 
      AND user_id = _user_id 
      AND role IN ('assignee', 'participant')
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id)
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.task_groups WHERE id = _group_id AND user_id = _user_id)
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_groups tg
      WHERE tg.id = _group_id
      AND tg.parent_id IS NOT NULL
      AND is_full_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_npd_stm_group(_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.task_groups
    WHERE id = _group_id
      AND project_subtype = 'npd_stm'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.group_members gm
      JOIN public.task_groups tg ON tg.id = gm.group_id
      WHERE tg.parent_id = _parent_id
      AND gm.user_id = _user_id
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_protocol_draft(_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_groups tg
    WHERE tg.id = _group_id
      AND tg.project_type = 'protocol'
      AND tg.draft_status = 'draft'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_groups tg
    WHERE tg.id = _group_id
      AND tg.project_type = 'protocol'
      AND jsonb_typeof(tg.protocol_meta -> 'internal_attendees') = 'array'
      AND (tg.protocol_meta -> 'internal_attendees') @> to_jsonb(_user_id::text)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_groups tg
      WHERE tg.id = _group_id
      AND tg.parent_id IS NOT NULL
      AND is_full_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_groups tg
      WHERE tg.id = _group_id
      AND tg.parent_id IS NOT NULL
      AND is_group_owner(tg.parent_id, _user_id)
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.task_groups WHERE id = _parent_id AND user_id = _user_id)
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _supervisor_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.team_members d
      JOIN public.team_members m ON d.team_id = m.team_id
      WHERE d.user_id = _supervisor_id AND d.role IN ('director', 'manager')
      AND m.user_id = _user_id AND m.role = 'member'
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _supervisor_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = _task_id
      AND t.group_id IS NOT NULL
      AND is_supervisor_of_user(_supervisor_id, t.user_id)
      AND (is_group_owner(t.group_id, _supervisor_id) OR is_group_member(t.group_id, _supervisor_id))
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = _task_id
      AND t.group_id IS NOT NULL
      AND is_group_member(t.group_id, _user_id)
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_groups tg ON tg.id = t.group_id
      WHERE t.id = _task_id
      AND tg.parent_id IS NOT NULL
      AND is_full_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_groups tg ON tg.id = t.group_id
      WHERE t.id = _task_id
      AND tg.parent_id IS NOT NULL
      AND is_group_owner(tg.parent_id, _user_id)
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = _task_id
      AND tg.project_type = 'protocol'
      AND jsonb_typeof(tg.protocol_meta -> 'internal_attendees') = 'array'
      AND (tg.protocol_meta -> 'internal_attendees') @> to_jsonb(_user_id::text)
      AND (NOT _draft_only OR tg.draft_status = 'draft')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = _task_id
      AND t.group_id IS NOT NULL
      AND (
        is_group_member(t.group_id, _user_id)
        OR is_group_owner(t.group_id, _user_id)
      )
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id AND (user_id = _user_id OR assigned_to = _user_id))
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_participants
      WHERE task_id = _task_id AND user_id = _user_id
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = _task_id
        AND (
          t.user_id = _user_id
          OR t.assigned_to = _user_id
          OR (
            t.group_id IS NOT NULL AND t.group_id IN (
              SELECT tg.id FROM public.task_groups tg WHERE tg.user_id = _user_id
              UNION ALL
              SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = _user_id
              UNION ALL
              SELECT tg.id
                FROM public.task_groups tg
                JOIN public.task_groups parent ON parent.id = tg.parent_id
               WHERE parent.user_id = _user_id
              UNION ALL
              SELECT tg.id
                FROM public.task_groups tg
                JOIN public.group_members gm ON gm.group_id = tg.parent_id
               WHERE gm.user_id = _user_id
                 AND gm.role = ANY (ARRAY['owner','participant'])
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.task_participants tp
            WHERE tp.task_id = t.id AND tp.user_id = _user_id
          )
          OR (
            t.department_id IS NOT NULL AND t.department_id IN (
              SELECT ud.department_id FROM public.user_departments ud WHERE ud.user_id = _user_id
            )
          )
          OR (
            t.group_id IS NOT NULL AND public.is_protocol_internal_attendee(t.group_id, _user_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.user_extra_visible_task_ids(_user_id) x(task_id)
            WHERE x.task_id = t.id
          )
        )
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_team_director(_team_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND role = 'director')
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id)
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND deleted_at IS NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1
      FROM public.tasks t
      JOIN public.profiles p ON p.id = _user_id
      WHERE t.id = _task_id
        AND t.department_id IS NOT NULL
        AND t.department_id = p.department_id
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'display_name', OLD.display_name, NEW.display_name);
    END IF;
    IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'department_id', OLD.department_id::text, NEW.department_id::text);
    END IF;
    IF NEW.organization IS DISTINCT FROM OLD.organization THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'organization', OLD.organization, NEW.organization);
    END IF;
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, actor, 'is_approved', OLD.is_approved::text, NEW.is_approved::text, CASE WHEN NEW.is_approved THEN 'approve' ELSE 'deactivate' END);
    END IF;
    IF NEW.contractor_id IS DISTINCT FROM OLD.contractor_id THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'contractor_id', OLD.contractor_id::text, NEW.contractor_id::text);
    END IF;
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'client_id', OLD.client_id::text, NEW.client_id::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_task_field_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid;
  changes jsonb := '[]'::jsonb;
  entry  jsonb;
BEGIN
  -- Actor: prefer auth.uid(), fall back to assigned_to or user_id of new row.
  actor := auth.uid();
  IF actor IS NULL THEN
    actor := COALESCE(NEW.user_id, OLD.user_id);
  END IF;
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- deadline change
  IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
    changes := changes || jsonb_build_object(
      'field', 'deadline', 'old', OLD.deadline, 'new', NEW.deadline
    );
  END IF;
  -- assigned_to change
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    changes := changes || jsonb_build_object(
      'field', 'assigned_to', 'old', OLD.assigned_to, 'new', NEW.assigned_to
    );
  END IF;
  -- is_completed change (close / reopen)
  IF NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN
    changes := changes || jsonb_build_object(
      'field', 'is_completed', 'old', OLD.is_completed, 'new', NEW.is_completed
    );
  END IF;
  -- approval_status change
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    changes := changes || jsonb_build_object(
      'field', 'approval_status', 'old', OLD.approval_status, 'new', NEW.approval_status
    );
  END IF;
  -- group change (moved to another project)
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    changes := changes || jsonb_build_object(
      'field', 'group_id', 'old', OLD.group_id, 'new', NEW.group_id
    );
  END IF;
  -- priority change
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    changes := changes || jsonb_build_object(
      'field', 'priority', 'old', OLD.priority, 'new', NEW.priority
    );
  END IF;

  IF jsonb_array_length(changes) = 0 THEN
    RETURN NEW;
  END IF;

  -- One log entry per row update, listing all changed fields in meta.
  INSERT INTO public.task_comments (task_id, user_id, content, kind, meta)
  VALUES (
    NEW.id,
    actor,
    '__log__',
    'log',
    jsonb_build_object('changes', changes)
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _group_id uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_consultant(_caller) THEN
    RAISE EXCEPTION 'Недостаточно прав для управления командой клиента';
  END IF;

  -- Найти или создать чат-комнату клиента.
  SELECT id INTO _group_id
  FROM public.task_groups
  WHERE project_type = 'crm_client' AND client_id = _client_id
  LIMIT 1;

  IF _group_id IS NULL THEN
    INSERT INTO public.task_groups (name, user_id, project_type, client_id, icon, color)
    SELECT COALESCE(c.name, 'Клиент'), _caller, 'crm_client', _client_id, '🏢', '#3b82f6'
    FROM public.clients c WHERE c.id = _client_id
    RETURNING id INTO _group_id;
  END IF;

  IF _action = 'add' THEN
    INSERT INTO public.client_team (client_id, user_id, role, added_by)
    VALUES (_client_id, _member_id, _role, _caller)
    ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    INSERT INTO public.group_members (group_id, user_id, invited_by, role)
    VALUES (_group_id, _member_id, _caller, 'participant')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  ELSIF _action = 'remove' THEN
    DELETE FROM public.client_team WHERE client_id = _client_id AND user_id = _member_id;
    DELETE FROM public.group_members WHERE group_id = _group_id AND user_id = _member_id;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', _action;
  END IF;

  RETURN _group_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_thread_read(_thread_id text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.chat_read_status (user_id, thread_id, last_read_at)
  VALUES (auth.uid(), _thread_id, _now)
  ON CONFLICT (user_id, thread_id)
  DO UPDATE SET last_read_at = GREATEST(public.chat_read_status.last_read_at, EXCLUDED.last_read_at);
  RETURN _now;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pgmq', 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_department_head_on_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _head uuid;
  _supabase_url text;
  _anon_key text;
BEGIN
  -- Уведомляем только при появлении нового department_id (без assigned_to)
  IF NEW.department_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    RETURN NEW;
  END IF;

  SELECT head_user_id INTO _head FROM public.departments WHERE id = NEW.department_id;
  IF _head IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO _anon_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;

  IF _supabase_url IS NULL OR _anon_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/notify-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body := jsonb_build_object(
      'event_type', 'department_assigned',
      'task_id', NEW.id,
      'department_id', NEW.department_id,
      'recipient_id', _head,
      'title', NEW.title,
      'deadline', NEW.deadline
    )
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_new_user_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/notify-new-user',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
    ),
    body := jsonb_build_object(
      'user_id', NEW.id,
      'display_name', NEW.display_name,
      'email', NEW.email,
      'telegram_username', NEW.telegram_username
    )
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id
  FROM public.clients
  WHERE lower(name) = lower(NEW.name)
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Клиент «%» уже существует (id=%). Используйте существующую запись.', NEW.name, _existing_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_is_approved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If is_approved is being changed and user is not admin, revert the change
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    IF NOT has_role(auth.uid(), 'admin') THEN
      NEW.is_approved := OLD.is_approved;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_system_protocol_templates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.is_system = true) THEN
    RAISE EXCEPTION 'Системные шаблоны протоколов нельзя удалить';
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.system_key IS DISTINCT FROM OLD.system_key) THEN
    RAISE EXCEPTION 'Нельзя изменить system_key системного шаблона';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_system_tag_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'Системные категории тегов нельзя удалять';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'Нельзя снять флаг is_system с системной категории';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.system_key IS DISTINCT FROM NEW.system_key AND OLD.system_key IS NOT NULL THEN
    RAISE EXCEPTION 'Нельзя менять system_key системной категории';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protocol_copyable_system_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY['clients','brand','product_category','site','territory','event_topic']::text[]
$function$
;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pgmq', 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _task_id IS NULL OR _protocol_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.task_tags tt
  USING public.tags t
  JOIN public.tag_categories tc ON tc.id = t.category_id
  WHERE tt.task_id = _task_id
    AND tt.tag_id = t.id
    AND tc.is_system = true
    AND tc.system_key = ANY (public.protocol_copyable_system_keys())
    AND EXISTS (
      SELECT 1 FROM public.group_tags gt
      WHERE gt.group_id = _protocol_id AND gt.tag_id = t.id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_dependency_violations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  iter integer := 0;
  changes integer := 0;
  total_changes integer := 0;
  rec record;
  pred_end timestamptz;
  succ_anchor timestamptz;
  new_start timestamptz;
  new_deadline timestamptz;
  duration_seconds double precision;
BEGIN
  LOOP
    iter := iter + 1;
    changes := 0;

    FOR rec IN
      SELECT
        d.predecessor_id,
        d.successor_id,
        d.successor_entity_type,
        d.lag_days,
        COALESCE(tp.deadline, mp.planned_date) AS pred_deadline,
        ts.start_at AS succ_start,
        ts.deadline AS succ_task_deadline,
        ms.planned_date AS succ_milestone_date
      FROM task_dependencies d
      LEFT JOIN tasks tp ON tp.id = d.predecessor_id
      LEFT JOIN project_milestones mp ON mp.id = d.predecessor_id
      LEFT JOIN tasks ts ON ts.id = d.successor_id AND d.successor_entity_type = 'task'
      LEFT JOIN project_milestones ms ON ms.id = d.successor_id AND d.successor_entity_type = 'milestone'
    LOOP
      IF rec.pred_deadline IS NULL THEN CONTINUE; END IF;
      pred_end := rec.pred_deadline + (rec.lag_days || ' days')::interval;

      IF rec.successor_entity_type = 'milestone' THEN
        IF rec.succ_milestone_date IS NULL OR rec.succ_milestone_date >= pred_end THEN CONTINUE; END IF;
        UPDATE project_milestones SET planned_date = pred_end WHERE id = rec.successor_id;
        changes := changes + 1;
      ELSE
        succ_anchor := COALESCE(rec.succ_start, rec.succ_task_deadline);
        IF succ_anchor IS NULL OR succ_anchor >= pred_end THEN CONTINUE; END IF;
        new_start := pred_end;
        IF rec.succ_start IS NOT NULL AND rec.succ_task_deadline IS NOT NULL THEN
          duration_seconds := EXTRACT(EPOCH FROM (rec.succ_task_deadline - rec.succ_start));
          new_deadline := new_start + (duration_seconds || ' seconds')::interval;
        ELSIF rec.succ_task_deadline IS NOT NULL THEN
          new_deadline := rec.succ_task_deadline + (pred_end - succ_anchor);
        ELSE
          new_deadline := new_start;
        END IF;
        UPDATE tasks SET start_at = new_start, deadline = new_deadline WHERE id = rec.successor_id;
        changes := changes + 1;
      END IF;
    END LOOP;

    total_changes := total_changes + changes;
    EXIT WHEN changes = 0 OR iter >= 50;
  END LOOP;

  RETURN total_changes;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_onboarding_data(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_id uuid;
  _subproject_id uuid;
  _gtd_project_id uuid;
  _gtd_sub1_id uuid;
  _gtd_sub2_id uuid;
  _task1_id uuid;
  _task2_id uuid;
  _task3_id uuid;
  _task4_id uuid;
  _task5_id uuid;
  _task6_id uuid;
  _gtd_t1_id uuid;
  _gtd_t2_id uuid;
  _gtd_t3_id uuid;
  _gtd_t4_id uuid;
  _gtd_t5_id uuid;
  _gtd_t6_id uuid;
  _cat_crm uuid;
  _cat_marketing uuid;
  _cat_npd uuid;
  _cat_projects uuid;
  _cat_other uuid;
BEGIN
  -- === Default tag categories (folders) ===
  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'CRM / Продажи', 0, _user_id, '#ef4444')
  RETURNING id INTO _cat_crm;

  INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
    ('Клиенты', 0, _user_id, '#ef4444', _cat_crm),
    ('Территории', 1, _user_id, '#ef4444', _cat_crm),
    ('Статусы / Этапы', 2, _user_id, '#ef4444', _cat_crm),
    ('Проекты', 3, _user_id, '#ef4444', _cat_crm);

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'Маркетинг', 1, _user_id, '#f59e0b')
  RETURNING id INTO _cat_marketing;

  INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
    ('ФЗ', 0, _user_id, '#f59e0b', _cat_marketing),
    ('АА', 1, _user_id, '#f59e0b', _cat_marketing),
    ('КМ', 2, _user_id, '#f59e0b', _cat_marketing),
    ('ФС', 3, _user_id, '#f59e0b', _cat_marketing),
    ('Проекты', 4, _user_id, '#f59e0b', _cat_marketing);

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'NPD', 2, _user_id, '#8b5cf6')
  RETURNING id INTO _cat_npd;

  INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
    ('ФЗ', 0, _user_id, '#8b5cf6', _cat_npd),
    ('АА', 1, _user_id, '#8b5cf6', _cat_npd),
    ('КМ', 2, _user_id, '#8b5cf6', _cat_npd),
    ('Этапы', 3, _user_id, '#8b5cf6', _cat_npd);

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'Проекты', 3, _user_id, '#3b82f6')
  RETURNING id INTO _cat_projects;

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'Другое', 4, _user_id, '#6b7280')
  RETURNING id INTO _cat_other;

  -- === Onboarding project (existing) ===
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, description)
  VALUES (
    gen_random_uuid(), '🚀 Добро пожаловать в JustTODOit', '🚀', '#3b82f6', _user_id, 0,
    'Это ваш первый проект! Здесь вы узнаете основные возможности приложения. Выполняйте задачи по порядку.'
  )
  RETURNING id INTO _project_id;

  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '📖 Изучи возможности', '📖', '#8b5cf6', _user_id, 0, _project_id,
    'Подпроект с продвинутыми функциями. Проекты могут содержать подпроекты для лучшей организации.'
  )
  RETURNING id INTO _subproject_id;

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important, priority)
  VALUES (gen_random_uuid(), 'Создай свою первую задачу',
    'Нажми кнопку «+» внизу списка задач, чтобы создать новую задачу. Попробуй добавить описание и отметить задачу как важную ⭐',
    _user_id, _project_id, 0, true, 1)
  RETURNING id INTO _task1_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task1_id, 'Нажми + чтобы создать задачу', 0),
    (_task1_id, 'Добавь описание к задаче', 1),
    (_task1_id, 'Отметь задачу как важную ⭐', 2);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, deadline, priority)
  VALUES (gen_random_uuid(), 'Попробуй установить дедлайн',
    'Открой задачу и установи дату дедлайна. Задачи с приближающимся сроком будут подсвечены. Также попробуй календарь 📅 в боковом меню!',
    _user_id, _project_id, 1, now() + interval '3 days', 2)
  RETURNING id INTO _task2_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task2_id, 'Открой задачу и найди поле дедлайна', 0),
    (_task2_id, 'Перейди в раздел Календарь в меню', 1);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), 'Напиши сообщение в чате проекта',
    'Открой чат проекта (иконка 💬 в заголовке) и напиши первое сообщение. Чат работает в реальном времени и синхронизируется с Telegram!',
    _user_id, _project_id, 2, 3)
  RETURNING id INTO _task3_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task3_id, 'Открой чат проекта', 0),
    (_task3_id, 'Напиши приветственное сообщение', 1),
    (_task3_id, 'Попробуй чат внутри задачи', 2);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (gen_random_uuid(), '🏷️ Освой систему тегов',
    'Теги помогают группировать задачи по темам и фильтровать их. Создай тег в боковом меню, затем присвой его задаче или проекту. Теги видны всей команде!',
    _user_id, _subproject_id, 0)
  RETURNING id INTO _task4_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task4_id, 'Создай тег в разделе «Теги» в боковом меню', 0),
    (_task4_id, 'Создай категорию для группировки тегов', 1),
    (_task4_id, 'Присвой тег любой задаче', 2),
    (_task4_id, 'Присвой тег проекту через панель деталей', 3),
    (_task4_id, 'Отфильтруй задачи по тегу в боковом меню', 4);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (gen_random_uuid(), '👥 Делегируй задачу коллеге',
    'Пригласи участника в проект и назначь ему задачу. Ты также можешь назначать ответственных за отдельные шаги задачи и устанавливать им дедлайны.',
    _user_id, _subproject_id, 1)
  RETURNING id INTO _task5_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task5_id, 'Пригласи коллегу в проект (кнопка в деталях проекта)', 0),
    (_task5_id, 'Создай задачу и назначь ответственного', 1),
    (_task5_id, 'Назначь ответственного за шаг внутри задачи', 2),
    (_task5_id, 'Установи дедлайн для шага', 3);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (gen_random_uuid(), '📊 Изучи дашборд и команды',
    'Дашборд покажет общую картину по всем задачам. А раздел «Команды» позволяет объединять участников и управлять ролями (директор, менеджер, участник).',
    _user_id, _subproject_id, 2)
  RETURNING id INTO _task6_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task6_id, 'Открой Дашборд в боковом меню', 0),
    (_task6_id, 'Создай команду в разделе Сообщество', 1),
    (_task6_id, 'Поделись кодом приглашения с коллегой', 2);

  -- === GTD Methodology project ===
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, description)
  VALUES (
    gen_random_uuid(), '🧠 GTD — Getting Things Done', '🧠', '#10b981', _user_id, 1,
    'Методология личной продуктивности Дэвида Аллена. Принцип: «Ваш мозг — для генерации идей, а не для их хранения». Пройдите 5 шагов GTD и внедрите систему в свою работу.'
  )
  RETURNING id INTO _gtd_project_id;

  -- Sub-project: 5 шагов GTD
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '🔄 5 шагов GTD', '🔄', '#10b981', _user_id, 0, _gtd_project_id,
    'Пять ключевых шагов методологии GTD: Собрать → Уточнить → Организовать → Пересмотреть → Действовать. Каждая задача — один шаг с практическими упражнениями.'
  )
  RETURNING id INTO _gtd_sub1_id;

  -- Sub-project: Быстрый чек-лист внедрения
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '✅ Чек-лист внедрения GTD', '✅', '#f59e0b', _user_id, 1, _gtd_project_id,
    'Практический чек-лист для быстрого старта с GTD. GTD — не про идеальную организацию, а про снижение ментального шума. Даже 20% внедрения дают заметный прирост фокуса.'
  )
  RETURNING id INTO _gtd_sub2_id;

  -- Step 1: Capture (Собрать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important, priority)
  VALUES (gen_random_uuid(), '📥 Шаг 1: Capture — Собери всё',
    E'Первый шаг GTD — выгрузить ВСЕ задачи, идеи и обязательства из головы во внешнюю систему.\n\n🎯 Цель: ваш мозг должен быть пустым от «надо не забыть».\n\n💡 Совет: не оценивай и не сортируй на этом этапе — просто записывай всё подряд. Потратьте 15-20 минут на «мозговой дамп».',
    _user_id, _gtd_sub1_id, 0, true, 1)
  RETURNING id INTO _gtd_t1_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t1_id, 'Открой проект и создай 10+ задач — всё что в голове', 0),
    (_gtd_t1_id, 'Добавь рабочие задачи, которые висят в голове', 1),
    (_gtd_t1_id, 'Добавь личные дела и бытовые задачи', 2),
    (_gtd_t1_id, 'Запиши идеи «когда-нибудь» — не фильтруй!', 3),
    (_gtd_t1_id, 'Проверь почту/мессенджеры — нет ли забытых дел?', 4);

  -- Step 2: Clarify (Уточнить)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), '🔍 Шаг 2: Clarify — Уточни каждый элемент',
    E'Для каждой записанной задачи ответь на вопрос: «Требует ли это действия?»\n\n• Если НЕТ → удали, отложи в «Когда-нибудь» или сохрани как справку\n• Если ДА → определи конкретное следующее физическое действие\n\n⚠️ Важно: не «запустить проект», а «написать ТЗ для дизайнера». Задача должна быть конкретным действием, которое можно выполнить за один подход.',
    _user_id, _gtd_sub1_id, 1, 2)
  RETURNING id INTO _gtd_t2_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t2_id, 'Пройди по каждой задаче из шага 1', 0),
    (_gtd_t2_id, 'Переформулируй абстрактные задачи в конкретные действия', 1),
    (_gtd_t2_id, 'Задачи < 2 мин — выполни сразу (правило двух минут)', 2),
    (_gtd_t2_id, 'Удали или отложи то, что не требует действия', 3);

  -- Step 3: Organize (Организовать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), '📂 Шаг 3: Organize — Организуй по контекстам',
    E'Распредели задачи по проектам, контекстам и срокам в JustTODOit:\n\n• 🏷️ Теги = контексты GTD (@офис, @телефон, @компьютер, @магазин)\n• 📁 Проекты = любой результат, требующий 2+ действий\n• 📅 Дедлайны = задачи, привязанные к дате\n• ⭐ Важное = приоритетные задачи на сегодня',
    _user_id, _gtd_sub1_id, 2, 3)
  RETURNING id INTO _gtd_t3_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t3_id, 'Создай теги-контексты: @офис, @дом, @телефон, @онлайн', 0),
    (_gtd_t3_id, 'Присвой контекстные теги своим задачам', 1),
    (_gtd_t3_id, 'Сгруппируй связанные задачи в проекты', 2),
    (_gtd_t3_id, 'Установи дедлайны для привязанных к дате задач', 3),
    (_gtd_t3_id, 'Отметь ⭐ задачи, которые нужно сделать сегодня', 4);

  -- Step 4: Reflect (Пересматривать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority, deadline)
  VALUES (gen_random_uuid(), '🔄 Шаг 4: Reflect — Еженедельный обзор',
    E'Еженедельный обзор — сердце GTD. Без него система разваливается.\n\nВыдели 30-60 минут в конце недели:\n1. Очисти инбокс (все входящие обработаны)\n2. Пройди по каждому проекту — актуальны ли задачи?\n3. Обнови дедлайны и приоритеты\n4. Добавь новые задачи, которые появились за неделю\n5. Загляни в Дашборд — общая картина по всем проектам\n\n💡 Совет: поставь повторяющееся напоминание на пятницу!',
    _user_id, _gtd_sub1_id, 3, 2, now() + interval '5 days')
  RETURNING id INTO _gtd_t4_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t4_id, 'Запланируй 30-60 мин на еженедельный обзор', 0),
    (_gtd_t4_id, 'Открой Дашборд и оцени общую картину', 1),
    (_gtd_t4_id, 'Пройди по каждому проекту — обнови статусы', 2),
    (_gtd_t4_id, 'Проверь просроченные задачи — перенеси или удали', 3),
    (_gtd_t4_id, 'Добавь новые задачи из головы', 4);

  -- Step 5: Engage (Действовать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), '⚡ Шаг 5: Engage — Действуй осознанно',
    E'Выбирай задачу для выполнения по 4 критериям:\n\n1. 📍 Контекст — где ты сейчас? Фильтруй по тегу-контексту\n2. ⏰ Время — сколько есть? Выбери задачу по размеру\n3. ⚡ Энергия — как себя чувствуешь? Сложные задачи — на пике\n4. 🎯 Приоритет — что важнее всего?\n\n✅ Главный результат GTD: снижение когнитивной нагрузки, повышение фокуса и контроль над рабочим потоком без стресса.',
    _user_id, _gtd_sub1_id, 4, 1)
  RETURNING id INTO _gtd_t5_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t5_id, 'Отфильтруй задачи по текущему контексту (тегу)', 0),
    (_gtd_t5_id, 'Выбери задачу подходящую по времени и энергии', 1),
    (_gtd_t5_id, 'Выполни её и отметь как завершённую ✅', 2),
    (_gtd_t5_id, 'Повтори цикл — выбери следующую задачу', 3);

  -- Checklist task
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important)
  VALUES (gen_random_uuid(), '🎯 Быстрый старт: внедри GTD за 5 шагов',
    E'Не гонитесь за идеальным инструментом — начните с простого. Даже 20% внедрения GTD дают заметный прирост фокуса и контроля.\n\n🧠 Финальный совет: GTD — не про идеальную организацию, а про снижение ментального шума.',
    _user_id, _gtd_sub2_id, 0, true)
  RETURNING id INTO _gtd_t6_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t6_id, '✅ Выбери один инбокс для всех входящих (JustTODOit!)', 0),
    (_gtd_t6_id, '✅ Проведи еженедельный обзор (30-60 мин)', 1),
    (_gtd_t6_id, '✅ Для каждой задачи определи одно «следующее действие»', 2),
    (_gtd_t6_id, '✅ Используй теги как контексты (@офис, @дом)', 3),
    (_gtd_t6_id, '✅ Интегрируй систему с календарём (раздел 📅)', 4);

  -- Welcome message
  INSERT INTO public.group_messages (group_id, user_id, content, source)
  VALUES (_project_id, _user_id,
    '👋 Добро пожаловать в JustTODOit! Это чат вашего первого проекта. Здесь вы можете обсуждать задачи с командой. Сообщения синхронизируются с Telegram в реальном времени. Удачной работы! 🎉',
    'web');

  -- GTD welcome message
  INSERT INTO public.group_messages (group_id, user_id, content, source)
  VALUES (_gtd_project_id, _user_id,
    '🧠 Добро пожаловать в проект GTD! Здесь вы освоите методологию Getting Things Done Дэвида Аллена. Пройдите 5 шагов по порядку — от сбора всех задач до осознанного выполнения. Главный принцип: ваш мозг — для генерации идей, а не для их хранения! 🚀',
    'web');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_protocol_status_for_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM public.tag_categories
  WHERE is_system = true AND system_key = 'protocol_status' LIMIT 1;

  IF cat_id IS NULL THEN
    INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position)
    VALUES (_user_id, 'Статус протокола', true, 'protocol_status', '📋', '#6366f1', 0)
    RETURNING id INTO cat_id;

    INSERT INTO public.tags (user_id, name, color, category_id) VALUES
      (_user_id, '🆕 Новая',       '#3b82f6', cat_id),
      (_user_id, '📤 Отправлена',  '#8b5cf6', cat_id),
      (_user_id, '⏳ Ждём ответ',  '#eab308', cat_id),
      (_user_id, '✅ Выполнена',   '#22c55e', cat_id),
      (_user_id, '🏁 Закрыта',     '#64748b', cat_id),
      (_user_id, '❌ Отменена',    '#ef4444', cat_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_protocol_templates(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Кросс-функциональный
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Кросс-функциональный',
    'Регулярная встреча команд по продукту/проекту',
    '🔀',
    true,
    'cross_functional',
    ARRAY['site', 'product_category']::text[],
    ARRAY['brand', 'department', 'event_topic']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Поручение","type":"text","required":true},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"},
      {"key":"comment","label":"Комментарий","type":"text"}
    ]'::jsonb,
    1
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Переговоры с клиентом
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Переговоры с клиентом',
    'Встреча с торговой сетью / контрагентом. КП, обязательства, цены.',
    '🤝',
    true,
    'client_negotiation',
    ARRAY['clients', 'territory']::text[],
    ARRAY['brand', 'site', 'stm', 'product_category']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Продукт / Тема","type":"text","required":true},
      {"key":"commitment","label":"Обязательство","type":"text"},
      {"key":"price","label":"Цена / Параметры","type":"text"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"},
      {"key":"comment","label":"Комментарий","type":"text"}
    ]'::jsonb,
    2
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Гейт NPD
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Гейт NPD',
    'Стандартная встреча Stage-Gate (G0–G5) по NPD-проекту',
    '🎯',
    true,
    'npd_gate',
    ARRAY['site', 'product_category']::text[],
    ARRAY['brand', 'event_topic', 'department']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Поручение","type":"text","required":true},
      {"key":"gate","label":"Гейт","type":"text"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Решение","type":"status"},
      {"key":"comment","label":"Комментарий","type":"text"}
    ]'::jsonb,
    3
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Живой документ
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Живой документ',
    'Протокол как living-документ: задачи разворачиваются в полноценные карточки с чатом, шагами и тегами. Темы группируются автоматически.',
    '📖',
    true,
    'living',
    ARRAY[]::text[],
    ARRAY['event_topic','site','product_category','brand','clients','department']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Что обсудили / о чём договорились","type":"text","required":true},
      {"key":"topic","label":"Тема","type":"project"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"}
    ]'::jsonb,
    4
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Пустой (передвигаем в конец, position=5)
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Пустой',
    'Свободная встреча. Назначайте проект, ответственного и оси на лету.',
    '📋',
    true,
    'blank',
    ARRAY[]::text[],
    ARRAY['site','product_category','brand','clients','territory','department','event_topic','stm','product_state']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Задача","type":"text","required":true},
      {"key":"project","label":"Проект / Тема","type":"project"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"}
    ]'::jsonb,
    5
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_system_tag_categories(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  existing_id uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('clients',          'Клиенты',           '🏢', '#3b82f6', 10),
      ('territory',        'Территория',        '📍', '#10b981', 11),
      ('site',             'Площадка',          '🏪', '#8b5cf6', 12),
      ('brand',            'Бренды',            '🏷️', '#ef4444', 13),
      ('product_category', 'Категории продукта','📦', '#f59e0b', 14),
      ('product_state',    'Состояние продукта','🔄', '#06b6d4', 15),
      ('department',       'Отделы',            '👥', '#64748b', 16),
      ('event_topic',      'События / Темы',    '📅', '#a855f7', 17),
      ('stm',              'СТМ',               '🏷️', '#ec4899', 18),
      ('contractors',      'Контрагенты',       '🤝', '#0ea5e9', 19),
      ('npd_gates',        'Гейты NPD',         '🎯', '#8b5cf6', 100),
      ('npd_streams',      'Стримы NPD',        '🌊', '#0ea5e9', 101),
      ('crm_stages',       'Этапы CRM',         '🛒', '#ef4444', 102),
      ('crm_rank',         'Ранг клиента',      '⭐', '#f59e0b', 103),
      ('crm_retail_type',  'Тип ретейла',       '🏬', '#10b981', 104)
    ) AS t(sys_key, cat_name, ico, col, pos)
  LOOP
    SELECT id INTO existing_id FROM public.tag_categories
    WHERE system_key = rec.sys_key AND is_system = true LIMIT 1;
    IF existing_id IS NULL THEN
      INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position)
      VALUES (_user_id, rec.cat_name, true, rec.sys_key, rec.ico, rec.col, rec.pos)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_original_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If original_deadline is null and a deadline is being set, capture it
  IF OLD.original_deadline IS NULL AND NEW.deadline IS NOT NULL THEN
    NEW.original_deadline = NEW.deadline;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_client_room_members(_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_manager uuid;
  v_owner uuid;
BEGIN
  SELECT client_id INTO v_client_id
  FROM task_groups
  WHERE id = _group_id AND project_type = 'crm_client';

  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT manager_id, user_id INTO v_manager, v_owner
  FROM clients WHERE id = v_client_id;

  IF v_manager IS NOT NULL THEN
    INSERT INTO group_members (group_id, user_id, invited_by, role)
    VALUES (_group_id, v_manager, v_manager, 'participant')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;

  IF v_owner IS NOT NULL THEN
    INSERT INTO group_members (group_id, user_id, invited_by, role)
    VALUES (_group_id, v_owner, v_owner, 'participant')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_consultant_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.contractor_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'consultant')
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.contractor_id IS NOT NULL
     AND NEW.contractor_id IS NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id AND role = 'consultant';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_department_head_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When head_user_id is set/changed and points to a real user,
  -- ensure that user's profile points at this department.
  IF NEW.head_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.head_user_id IS DISTINCT FROM OLD.head_user_id)
  THEN
    UPDATE public.profiles
       SET department_id = NEW.id
     WHERE id = NEW.head_user_id
       AND (department_id IS DISTINCT FROM NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_linked_project_participants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_linked_id uuid;
  old_linked_id uuid;
  project_owner_id uuid;
BEGIN
  new_linked_id := NULLIF(NEW.status_meta->>'linked_project_id', '')::uuid;
  old_linked_id := CASE WHEN TG_OP = 'UPDATE'
                        THEN NULLIF(OLD.status_meta->>'linked_project_id', '')::uuid
                        ELSE NULL END;

  -- Если linked_project_id не изменился — выходим
  IF new_linked_id IS NOT DISTINCT FROM old_linked_id THEN
    RETURN NEW;
  END IF;

  -- Если новый linked_project_id NULL — ничего не добавляем (старых не убираем,
  -- чтобы не сломать ручные правки участников)
  IF new_linked_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Владелец linked-проекта
  SELECT user_id INTO project_owner_id
  FROM task_groups WHERE id = new_linked_id;

  IF project_owner_id IS NOT NULL THEN
    INSERT INTO task_participants (task_id, user_id, role)
    VALUES (NEW.id, project_owner_id, 'participant')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Создатель задачи
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO task_participants (task_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'participant')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_primary_department_to_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_primary THEN
      UPDATE public.profiles SET department_id = NULL WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.is_primary THEN
    UPDATE public.profiles SET department_id = NEW.department_id WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_stm_milestone_from_stage_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _milestone_name text;
BEGIN
  -- Only react to STM stage tasks whose stage_key is one of the two milestone gates.
  IF NEW.task_type IS DISTINCT FROM 'stm_stage' THEN
    RETURN NEW;
  END IF;

  IF NEW.stage_key NOT IN ('approval', 'order_release') THEN
    RETURN NEW;
  END IF;

  -- Skip when nothing changed (deadline same as before).
  IF TG_OP = 'UPDATE'
     AND NEW.deadline IS NOT DISTINCT FROM OLD.deadline THEN
    RETURN NEW;
  END IF;

  -- Project must exist.
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  _milestone_name := CASE NEW.stage_key
    WHEN 'approval'      THEN 'Утверждён в сети'
    WHEN 'order_release' THEN 'Первый заказ'
  END;

  -- Update the matching milestone if it exists. We do NOT auto-create
  -- a milestone for legacy SKUs (per product decision: only new SKUs).
  IF NEW.deadline IS NOT NULL THEN
    UPDATE public.project_milestones
       SET planned_date = NEW.deadline,
           updated_at   = now()
     WHERE group_id = NEW.group_id
       AND name     = _milestone_name;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_tags tt
      WHERE tt.task_id = _task_id
      AND has_tag_access(tt.tag_id, _user_id)
    )
  ELSE false END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_group_tags_sync_protocol_tasks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _gid uuid;
  _tag_id uuid;
  _is_draft_protocol boolean;
  _is_system_copyable boolean;
  _task record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _gid := NEW.group_id;
    _tag_id := NEW.tag_id;
  ELSE
    _gid := OLD.group_id;
    _tag_id := OLD.tag_id;
  END IF;

  -- Только для draft-протоколов
  SELECT (project_type = 'protocol' AND COALESCE(draft_status, 'draft') = 'draft')
    INTO _is_draft_protocol
  FROM public.task_groups WHERE id = _gid;

  IF NOT COALESCE(_is_draft_protocol, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Только если тег относится к копируемой системной категории
  SELECT (tc.is_system = true AND tc.system_key = ANY (public.protocol_copyable_system_keys()))
    INTO _is_system_copyable
  FROM public.tags t
  JOIN public.tag_categories tc ON tc.id = t.category_id
  WHERE t.id = _tag_id;

  IF NOT COALESCE(_is_system_copyable, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Добавляем тег во все задачи протокола
    INSERT INTO public.task_tags (task_id, tag_id)
    SELECT t.id, _tag_id
    FROM public.tasks t
    WHERE t.group_id = _gid
    ON CONFLICT DO NOTHING;
  ELSE
    -- Удаляем тег из всех задач протокола
    DELETE FROM public.task_tags tt
    USING public.tasks t
    WHERE tt.task_id = t.id
      AND t.group_id = _gid
      AND tt.tag_id = _tag_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_protocol_draft_assignee_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _grp record;
BEGIN
  -- Игнорируем сами задачи-ревью, чтобы не зациклить
  IF NEW.task_type = 'protocol_review' THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, user_id, draft_status, project_type
    INTO _grp
    FROM public.task_groups
   WHERE id = NEW.group_id;

  IF _grp.id IS NULL
     OR _grp.project_type <> 'protocol'
     OR _grp.draft_status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Review для автора протокола (всегда)
  PERFORM public.ensure_protocol_review_task(_grp.id, _grp.user_id);

  -- Review для нового ответственного (если назначен и изменился)
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    PERFORM public.ensure_protocol_review_task(_grp.id, NEW.assigned_to);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sync_client_room_on_client_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_group uuid;
BEGIN
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    SELECT id INTO v_group
    FROM task_groups
    WHERE client_id = NEW.id AND project_type = 'crm_client';
    IF v_group IS NOT NULL THEN
      PERFORM public.sync_client_room_members(v_group);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sync_client_room_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.project_type = 'crm_client' THEN
    PERFORM public.sync_client_room_members(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_task_sync_protocol_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_is_protocol boolean := false;
  _old_is_protocol boolean := false;
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    SELECT (project_type = 'protocol') INTO _new_is_protocol
    FROM public.task_groups WHERE id = NEW.group_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(_new_is_protocol, false) THEN
      PERFORM public.copy_protocol_system_tags_to_task(NEW.id, NEW.group_id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: только если изменился group_id
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    IF OLD.group_id IS NOT NULL THEN
      SELECT (project_type = 'protocol') INTO _old_is_protocol
      FROM public.task_groups WHERE id = OLD.group_id;
      IF COALESCE(_old_is_protocol, false) THEN
        PERFORM public.remove_protocol_system_tags_from_task(NEW.id, OLD.group_id);
      END IF;
    END IF;
    IF COALESCE(_new_is_protocol, false) THEN
      PERFORM public.copy_protocol_system_tags_to_task(NEW.id, NEW.group_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_resolve_dependencies()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Prevent recursion: only run at top-level statement, not when invoked by another trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  PERFORM public.resolve_dependency_violations();
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_client_by_name(_name text, _user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _name_trim text := trim(_name);
  _existing_id uuid;
  _new_id uuid;
BEGIN
  IF _name_trim = '' OR _name_trim IS NULL THEN
    RAISE EXCEPTION 'Имя клиента не может быть пустым';
  END IF;

  SELECT id INTO _existing_id
  FROM public.clients
  WHERE lower(name) = lower(_name_trim)
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  -- Триггер не сработает, т.к. дубля нет
  INSERT INTO public.clients (name, user_id)
  VALUES (_name_trim, _user_id)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.department_id = _department_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_extra_tasks_arr(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::uuid[])
  FROM (
    SELECT task_id AS t FROM public.task_participants WHERE user_id = _user_id
    UNION
    SELECT tt.task_id FROM public.task_tags tt
      JOIN public.tag_access ta ON ta.tag_id = tt.tag_id
      WHERE ta.user_id = _user_id
  ) sub;
$function$
;

CREATE OR REPLACE FUNCTION public.user_extra_visible_task_ids(_user_id uuid)
 RETURNS TABLE(task_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tp.task_id FROM public.task_participants tp WHERE tp.user_id = _user_id
  UNION
  SELECT tt.task_id FROM public.task_tags tt
    JOIN public.tag_access ta ON ta.tag_id = tt.tag_id
    WHERE ta.user_id = _user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.user_protocol_groups_arr(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT tg.id), ARRAY[]::uuid[])
  FROM public.task_groups tg
  WHERE tg.protocol_meta IS NOT NULL
    AND public.is_protocol_internal_attendee(tg.id, _user_id);
$function$
;

CREATE OR REPLACE FUNCTION public.user_subordinate_ids(_user_id uuid)
 RETURNS TABLE(subordinate_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Подчинённые через department_directors → user_departments
  SELECT DISTINCT ud.user_id
  FROM public.department_directors dd
    JOIN public.user_departments ud ON ud.department_id = dd.department_id
  WHERE dd.director_user_id = _user_id
    AND ud.user_id != _user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.user_subordinates_arr(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT ud.user_id), ARRAY[]::uuid[])
  FROM public.department_directors dd
    JOIN public.user_departments ud ON ud.department_id = dd.department_id
  WHERE dd.director_user_id = _user_id AND ud.user_id != _user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.user_visible_department_ids(_user_id uuid)
 RETURNS TABLE(department_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ud.department_id FROM public.user_departments ud WHERE ud.user_id = _user_id
  UNION
  SELECT dd.department_id FROM public.department_directors dd WHERE dd.director_user_id = _user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.user_visible_depts_arr(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT d), ARRAY[]::uuid[])
  FROM (
    SELECT department_id AS d FROM public.user_departments WHERE user_id = _user_id
    UNION
    SELECT department_id FROM public.department_directors WHERE director_user_id = _user_id
  ) sub;
$function$
;

CREATE OR REPLACE FUNCTION public.user_visible_group_ids(_user_id uuid)
 RETURNS TABLE(group_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Owned groups
  SELECT id FROM public.task_groups WHERE user_id = _user_id
  UNION
  -- Member groups
  SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = _user_id
  UNION
  -- Subgroups of owned parent groups
  SELECT tg.id FROM public.task_groups tg
    JOIN public.task_groups parent ON parent.id = tg.parent_id
    WHERE parent.user_id = _user_id
  UNION
  -- Subgroups of member parent groups (full members)
  SELECT tg.id FROM public.task_groups tg
    JOIN public.group_members gm ON gm.group_id = tg.parent_id
    WHERE gm.user_id = _user_id AND gm.role IN ('owner', 'participant')
  UNION
  -- Protocol attendee groups
  SELECT tg.id FROM public.task_groups tg
    WHERE tg.protocol_meta IS NOT NULL
      AND public.is_protocol_internal_attendee(tg.id, _user_id);
$function$
;

CREATE OR REPLACE FUNCTION public.user_visible_groups_arr(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT g), ARRAY[]::uuid[])
  FROM (
    SELECT id AS g FROM public.task_groups WHERE user_id = _user_id
    UNION
    SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = _user_id
    UNION
    SELECT tg.id FROM public.task_groups tg
      JOIN public.task_groups parent ON parent.id = tg.parent_id
      WHERE parent.user_id = _user_id
    UNION
    SELECT tg.id FROM public.task_groups tg
      JOIN public.group_members gm ON gm.group_id = tg.parent_id
      WHERE gm.user_id = _user_id AND gm.role IN ('owner', 'participant')
  ) sub;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_source_protocol()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE _ptype text;
BEGIN
  IF NEW.source_protocol_id IS NOT NULL THEN
    SELECT project_type INTO _ptype FROM public.task_groups WHERE id = NEW.source_protocol_id;
    IF _ptype IS DISTINCT FROM 'protocol' THEN
      RAISE EXCEPTION 'source_protocol_id должен указывать на проект с project_type = protocol';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_task_group_view_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.view_mode = 'lens' THEN
    IF NEW.project_type IN ('npd', 'crm', 'stm', 'protocol') THEN
      RAISE EXCEPTION 'Проекты типа % не могут быть линзой', NEW.project_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- linked_tag_id больше не обязателен: теги хранятся в task_group_linked_tags (m:n).
    -- Пустая линза допустима — она просто не покажет задач, пока не привяжут тег.
  END IF;
  RETURN NEW;
END;
$function$
;


-- ========== TRIGGERS ==========
CREATE TRIGGER trg_client_assignments_updated_at BEFORE UPDATE ON public.client_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER sync_client_room_members_upd AFTER UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION trg_sync_client_room_on_client_update();
CREATE TRIGGER trg_prevent_duplicate_client BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_client();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contractors_updated_at BEFORE UPDATE ON public.contractors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_decisions_set_user_id BEFORE INSERT ON public.decisions FOR EACH ROW EXECUTE FUNCTION decisions_set_user_id();
CREATE TRIGGER trg_decisions_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER departments_check_hierarchy BEFORE INSERT OR UPDATE OF parent_department_id ON public.departments FOR EACH ROW EXECUTE FUNCTION check_department_hierarchy();
CREATE TRIGGER trg_sync_department_head_membership AFTER INSERT OR UPDATE OF head_user_id ON public.departments FOR EACH ROW EXECUTE FUNCTION sync_department_head_membership();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_group_messages_updated_at BEFORE UPDATE ON public.group_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER group_tags_sync_protocol_tasks AFTER INSERT OR DELETE ON public.group_tags FOR EACH ROW EXECUTE FUNCTION trg_group_tags_sync_protocol_tasks();
CREATE TRIGGER kanban_boards_default_columns AFTER INSERT ON public.kanban_boards FOR EACH ROW EXECUTE FUNCTION create_default_kanban_columns();
CREATE TRIGGER update_kanban_boards_updated_at BEFORE UPDATE ON public.kanban_boards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER on_new_profile_notify_admins AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION notify_new_user_registration();
CREATE TRIGGER protect_is_approved_trigger BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_is_approved();
CREATE TRIGGER trg_log_profile_changes AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION log_profile_changes();
CREATE TRIGGER trg_sync_consultant_role AFTER INSERT OR UPDATE OF contractor_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION sync_consultant_role();
CREATE TRIGGER trg_resolve_deps_on_ms_change AFTER UPDATE OF planned_date ON public.project_milestones FOR EACH STATEMENT EXECUTE FUNCTION trigger_resolve_dependencies();
CREATE TRIGGER update_project_milestones_updated_at BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER protect_system_protocol_templates_trg BEFORE DELETE OR UPDATE ON public.protocol_templates FOR EACH ROW EXECUTE FUNCTION protect_system_protocol_templates();
CREATE TRIGGER protocol_templates_set_updated_at BEFORE UPDATE ON public.protocol_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_report_pages_updated_at BEFORE UPDATE ON public.report_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stm_structure_nodes_updated_at BEFORE UPDATE ON public.stm_structure_nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_protect_system_tag_categories BEFORE DELETE OR UPDATE ON public.tag_categories FOR EACH ROW EXECUTE FUNCTION protect_system_tag_categories();
CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_resolve_deps_on_dep_change AFTER INSERT OR DELETE OR UPDATE ON public.task_dependencies FOR EACH STATEMENT EXECUTE FUNCTION trigger_resolve_dependencies();
CREATE TRIGGER auto_assign_project_tag_category_trigger AFTER INSERT ON public.task_groups FOR EACH ROW EXECUTE FUNCTION auto_assign_project_tag_category();
CREATE TRIGGER sync_client_room_members_ins AFTER INSERT ON public.task_groups FOR EACH ROW EXECUTE FUNCTION trg_sync_client_room_on_insert();
CREATE TRIGGER validate_task_group_view_mode_trigger BEFORE INSERT OR UPDATE OF view_mode, project_type, linked_tag_id ON public.task_groups FOR EACH ROW EXECUTE FUNCTION validate_task_group_view_mode();
CREATE TRIGGER protocol_draft_assignee_review AFTER INSERT OR UPDATE OF assigned_to ON public.tasks FOR EACH ROW EXECUTE FUNCTION trg_protocol_draft_assignee_review();
CREATE TRIGGER task_sync_protocol_context AFTER INSERT OR UPDATE OF group_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION trg_task_sync_protocol_context();
CREATE TRIGGER trg_auto_set_source_protocol BEFORE INSERT OR UPDATE OF group_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION auto_set_source_protocol();
CREATE TRIGGER trg_enforce_assignee_exclusivity BEFORE INSERT OR UPDATE OF assigned_to, department_id, contractor_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION enforce_assignee_exclusivity();
CREATE TRIGGER trg_log_task_field_changes AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION log_task_field_changes();
CREATE TRIGGER trg_notify_department_head_on_assign AFTER INSERT OR UPDATE OF department_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION notify_department_head_on_assign();
CREATE TRIGGER trg_resolve_deps_on_task_change AFTER UPDATE OF start_at, deadline ON public.tasks FOR EACH STATEMENT EXECUTE FUNCTION trigger_resolve_dependencies();
CREATE TRIGGER trg_set_original_deadline BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_original_deadline();
CREATE TRIGGER trg_sync_linked_project_participants AFTER INSERT OR UPDATE OF status_meta ON public.tasks FOR EACH ROW EXECUTE FUNCTION sync_linked_project_participants();
CREATE TRIGGER trg_sync_stm_milestone_from_stage_task AFTER INSERT OR UPDATE OF deadline ON public.tasks FOR EACH ROW EXECUTE FUNCTION sync_stm_milestone_from_stage_task();
CREATE TRIGGER trg_validate_source_protocol BEFORE INSERT OR UPDATE OF source_protocol_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION validate_source_protocol();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER sync_primary_dept AFTER INSERT OR DELETE OR UPDATE ON public.user_departments FOR EACH ROW EXECUTE FUNCTION sync_primary_department_to_profile();

-- ========== GRANTS (tables) ==========

-- ========== GRANTS (functions) ==========
GRANT EXECUTE ON FUNCTION public.admin_delete_user(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_user(target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_user(target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_user(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_users_department(user_ids uuid[], dept_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_users_department(user_ids uuid[], dept_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_set_users_department(user_ids uuid[], dept_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(target_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(target_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(target_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_project_tag_category() TO anon;
GRANT EXECUTE ON FUNCTION public.auto_assign_project_tag_category() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_assign_project_tag_category() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_set_source_protocol() TO anon;
GRANT EXECUTE ON FUNCTION public.auto_set_source_protocol() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_set_source_protocol() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_task(_user_id uuid, _task_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_see_task(_user_id uuid, _task_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_see_task(_user_id uuid, _task_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile(_profile_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile(_profile_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(_profile_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_department_hierarchy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_department_hierarchy() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_department_hierarchy() TO anon;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultant_company(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_company(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultant_company(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_kanban_columns() TO anon;
GRANT EXECUTE ON FUNCTION public.create_default_kanban_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_kanban_columns() TO service_role;
GRANT EXECUTE ON FUNCTION public.debug_user_visible_groups(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_user_visible_groups(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.debug_user_visible_groups(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decisions_set_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decisions_set_user_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.decisions_set_user_id() TO anon;
GRANT EXECUTE ON FUNCTION public.delegation_profile_ids(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delegation_profile_ids(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delegation_profile_ids(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.department_depth(_dept_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.department_depth(_dept_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.department_depth(_dept_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO anon;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO anon;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_assignee_exclusivity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_assignee_exclusivity() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_assignee_exclusivity() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_protocol_review_task(_protocol_id uuid, _assignee uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_protocol_review_task(_protocol_id uuid, _assignee uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_protocol_review_task(_protocol_id uuid, _assignee uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_department_descendants(_dept_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_department_descendants(_dept_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_department_descendants(_dept_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_group_task_stats(_group_ids uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_group_task_stats(_group_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_task_stats(_group_ids uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_auth_meta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_auth_meta() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_profile_approval() TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_approval() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_approval() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_threads() TO anon;
GRANT EXECUTE ON FUNCTION public.get_unread_threads() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_threads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_departments(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_departments(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_departments(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_visible_departments(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_visible_departments(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_visible_departments(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_consultant(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_consultant(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_consultant(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_npd_stm_group(_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_npd_stm_group(_group_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_npd_stm_group(_group_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_protocol_draft(_group_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_protocol_draft(_group_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_protocol_draft(_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_director(_team_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_team_director(_team_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_team_director(_team_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(_team_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(_team_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_team_member(_team_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_user_active(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_user_active(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_user_active(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_profile_changes() TO anon;
GRANT EXECUTE ON FUNCTION public.log_profile_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_profile_changes() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_task_field_changes() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_task_field_changes() TO anon;
GRANT EXECUTE ON FUNCTION public.log_task_field_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text) TO anon;
GRANT EXECUTE ON FUNCTION public.manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(_thread_id text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(_thread_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(_thread_id text) TO anon;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_department_head_on_assign() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_department_head_on_assign() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_department_head_on_assign() TO anon;
GRANT EXECUTE ON FUNCTION public.notify_new_user_registration() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_user_registration() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_new_user_registration() TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_client() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_client() TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_client() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_is_approved() TO anon;
GRANT EXECUTE ON FUNCTION public.protect_is_approved() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_is_approved() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_system_protocol_templates() TO anon;
GRANT EXECUTE ON FUNCTION public.protect_system_protocol_templates() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_system_protocol_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_system_tag_categories() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_system_tag_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_system_tag_categories() TO anon;
GRANT EXECUTE ON FUNCTION public.protocol_copyable_system_keys() TO service_role;
GRANT EXECUTE ON FUNCTION public.protocol_copyable_system_keys() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protocol_copyable_system_keys() TO anon;
GRANT EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) TO anon;
GRANT EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_dependency_violations() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_dependency_violations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_dependency_violations() TO anon;
GRANT EXECUTE ON FUNCTION public.seed_onboarding_data(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.seed_onboarding_data(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_onboarding_data(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_protocol_status_for_user(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.seed_protocol_status_for_user(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_protocol_status_for_user(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_protocol_templates(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.seed_protocol_templates(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_protocol_templates(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_system_tag_categories(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_system_tag_categories(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.seed_system_tag_categories(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_original_deadline() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_original_deadline() TO anon;
GRANT EXECUTE ON FUNCTION public.set_original_deadline() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_client_room_members(_group_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_client_room_members(_group_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_client_room_members(_group_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_consultant_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_consultant_role() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_consultant_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_department_head_membership() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_department_head_membership() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_department_head_membership() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_linked_project_participants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_linked_project_participants() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_linked_project_participants() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_primary_department_to_profile() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_primary_department_to_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_primary_department_to_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_stm_milestone_from_stage_task() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_stm_milestone_from_stage_task() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_stm_milestone_from_stage_task() TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.trg_group_tags_sync_protocol_tasks() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_group_tags_sync_protocol_tasks() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_group_tags_sync_protocol_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_protocol_draft_assignee_review() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_protocol_draft_assignee_review() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_protocol_draft_assignee_review() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_sync_client_room_on_client_update() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_sync_client_room_on_client_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_sync_client_room_on_client_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_sync_client_room_on_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_sync_client_room_on_insert() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_sync_client_room_on_insert() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_task_sync_protocol_context() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_task_sync_protocol_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_task_sync_protocol_context() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_resolve_dependencies() TO anon;
GRANT EXECUTE ON FUNCTION public.trigger_resolve_dependencies() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_resolve_dependencies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_client_by_name(_name text, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_client_by_name(_name text, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_client_by_name(_name text, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_extra_tasks_arr(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_extra_tasks_arr(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_extra_tasks_arr(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_extra_visible_task_ids(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_extra_visible_task_ids(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_extra_visible_task_ids(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_protocol_groups_arr(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_protocol_groups_arr(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_protocol_groups_arr(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_subordinate_ids(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_subordinate_ids(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_subordinate_ids(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_subordinates_arr(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_subordinates_arr(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_subordinates_arr(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_visible_department_ids(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_visible_department_ids(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_visible_department_ids(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_visible_depts_arr(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_visible_depts_arr(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_visible_depts_arr(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_visible_group_ids(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_visible_group_ids(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_visible_group_ids(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_visible_groups_arr(_user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.user_visible_groups_arr(_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_visible_groups_arr(_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_source_protocol() TO anon;
GRANT EXECUTE ON FUNCTION public.validate_source_protocol() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_source_protocol() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_task_group_view_mode() TO anon;
GRANT EXECUTE ON FUNCTION public.validate_task_group_view_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_task_group_view_mode() TO service_role;

-- END
