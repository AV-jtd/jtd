ALTER TABLE public.notification_preferences 
ADD COLUMN telegram_weekly_report boolean NOT NULL DEFAULT false;