INSERT INTO public.task_participants (task_id, user_id, role)
SELECT t.id, t.assigned_to, 'assignee'
FROM public.tasks t
WHERE t.assigned_to IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = t.id AND tp.role = 'assignee'
  )
ON CONFLICT DO NOTHING;