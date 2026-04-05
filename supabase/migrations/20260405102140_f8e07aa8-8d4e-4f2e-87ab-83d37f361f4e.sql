-- 1. Add 'viewer' to allowed roles in group_members
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_role_check;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_role_check 
  CHECK (role IN ('assignee', 'participant', 'viewer'));

-- 2. Create a function that checks full membership (excludes viewers)
CREATE OR REPLACE FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.group_members 
      WHERE group_id = _group_id 
      AND user_id = _user_id 
      AND role IN ('assignee', 'participant')
    )
  ELSE false END;
$$;

-- 3. Update RLS: subgroup visibility only for full members
DROP POLICY IF EXISTS "Members can view subgroups of joined groups" ON public.task_groups;
CREATE POLICY "Members can view subgroups of joined groups" ON public.task_groups
  FOR SELECT USING (
    parent_id IS NOT NULL AND is_full_group_member(parent_id, auth.uid())
  );

-- 4. Update task RLS for subgroup access - only full parent members
DROP POLICY IF EXISTS "Parent group members can view subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group members can view subgroup tasks" ON public.tasks
  FOR SELECT USING (
    group_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.task_groups tg
        WHERE tg.id = tasks.group_id
        AND tg.parent_id IS NOT NULL
        AND is_full_group_member(tg.parent_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Parent group members can update subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group members can update subgroup tasks" ON public.tasks
  FOR UPDATE USING (
    group_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.task_groups tg
        WHERE tg.id = tasks.group_id
        AND tg.parent_id IS NOT NULL
        AND is_full_group_member(tg.parent_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Parent group members can create subgroup tasks" ON public.tasks;
CREATE POLICY "Parent group members can create subgroup tasks" ON public.tasks
  FOR INSERT WITH CHECK (
    group_id IS NOT NULL AND user_id = auth.uid() AND (
      EXISTS (
        SELECT 1 FROM public.task_groups tg
        WHERE tg.id = tasks.group_id
        AND tg.parent_id IS NOT NULL
        AND is_full_group_member(tg.parent_id, auth.uid())
      )
    )
  );

-- 5. Update is_subgroup_of_member_group to use full membership
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
      AND is_full_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$$;