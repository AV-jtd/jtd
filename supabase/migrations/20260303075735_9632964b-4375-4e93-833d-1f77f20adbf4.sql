
-- Task participants can update subtasks (mark steps as completed)
CREATE POLICY "Task participants can update subtasks"
ON public.subtasks
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = subtasks.task_id AND tp.user_id = auth.uid()
  )
);

-- Task participants can create subtasks (needed for CRM stage creation when moving tasks)
CREATE POLICY "Task participants can create subtasks"
ON public.subtasks
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = subtasks.task_id AND tp.user_id = auth.uid()
  )
);

-- Task participants can delete subtasks (needed for CRM stage removal)
CREATE POLICY "Task participants can delete subtasks"
ON public.subtasks
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = subtasks.task_id AND tp.user_id = auth.uid()
  )
);
