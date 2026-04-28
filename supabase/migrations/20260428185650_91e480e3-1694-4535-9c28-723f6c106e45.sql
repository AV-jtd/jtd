BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_profile_approval()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_approved FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_approval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile_approval() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_approval() TO authenticated;

COMMIT;