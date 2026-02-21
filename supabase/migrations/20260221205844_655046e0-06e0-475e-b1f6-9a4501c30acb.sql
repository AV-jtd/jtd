
-- Notification preferences per user
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  push_task_assigned boolean NOT NULL DEFAULT true,
  push_task_completed boolean NOT NULL DEFAULT true,
  push_task_commented boolean NOT NULL DEFAULT false,
  push_deadline_approaching boolean NOT NULL DEFAULT false,
  push_added_to_group boolean NOT NULL DEFAULT false,
  telegram_task_assigned boolean NOT NULL DEFAULT false,
  telegram_task_completed boolean NOT NULL DEFAULT false,
  telegram_task_commented boolean NOT NULL DEFAULT false,
  telegram_deadline_approaching boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own preferences"
  ON public.notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
