ALTER TABLE public.task_comments
  ADD COLUMN reply_to uuid REFERENCES public.task_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS task_comments_reply_to_idx ON public.task_comments (reply_to);