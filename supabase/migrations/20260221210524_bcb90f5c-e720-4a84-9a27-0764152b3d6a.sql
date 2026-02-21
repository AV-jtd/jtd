
-- Add new notification preference columns
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_task_participant_added boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_new_task_in_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_task_participant_added boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_added_to_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_new_task_in_group boolean NOT NULL DEFAULT false;
