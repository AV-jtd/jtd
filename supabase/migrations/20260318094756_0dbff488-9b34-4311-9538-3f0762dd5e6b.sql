CREATE POLICY "Group owners can view group tasks"
ON public.tasks
FOR SELECT
TO public
USING (group_id IS NOT NULL AND is_group_owner(group_id, auth.uid()));