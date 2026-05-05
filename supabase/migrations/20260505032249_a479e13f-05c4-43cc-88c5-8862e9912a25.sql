-- 1) Add kind + meta columns to task_comments
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS meta jsonb;

-- Constrain kind values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_comments_kind_check'
  ) THEN
    ALTER TABLE public.task_comments
      ADD CONSTRAINT task_comments_kind_check
      CHECK (kind IN ('message', 'system', 'log'));
  END IF;
END$$;

-- Backfill: mark existing system-prefixed messages
UPDATE public.task_comments
SET kind = 'system'
WHERE kind = 'message'
  AND (
    content LIKE '__sys_task_created__:%'
    OR content LIKE '__sys_task_followup__:%'
    OR content LIKE '__sys_task_source__:%'
  );

CREATE INDEX IF NOT EXISTS task_comments_task_kind_idx
  ON public.task_comments (task_id, kind, created_at DESC);

-- 2) Trigger function: log task field changes into task_comments
CREATE OR REPLACE FUNCTION public.log_task_field_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  changes jsonb := '[]'::jsonb;
  entry  jsonb;
BEGIN
  -- Actor: prefer auth.uid(), fall back to assigned_to or user_id of new row.
  actor := auth.uid();
  IF actor IS NULL THEN
    actor := COALESCE(NEW.user_id, OLD.user_id);
  END IF;
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- deadline change
  IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
    changes := changes || jsonb_build_object(
      'field', 'deadline', 'old', OLD.deadline, 'new', NEW.deadline
    );
  END IF;
  -- assigned_to change
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    changes := changes || jsonb_build_object(
      'field', 'assigned_to', 'old', OLD.assigned_to, 'new', NEW.assigned_to
    );
  END IF;
  -- is_completed change (close / reopen)
  IF NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN
    changes := changes || jsonb_build_object(
      'field', 'is_completed', 'old', OLD.is_completed, 'new', NEW.is_completed
    );
  END IF;
  -- approval_status change
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    changes := changes || jsonb_build_object(
      'field', 'approval_status', 'old', OLD.approval_status, 'new', NEW.approval_status
    );
  END IF;
  -- group change (moved to another project)
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    changes := changes || jsonb_build_object(
      'field', 'group_id', 'old', OLD.group_id, 'new', NEW.group_id
    );
  END IF;
  -- priority change
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    changes := changes || jsonb_build_object(
      'field', 'priority', 'old', OLD.priority, 'new', NEW.priority
    );
  END IF;

  IF jsonb_array_length(changes) = 0 THEN
    RETURN NEW;
  END IF;

  -- One log entry per row update, listing all changed fields in meta.
  INSERT INTO public.task_comments (task_id, user_id, content, kind, meta)
  VALUES (
    NEW.id,
    actor,
    '__log__',
    'log',
    jsonb_build_object('changes', changes)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_field_changes ON public.tasks;
CREATE TRIGGER trg_log_task_field_changes
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_field_changes();