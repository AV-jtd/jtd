-- Drop the problematic policies
DROP POLICY IF EXISTS "Owners can manage subgroups" ON public.task_groups;
DROP POLICY IF EXISTS "Members can view subgroups of joined groups" ON public.task_groups;

-- Create a security definer function to check parent ownership
CREATE OR REPLACE FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_groups
    WHERE id = _parent_id AND user_id = _user_id
  );
$$;

-- Recreate policies using the function
CREATE POLICY "Members can view subgroups of joined groups"
ON public.task_groups
FOR SELECT
USING (
  parent_id IS NOT NULL AND is_group_member(parent_id, auth.uid())
);

CREATE POLICY "Owners can manage subgroups"
ON public.task_groups
FOR ALL
USING (
  parent_id IS NOT NULL AND is_subgroup_owner(parent_id, auth.uid())
)
WITH CHECK (
  parent_id IS NOT NULL AND is_subgroup_owner(parent_id, auth.uid())
);