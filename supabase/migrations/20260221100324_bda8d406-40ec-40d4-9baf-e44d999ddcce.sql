
-- 1. Group members can see OTHER group members (not just owners)
CREATE POLICY "Members can view fellow group members"
ON public.group_members
FOR SELECT
USING (
  is_group_member(group_id, auth.uid())
);

-- 2. Group members can see subtasks of tasks in their groups
CREATE POLICY "Group members can view subtasks of group tasks"
ON public.subtasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = subtasks.task_id
    AND t.group_id IS NOT NULL
    AND is_group_member(t.group_id, auth.uid())
  )
);

-- 3. Group members can see task participants for tasks in their groups
CREATE POLICY "Group members can view task participants in group"
ON public.task_participants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_participants.task_id
    AND t.group_id IS NOT NULL
    AND is_group_member(t.group_id, auth.uid())
  )
);

-- 4. Delegatees (assigned_to) should also see subtasks
CREATE POLICY "Delegatees can view subtasks"
ON public.subtasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = subtasks.task_id
    AND t.assigned_to = auth.uid()
  )
);
