
CREATE POLICY "Task participants can view tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = tasks.id AND tp.user_id = auth.uid()
  )
);
