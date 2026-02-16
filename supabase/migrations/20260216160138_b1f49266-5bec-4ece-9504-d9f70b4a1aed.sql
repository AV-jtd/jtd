
-- Create task_participants table for multiple roles per task
CREATE TABLE public.task_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'participant' CHECK (role IN ('assignee', 'participant')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

-- Enable RLS
ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;

-- Task owners can manage participants
CREATE POLICY "Task owners manage participants"
ON public.task_participants
FOR ALL
USING (is_task_owner(task_id, auth.uid()))
WITH CHECK (is_task_owner(task_id, auth.uid()));

-- Participants can view their own participation
CREATE POLICY "Users can view own participation"
ON public.task_participants
FOR SELECT
USING (auth.uid() = user_id);

-- Supervisors can view participants of subordinate tasks
CREATE POLICY "Supervisors can view subordinate task participants"
ON public.task_participants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_participants.task_id
    AND is_supervisor_of_user(auth.uid(), t.user_id)
  )
);

-- Allow profiles to be visible for task participants (so users can see names)
CREATE POLICY "Task participants can view each other profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp1
    JOIN public.task_participants tp2 ON tp1.task_id = tp2.task_id
    WHERE tp1.user_id = auth.uid() AND tp2.user_id = profiles.id
  )
);

-- Team members can view profiles of other team members (for user picker)
CREATE POLICY "Team members can view team member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm2.user_id = profiles.id
  )
);
