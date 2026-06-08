CREATE OR REPLACE FUNCTION public.is_crm_client_group(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_groups
    WHERE id = _group_id AND project_type = 'crm_client'
  );
$$;

-- Все не-консультанты видят чат-комнаты клиентов (общий справочник клиентов).
CREATE POLICY "Non-consultants view client rooms"
ON public.task_groups
FOR SELECT
TO authenticated
USING (project_type = 'crm_client' AND NOT is_consultant(auth.uid()));

-- Все не-консультанты видят сообщения в чатах клиентов.
CREATE POLICY "Non-consultants view client room messages"
ON public.group_messages
FOR SELECT
TO authenticated
USING (NOT is_consultant(auth.uid()) AND public.is_crm_client_group(group_id));

-- Все не-консультанты могут писать в чаты клиентов.
CREATE POLICY "Non-consultants post in client rooms"
ON public.group_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND NOT is_consultant(auth.uid()) AND public.is_crm_client_group(group_id));

-- Все не-консультанты видят участников чатов клиентов.
CREATE POLICY "Non-consultants view client room members"
ON public.group_members
FOR SELECT
TO authenticated
USING (NOT is_consultant(auth.uid()) AND public.is_crm_client_group(group_id));