-- Create a diagnostic function to test RLS as a specific user
CREATE OR REPLACE FUNCTION public.debug_user_visible_groups(_user_id uuid)
RETURNS TABLE(group_id uuid, group_name text, parent_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Set the JWT claims to impersonate the user
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  
  RETURN QUERY
  SELECT tg.id, tg.name, tg.parent_id
  FROM task_groups tg
  ORDER BY tg.position;
END;
$$;