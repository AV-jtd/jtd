
-- Table to link Telegram group chats to app projects
CREATE TABLE public.telegram_group_chats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_chat_id bigint NOT NULL,
  telegram_chat_title text,
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  linked_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(telegram_chat_id)
);

-- Enable RLS
ALTER TABLE public.telegram_group_chats ENABLE ROW LEVEL SECURITY;

-- Only service role should manage this table (via edge functions)
-- Users can view links for their own groups
CREATE POLICY "Users can view links for own groups"
  ON public.telegram_group_chats
  FOR SELECT
  USING (is_group_owner(group_id, auth.uid()) OR is_group_member(group_id, auth.uid()));

CREATE POLICY "Group owners can manage links"
  ON public.telegram_group_chats
  FOR ALL
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));
