-- Same gap as task_groups (see 20260715103948), one table over: adding
-- "участники" (task_participants) from the STM group-edit dialog only
-- worked when the current user owned every stage task being touched
-- (is_task_owner / is_task_in_user_group — group_members is never
-- populated for STM SKUs). A non-owner team member adding participants
-- to someone else's SKU got a hard RLS error on INSERT. Scope narrowly
-- to stm_stage tasks belonging to npd_stm groups.
CREATE POLICY "Team can manage STM SKU participants"
ON public.task_participants
FOR ALL
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_participants.task_id
      AND t.task_type = 'stm_stage'
      AND tg.project_subtype = 'npd_stm'
  )
)
WITH CHECK (
  NOT public.is_consultant(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = task_participants.task_id
      AND t.task_type = 'stm_stage'
      AND tg.project_subtype = 'npd_stm'
  )
);
