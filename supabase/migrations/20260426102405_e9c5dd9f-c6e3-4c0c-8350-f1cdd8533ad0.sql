
-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.profile_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  changed_by UUID,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL DEFAULT 'update',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_audit_profile_id ON public.profile_audit_log(profile_id, created_at DESC);

ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.profile_audit_log;
CREATE POLICY "Admins can view audit log"
ON public.profile_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert audit log" ON public.profile_audit_log;
CREATE POLICY "Admins can insert audit log"
ON public.profile_audit_log FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Trigger: log changes to profiles
CREATE OR REPLACE FUNCTION public.log_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'display_name', OLD.display_name, NEW.display_name);
    END IF;
    IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'department_id', OLD.department_id::text, NEW.department_id::text);
    END IF;
    IF NEW.organization IS DISTINCT FROM OLD.organization THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'organization', OLD.organization, NEW.organization);
    END IF;
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
      VALUES (NEW.id, actor, 'is_approved', OLD.is_approved::text, NEW.is_approved::text, CASE WHEN NEW.is_approved THEN 'approve' ELSE 'deactivate' END);
    END IF;
    IF NEW.contractor_id IS DISTINCT FROM OLD.contractor_id THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'contractor_id', OLD.contractor_id::text, NEW.contractor_id::text);
    END IF;
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value)
      VALUES (NEW.id, actor, 'client_id', OLD.client_id::text, NEW.client_id::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_changes ON public.profiles;
CREATE TRIGGER trg_log_profile_changes
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_changes();

-- 3. RPC: bulk department assignment
CREATE OR REPLACE FUNCTION public.admin_set_users_department(
  user_ids UUID[],
  dept_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can perform bulk operations';
  END IF;

  UPDATE public.profiles
     SET department_id = dept_id
   WHERE id = ANY(user_ids);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 4. RPC: safe user deletion
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  IF public.has_role(target_user_id, 'admin') THEN
    RAISE EXCEPTION 'Cannot delete another administrator';
  END IF;

  -- Log the deletion before removing
  INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
  VALUES (target_user_id, auth.uid(), '__deleted__', 'exists', NULL, 'delete');

  -- Cascade through auth (will also delete profile via FK)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
