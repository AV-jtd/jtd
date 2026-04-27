-- Расширяем права internal_attendees: после публикации протокола они тоже
-- должны иметь возможность править свои строки и назначать ответственных,
-- иначе переговоры/кросс-функциональные встречи становятся "только для чтения"
-- для всех, кроме создателя протокола.

DROP POLICY IF EXISTS "Internal attendees can update published protocol tasks" ON public.tasks;
CREATE POLICY "Internal attendees can update published protocol tasks"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    group_id IS NOT NULL
    AND public.is_protocol_internal_attendee(group_id, auth.uid())
  )
  WITH CHECK (
    group_id IS NOT NULL
    AND public.is_protocol_internal_attendee(group_id, auth.uid())
  );

-- Аналогично для подзадач (шагов) опубликованного протокола
DROP POLICY IF EXISTS "Internal attendees can update published protocol subtasks" ON public.subtasks;
CREATE POLICY "Internal attendees can update published protocol subtasks"
  ON public.subtasks
  FOR UPDATE
  TO authenticated
  USING (public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), false))
  WITH CHECK (public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), false));