CREATE OR REPLACE FUNCTION public.inherit_group_client_on_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.group_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id
    FROM public.task_groups
    WHERE id = NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_group_client ON public.tasks;
CREATE TRIGGER trg_inherit_group_client
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_group_client_on_task();