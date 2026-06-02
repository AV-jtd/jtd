-- MAX messenger channel — Stage 1 foundation
-- Add MAX identifiers to profiles (alongside telegram_*)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_user_id bigint;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_chat_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_max_user_id ON public.profiles (max_user_id) WHERE max_user_id IS NOT NULL;

-- Mirror Telegram notification preferences for MAX channel
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS max_task_assigned boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS max_task_completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS max_task_commented boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS max_deadline_approaching boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS max_group_chat_message boolean NOT NULL DEFAULT false;

-- Lightweight token store for deep-link account binding (userId -> short-lived link token)
CREATE TABLE IF NOT EXISTS public.max_link_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 hour')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.max_link_tokens TO authenticated;
GRANT ALL ON public.max_link_tokens TO service_role;

ALTER TABLE public.max_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own max link tokens"
  ON public.max_link_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);