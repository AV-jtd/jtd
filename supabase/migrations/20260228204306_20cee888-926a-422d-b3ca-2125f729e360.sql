-- Add start_at column to tasks for planned start date (separate from created_at)
ALTER TABLE public.tasks ADD COLUMN start_at timestamp with time zone DEFAULT NULL;

-- Add UPDATE policy for task_dependencies so users can edit dependencies they created
CREATE POLICY "Users can update dependencies they created"
ON public.task_dependencies
FOR UPDATE
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);
