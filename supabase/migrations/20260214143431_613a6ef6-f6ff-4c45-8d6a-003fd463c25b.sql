
-- Step 1: Drop all problematic policies
DROP POLICY IF EXISTS "Members can view joined groups" ON public.task_groups;
DROP POLICY IF EXISTS "Group members can view group tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tag access holders can view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Owners can add members" ON public.group_members;
DROP POLICY IF EXISTS "Owners can remove members" ON public.group_members;
DROP POLICY IF EXISTS "Owners can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Users manage task_tags of own tasks" ON public.task_tags;
DROP POLICY IF EXISTS "Users manage subtasks of own tasks" ON public.subtasks;

-- Step 2: Drop old functions
DROP FUNCTION IF EXISTS public.is_group_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.has_tag_access(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_group_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_task_owner(uuid, uuid);

-- Step 3: Create security definer functions
CREATE FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.task_groups WHERE id = _group_id AND user_id = _user_id); $$;

CREATE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id); $$;

CREATE FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.tag_access WHERE tag_id = _tag_id AND user_id = _user_id); $$;

CREATE FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id AND (user_id = _user_id OR assigned_to = _user_id)); $$;

-- Step 4: Create policies using functions
CREATE POLICY "Members can view joined groups"
ON public.task_groups FOR SELECT USING (public.is_group_member(id, auth.uid()));

CREATE POLICY "Group members can view group tasks"
ON public.tasks FOR SELECT USING (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Tag access holders can view tasks"
ON public.tasks FOR SELECT USING (EXISTS (SELECT 1 FROM public.task_tags tt WHERE tt.task_id = tasks.id AND public.has_tag_access(tt.tag_id, auth.uid())));

CREATE POLICY "Owners can add members"
ON public.group_members FOR INSERT WITH CHECK (public.is_group_owner(group_id, auth.uid()));

CREATE POLICY "Owners can remove members"
ON public.group_members FOR DELETE USING (public.is_group_owner(group_id, auth.uid()));

CREATE POLICY "Owners can view group members"
ON public.group_members FOR SELECT USING (public.is_group_owner(group_id, auth.uid()));

CREATE POLICY "Users manage task_tags of own tasks"
ON public.task_tags FOR ALL USING (public.is_task_owner(task_id, auth.uid())) WITH CHECK (public.is_task_owner(task_id, auth.uid()));

CREATE POLICY "Users manage subtasks of own tasks"
ON public.subtasks FOR ALL USING (public.is_task_owner(task_id, auth.uid())) WITH CHECK (public.is_task_owner(task_id, auth.uid()));
