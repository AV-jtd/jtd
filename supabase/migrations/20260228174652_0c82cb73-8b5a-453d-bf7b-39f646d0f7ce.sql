
-- Dependencies between tasks (Finish-to-Start, Start-to-Start, etc.)
CREATE TABLE public.task_dependencies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  predecessor_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  successor_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'FS', -- FS, SS, FF, SF
  lag_days integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE(predecessor_id, successor_id)
);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

-- Helper function to check dependency access
CREATE OR REPLACE FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_dependencies td
    JOIN public.tasks t1 ON t1.id = td.predecessor_id
    JOIN public.tasks t2 ON t2.id = td.successor_id
    WHERE td.id = _dep_id
    AND (
      t1.user_id = _user_id OR t2.user_id = _user_id
      OR (t1.group_id IS NOT NULL AND (is_group_owner(t1.group_id, _user_id) OR is_group_member(t1.group_id, _user_id)))
      OR (t2.group_id IS NOT NULL AND (is_group_owner(t2.group_id, _user_id) OR is_group_member(t2.group_id, _user_id)))
    )
  );
$$;

CREATE POLICY "Users can view dependencies for accessible tasks"
ON public.task_dependencies FOR SELECT
USING (can_access_dependency(id, auth.uid()));

CREATE POLICY "Users can create dependencies for own/group tasks"
ON public.task_dependencies FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND (
    EXISTS (SELECT 1 FROM public.tasks WHERE id = predecessor_id AND (user_id = auth.uid() OR (group_id IS NOT NULL AND (is_group_owner(group_id, auth.uid()) OR is_group_member(group_id, auth.uid())))))
  )
);

CREATE POLICY "Users can delete dependencies they created"
ON public.task_dependencies FOR DELETE
USING (auth.uid() = created_by);

-- Project milestones
CREATE TABLE public.project_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  planned_date timestamp with time zone NOT NULL,
  actual_date timestamp with time zone,
  status text NOT NULL DEFAULT 'pending', -- pending, completed, missed, cancelled
  color text DEFAULT '#3b82f6',
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group owners manage milestones"
ON public.project_milestones FOR ALL
USING (is_group_owner(group_id, auth.uid()))
WITH CHECK (is_group_owner(group_id, auth.uid()));

CREATE POLICY "Group members can view milestones"
ON public.project_milestones FOR SELECT
USING (is_group_member(group_id, auth.uid()));

CREATE POLICY "Group members can create milestones"
ON public.project_milestones FOR INSERT
WITH CHECK (is_group_member(group_id, auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Milestone creators can update own milestones"
ON public.project_milestones FOR UPDATE
USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER update_project_milestones_updated_at
BEFORE UPDATE ON public.project_milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
