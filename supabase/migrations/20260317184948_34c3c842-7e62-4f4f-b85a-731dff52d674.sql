
-- Allow parent group members to VIEW tasks in child groups
CREATE POLICY "Parent group members can view subgroup tasks"
ON public.tasks
FOR SELECT
USING (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = tasks.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to UPDATE tasks in child groups
CREATE POLICY "Parent group members can update subgroup tasks"
ON public.tasks
FOR UPDATE
USING (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = tasks.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to INSERT tasks in child groups
CREATE POLICY "Parent group members can create subgroup tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  group_id IS NOT NULL
  AND user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = tasks.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to view subtasks in child groups
CREATE POLICY "Parent group members can view subgroup subtasks"
ON public.subtasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = subtasks.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to manage subtasks in child groups
CREATE POLICY "Parent group members can insert subgroup subtasks"
ON public.subtasks
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = subtasks.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

CREATE POLICY "Parent group members can update subgroup subtasks"
ON public.subtasks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = subtasks.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

CREATE POLICY "Parent group members can delete subgroup subtasks"
ON public.subtasks
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = subtasks.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to manage task_tags in child groups
CREATE POLICY "Parent group members can manage subgroup task tags"
ON public.task_tags
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_tags.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_tags.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to view/add comments in child groups
CREATE POLICY "Parent group members can view subgroup task comments"
ON public.task_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_comments.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

CREATE POLICY "Parent group members can add subgroup task comments"
ON public.task_comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_comments.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to manage task_participants in child groups
CREATE POLICY "Parent group members can manage subgroup task participants"
ON public.task_participants
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_participants.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_participants.task_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to view group_messages in child groups
CREATE POLICY "Parent group members can view subgroup messages"
ON public.group_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = group_messages.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group members to post in child group chats
CREATE POLICY "Parent group members can post in subgroup chats"
ON public.group_messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = group_messages.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_member(tg.parent_id, auth.uid())
  )
);

-- Allow parent group OWNERS to also see/manage subgroup tasks (not just members)
CREATE POLICY "Parent group owners can view subgroup tasks"
ON public.tasks
FOR SELECT
USING (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = tasks.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_owner(tg.parent_id, auth.uid())
  )
);

CREATE POLICY "Parent group owners can update subgroup tasks"
ON public.tasks
FOR UPDATE
USING (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = tasks.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_owner(tg.parent_id, auth.uid())
  )
);

CREATE POLICY "Parent group owners can delete subgroup tasks"
ON public.tasks
FOR DELETE
USING (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = tasks.group_id
    AND tg.parent_id IS NOT NULL
    AND is_group_owner(tg.parent_id, auth.uid())
  )
);
