-- Stage 1: view_mode column for lens projects (no UI impact, default = container)

ALTER TABLE public.task_groups
  ADD COLUMN IF NOT EXISTS view_mode text NOT NULL DEFAULT 'container';

ALTER TABLE public.task_groups
  DROP CONSTRAINT IF EXISTS task_groups_view_mode_check;

ALTER TABLE public.task_groups
  ADD CONSTRAINT task_groups_view_mode_check
  CHECK (view_mode IN ('container', 'lens'));

-- Index for lens queries by linked tag
CREATE INDEX IF NOT EXISTS idx_task_groups_view_mode_linked_tag
  ON public.task_groups (view_mode, linked_tag_id)
  WHERE view_mode = 'lens';

-- Validation trigger: protect specialized project types & require linked_tag_id for lenses
CREATE OR REPLACE FUNCTION public.validate_task_group_view_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.view_mode = 'lens' THEN
    -- Block lens mode for specialized project types (NPD matrix, CRM pipeline, STM, protocols)
    IF NEW.project_type IN ('npd', 'crm', 'stm', 'protocol') THEN
      RAISE EXCEPTION 'Проекты типа % не могут быть линзой', NEW.project_type
        USING ERRCODE = 'check_violation';
    END IF;

    -- Lens must have a linked tag to know which tasks to show
    IF NEW.linked_tag_id IS NULL THEN
      RAISE EXCEPTION 'Линза требует linked_tag_id'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_task_group_view_mode_trigger ON public.task_groups;
CREATE TRIGGER validate_task_group_view_mode_trigger
  BEFORE INSERT OR UPDATE OF view_mode, project_type, linked_tag_id ON public.task_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_task_group_view_mode();

COMMENT ON COLUMN public.task_groups.view_mode IS
  'container (default) — обычный проект с задачами через group_id. lens — виртуальная проекция: показывает все задачи с tag_id = linked_tag_id. Линза не может быть NPD/CRM/STM/protocol.';