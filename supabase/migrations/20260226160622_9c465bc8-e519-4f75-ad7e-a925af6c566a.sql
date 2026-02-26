
ALTER TABLE public.subtasks
ADD COLUMN deadline timestamp with time zone DEFAULT NULL,
ADD COLUMN assigned_to uuid DEFAULT NULL;
