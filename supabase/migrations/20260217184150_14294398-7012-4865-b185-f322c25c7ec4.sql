
-- Members of subgroups can view the parent group
CREATE POLICY "Subgroup members can view parent group"
ON public.task_groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.task_groups sub
    WHERE sub.parent_id = task_groups.id
    AND is_group_member(sub.id, auth.uid())
  )
);

-- Delegatees can view the group of tasks assigned to them
CREATE POLICY "Delegatees can view task groups"
ON public.task_groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.group_id = task_groups.id
    AND t.assigned_to = auth.uid()
  )
);
