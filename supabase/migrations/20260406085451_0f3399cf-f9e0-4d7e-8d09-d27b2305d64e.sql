
CREATE TABLE public.telegram_pending_context (
  id serial PRIMARY KEY,
  chat_id bigint NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  context_type text NOT NULL DEFAULT 'spisok',
  group_id uuid REFERENCES public.task_groups(id) ON DELETE CASCADE,
  group_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-expire old contexts (older than 10 minutes will be ignored in code)
CREATE INDEX idx_telegram_pending_context_chat ON telegram_pending_context(chat_id);

-- RLS: only service role accesses this
ALTER TABLE public.telegram_pending_context ENABLE ROW LEVEL SECURITY;
