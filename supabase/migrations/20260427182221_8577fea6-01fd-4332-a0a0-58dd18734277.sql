-- 1) Понизить лишних assignee до participant (всех, кто не совпадает с tasks.assigned_to)
UPDATE public.task_participants tp
SET role = 'participant'
FROM public.tasks t
WHERE tp.task_id = t.id
  AND tp.role = 'assignee'
  AND (t.assigned_to IS NULL OR tp.user_id <> t.assigned_to);

-- 2) Если у задачи уже есть participant-запись для tasks.assigned_to — поднять её до assignee
UPDATE public.task_participants tp
SET role = 'assignee'
FROM public.tasks t
WHERE tp.task_id = t.id
  AND t.assigned_to IS NOT NULL
  AND tp.user_id = t.assigned_to
  AND tp.role <> 'assignee';

-- 3) Если в tasks.assigned_to есть пользователь, но записи в task_participants нет — добавить
INSERT INTO public.task_participants (task_id, user_id, role)
SELECT t.id, t.assigned_to, 'assignee'
FROM public.tasks t
WHERE t.assigned_to IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = t.id AND tp.user_id = t.assigned_to
  );

-- 4) Уникальный индекс: один assignee на задачу
CREATE UNIQUE INDEX IF NOT EXISTS task_participants_one_assignee_per_task
  ON public.task_participants (task_id)
  WHERE role = 'assignee';