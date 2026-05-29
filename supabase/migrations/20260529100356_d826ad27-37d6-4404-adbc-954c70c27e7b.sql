CREATE OR REPLACE FUNCTION public.can_view_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = _profile_id
    OR (NOT public.is_consultant(auth.uid()))
    OR (public.is_consultant(auth.uid()) AND public.consultant_can_see_user(auth.uid(), _profile_id))
    OR public.is_supervisor_of_user(auth.uid(), _profile_id)
    OR EXISTS (
      SELECT 1 FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid() AND gm2.user_id = _profile_id
    )
    OR EXISTS (
      SELECT 1 FROM public.task_participants tp1
      JOIN public.task_participants tp2 ON tp1.task_id = tp2.task_id
      WHERE tp1.user_id = auth.uid() AND tp2.user_id = _profile_id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm1
      JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = _profile_id
    )
    OR _profile_id IN (SELECT public.delegation_profile_ids(auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "Consultants view limited profiles" ON public.profiles;
DROP POLICY IF EXISTS "Group members can view group member profiles" ON public.profiles;
DROP POLICY IF EXISTS "Non-consultants view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view subordinate profiles" ON public.profiles;
DROP POLICY IF EXISTS "Task participants can view each other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Team members can view team member profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view delegatee profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_view_profile(id));