
-- ============================================================
-- СИСТЕМНАЯ ОПТИМИЗАЦИЯ RLS ДЛЯ tasks И subtasks
-- Цель: 13 PERMISSIVE-политик → 1 быстрая SECURITY DEFINER функция
-- Видимость НЕ меняется (тождественное OR-преобразование)
-- ============================================================

-- ===== 1. Создаём единую функцию проверки видимости задачи =====
CREATE OR REPLACE FUNCTION public.can_see_task(_user_id uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        -- 1. Owner (самая частая → first)
        t.user_id = _user_id
        -- 2. Assignee
        OR t.assigned_to = _user_id
        -- 3. Task participant
        OR public.is_task_participant(t.id, _user_id)
        -- 4. Group member
        OR (t.group_id IS NOT NULL AND public.is_group_member(t.group_id, _user_id))
        -- 5. Group owner
        OR (t.group_id IS NOT NULL AND public.is_group_owner(t.group_id, _user_id))
        -- 6. Department member
        OR (t.department_id IS NOT NULL AND public.user_belongs_to_department(_user_id, t.department_id))
        -- 7. Parent group owner of subgroup
        OR (t.group_id IS NOT NULL AND public.is_subgroup_of_owner_group(t.group_id, _user_id))
        -- 8. Parent group member of subgroup
        OR (t.group_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.task_groups tg
              WHERE tg.id = t.group_id
                AND tg.parent_id IS NOT NULL
                AND public.is_full_group_member(tg.parent_id, _user_id)
            ))
        -- 9. Supervisor of task owner in shared group
        OR (t.group_id IS NOT NULL
            AND public.is_supervisor_of_user(_user_id, t.user_id)
            AND (public.is_group_owner(t.group_id, _user_id)
                 OR public.is_group_member(t.group_id, _user_id)))
        -- 10. Internal protocol attendee
        OR (t.group_id IS NOT NULL AND public.is_protocol_internal_attendee(t.group_id, _user_id))
        -- 11. Tag access
        OR public.task_has_tag_access(t.id, _user_id)
      )
  );
$$;

-- ===== 2. Удаляем 11 старых PERMISSIVE-политик SELECT на tasks =====
DROP POLICY IF EXISTS "Delegatees can view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Department members can view department tasks" ON public.tasks;
DROP POLICY IF EXISTS "Group members can view group tasks" ON public.tasks;
DROP POLICY IF EXISTS "Group owners can view group tasks" ON public.tasks;
DROP POLICY IF EXISTS "Internal attendees can view protocol tasks" ON public.tasks;
DROP POLICY IF EXISTS "Parent group members can view subgroup tasks" ON public.tasks;
DROP POLICY IF EXISTS "Parent group owners can view subgroup tasks" ON public.tasks;
DROP POLICY IF EXISTS "Supervisors can view subordinate tasks in shared groups" ON public.tasks;
DROP POLICY IF EXISTS "Tag access holders can view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Task participants can view tasks" ON public.tasks;

-- Оставляем как есть:
-- - "Admins full access to tasks" (FOR ALL, has_role)
-- - "Owners manage tasks" (FOR ALL, user_id = uid) — нужен для INSERT/UPDATE/DELETE
-- - "Consultant restriction on tasks" (RESTRICTIVE) — обязательная

-- ===== 3. Создаём ОДНУ объединённую SELECT-политику =====
CREATE POLICY "Users can see visible tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (public.can_see_task(auth.uid(), id));

-- ===== 4. Аналогично для subtasks (там 19 политик) =====

-- Удаляем дублирующиеся SELECT-политики на subtasks
DROP POLICY IF EXISTS "Delegatees can view subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Group members can view subtasks of group tasks" ON public.subtasks;
DROP POLICY IF EXISTS "Internal attendees can view protocol subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Parent group members can view subgroup subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Task participants can view subtasks" ON public.subtasks;

-- Одна объединённая политика на subtasks через can_see_task родителя
CREATE POLICY "Users can see subtasks of visible tasks"
ON public.subtasks
FOR SELECT
TO authenticated
USING (public.can_see_task(auth.uid(), task_id));

-- ===== 5. ANALYZE чтобы планировщик увидел =====
ANALYZE public.tasks;
ANALYZE public.subtasks;
