ALTER TABLE public.notification_preferences
ADD COLUMN IF NOT EXISTS telegram_weekly_ai_review boolean NOT NULL DEFAULT true;