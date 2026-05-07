-- Many-to-many: lens project ↔ tags (OR logic)
CREATE TABLE IF NOT EXISTS public.task_group_linked_tags (
  group_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (group_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tglt_group ON public.task_group_linked_tags(group_id);
CREATE INDEX IF NOT EXISTS idx_tglt_tag ON public.task_group_linked_tags(tag_id);

ALTER TABLE public.task_group_linked_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to linked tags"
ON public.task_group_linked_tags FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Consultant block on linked tags"
ON public.task_group_linked_tags AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT is_consultant(auth.uid()))
WITH CHECK (NOT is_consultant(auth.uid()));

CREATE POLICY "Group members can view linked tags"
ON public.task_group_linked_tags FOR SELECT
USING (is_group_member(group_id, auth.uid()) OR is_group_owner(group_id, auth.uid()));

CREATE POLICY "Group owners manage linked tags"
ON public.task_group_linked_tags FOR ALL
USING (is_group_owner(group_id, auth.uid()))
WITH CHECK (is_group_owner(group_id, auth.uid()));

CREATE POLICY "Owners can manage linked tags via task_groups"
ON public.task_group_linked_tags FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.task_groups tg WHERE tg.id = group_id AND tg.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.task_groups tg WHERE tg.id = group_id AND tg.user_id = auth.uid()));

-- Backfill: existing single linked_tag_id → new table
INSERT INTO public.task_group_linked_tags (group_id, tag_id, created_by)
SELECT id, linked_tag_id, user_id
FROM public.task_groups
WHERE linked_tag_id IS NOT NULL
ON CONFLICT DO NOTHING;
