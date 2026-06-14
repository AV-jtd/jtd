-- STM stage status: pending / in_progress / blocked / done
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS stage_status text;

-- Allowed values (NULL allowed for non-STM tasks)
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_stage_status_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_stage_status_check
  CHECK (stage_status IS NULL OR stage_status IN ('pending','in_progress','blocked','done'));

-- Backfill for existing STM stage tasks: done if completed, otherwise pending
UPDATE public.tasks
  SET stage_status = CASE WHEN is_completed THEN 'done' ELSE 'pending' END
  WHERE task_type = 'stm_stage' AND stage_status IS NULL;