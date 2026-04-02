
-- Add missing owner SELECT policy on task_groups
-- This ensures project creators can always see their own projects
CREATE POLICY "Owners can view own groups"
ON public.task_groups FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Add owner-based SELECT policy on group_tags for task_group owners
-- This ensures if you own the group, you can see its tags
CREATE POLICY "Task group owners can view group tags via ownership"
ON public.group_tags FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = group_tags.group_id AND tg.user_id = auth.uid()
  )
);
