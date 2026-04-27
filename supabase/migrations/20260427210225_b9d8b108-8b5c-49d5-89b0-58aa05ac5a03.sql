
-- Allow users who can see/work with at least one task in the group to also pin pages to the project's knowledge base.
-- Covers: assignees, task owners, task_participants, delegatees — even when they aren't formally group_members.

CREATE POLICY "Task collaborators can create wiki pages in group"
ON public.wiki_pages
FOR INSERT
TO authenticated
WITH CHECK (
  group_id IS NOT NULL
  AND auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.group_id = wiki_pages.group_id
      AND (
        t.user_id = auth.uid()
        OR t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.task_participants tp
          WHERE tp.task_id = t.id AND tp.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Task collaborators can view wiki pages in group"
ON public.wiki_pages
FOR SELECT
TO authenticated
USING (
  group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.group_id = wiki_pages.group_id
      AND (
        t.user_id = auth.uid()
        OR t.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.task_participants tp
          WHERE tp.task_id = t.id AND tp.user_id = auth.uid()
        )
      )
  )
);
