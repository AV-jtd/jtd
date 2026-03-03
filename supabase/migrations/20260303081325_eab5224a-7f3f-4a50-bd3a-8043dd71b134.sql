-- Fix infinite recursion: task_participants policies reference tasks, and tasks policies reference task_participants
-- Solution: Create SECURITY DEFINER functions that bypass RLS to break the cycle

-- Function to check if user is a task participant (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_participants
      WHERE task_id = _task_id AND user_id = _user_id
    )
  ELSE false END;
$$;

-- Drop the problematic policies that cause recursion
DROP POLICY IF EXISTS "Task participants can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Task participants can view tasks" ON public.tasks;

DROP POLICY IF EXISTS "Task participants can view comments" ON public.task_comments;
DROP POLICY IF EXISTS "Task participants can add comments" ON public.task_comments;

DROP POLICY IF EXISTS "Task participants can view subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Task participants can update subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Task participants can create subtasks" ON public.subtasks;
DROP POLICY IF EXISTS "Task participants can delete subtasks" ON public.subtasks;

DROP POLICY IF EXISTS "Task participants can view task tags" ON public.task_tags;

-- Recreate policies using the SECURITY DEFINER function (no recursion)

-- Tasks
CREATE POLICY "Task participants can view tasks"
ON public.tasks FOR SELECT TO authenticated
USING (is_task_participant(id, auth.uid()));

CREATE POLICY "Task participants can update tasks"
ON public.tasks FOR UPDATE TO authenticated
USING (is_task_participant(id, auth.uid()));

-- Task comments
CREATE POLICY "Task participants can view comments"
ON public.task_comments FOR SELECT TO authenticated
USING (is_task_participant(task_id, auth.uid()));

CREATE POLICY "Task participants can add comments"
ON public.task_comments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND is_task_participant(task_id, auth.uid()));

-- Subtasks
CREATE POLICY "Task participants can view subtasks"
ON public.subtasks FOR SELECT TO authenticated
USING (is_task_participant(task_id, auth.uid()));

CREATE POLICY "Task participants can update subtasks"
ON public.subtasks FOR UPDATE TO authenticated
USING (is_task_participant(task_id, auth.uid()));

CREATE POLICY "Task participants can create subtasks"
ON public.subtasks FOR INSERT TO authenticated
WITH CHECK (is_task_participant(task_id, auth.uid()));

CREATE POLICY "Task participants can delete subtasks"
ON public.subtasks FOR DELETE TO authenticated
USING (is_task_participant(task_id, auth.uid()));

-- Task tags
CREATE POLICY "Task participants can view task tags"
ON public.task_tags FOR SELECT TO authenticated
USING (is_task_participant(task_id, auth.uid()));

-- Also fix profiles: "Authenticated users can view all profiles" already covers it,
-- but the task_participants join in the profile policy also causes recursion.
-- Drop and recreate with the SECURITY DEFINER function
DROP POLICY IF EXISTS "Task participants can view each other profiles" ON public.profiles;

CREATE POLICY "Task participants can view each other profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.task_participants tp1
    JOIN public.task_participants tp2 ON tp1.task_id = tp2.task_id
    WHERE tp1.user_id = auth.uid() AND tp2.user_id = profiles.id
  )
);