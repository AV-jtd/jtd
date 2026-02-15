
-- Allow team creator to SELECT their own team (needed for INSERT...RETURNING)
CREATE POLICY "Creators can view own teams" ON public.teams
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());
