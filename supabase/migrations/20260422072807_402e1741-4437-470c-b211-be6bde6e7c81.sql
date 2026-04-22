-- STM milestone sync: tasks.deadline (stm_stage with milestone-bearing stage_key)
-- is the single source of truth. project_milestones.planned_date is a derived
-- mirror, kept in sync by this trigger so the Gantt shows the same date as the matrix.

CREATE OR REPLACE FUNCTION public.sync_stm_milestone_from_stage_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _milestone_name text;
BEGIN
  -- Only react to STM stage tasks whose stage_key is one of the two milestone gates.
  IF NEW.task_type IS DISTINCT FROM 'stm_stage' THEN
    RETURN NEW;
  END IF;

  IF NEW.stage_key NOT IN ('approval', 'order_release') THEN
    RETURN NEW;
  END IF;

  -- Skip when nothing changed (deadline same as before).
  IF TG_OP = 'UPDATE'
     AND NEW.deadline IS NOT DISTINCT FROM OLD.deadline THEN
    RETURN NEW;
  END IF;

  -- Project must exist.
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  _milestone_name := CASE NEW.stage_key
    WHEN 'approval'      THEN 'Утверждён в сети'
    WHEN 'order_release' THEN 'Первый заказ'
  END;

  -- Update the matching milestone if it exists. We do NOT auto-create
  -- a milestone for legacy SKUs (per product decision: only new SKUs).
  IF NEW.deadline IS NOT NULL THEN
    UPDATE public.project_milestones
       SET planned_date = NEW.deadline,
           updated_at   = now()
     WHERE group_id = NEW.group_id
       AND name     = _milestone_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_stm_milestone_from_stage_task ON public.tasks;

CREATE TRIGGER trg_sync_stm_milestone_from_stage_task
AFTER INSERT OR UPDATE OF deadline ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_stm_milestone_from_stage_task();