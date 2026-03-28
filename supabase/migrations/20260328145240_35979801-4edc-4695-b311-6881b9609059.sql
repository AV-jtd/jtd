ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closure_result text DEFAULT NULL;