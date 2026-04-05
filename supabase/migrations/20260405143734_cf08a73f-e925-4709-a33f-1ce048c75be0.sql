
-- Table for named step templates
CREATE TABLE public.task_step_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  group_id uuid REFERENCES public.task_groups(id) ON DELETE SET NULL,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_step_templates ENABLE ROW LEVEL SECURITY;

-- Users can manage their own templates
CREATE POLICY "Users manage own templates"
ON public.task_step_templates FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can view global templates shared by others
CREATE POLICY "Users can view global templates"
ON public.task_step_templates FOR SELECT
TO authenticated
USING (is_global = true);

-- Group members can view group-scoped templates
CREATE POLICY "Group members can view group templates"
ON public.task_step_templates FOR SELECT
TO authenticated
USING (group_id IS NOT NULL AND is_group_member(group_id, auth.uid()));

-- Group owners can view group templates
CREATE POLICY "Group owners can view group templates"
ON public.task_step_templates FOR SELECT
TO authenticated
USING (group_id IS NOT NULL AND is_group_owner(group_id, auth.uid()));
