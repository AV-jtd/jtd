ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS telegram_group_chat_message boolean NOT NULL DEFAULT false;