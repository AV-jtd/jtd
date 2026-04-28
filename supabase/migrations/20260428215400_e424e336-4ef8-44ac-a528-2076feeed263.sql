CREATE OR REPLACE FUNCTION public.get_my_auth_meta()
RETURNS TABLE(
  is_approved boolean,
  is_admin boolean,
  is_consultant boolean,
  admin_disabled boolean,
  no_admins_exist boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT p.is_approved
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ), false) AS is_approved,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    ) AS is_admin,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'consultant'
    ) AS is_consultant,
    COALESCE((
      SELECT ams.admin_disabled
      FROM public.admin_mode_state ams
      WHERE ams.user_id = auth.uid()
    ), false) AS admin_disabled,
    NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.role = 'admin'
    ) AS no_admins_exist
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_auth_meta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_auth_meta() TO anon, authenticated;