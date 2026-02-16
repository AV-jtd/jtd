
-- Fix: all SELECT policies on profiles are RESTRICTIVE, meaning ALL must pass.
-- They should be PERMISSIVE so that ANY one grants access.

-- Drop all existing restrictive SELECT policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view delegatee profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view subordinate profiles" ON public.profiles;
DROP POLICY IF EXISTS "Task participants can view each other profiles" ON public.profiles;
DROP POLICY IF EXISTS "Team members can view team member profiles" ON public.profiles;
DROP POLICY IF EXISTS "Group members can view group member profiles" ON public.profiles;

-- Recreate as PERMISSIVE
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view delegatee profiles"
  ON public.profiles FOR SELECT
  USING (
    id IN (SELECT tasks.assigned_to FROM tasks WHERE tasks.user_id = auth.uid())
    OR id IN (SELECT tasks.user_id FROM tasks WHERE tasks.assigned_to = auth.uid())
  );

CREATE POLICY "Supervisors can view subordinate profiles"
  ON public.profiles FOR SELECT
  USING (is_supervisor_of_user(auth.uid(), id));

CREATE POLICY "Task participants can view each other profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM task_participants tp1
      JOIN task_participants tp2 ON tp1.task_id = tp2.task_id
      WHERE tp1.user_id = auth.uid() AND tp2.user_id = profiles.id
    )
  );

CREATE POLICY "Team members can view team member profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm1
      JOIN team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = profiles.id
    )
  );

CREATE POLICY "Group members can view group member profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm1
      JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid() AND gm2.user_id = profiles.id
    )
  );
