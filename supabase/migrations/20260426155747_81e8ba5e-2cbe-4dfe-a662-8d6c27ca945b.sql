-- Дополнительные индексы для ускорения OR-цепочки в политике видимости
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON public.tasks(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_groups_user_id ON public.task_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id ON public.user_departments(user_id);

-- Заменяем политику видимости на версию с inline-подзапросами,
-- чтобы Postgres строил hashed SubPlan и использовал индексы вместо seq scan
DROP POLICY IF EXISTS "Users can see visible tasks" ON public.tasks;

CREATE POLICY "Users can see visible tasks" ON public.tasks
FOR SELECT
USING (
  -- 1) Свои задачи (индекс idx_tasks_user_id)
  user_id = auth.uid()
  -- 2) Назначенные на меня (индекс idx_tasks_assigned_to)
  OR assigned_to = auth.uid()
  -- 3) Группы, где я владелец/участник/в подгруппе (hashed SubPlan)
  OR group_id IN (
    SELECT id FROM public.task_groups WHERE user_id = auth.uid()
    UNION ALL
    SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()
    UNION ALL
    SELECT tg.id FROM public.task_groups tg
      JOIN public.task_groups parent ON parent.id = tg.parent_id
      WHERE parent.user_id = auth.uid()
    UNION ALL
    SELECT tg.id FROM public.task_groups tg
      JOIN public.group_members gm ON gm.group_id = tg.parent_id
      WHERE gm.user_id = auth.uid() AND gm.role IN ('owner', 'participant')
  )
  -- 4) Я — участник задачи (hashed SubPlan + индекс idx_task_participants_user)
  OR id IN (SELECT task_id FROM public.task_participants WHERE user_id = auth.uid())
  -- 5) Задачи моего отдела (hashed SubPlan)
  OR (department_id IS NOT NULL AND department_id IN (
    SELECT department_id FROM public.user_departments WHERE user_id = auth.uid()
  ))
  -- 6) Доп. видимость через теги/протоколы/директорство (через функцию-агрегатор)
  OR id IN (SELECT task_id FROM public.user_extra_visible_task_ids(auth.uid()))
);

-- То же самое для subtasks
DROP POLICY IF EXISTS "Users can see subtasks of visible tasks" ON public.subtasks;

CREATE POLICY "Users can see subtasks of visible tasks" ON public.subtasks
FOR SELECT
USING (
  task_id IN (
    SELECT t.id FROM public.tasks t WHERE
      t.user_id = auth.uid()
      OR t.assigned_to = auth.uid()
      OR t.group_id IN (
        SELECT id FROM public.task_groups WHERE user_id = auth.uid()
        UNION ALL
        SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()
        UNION ALL
        SELECT tg.id FROM public.task_groups tg
          JOIN public.task_groups parent ON parent.id = tg.parent_id
          WHERE parent.user_id = auth.uid()
        UNION ALL
        SELECT tg.id FROM public.task_groups tg
          JOIN public.group_members gm ON gm.group_id = tg.parent_id
          WHERE gm.user_id = auth.uid() AND gm.role IN ('owner', 'participant')
      )
      OR t.id IN (SELECT task_id FROM public.task_participants WHERE user_id = auth.uid())
      OR (t.department_id IS NOT NULL AND t.department_id IN (
        SELECT department_id FROM public.user_departments WHERE user_id = auth.uid()
      ))
      OR t.id IN (SELECT task_id FROM public.user_extra_visible_task_ids(auth.uid()))
  )
  OR assigned_to = auth.uid()
);

-- ANALYZE для обновления статистики после индексов
ANALYZE public.tasks;
ANALYZE public.subtasks;
ANALYZE public.task_groups;
ANALYZE public.group_members;
ANALYZE public.user_departments;