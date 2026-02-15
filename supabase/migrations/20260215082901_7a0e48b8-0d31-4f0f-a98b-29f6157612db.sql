
-- Fix 1: Remove direct client access to vapid_keys table (private key exposure)
-- Drop the existing permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read VAPID public key" ON public.vapid_keys;

-- Create a view that only exposes the public key
CREATE OR REPLACE VIEW public.vapid_public_keys AS
SELECT id, public_key FROM public.vapid_keys;

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.vapid_public_keys TO authenticated;

-- Fix 2: Restrict SECURITY DEFINER functions to only work with auth.uid()
-- These functions are used in RLS policies where the _user_id parameter is always auth.uid(),
-- so we add a check to ensure callers can only query about themselves.

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.task_groups WHERE id = _group_id AND user_id = _user_id)
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id)
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.tag_access WHERE tag_id = _tag_id AND user_id = _user_id)
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id AND (user_id = _user_id OR assigned_to = _user_id))
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id)
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.is_team_director(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND role = 'director')
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (SELECT 1 FROM public.task_groups WHERE id = _parent_id AND user_id = _user_id)
  ELSE false END;
$$;

-- For supervisor/director functions, the _supervisor_id should be auth.uid()
CREATE OR REPLACE FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _director_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.team_members d
      JOIN public.team_members m ON d.team_id = m.team_id
      WHERE d.user_id = _director_id AND d.role = 'director'
      AND m.user_id = _user_id AND m.role = 'member'
    )
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ 
  SELECT CASE WHEN _supervisor_id = auth.uid() THEN
    EXISTS (
      SELECT 1 FROM public.team_members d
      JOIN public.team_members m ON d.team_id = m.team_id
      WHERE d.user_id = _supervisor_id AND d.role IN ('director', 'manager')
      AND m.user_id = _user_id AND m.role = 'member'
    )
  ELSE false END;
$$;
