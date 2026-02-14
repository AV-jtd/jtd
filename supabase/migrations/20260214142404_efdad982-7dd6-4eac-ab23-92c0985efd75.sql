
-- 1. Group members table: owner invites users to groups
CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Members can see their own memberships
CREATE POLICY "Users can view own memberships"
  ON public.group_members FOR SELECT
  USING (auth.uid() = user_id);

-- Group owners can view all members of their groups
CREATE POLICY "Owners can view group members"
  ON public.group_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = group_members.group_id AND tg.user_id = auth.uid()
  ));

-- Group owners can add members
CREATE POLICY "Owners can add members"
  ON public.group_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = group_members.group_id AND tg.user_id = auth.uid()
  ));

-- Group owners can remove members
CREATE POLICY "Owners can remove members"
  ON public.group_members FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.task_groups tg
    WHERE tg.id = group_members.group_id AND tg.user_id = auth.uid()
  ));

-- 2. Tag access table: controls who can see tasks with a given tag
CREATE TABLE public.tag_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tag_id, user_id)
);

ALTER TABLE public.tag_access ENABLE ROW LEVEL SECURITY;

-- Users can see their own tag access
CREATE POLICY "Users can view own tag access"
  ON public.tag_access FOR SELECT
  USING (auth.uid() = user_id);

-- Tag owners can view who has access
CREATE POLICY "Tag owners can view access"
  ON public.tag_access FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.tags t
    WHERE t.id = tag_access.tag_id AND t.user_id = auth.uid()
  ));

-- Tag owners can grant access
CREATE POLICY "Tag owners can grant access"
  ON public.tag_access FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tags t
    WHERE t.id = tag_access.tag_id AND t.user_id = auth.uid()
  ));

-- Tag owners can revoke access
CREATE POLICY "Tag owners can revoke access"
  ON public.tag_access FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.tags t
    WHERE t.id = tag_access.tag_id AND t.user_id = auth.uid()
  ));

-- 3. Add linked_tag_id to task_groups for auto-tag
ALTER TABLE public.task_groups
  ADD COLUMN linked_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL;

-- 4. Update tasks RLS: users can also see tasks if they have access to any of the task's tags
CREATE POLICY "Tag access holders can view tasks"
  ON public.tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.task_tags tt
    JOIN public.tag_access ta ON ta.tag_id = tt.tag_id
    WHERE tt.task_id = tasks.id AND ta.user_id = auth.uid()
  ));

-- 5. Group members can view tasks in groups they belong to
CREATE POLICY "Group members can view group tasks"
  ON public.tasks FOR SELECT
  USING (
    group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = tasks.group_id AND gm.user_id = auth.uid()
    )
  );

-- 6. Group members can see the group itself
CREATE POLICY "Members can view joined groups"
  ON public.task_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = task_groups.id AND gm.user_id = auth.uid()
  ));

-- 7. Security definer function to check group membership
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id
  ) OR EXISTS (
    SELECT 1 FROM public.task_groups
    WHERE id = _group_id AND user_id = _user_id
  )
$$;

-- 8. Security definer function to check tag access
CREATE OR REPLACE FUNCTION public.has_tag_access(_user_id uuid, _tag_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tag_access
    WHERE user_id = _user_id AND tag_id = _tag_id
  ) OR EXISTS (
    SELECT 1 FROM public.tags
    WHERE id = _tag_id AND user_id = _user_id
  )
$$;
