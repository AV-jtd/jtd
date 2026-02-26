
-- Junction table: tags for projects (task_groups)
CREATE TABLE public.group_tags (
  group_id UUID NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.group_tags ENABLE ROW LEVEL SECURITY;

-- Group owners can manage tags on their groups
CREATE POLICY "Group owners manage group tags"
ON public.group_tags
FOR ALL
USING (is_group_owner(group_id, auth.uid()))
WITH CHECK (is_group_owner(group_id, auth.uid()));

-- Group members can view group tags
CREATE POLICY "Group members can view group tags"
ON public.group_tags
FOR SELECT
USING (is_group_member(group_id, auth.uid()));

-- Delegatees who see the group can view tags
CREATE POLICY "Delegatees can view group tags"
ON public.group_tags
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM tasks t
  WHERE t.group_id = group_tags.group_id AND t.assigned_to = auth.uid()
));
