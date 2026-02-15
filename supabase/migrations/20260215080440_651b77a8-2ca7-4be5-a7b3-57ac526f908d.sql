
-- Drop existing restrictive policies on teams
DROP POLICY IF EXISTS "Users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Members can view teams" ON public.teams;
DROP POLICY IF EXISTS "Directors can update teams" ON public.teams;
DROP POLICY IF EXISTS "Directors can delete teams" ON public.teams;

-- Recreate as PERMISSIVE
CREATE POLICY "Users can create teams" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Members can view teams" ON public.teams
  FOR SELECT TO authenticated
  USING (is_team_member(id, auth.uid()));

CREATE POLICY "Directors can update teams" ON public.teams
  FOR UPDATE TO authenticated
  USING (is_team_director(id, auth.uid()));

CREATE POLICY "Directors can delete teams" ON public.teams
  FOR DELETE TO authenticated
  USING (is_team_director(id, auth.uid()));

-- Also fix team_members policies (same issue)
DROP POLICY IF EXISTS "Members can view team members" ON public.team_members;
DROP POLICY IF EXISTS "Directors can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Users can add self as member" ON public.team_members;
DROP POLICY IF EXISTS "Users can leave team" ON public.team_members;

CREATE POLICY "Members can view team members" ON public.team_members
  FOR SELECT TO authenticated
  USING (is_team_member(team_id, auth.uid()));

CREATE POLICY "Directors can manage members" ON public.team_members
  FOR ALL TO authenticated
  USING (is_team_director(team_id, auth.uid()))
  WITH CHECK (is_team_director(team_id, auth.uid()));

CREATE POLICY "Users can add self as member" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave team" ON public.team_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
