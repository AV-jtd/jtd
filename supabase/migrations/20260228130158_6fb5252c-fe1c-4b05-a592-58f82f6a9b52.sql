
-- Create a security definer function to check if a task is in a group where user is member/owner
-- This avoids infinite recursion by bypassing RLS on the tasks table
CREATE OR REPLACE FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = _task_id
      AND t.group_id IS NOT NULL
      AND (
        is_group_member(t.group_id, _user_id)
        OR is_group_owner(t.group_id, _user_id)
      )
    )
  ELSE false END;
$$;

-- Drop the problematic policies that cause recursion
DROP POLICY IF EXISTS "Group members can manage task tags in group" ON public.task_tags;
DROP POLICY IF EXISTS "Group members can manage task participants in group" ON public.task_participants;
DROP POLICY IF EXISTS "Group owners can manage task participants" ON public.task_participants;

-- Recreate task_tags policy using the security definer function
CREATE POLICY "Group members can manage task tags in group"
ON public.task_tags
FOR ALL
USING (is_task_in_user_group(task_id, auth.uid()))
WITH CHECK (is_task_in_user_group(task_id, auth.uid()));

-- Recreate task_participants policies using the security definer function
CREATE POLICY "Group members can manage task participants in group"
ON public.task_participants
FOR ALL
USING (is_task_in_user_group(task_id, auth.uid()))
WITH CHECK (is_task_in_user_group(task_id, auth.uid()));

-- Drop redundant group owners policy (already covered by the above)
-- No need for separate owner policy since is_task_in_user_group checks both member and owner
