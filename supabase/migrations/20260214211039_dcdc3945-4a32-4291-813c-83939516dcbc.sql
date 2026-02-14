
-- Teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members with role
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Security definer functions (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id); $$;

CREATE OR REPLACE FUNCTION public.is_team_director(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND role = 'director'); $$;

CREATE OR REPLACE FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.team_members d
  JOIN public.team_members m ON d.team_id = m.team_id
  WHERE d.user_id = _director_id AND d.role = 'director'
  AND m.user_id = _user_id AND m.role = 'member'
); $$;

-- Teams RLS
CREATE POLICY "Members can view teams" ON public.teams FOR SELECT
USING (is_team_member(id, auth.uid()));

CREATE POLICY "Users can create teams" ON public.teams FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Directors can update teams" ON public.teams FOR UPDATE
USING (is_team_director(id, auth.uid()));

CREATE POLICY "Directors can delete teams" ON public.teams FOR DELETE
USING (is_team_director(id, auth.uid()));

-- Team members RLS
CREATE POLICY "Members can view team members" ON public.team_members FOR SELECT
USING (is_team_member(team_id, auth.uid()));

CREATE POLICY "Directors can manage members" ON public.team_members FOR ALL
USING (is_team_director(team_id, auth.uid()))
WITH CHECK (is_team_director(team_id, auth.uid()));

CREATE POLICY "Users can add self as member" ON public.team_members FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave team" ON public.team_members FOR DELETE
USING (user_id = auth.uid());

-- Directors can view subordinate tasks
CREATE POLICY "Directors can view subordinate tasks" ON public.tasks FOR SELECT
USING (is_director_of_user(auth.uid(), user_id));

-- Directors can see subordinate profiles
CREATE POLICY "Directors can view subordinate profiles" ON public.profiles FOR SELECT
USING (is_director_of_user(auth.uid(), id));
