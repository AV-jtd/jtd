-- Index for fast filtering of protocol projects
CREATE INDEX IF NOT EXISTS idx_task_groups_project_type ON public.task_groups(project_type) WHERE project_type = 'protocol';