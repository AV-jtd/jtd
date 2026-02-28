
-- 1. Allow group members to INSERT tasks into their groups
CREATE POLICY "Group members can create tasks in group"
ON public.tasks
FOR INSERT
WITH CHECK (
  group_id IS NOT NULL
  AND is_group_member(group_id, auth.uid())
  AND user_id = auth.uid()
);

-- 2. Allow group members to UPDATE any task in their group
CREATE POLICY "Group members can update group tasks"
ON public.tasks
FOR UPDATE
USING (
  group_id IS NOT NULL
  AND is_group_member(group_id, auth.uid())
);

-- 3. Allow group OWNERS to UPDATE any task in their group
CREATE POLICY "Group owners can update group tasks"
ON public.tasks
FOR UPDATE
USING (
  group_id IS NOT NULL
  AND is_group_owner(group_id, auth.uid())
);

-- 4. Allow group owners to DELETE any task in their group
CREATE POLICY "Group owners can delete group tasks"
ON public.tasks
FOR DELETE
USING (
  group_id IS NOT NULL
  AND is_group_owner(group_id, auth.uid())
);

-- 5. Allow group members to manage subtasks (already partially exists, adding delete)
CREATE POLICY "Group members can delete subtasks of group tasks"
ON public.subtasks
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = subtasks.task_id
    AND t.group_id IS NOT NULL
    AND (is_group_member(t.group_id, auth.uid()) OR is_group_owner(t.group_id, auth.uid()))
  )
);

-- 6. Allow group members to manage task_tags in their groups
CREATE POLICY "Group members can manage task tags in group"
ON public.task_tags
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_tags.task_id
    AND t.group_id IS NOT NULL
    AND is_group_member(t.group_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_tags.task_id
    AND t.group_id IS NOT NULL
    AND is_group_member(t.group_id, auth.uid())
  )
);

-- 7. Allow group members to manage task participants in their groups
CREATE POLICY "Group members can manage task participants in group"
ON public.task_participants
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_participants.task_id
    AND t.group_id IS NOT NULL
    AND is_group_member(t.group_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_participants.task_id
    AND t.group_id IS NOT NULL
    AND is_group_member(t.group_id, auth.uid())
  )
);

-- 8. Allow group owners to manage task participants
CREATE POLICY "Group owners can manage task participants"
ON public.task_participants
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_participants.task_id
    AND t.group_id IS NOT NULL
    AND is_group_owner(t.group_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_participants.task_id
    AND t.group_id IS NOT NULL
    AND is_group_owner(t.group_id, auth.uid())
  )
);
