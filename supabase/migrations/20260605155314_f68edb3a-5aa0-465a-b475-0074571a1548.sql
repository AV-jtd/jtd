CREATE UNIQUE INDEX IF NOT EXISTS uq_task_groups_crm_client
ON public.task_groups (client_id)
WHERE project_type = 'crm_client' AND client_id IS NOT NULL;