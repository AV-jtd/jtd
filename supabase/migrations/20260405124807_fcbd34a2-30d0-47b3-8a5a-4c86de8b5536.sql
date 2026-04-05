
-- Allow group owners to update member roles
CREATE POLICY "Owners can update member roles" ON public.group_members
  FOR UPDATE USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
