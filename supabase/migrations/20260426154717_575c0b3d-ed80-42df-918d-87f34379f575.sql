
-- Префетч-функции: возвращают set of uuid доступных групп/задач за 1 проход.
-- STABLE → Postgres кеширует результат на запрос. SECURITY DEFINER → обходит RLS внутри.

-- Все group_id, к которым у пользователя есть доступ
CREATE OR REPLACE FUNCTION public.user_visible_group_ids(_user_id uuid)
RETURNS TABLE(group_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Все department_id, видимые пользователю
CREATE OR REPLACE FUNCTION public.user_visible_department_ids(_user_id uuid)
RETURNS TABLE(department_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ud.department_id FROM public.user_departments ud WHERE ud.user_id = _user_id
  UNION
  SELECT dd.department_id FROM public.department_directors dd WHERE dd.director_user_id = _user_id;
$$;

-- Все task_id, к которым доступ через task_participants или tag_access
CREATE OR REPLACE FUNCTION public.user_extra_visible_task_ids(_user_id uuid)
RETURNS TABLE(task_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.task_id FROM public.task_participants tp WHERE tp.user_id = _user_id
  UNION
  SELECT tt.task_id FROM public.task_tags tt
    JOIN public.tag_access ta ON ta.tag_id = tt.tag_id
    WHERE ta.user_id = _user_id;
$$;

-- Все user_id подчинённых (для supervisor-доступа)
CREATE OR REPLACE FUNCTION public.user_subordinate_ids(_user_id uuid)
RETURNS TABLE(subordinate_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Подчинённые через department_directors → user_departments
  SELECT DISTINCT ud.user_id
  FROM public.department_directors dd
    JOIN public.user_departments ud ON ud.department_id = dd.department_id
  WHERE dd.director_user_id = _user_id
    AND ud.user_id != _user_id;
$$;

-- Перезаписываем основную проверку на использование IN (set) — Postgres хеширует set
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
    -- Самые частые/дешёвые → first
    _task_user_id = _user_id
    OR _task_assigned_to = _user_id
    OR (_task_group_id IS NOT NULL AND _task_group_id IN (SELECT g.group_id FROM public.user_visible_group_ids(_user_id) g))
    OR (_task_department_id IS NOT NULL AND _task_department_id IN (SELECT d.department_id FROM public.user_visible_department_ids(_user_id) d))
    OR _task_id IN (SELECT x.task_id FROM public.user_extra_visible_task_ids(_user_id) x)
    -- Supervisor: проверяем только если задача в видимой группе И автор = подчинённый
    OR (_task_group_id IS NOT NULL
        AND _task_user_id IN (SELECT s.subordinate_id FROM public.user_subordinate_ids(_user_id) s)
        AND _task_group_id IN (SELECT g.group_id FROM public.user_visible_group_ids(_user_id) g));
$$;

ANALYZE public.tasks;
