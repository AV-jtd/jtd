
-- 1. Add department_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);

-- 2. Cleanup duplicate NPD stream subprojects.
-- Stream subprojects: project_type='npd' AND parent_id IS NOT NULL AND name IN (Продакт, Реклама, ...)
-- Strategy: per (parent_id, name) keep the OLDEST (created_at) record, delete the rest IF they have no tasks.
WITH stream_subs AS (
  SELECT id, parent_id, name, created_at,
         ROW_NUMBER() OVER (PARTITION BY parent_id, name ORDER BY created_at ASC) AS rn
  FROM public.task_groups
  WHERE project_type = 'npd'
    AND parent_id IS NOT NULL
    AND name IN ('Продакт','Реклама','RnD','СКК','Производство','Закупки','Продажи','Покупка оборудования')
),
to_delete AS (
  SELECT s.id
  FROM stream_subs s
  WHERE s.rn > 1
    AND NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.group_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM public.task_groups c WHERE c.parent_id = s.id)
)
DELETE FROM public.task_groups WHERE id IN (SELECT id FROM to_delete);

-- 3. Add unique partial index to prevent future duplicates of stream subprojects per parent
CREATE UNIQUE INDEX IF NOT EXISTS uniq_npd_stream_subproject_per_parent
  ON public.task_groups (parent_id, name)
  WHERE project_type = 'npd'
    AND parent_id IS NOT NULL
    AND name IN ('Продакт','Реклама','RnD','СКК','Производство','Закупки','Продажи','Покупка оборудования');
