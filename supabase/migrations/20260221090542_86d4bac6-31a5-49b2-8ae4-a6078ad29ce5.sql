
-- Create group_messages table for project chat with thread support
CREATE TABLE public.group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reply_to UUID REFERENCES public.group_messages(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web', -- 'web' or 'telegram'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX idx_group_messages_reply_to ON public.group_messages(reply_to);
CREATE INDEX idx_group_messages_created_at ON public.group_messages(group_id, created_at);

-- Enable RLS
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Policies: group owners can manage all messages
CREATE POLICY "Group owners manage messages"
ON public.group_messages FOR ALL
USING (is_group_owner(group_id, auth.uid()))
WITH CHECK (is_group_owner(group_id, auth.uid()));

-- Group members can view messages
CREATE POLICY "Group members can view messages"
ON public.group_messages FOR SELECT
USING (is_group_member(group_id, auth.uid()));

-- Group members can insert messages
CREATE POLICY "Group members can insert messages"
ON public.group_messages FOR INSERT
WITH CHECK (is_group_member(group_id, auth.uid()) AND auth.uid() = user_id);

-- Users can manage own messages
CREATE POLICY "Users manage own messages"
ON public.group_messages FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_group_messages_updated_at
BEFORE UPDATE ON public.group_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
