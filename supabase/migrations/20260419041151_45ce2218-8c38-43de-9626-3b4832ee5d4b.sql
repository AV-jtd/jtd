-- Add protocol_scope column to tasks
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS protocol_scope text NOT NULL DEFAULT 'external'
CHECK (protocol_scope IN ('external', 'internal'));

-- Index for fast lookup of protocol rows by scope
CREATE INDEX IF NOT EXISTS idx_tasks_source_protocol_scope
ON public.tasks (source_protocol_id, protocol_scope)
WHERE source_protocol_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.protocol_scope IS 'Для строк протокола: external = видно партнёру в экспорте и CRM, internal = только своя команда';