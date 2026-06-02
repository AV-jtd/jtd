-- Этап 4 «Единый чат»: связь проектов с группами TG/MAX + поля внешних авторов

-- 1) Связь проект ↔ группа мессенджера
ALTER TABLE public.task_groups ADD COLUMN IF NOT EXISTS telegram_group_chat_id bigint;
ALTER TABLE public.task_groups ADD COLUMN IF NOT EXISTS max_group_chat_id text;
ALTER TABLE public.task_groups ADD COLUMN IF NOT EXISTS chat_mirror_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_groups_tg_group ON public.task_groups (telegram_group_chat_id) WHERE telegram_group_chat_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_groups_max_group ON public.task_groups (max_group_chat_id) WHERE max_group_chat_id IS NOT NULL;

-- 2) group_messages: внешние авторы (несопоставленные с JTD) + дедупликация входящих
ALTER TABLE public.group_messages ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS external_author text;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS external_message_id text;

-- Дедуп: один входящий из (source, external_message_id) не записывается дважды (ретраи вебхука)
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_messages_external_dedup
  ON public.group_messages (source, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- 3) Коды привязки группы (короткоживущие, генерятся из JTD, вводятся в группе)
CREATE TABLE IF NOT EXISTS public.chat_link_tokens (
  code text PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  channel text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 hour')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_link_tokens TO authenticated;
GRANT ALL ON public.chat_link_tokens TO service_role;

ALTER TABLE public.chat_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat link tokens"
  ON public.chat_link_tokens
  FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);