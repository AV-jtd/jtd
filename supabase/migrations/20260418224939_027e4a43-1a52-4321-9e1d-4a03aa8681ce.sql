-- Add draft mode for protocols and bulk-imported tasks
ALTER TABLE public.task_groups
  ADD COLUMN IF NOT EXISTS draft_status text NOT NULL DEFAULT 'published';

ALTER TABLE public.task_groups
  ADD CONSTRAINT task_groups_draft_status_check
  CHECK (draft_status IN ('draft', 'published'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- Index for fast filtering of non-drafts in user dashboards
CREATE INDEX IF NOT EXISTS idx_tasks_is_draft ON public.tasks (is_draft) WHERE is_draft = true;
CREATE INDEX IF NOT EXISTS idx_task_groups_draft_status ON public.task_groups (draft_status) WHERE draft_status = 'draft';