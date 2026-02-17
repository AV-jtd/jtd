
-- Drop the problematic policy
DROP POLICY IF EXISTS "Subgroup members can view parent group" ON public.task_groups;

-- Create a security definer function to check if user is member of any subgroup
CREATE OR REPLACE FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.group_members gm
      JOIN public.task_groups tg ON tg.id = gm.group_id
      WHERE tg.parent_id = _parent_id
      AND gm.user_id = _user_id
    )
  ELSE false END;
$$;

-- Recreate policy using the function
CREATE POLICY "Subgroup members can view parent group"
ON public.task_groups
FOR SELECT
USING (is_parent_of_member_group(id, auth.uid()));
