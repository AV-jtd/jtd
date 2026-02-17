
-- Allow supervisors to see task_groups that contain tasks of their subordinates
CREATE POLICY "Supervisors can view subordinate task groups"
ON public.task_groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.group_id = task_groups.id
    AND is_supervisor_of_user(auth.uid(), t.user_id)
  )
);
