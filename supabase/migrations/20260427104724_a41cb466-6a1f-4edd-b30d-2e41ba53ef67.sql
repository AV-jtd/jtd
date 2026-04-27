-- Откат дублирующей механики "attributed_group_id" (вторая попытка).
DROP POLICY IF EXISTS "Attributed project members can view task" ON public.tasks;
DROP POLICY IF EXISTS "Attributed project members can update task" ON public.tasks;
DROP INDEX IF EXISTS public.idx_tasks_attributed_group_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS attributed_group_id CASCADE;