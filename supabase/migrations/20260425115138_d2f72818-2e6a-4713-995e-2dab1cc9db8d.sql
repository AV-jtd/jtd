-- Reactions on messages (task comments + group/project messages)
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_type TEXT NOT NULL CHECK (message_type IN ('task_comment','group_message')),
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_unique UNIQUE (message_type, message_id, user_id, emoji)
);

CREATE INDEX idx_message_reactions_msg ON public.message_reactions (message_type, message_id);
CREATE INDEX idx_message_reactions_user ON public.message_reactions (user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user who can see the underlying message
CREATE POLICY "Reactions visible to those who see the message"
ON public.message_reactions
FOR SELECT
TO authenticated
USING (
  (
    message_type = 'task_comment'
    AND EXISTS (
      SELECT 1 FROM public.task_comments tc
      WHERE tc.id = message_reactions.message_id
    )
  )
  OR (
    message_type = 'group_message'
    AND EXISTS (
      SELECT 1 FROM public.group_messages gm
      WHERE gm.id = message_reactions.message_id
        AND public.is_group_member(gm.group_id, auth.uid())
    )
  )
);

-- INSERT: only on behalf of self, only if the user can see the message
CREATE POLICY "Users add their own reactions"
ON public.message_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    (
      message_type = 'task_comment'
      AND EXISTS (SELECT 1 FROM public.task_comments tc WHERE tc.id = message_reactions.message_id)
    )
    OR (
      message_type = 'group_message'
      AND EXISTS (
        SELECT 1 FROM public.group_messages gm
        WHERE gm.id = message_reactions.message_id
          AND public.is_group_member(gm.group_id, auth.uid())
      )
    )
  )
);

-- DELETE: only own reactions
CREATE POLICY "Users delete their own reactions"
ON public.message_reactions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;