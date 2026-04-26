-- Auto-assign department head to the department (sync profiles.department_id with departments.head_user_id)
CREATE OR REPLACE FUNCTION public.sync_department_head_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When head_user_id is set/changed and points to a real user,
  -- ensure that user's profile points at this department.
  IF NEW.head_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.head_user_id IS DISTINCT FROM OLD.head_user_id)
  THEN
    UPDATE public.profiles
       SET department_id = NEW.id
     WHERE id = NEW.head_user_id
       AND (department_id IS DISTINCT FROM NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_department_head_membership ON public.departments;
CREATE TRIGGER trg_sync_department_head_membership
AFTER INSERT OR UPDATE OF head_user_id ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.sync_department_head_membership();

-- Backfill: existing heads should already belong to their departments
UPDATE public.profiles p
   SET department_id = d.id
  FROM public.departments d
 WHERE d.head_user_id = p.id
   AND (p.department_id IS DISTINCT FROM d.id);