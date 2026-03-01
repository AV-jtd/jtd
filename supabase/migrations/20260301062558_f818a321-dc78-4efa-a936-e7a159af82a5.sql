
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all tags" ON public.tags;

-- Create a security definer function to check if a user can see a tag
CREATE OR REPLACE FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- User created the tag
    SELECT 1 FROM public.tags WHERE id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- User has explicit tag_access
    SELECT 1 FROM public.tag_access WHERE tag_id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- Tag is used on a task in a group the user owns or is member of
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND t.group_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.task_groups tg WHERE tg.id = t.group_id AND tg.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = _user_id)
    )
  ) OR EXISTS (
    -- Tag is used on a task owned by or assigned to the user
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND (t.user_id = _user_id OR t.assigned_to = _user_id)
  ) OR EXISTS (
    -- Tag is linked to a group the user owns or is member of
    SELECT 1 FROM public.task_groups tg
    WHERE tg.linked_tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  ) OR EXISTS (
    -- Tag is assigned to a group (group_tags) the user owns or is member of
    SELECT 1 FROM public.group_tags gt
    JOIN public.task_groups tg ON tg.id = gt.group_id
    WHERE gt.tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  );
$$;

-- New restrictive SELECT policy
CREATE POLICY "Users can view accessible tags"
ON public.tags
FOR SELECT
USING (can_view_tag(id, auth.uid()));
