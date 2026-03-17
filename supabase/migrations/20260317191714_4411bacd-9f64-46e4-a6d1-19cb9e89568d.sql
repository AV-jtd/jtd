
-- Helper: check if a group is a subgroup of a group the user is member of
CREATE OR REPLACE FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_groups tg
      WHERE tg.id = _group_id
      AND tg.parent_id IS NOT NULL
      AND is_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$$;

-- Helper: check if a group is a subgroup of a group the user owns
CREATE OR REPLACE FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_groups tg
      WHERE tg.id = _group_id
      AND tg.parent_id IS NOT NULL
      AND is_group_owner(tg.parent_id, _user_id)
    )
  ELSE false END;
$$;

-- Helper: check if user is a delegatee of any task in a group (for task_groups visibility)
CREATE OR REPLACE FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.group_id = _group_id
      AND t.assigned_to = _user_id
    )
  ELSE false END;
$$;

-- Helper: check if task has tag_access for user (avoids task_tags -> tasks recursion)
CREATE OR REPLACE FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_tags tt
      WHERE tt.task_id = _task_id
      AND has_tag_access(tt.tag_id, _user_id)
    )
  ELSE false END;
$$;

-- Helper for task_participants inline query on task_participants
CREATE OR REPLACE FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid)
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
      AND is_group_member(t.group_id, _user_id)
    )
  ELSE false END;
$$;

-- Helper for supervisor task viewing
CREATE OR REPLACE FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _supervisor_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = _task_id
      AND t.group_id IS NOT NULL
      AND is_supervisor_of_user(_supervisor_id, t.user_id)
      AND (is_group_owner(t.group_id, _supervisor_id) OR is_group_member(t.group_id, _supervisor_id))
    )
  ELSE false END;
$$;

-- ================================================================
-- Fix tasks table policies - replace inline task_groups queries
-- ================================================================

DROP POLICY IF EXISTS "Parent group members can view subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group members can view subgroup tasks"
ON public.tasks FOR SELECT USING (
  group_id IS NOT NULL AND is_subgroup_of_member_group(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group members can create subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group members can create subgroup tasks"
ON public.tasks FOR INSERT WITH CHECK (
  group_id IS NOT NULL AND user_id = auth.uid() AND is_subgroup_of_member_group(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group members can update subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group members can update subgroup tasks"
ON public.tasks FOR UPDATE USING (
  group_id IS NOT NULL AND is_subgroup_of_member_group(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group owners can view subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group owners can view subgroup tasks"
ON public.tasks FOR SELECT USING (
  group_id IS NOT NULL AND is_subgroup_of_owner_group(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group owners can update subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group owners can update subgroup tasks"
ON public.tasks FOR UPDATE USING (
  group_id IS NOT NULL AND is_subgroup_of_owner_group(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group owners can delete subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group owners can delete subgroup tasks"
ON public.tasks FOR DELETE USING (
  group_id IS NOT NULL AND is_subgroup_of_owner_group(group_id, auth.uid())
);

-- Fix tag access policy on tasks to avoid tasks -> task_tags -> tasks recursion
DROP POLICY IF EXISTS "Tag access holders can view tasks" ON public.tasks;
CREATE POLICY "Tag access holders can view tasks"
ON public.tasks FOR SELECT USING (
  task_has_tag_access(id, auth.uid())
);

-- Fix Supervisors policy on tasks
DROP POLICY IF EXISTS "Supervisors can view subordinate tasks in shared groups" ON public.tasks;
CREATE POLICY "Supervisors can view subordinate tasks in shared groups"
ON public.tasks FOR SELECT USING (
  group_id IS NOT NULL AND is_supervisor_of_user(auth.uid(), user_id) AND (is_group_owner(group_id, auth.uid()) OR is_group_member(group_id, auth.uid()))
);

-- ================================================================
-- Fix task_groups policies - replace inline tasks queries
-- ================================================================

DROP POLICY IF EXISTS "Delegatees can view task groups" ON public.task_groups;
CREATE POLICY "Delegatees can view task groups"
ON public.task_groups FOR SELECT USING (
  is_delegatee_in_group(id, auth.uid())
);

-- ================================================================
-- Fix task_participants policies - replace inline tasks queries
-- ================================================================

DROP POLICY IF EXISTS "Group members can view task participants in group" ON public.task_participants;
CREATE POLICY "Group members can view task participants in group"
ON public.task_participants FOR SELECT USING (
  is_task_in_member_group(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Supervisors can view subordinate task participants in shared gr" ON public.task_participants;
CREATE POLICY "Supervisors can view subordinate task participants in shared groups"
ON public.task_participants FOR SELECT USING (
  is_supervisor_task_in_shared_group(task_id, auth.uid())
);

-- ================================================================
-- Fix task_comments policies - replace inline tasks queries
-- ================================================================

DROP POLICY IF EXISTS "Group members can add comments" ON public.task_comments;
CREATE POLICY "Group members can add comments"
ON public.task_comments FOR INSERT WITH CHECK (
  auth.uid() = user_id AND is_task_in_member_group(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Group members can view task comments" ON public.task_comments;
CREATE POLICY "Group members can view task comments"
ON public.task_comments FOR SELECT USING (
  is_task_in_member_group(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Supervisors can view subordinate task comments in shared groups" ON public.task_comments;
CREATE POLICY "Supervisors can view subordinate task comments in shared groups"
ON public.task_comments FOR SELECT USING (
  is_supervisor_task_in_shared_group(task_id, auth.uid())
);

-- ================================================================
-- Fix subtasks policies - replace inline tasks queries
-- ================================================================

DROP POLICY IF EXISTS "Delegatees can view subtasks" ON public.subtasks;
CREATE POLICY "Delegatees can view subtasks"
ON public.subtasks FOR SELECT USING (
  is_task_owner(task_id, auth.uid())
);
