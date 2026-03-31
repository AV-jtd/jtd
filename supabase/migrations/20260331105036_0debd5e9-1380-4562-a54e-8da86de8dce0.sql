
-- Allow group members to add new members (invite others)
CREATE POLICY "Members can add members"
ON public.group_members
FOR INSERT
TO public
WITH CHECK (is_group_member(group_id, auth.uid()));
