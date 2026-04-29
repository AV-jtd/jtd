
SET lock_timeout = '3s';
SET statement_timeout = '15s';

CREATE OR REPLACE FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
          OR EXISTS (
            SELECT 1 FROM public.user_extra_visible_task_ids(_user_id) x(task_id)
            WHERE x.task_id = t.id
          )
        )
    )
  ELSE false END;
$$;

REVOKE ALL ON FUNCTION public.is_task_visible(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_task_visible(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_task_visible(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can see visible tasks" ON public.tasks;
CREATE POLICY "Users can see visible tasks"
ON public.tasks
FOR SELECT
TO public
USING (public.is_task_visible(id, auth.uid()));

DROP POLICY IF EXISTS "Users can see subtasks of visible tasks" ON public.subtasks;
CREATE POLICY "Users can see subtasks of visible tasks"
ON public.subtasks
FOR SELECT
TO public
USING (
  assigned_to = auth.uid()
  OR public.is_task_visible(task_id, auth.uid())
);
