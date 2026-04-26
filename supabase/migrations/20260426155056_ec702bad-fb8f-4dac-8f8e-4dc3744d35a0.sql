
-- Главный приём: в USING-выражении используем подзапросы IN (SELECT ...) 
-- БЕЗ обёртывающих функций — Postgres может построить bitmap OR по индексам.
-- SECURITY DEFINER изолируем в маленьких функциях БЕЗ STABLE-обёрток вокруг них.

DROP POLICY IF EXISTS "Users can see visible tasks" ON public.tasks;

CREATE POLICY "Users can see visible tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  -- 1. Owner / assignee — индексы есть, мгновенно
  user_id = auth.uid()
  OR assigned_to = auth.uid()
  -- 2. Group access — через IN с прямым подзапросом (планировщик увидит индекс idx_group_members_user)
  OR (group_id IS NOT NULL AND group_id IN (
        SELECT id FROM public.task_groups WHERE user_id = auth.uid()
        UNION ALL
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      ))
  -- 3. Subgroup access (parent owner/member)
  OR (group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.task_groups tg 
        WHERE tg.id = tasks.group_id 
          AND tg.parent_id IS NOT NULL 
          AND (
            tg.parent_id IN (SELECT id FROM public.task_groups WHERE user_id = auth.uid())
            OR tg.parent_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role IN ('owner','participant'))
          )
      ))
  -- 4. Department access
  OR (department_id IS NOT NULL AND department_id IN (
        SELECT department_id FROM public.user_departments WHERE user_id = auth.uid()
        UNION ALL
        SELECT department_id FROM public.department_directors WHERE director_user_id = auth.uid()
      ))
  -- 5. Task participant
  OR id IN (SELECT task_id FROM public.task_participants WHERE user_id = auth.uid())
  -- 6. Tag access
  OR id IN (
        SELECT tt.task_id FROM public.task_tags tt
          JOIN public.tag_access ta ON ta.tag_id = tt.tag_id
          WHERE ta.user_id = auth.uid()
      )
  -- 7. Supervisor access
  OR (group_id IS NOT NULL 
      AND user_id IN (
        SELECT DISTINCT ud.user_id FROM public.department_directors dd
          JOIN public.user_departments ud ON ud.department_id = dd.department_id
          WHERE dd.director_user_id = auth.uid()
      )
      AND group_id IN (
        SELECT id FROM public.task_groups WHERE user_id = auth.uid()
        UNION ALL
        SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
      ))
  -- 8. Protocol attendee
  OR (group_id IS NOT NULL AND public.is_protocol_internal_attendee(group_id, auth.uid()))
);

-- Дополнительные индексы для ускорения подзапросов
CREATE INDEX IF NOT EXISTS idx_task_groups_parent ON public.task_groups (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_tags_task ON public.task_tags (task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON public.task_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_access_user ON public.tag_access (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_department ON public.tasks (department_id) WHERE department_id IS NOT NULL;

ANALYZE public.tasks;
ANALYZE public.task_groups;
ANALYZE public.group_members;
ANALYZE public.task_participants;
ANALYZE public.task_tags;
ANALYZE public.tag_access;
ANALYZE public.user_departments;
ANALYZE public.department_directors;
