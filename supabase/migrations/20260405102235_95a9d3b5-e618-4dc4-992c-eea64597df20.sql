-- Update is_task_in_parent_member_group to use full membership
CREATE OR REPLACE FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_groups tg ON tg.id = t.group_id
      WHERE t.id = _task_id
      AND tg.parent_id IS NOT NULL
      AND is_full_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$$;

-- Update is_message_in_parent_member_group to use full membership
CREATE OR REPLACE FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.task_groups tg
      WHERE tg.id = _group_id
      AND tg.parent_id IS NOT NULL
      AND is_full_group_member(tg.parent_id, _user_id)
    )
  ELSE false END;
$$;