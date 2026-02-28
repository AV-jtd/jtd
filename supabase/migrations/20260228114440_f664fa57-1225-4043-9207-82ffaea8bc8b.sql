
-- Add task_type column to tasks table
ALTER TABLE public.tasks ADD COLUMN task_type text NOT NULL DEFAULT 'standard';

-- Add client_id column to tasks (nullable FK to clients)
ALTER TABLE public.tasks ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- Index for quick CRM task lookups
CREATE INDEX idx_tasks_task_type ON public.tasks(task_type) WHERE task_type != 'standard';
CREATE INDEX idx_tasks_client_id ON public.tasks(client_id) WHERE client_id IS NOT NULL;
