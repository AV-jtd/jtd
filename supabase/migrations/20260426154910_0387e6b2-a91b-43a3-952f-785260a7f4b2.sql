
-- Финальная стратегия: собираем все видимые ID в массив один раз,
-- кешируем через STABLE + используем = ANY(array) — это hash-lookup в Postgres

CREATE OR REPLACE FUNCTION public.user_visible_groups_arr(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.user_visible_depts_arr(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT d), ARRAY[]::uuid[])
  FROM (
    SELECT department_id AS d FROM public.user_departments WHERE user_id = _user_id
    UNION
    SELECT department_id FROM public.department_directors WHERE director_user_id = _user_id
  ) sub;
$$;

CREATE OR REPLACE FUNCTION public.user_extra_tasks_arr(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::uuid[])
  FROM (
    SELECT task_id AS t FROM public.task_participants WHERE user_id = _user_id
    UNION
    SELECT tt.task_id FROM public.task_tags tt
      JOIN public.tag_access ta ON ta.tag_id = tt.tag_id
      WHERE ta.user_id = _user_id
  ) sub;
$$;

CREATE OR REPLACE FUNCTION public.user_subordinates_arr(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT ud.user_id), ARRAY[]::uuid[])
  FROM public.department_directors dd
    JOIN public.user_departments ud ON ud.department_id = dd.department_id
  WHERE dd.director_user_id = _user_id AND ud.user_id != _user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_protocol_groups_arr(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT tg.id), ARRAY[]::uuid[])
  FROM public.task_groups tg
  WHERE tg.protocol_meta IS NOT NULL
    AND public.is_protocol_internal_attendee(tg.id, _user_id);
$$;

-- Главная проверка: все сравнения через = ANY(array)
CREATE OR REPLACE FUNCTION public.can_see_task_row(
  _user_id uuid,
  _task_user_id uuid,
  _task_assigned_to uuid,
  _task_id uuid,
  _task_group_id uuid,
  _task_department_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _task_user_id = _user_id
    OR _task_assigned_to = _user_id
    OR (_task_group_id IS NOT NULL AND _task_group_id = ANY(public.user_visible_groups_arr(_user_id)))
    OR (_task_department_id IS NOT NULL AND _task_department_id = ANY(public.user_visible_depts_arr(_user_id)))
    OR _task_id = ANY(public.user_extra_tasks_arr(_user_id))
    OR (_task_group_id IS NOT NULL
        AND _task_user_id = ANY(public.user_subordinates_arr(_user_id))
        AND _task_group_id = ANY(public.user_visible_groups_arr(_user_id)))
    OR (_task_group_id IS NOT NULL AND _task_group_id = ANY(public.user_protocol_groups_arr(_user_id)));
$$;

ANALYZE public.tasks;
