DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tasks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_groups') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_groups';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_participants') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_participants';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_tags') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_tags';
  END IF;
END $$;

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_groups REPLICA IDENTITY FULL;
ALTER TABLE public.task_participants REPLICA IDENTITY FULL;
ALTER TABLE public.task_tags REPLICA IDENTITY FULL;