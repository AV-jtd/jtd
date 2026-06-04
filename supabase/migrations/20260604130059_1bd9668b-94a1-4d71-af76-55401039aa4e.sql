ALTER TABLE public.task_groups
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_groups_client_id
  ON public.task_groups (client_id)
  WHERE client_id IS NOT NULL;