
-- 1. Restrict supervisor task visibility to shared groups only
DROP POLICY IF EXISTS "Supervisors can view subordinate tasks" ON public.tasks;

CREATE POLICY "Supervisors can view subordinate tasks in shared groups"
ON public.tasks
FOR SELECT
USING (
  group_id IS NOT NULL
  AND is_supervisor_of_user(auth.uid(), user_id)
  AND (is_group_owner(group_id, auth.uid()) OR is_group_member(group_id, auth.uid()))
);

-- 2. Remove broad supervisor group visibility (membership policies already cover shared groups)
DROP POLICY IF EXISTS "Supervisors can view subordinate task groups" ON public.task_groups;

-- 3. Restrict supervisor comment visibility to shared groups
DROP POLICY IF EXISTS "Supervisors can view subordinate task comments" ON public.task_comments;

CREATE POLICY "Supervisors can view subordinate task comments in shared groups"
ON public.task_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_comments.task_id
    AND t.group_id IS NOT NULL
    AND is_supervisor_of_user(auth.uid(), t.user_id)
    AND (is_group_owner(t.group_id, auth.uid()) OR is_group_member(t.group_id, auth.uid()))
  )
);

-- 4. Restrict supervisor participant visibility to shared groups
DROP POLICY IF EXISTS "Supervisors can view subordinate task participants" ON public.task_participants;

CREATE POLICY "Supervisors can view subordinate task participants in shared groups"
ON public.task_participants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_participants.task_id
    AND t.group_id IS NOT NULL
    AND is_supervisor_of_user(auth.uid(), t.user_id)
    AND (is_group_owner(t.group_id, auth.uid()) OR is_group_member(t.group_id, auth.uid()))
  )
);
