
-- Create a SECURITY DEFINER function to check if a task belongs to a subgroup
-- of a group the user is a member of. This avoids inline JOINs that cause
-- infinite recursion between tasks, task_tags, and task_participants RLS policies.
CREATE OR REPLACE FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_groups tg ON tg.id = t.group_id
      WHERE t.id = _task_id
      AND tg.parent_id IS NOT NULL
      AND is_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$$;

-- Also create one for parent group OWNER access
CREATE OR REPLACE FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_groups tg ON tg.id = t.group_id
      WHERE t.id = _task_id
      AND tg.parent_id IS NOT NULL
      AND is_group_owner(tg.parent_id, _user_id)
    )
  ELSE false END;
$$;

-- Also helper for group_messages parent access
CREATE OR REPLACE FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid)
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

-- ================================================================
-- Drop and recreate policies that cause recursion
-- ================================================================

-- === task_tags: replace inline JOIN with function ===
DROP POLICY IF EXISTS "Parent group members can manage subgroup task tags" ON public.task_tags;
CREATE POLICY "Parent group members can manage subgroup task tags"
ON public.task_tags FOR ALL USING (
  is_task_in_parent_member_group(task_id, auth.uid())
) WITH CHECK (
  is_task_in_parent_member_group(task_id, auth.uid())
);

-- === task_comments: replace inline JOINs with function ===
DROP POLICY IF EXISTS "Parent group members can add subgroup task comments" ON public.task_comments;
CREATE POLICY "Parent group members can add subgroup task comments"
ON public.task_comments FOR INSERT WITH CHECK (
  auth.uid() = user_id AND is_task_in_parent_member_group(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group members can view subgroup task comments" ON public.task_comments;
CREATE POLICY "Parent group members can view subgroup task comments"
ON public.task_comments FOR SELECT USING (
  is_task_in_parent_member_group(task_id, auth.uid())
);

-- === task_participants: replace inline JOINs with function ===
DROP POLICY IF EXISTS "Parent group members can manage subgroup task participants" ON public.task_participants;
CREATE POLICY "Parent group members can manage subgroup task participants"
ON public.task_participants FOR ALL USING (
  is_task_in_parent_member_group(task_id, auth.uid())
) WITH CHECK (
  is_task_in_parent_member_group(task_id, auth.uid())
);

-- === subtasks: replace inline JOINs with function ===
DROP POLICY IF EXISTS "Parent group members can delete subgroup subtasks" ON public.subtasks;
CREATE POLICY "Parent group members can delete subgroup subtasks"
ON public.subtasks FOR DELETE USING (
  is_task_in_parent_member_group(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group members can insert subgroup subtasks" ON public.subtasks;
CREATE POLICY "Parent group members can insert subgroup subtasks"
ON public.subtasks FOR INSERT WITH CHECK (
  is_task_in_parent_member_group(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group members can update subgroup subtasks" ON public.subtasks;
CREATE POLICY "Parent group members can update subgroup subtasks"
ON public.subtasks FOR UPDATE USING (
  is_task_in_parent_member_group(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group members can view subgroup subtasks" ON public.subtasks;
CREATE POLICY "Parent group members can view subgroup subtasks"
ON public.subtasks FOR SELECT USING (
  is_task_in_parent_member_group(task_id, auth.uid())
);

-- === group_messages: replace inline EXISTS with function ===
DROP POLICY IF EXISTS "Parent group members can view subgroup messages" ON public.group_messages;
CREATE POLICY "Parent group members can view subgroup messages"
ON public.group_messages FOR SELECT USING (
  is_message_in_parent_member_group(group_id, auth.uid())
);

DROP POLICY IF EXISTS "Parent group members can post in subgroup chats" ON public.group_messages;
CREATE POLICY "Parent group members can post in subgroup chats"
ON public.group_messages FOR INSERT WITH CHECK (
  auth.uid() = user_id AND is_message_in_parent_member_group(group_id, auth.uid())
);
