-- Performance indexes for tasks fetching
-- 1) Partial index for global task fetches (excluding stm_stage which dominate the table)
CREATE INDEX IF NOT EXISTS idx_tasks_global_no_stm
  ON public.tasks (is_completed, position, created_at DESC)
  WHERE task_type IS DISTINCT FROM 'stm_stage';

-- 2) Index for protocol/project scoped fetches
CREATE INDEX IF NOT EXISTS idx_tasks_group_id_completed
  ON public.tasks (group_id, is_completed, position)
  WHERE group_id IS NOT NULL;

-- 3) Index for completed_at window queries
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON public.tasks (completed_at DESC)
  WHERE is_completed = true AND completed_at IS NOT NULL;