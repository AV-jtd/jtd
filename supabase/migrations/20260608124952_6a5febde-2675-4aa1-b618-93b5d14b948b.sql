DROP POLICY IF EXISTS "Non-consultants view client rooms" ON public.task_groups;
DROP POLICY IF EXISTS "Non-consultants view client room messages" ON public.group_messages;
DROP POLICY IF EXISTS "Non-consultants post in client rooms" ON public.group_messages;
DROP POLICY IF EXISTS "Non-consultants view client room members" ON public.group_members;
DROP FUNCTION IF EXISTS public.is_crm_client_group(uuid);