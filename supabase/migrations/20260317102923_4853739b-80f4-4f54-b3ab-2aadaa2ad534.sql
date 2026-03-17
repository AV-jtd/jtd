
-- Allow members of child subgroups to view parent group's tags
CREATE POLICY "Subgroup members can view parent group tags"
ON public.group_tags
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.parent_id = group_tags.group_id
    AND is_group_member(tg.id, auth.uid())
  )
);

-- Allow members of parent group to view child subgroup tags
CREATE POLICY "Parent members can view subgroup tags"
ON public.group_tags
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = group_tags.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);
