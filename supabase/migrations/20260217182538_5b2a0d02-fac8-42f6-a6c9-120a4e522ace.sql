
-- 1. Add priority column to tasks (1=P1 highest, 4=P4 lowest, null=no priority for backward compat)
ALTER TABLE public.tasks ADD COLUMN priority smallint;

-- 2. Create comments table
CREATE TABLE public.task_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Comments policies: task owner and participants can view
CREATE POLICY "Task owners can manage comments"
  ON public.task_comments FOR ALL
  USING (is_task_owner(task_id, auth.uid()))
  WITH CHECK (is_task_owner(task_id, auth.uid()));

CREATE POLICY "Comment authors can manage own comments"
  ON public.task_comments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Group members can view task comments"
  ON public.task_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tasks t 
    WHERE t.id = task_comments.task_id 
    AND t.group_id IS NOT NULL 
    AND is_group_member(t.group_id, auth.uid())
  ));

CREATE POLICY "Group members can add comments"
  ON public.task_comments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t 
    WHERE t.id = task_comments.task_id 
    AND t.group_id IS NOT NULL 
    AND is_group_member(t.group_id, auth.uid())
  ));

CREATE POLICY "Supervisors can view subordinate task comments"
  ON public.task_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tasks t 
    WHERE t.id = task_comments.task_id 
    AND is_supervisor_of_user(auth.uid(), t.user_id)
  ));

-- Trigger for updated_at
CREATE TRIGGER update_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
