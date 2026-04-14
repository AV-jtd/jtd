
-- Add baseline lock fields to task_groups
ALTER TABLE public.task_groups
  ADD COLUMN baseline_status text NOT NULL DEFAULT 'planning',
  ADD COLUMN baseline_approver_id uuid,
  ADD COLUMN baseline_locked_at timestamptz,
  ADD COLUMN baseline_auto_lock_hours integer NOT NULL DEFAULT 48;
