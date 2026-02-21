
-- Add deferred_until column to tasks
ALTER TABLE public.tasks ADD COLUMN deferred_until timestamp with time zone DEFAULT NULL;

-- Create index for efficient filtering
CREATE INDEX idx_tasks_deferred_until ON public.tasks (deferred_until) WHERE deferred_until IS NOT NULL;
