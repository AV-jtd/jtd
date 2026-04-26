
-- Переписываем can_see_task: принимаем поля задачи напрямую
-- вместо повторного SELECT по tasks (который дублирует работу планировщика)
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
    -- 1. Owner (хит ~80% случаев)
    _task_user_id = _user_id
    -- 2. Assignee
    OR _task_assigned_to = _user_id
    -- 3. Group member
    OR (_task_group_id IS NOT NULL AND public.is_group_member(_task_group_id, _user_id))
    -- 4. Group owner
    OR (_task_group_id IS NOT NULL AND public.is_group_owner(_task_group_id, _user_id))
    -- 5. Department member
    OR (_task_department_id IS NOT NULL AND public.user_belongs_to_department(_user_id, _task_department_id))
    -- 6. Task participant
    OR public.is_task_participant(_task_id, _user_id)
    -- 7. Parent group owner of subgroup
    OR (_task_group_id IS NOT NULL AND public.is_subgroup_of_owner_group(_task_group_id, _user_id))
    -- 8. Parent group member of subgroup
    OR (_task_group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.task_groups tg
          WHERE tg.id = _task_group_id
            AND tg.parent_id IS NOT NULL
            AND public.is_full_group_member(tg.parent_id, _user_id)
        ))
    -- 9. Supervisor of task owner in shared group
    OR (_task_group_id IS NOT NULL
        AND public.is_supervisor_of_user(_user_id, _task_user_id)
        AND (public.is_group_owner(_task_group_id, _user_id)
             OR public.is_group_member(_task_group_id, _user_id)))
    -- 10. Internal protocol attendee
    OR (_task_group_id IS NOT NULL AND public.is_protocol_internal_attendee(_task_group_id, _user_id))
    -- 11. Tag access
    OR public.task_has_tag_access(_task_id, _user_id);
$$;

-- Пересоздаём политику с inline-вызовом (без EXISTS-обёртки в can_see_task)
DROP POLICY IF EXISTS "Users can see visible tasks" ON public.tasks;

CREATE POLICY "Users can see visible tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  public.can_see_task_row(
    auth.uid(),
    user_id,
    assigned_to,
    id,
    group_id,
    department_id
  )
);

-- Subtasks: оставляем через старую can_see_task (там нужен lookup по task_id)
-- но переписываем её inline тоже
CREATE OR REPLACE FUNCTION public.can_see_task(_user_id uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND public.can_see_task_row(
        _user_id, t.user_id, t.assigned_to, t.id, t.group_id, t.department_id
      )
  );
$$;

ANALYZE public.tasks;
