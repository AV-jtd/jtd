-- Связи на Ганте: вехи и чтение только что созданной связи (01.10.2026).
--
-- Найдено на проекте сотрудника, который строил Гант через коннектор:
--   1) связь «веха → задача» не создавалась ни у кого, кроме администраторов:
--      проверка на вставку искала предшественника только в tasks;
--   2) связи с вехами не были видны никому, кроме администраторов:
--      can_access_dependency соединял обе стороны с tasks (74 из 610 связей);
--   3) вставка с RETURNING (коннектор) падала даже для задача → задача:
--      политика чтения искала связь по id в таблице, а STABLE-функция внутри
--      той же команды новой строки ещё не видит.
-- Доступ остаётся прежним по смыслу: автор задачи, владелец или участник
-- проекта; для вехи — владелец или участник её проекта. Проверка теперь по
-- полям самой строки, без повторного поиска связи.

CREATE OR REPLACE FUNCTION public.can_access_plan_entity(_id uuid, _kind text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _kind = 'milestone' THEN EXISTS (
      SELECT 1 FROM public.project_milestones m
      WHERE m.id = _id
        AND (is_group_owner(m.group_id, _user_id) OR is_group_member(m.group_id, _user_id)))
    ELSE EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = _id
        AND (t.user_id = _user_id
             OR (t.group_id IS NOT NULL AND (is_group_owner(t.group_id, _user_id) OR is_group_member(t.group_id, _user_id)))))
  END;
$$;

REVOKE ALL ON FUNCTION public.can_access_plan_entity(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_plan_entity(uuid, text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view dependencies for accessible tasks" ON public.task_dependencies;
CREATE POLICY "Users can view dependencies for accessible tasks" ON public.task_dependencies
  FOR SELECT USING (
    can_access_plan_entity(predecessor_id, predecessor_entity_type, auth.uid())
    OR can_access_plan_entity(successor_id, successor_entity_type, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create dependencies for own/group tasks" ON public.task_dependencies;
CREATE POLICY "Users can create dependencies for own/group tasks" ON public.task_dependencies
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND can_access_plan_entity(predecessor_id, predecessor_entity_type, auth.uid())
  );
