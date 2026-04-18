-- Add external_ref to tasks for protocol number tracking
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE INDEX IF NOT EXISTS idx_tasks_external_ref_group
  ON public.tasks (group_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tasks.external_ref IS 'External task number from imported source (e.g., protocol № п/п). Used for re-import matching and traceability.';
COMMENT ON COLUMN public.task_participants.role IS 'RACI role: assignee, participant, informed, support, consulted';