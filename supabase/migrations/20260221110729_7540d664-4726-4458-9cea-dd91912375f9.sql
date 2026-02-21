-- Drop and recreate INSERT policy to also allow group owners
DROP POLICY IF EXISTS "Group members can add subtasks to group tasks" ON public.subtasks;
CREATE POLICY "Group members can add subtasks to group tasks"
ON public.subtasks
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = subtasks.task_id
      AND t.group_id IS NOT NULL
      AND (is_group_member(t.group_id, auth.uid()) OR is_group_owner(t.group_id, auth.uid()))
  )
);

-- Drop and recreate UPDATE policy to also allow group owners
DROP POLICY IF EXISTS "Group members can update subtasks of group tasks" ON public.subtasks;
CREATE POLICY "Group members can update subtasks of group tasks"
ON public.subtasks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = subtasks.task_id
      AND t.group_id IS NOT NULL
      AND (is_group_member(t.group_id, auth.uid()) OR is_group_owner(t.group_id, auth.uid()))
  )
);

-- Also fix SELECT policy for group owners
DROP POLICY IF EXISTS "Group members can view subtasks of group tasks" ON public.subtasks;
CREATE POLICY "Group members can view subtasks of group tasks"
ON public.subtasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = subtasks.task_id
      AND t.group_id IS NOT NULL
      AND (is_group_member(t.group_id, auth.uid()) OR is_group_owner(t.group_id, auth.uid()))
  )
);