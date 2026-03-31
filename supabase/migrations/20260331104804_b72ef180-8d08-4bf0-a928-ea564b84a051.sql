
-- Allow group members to delete their own wiki pages
CREATE POLICY "Group members can delete own wiki pages"
ON public.wiki_pages
FOR DELETE
TO public
USING (is_group_member(group_id, auth.uid()) AND auth.uid() = user_id);
