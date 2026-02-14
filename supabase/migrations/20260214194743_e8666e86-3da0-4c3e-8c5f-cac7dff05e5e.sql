-- Add parent_id for subproject hierarchy (one level nesting)
ALTER TABLE public.task_groups
ADD COLUMN parent_id uuid REFERENCES public.task_groups(id) ON DELETE CASCADE;

-- Index for fast lookups
CREATE INDEX idx_task_groups_parent_id ON public.task_groups(parent_id);

-- Update RLS: members of parent group can also see subgroups
CREATE POLICY "Members can view subgroups of joined groups"
ON public.task_groups
FOR SELECT
USING (
  parent_id IS NOT NULL AND is_group_member(parent_id, auth.uid())
);

-- Owners of parent can manage subgroups
CREATE POLICY "Owners can manage subgroups"
ON public.task_groups
FOR ALL
USING (
  parent_id IS NOT NULL AND (
    SELECT user_id FROM public.task_groups AS parent WHERE parent.id = task_groups.parent_id
  ) = auth.uid()
)
WITH CHECK (
  parent_id IS NOT NULL AND (
    SELECT user_id FROM public.task_groups AS parent WHERE parent.id = task_groups.parent_id
  ) = auth.uid()
);