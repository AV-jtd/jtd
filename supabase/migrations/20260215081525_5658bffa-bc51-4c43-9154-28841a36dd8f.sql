
-- Function to check if user is a supervisor (director or manager) of another user
CREATE OR REPLACE FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ 
  SELECT EXISTS (
    SELECT 1 FROM public.team_members d
    JOIN public.team_members m ON d.team_id = m.team_id
    WHERE d.user_id = _supervisor_id AND d.role IN ('director', 'manager')
    AND m.user_id = _user_id AND m.role = 'member'
  );
$$;

-- Update task viewing policy to include managers
DROP POLICY IF EXISTS "Directors can view subordinate tasks" ON public.tasks;
CREATE POLICY "Supervisors can view subordinate tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (is_supervisor_of_user(auth.uid(), user_id));

-- Update profile viewing policy to include managers
DROP POLICY IF EXISTS "Directors can view subordinate profiles" ON public.profiles;
CREATE POLICY "Supervisors can view subordinate profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (is_supervisor_of_user(auth.uid(), id));
