ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_task_delegated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_task_delegated boolean NOT NULL DEFAULT false;