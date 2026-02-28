
-- Add entity type columns to support milestones and projects as dependency endpoints
ALTER TABLE public.task_dependencies
  ADD COLUMN predecessor_entity_type text NOT NULL DEFAULT 'task',
  ADD COLUMN successor_entity_type text NOT NULL DEFAULT 'task';

-- Drop FK constraints to allow milestone/project IDs in predecessor_id/successor_id
ALTER TABLE public.task_dependencies
  DROP CONSTRAINT IF EXISTS task_dependencies_predecessor_id_fkey,
  DROP CONSTRAINT IF EXISTS task_dependencies_successor_id_fkey;

-- Update access check function for milestones and projects
CREATE OR REPLACE FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.task_dependencies td
    WHERE td.id = _dep_id
    AND (
      -- Task access
      (td.predecessor_entity_type = 'task' AND EXISTS (
        SELECT 1 FROM public.tasks t WHERE t.id = td.predecessor_id AND (
          t.user_id = _user_id
          OR (t.group_id IS NOT NULL AND (is_group_owner(t.group_id, _user_id) OR is_group_member(t.group_id, _user_id)))
        )
      ))
      OR (td.successor_entity_type = 'task' AND EXISTS (
        SELECT 1 FROM public.tasks t WHERE t.id = td.successor_id AND (
          t.user_id = _user_id
          OR (t.group_id IS NOT NULL AND (is_group_owner(t.group_id, _user_id) OR is_group_member(t.group_id, _user_id)))
        )
      ))
      -- Milestone access
      OR (td.predecessor_entity_type = 'milestone' AND EXISTS (
        SELECT 1 FROM public.project_milestones m WHERE m.id = td.predecessor_id AND (
          is_group_owner(m.group_id, _user_id) OR is_group_member(m.group_id, _user_id) OR m.created_by = _user_id
        )
      ))
      OR (td.successor_entity_type = 'milestone' AND EXISTS (
        SELECT 1 FROM public.project_milestones m WHERE m.id = td.successor_id AND (
          is_group_owner(m.group_id, _user_id) OR is_group_member(m.group_id, _user_id) OR m.created_by = _user_id
        )
      ))
      -- Project access
      OR (td.predecessor_entity_type = 'project' AND EXISTS (
        SELECT 1 FROM public.task_groups g WHERE g.id = td.predecessor_id AND (
          g.user_id = _user_id OR is_group_member(g.id, _user_id)
        )
      ))
      OR (td.successor_entity_type = 'project' AND EXISTS (
        SELECT 1 FROM public.task_groups g WHERE g.id = td.successor_id AND (
          g.user_id = _user_id OR is_group_member(g.id, _user_id)
        )
      ))
    )
  );
$function$;

-- Update INSERT policy for milestones and projects
DROP POLICY IF EXISTS "Users can create dependencies for own/group tasks" ON public.task_dependencies;
CREATE POLICY "Users can create dependencies for own/group tasks"
ON public.task_dependencies FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND (
    (predecessor_entity_type = 'task' AND EXISTS (
      SELECT 1 FROM tasks WHERE id = predecessor_id AND (
        user_id = auth.uid() OR (group_id IS NOT NULL AND (is_group_owner(group_id, auth.uid()) OR is_group_member(group_id, auth.uid())))
      )
    ))
    OR (predecessor_entity_type = 'milestone' AND EXISTS (
      SELECT 1 FROM project_milestones WHERE id = predecessor_id AND (
        is_group_owner(group_id, auth.uid()) OR is_group_member(group_id, auth.uid()) OR created_by = auth.uid()
      )
    ))
    OR (predecessor_entity_type = 'project' AND EXISTS (
      SELECT 1 FROM task_groups WHERE id = predecessor_id AND (
        user_id = auth.uid() OR is_group_member(id, auth.uid())
      )
    ))
  )
);
