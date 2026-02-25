
-- Table to store telegram username → chat_id mapping independently of profiles
CREATE TABLE public.telegram_bot_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_username TEXT NOT NULL UNIQUE,
  chat_id BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: only service role needs access (edge functions use service role key)
ALTER TABLE public.telegram_bot_chats ENABLE ROW LEVEL SECURITY;

-- No public policies needed — only accessed via service_role in edge functions
