ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_user_mentioned boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_user_mentioned boolean NOT NULL DEFAULT false;