
-- Add recurrence fields to tasks
ALTER TABLE public.tasks
ADD COLUMN recurrence text DEFAULT NULL,
ADD COLUMN recurrence_end_date timestamp with time zone DEFAULT NULL,
ADD COLUMN parent_recurring_id uuid DEFAULT NULL REFERENCES public.tasks(id) ON DELETE SET NULL;

-- recurrence values: 'daily', 'weekly', 'monthly', 'yearly', or NULL for non-recurring
-- parent_recurring_id links auto-created tasks back to the original recurring task

COMMENT ON COLUMN public.tasks.recurrence IS 'Repeat interval: daily, weekly, monthly, yearly';
COMMENT ON COLUMN public.tasks.recurrence_end_date IS 'Stop repeating after this date';
COMMENT ON COLUMN public.tasks.parent_recurring_id IS 'Links to the original recurring task';
