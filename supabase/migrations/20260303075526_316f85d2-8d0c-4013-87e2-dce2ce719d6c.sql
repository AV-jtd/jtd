
-- Task participants can update tasks (e.g. toggle completion status)
CREATE POLICY "Task participants can update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = tasks.id AND tp.user_id = auth.uid()
  )
);

-- Task participants can view comments on their tasks
CREATE POLICY "Task participants can view comments"
ON public.task_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = task_comments.task_id AND tp.user_id = auth.uid()
  )
);

-- Task participants can add comments to their tasks
CREATE POLICY "Task participants can add comments"
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = task_comments.task_id AND tp.user_id = auth.uid()
  )
);

-- Task participants can view subtasks
CREATE POLICY "Task participants can view subtasks"
ON public.subtasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = subtasks.task_id AND tp.user_id = auth.uid()
  )
);

-- Task participants can view task tags
CREATE POLICY "Task participants can view task tags"
ON public.task_tags
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp
    WHERE tp.task_id = task_tags.task_id AND tp.user_id = auth.uid()
  )
);
