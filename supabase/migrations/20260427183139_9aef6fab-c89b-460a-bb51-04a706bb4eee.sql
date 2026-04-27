CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks (task_id);
ANALYZE public.subtasks;