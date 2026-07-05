-- Helper: is this group an STM SKU (npd_stm)? SECURITY DEFINER to avoid RLS recursion.
CREATE OR REPLACE FUNCTION public.is_npd_stm_group(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_groups
    WHERE id = _group_id
      AND project_subtype = 'npd_stm'
  )
$$;

-- Team visibility for SKU chats: mirror task_groups visibility (any non-consultant).
CREATE POLICY "Team can view STM SKU messages"
  ON public.group_messages
  FOR SELECT
  TO authenticated
  USING ((NOT is_consultant(auth.uid())) AND public.is_npd_stm_group(group_id));

CREATE POLICY "Team can post in STM SKU chats"
  ON public.group_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (NOT is_consultant(auth.uid()))
    AND (auth.uid() = user_id)
    AND public.is_npd_stm_group(group_id)
  );