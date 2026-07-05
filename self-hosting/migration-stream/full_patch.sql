BEGIN;

-- ============================================================
-- 0. Недостающие 15 функций (взяты дословно из schema_live_full.sql)
-- ============================================================
\i /tmp/missing_functions.sql

-- ============================================================
-- 1. task_dependencies: 2 недостающие колонки + backfill из CSV
-- ============================================================
ALTER TABLE public.task_dependencies
  ADD COLUMN predecessor_entity_type text DEFAULT 'task'::text NOT NULL,
  ADD COLUMN successor_entity_type text DEFAULT 'task'::text NOT NULL;

-- ============================================================
-- 2. task_groups.project_type: backfill NULL -> 'standard', затем DEFAULT+NOT NULL
-- ============================================================
UPDATE public.task_groups SET project_type = 'standard' WHERE project_type IS NULL;
ALTER TABLE public.task_groups
  ALTER COLUMN project_type SET DEFAULT 'standard'::text,
  ALTER COLUMN project_type SET NOT NULL;

-- ============================================================
-- 3. wiki_pages.group_id: у нас лишний NOT NULL, в живой схеме nullable
-- ============================================================
ALTER TABLE public.wiki_pages ALTER COLUMN group_id DROP NOT NULL;

-- ============================================================
-- 4. Недостающие индексы (3 из 106)
-- ============================================================
CREATE INDEX idx_task_groups_project_type ON public.task_groups USING btree (project_type) WHERE (project_type = 'protocol'::text);
CREATE UNIQUE INDEX uniq_npd_stream_subproject_per_parent ON public.task_groups USING btree (parent_id, name) WHERE ((project_type = 'npd'::text) AND (parent_id IS NOT NULL) AND (name = ANY (ARRAY['Продакт'::text, 'Реклама'::text, 'RnD'::text, 'СКК'::text, 'Производство'::text, 'Закупки'::text, 'Продажи'::text, 'Покупка оборудования'::text])));
CREATE INDEX idx_tasks_client_id ON public.tasks(client_id) WHERE client_id IS NOT NULL;

-- ============================================================
-- 5. RLS: убрать 2 мои неверные политики на task_step_templates,
--    докатить 49 отсутствующих (точные тела из schema_live_full.sql)
-- ============================================================
DROP POLICY IF EXISTS "Non-consultants view step templates" ON public.task_step_templates;
DROP POLICY IF EXISTS "Users manage own step templates" ON public.task_step_templates;

\i /tmp/missing_policies.sql

COMMIT;
