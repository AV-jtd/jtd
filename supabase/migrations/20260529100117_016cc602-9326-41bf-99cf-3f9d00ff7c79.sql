CREATE OR REPLACE FUNCTION public.delegation_profile_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_to FROM public.tasks
   WHERE user_id = _user_id AND assigned_to IS NOT NULL
  UNION
  SELECT user_id FROM public.tasks
   WHERE assigned_to = _user_id AND user_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.delegation_profile_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view delegatee profiles" ON public.profiles;

CREATE POLICY "Users can view delegatee profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (id IN (SELECT public.delegation_profile_ids(auth.uid())));