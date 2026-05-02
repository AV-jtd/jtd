-- Follow-up link: closed task → newly opened follow-up task.
-- Used in TaskChat workflow: "закрыли задачу → создали продолжение".
-- Self-referencing FK with SET NULL on delete to avoid losing the new task
-- if the original gets removed.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS follow_up_of uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_follow_up_of_idx
  ON public.tasks (follow_up_of)
  WHERE follow_up_of IS NOT NULL;