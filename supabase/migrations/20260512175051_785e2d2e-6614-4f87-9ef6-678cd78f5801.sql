-- Decisions: cross-app entity attached to a protocol with M2M to projects/tags/clients,
-- with optional restricted visibility to a defined circle.

CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  protocol_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  source_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active', -- active | revoked | superseded
  superseded_by uuid REFERENCES public.decisions(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'protocol', -- protocol | restricted
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_decisions_protocol ON public.decisions(protocol_id);
CREATE INDEX idx_decisions_user ON public.decisions(user_id);
CREATE INDEX idx_decisions_source_task ON public.decisions(source_task_id);

CREATE TABLE public.decision_projects (
  decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (decision_id, group_id)
);
CREATE INDEX idx_decision_projects_group ON public.decision_projects(group_id);

CREATE TABLE public.decision_tags (
  decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (decision_id, tag_id)
);
CREATE INDEX idx_decision_tags_tag ON public.decision_tags(tag_id);

CREATE TABLE public.decision_clients (
  decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  PRIMARY KEY (decision_id, client_id)
);
CREATE INDEX idx_decision_clients_client ON public.decision_clients(client_id);

CREATE TABLE public.decision_viewers (
  decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (decision_id, user_id)
);
CREATE INDEX idx_decision_viewers_user ON public.decision_viewers(user_id);

-- updated_at trigger
CREATE TRIGGER trg_decisions_updated_at
BEFORE UPDATE ON public.decisions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Visibility helper
CREATE OR REPLACE FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  SELECT id, user_id, protocol_id, visibility
    INTO d
    FROM public.decisions
   WHERE id = _decision_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF d.user_id = _user_id THEN RETURN true; END IF;
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;
  IF public.is_consultant(_user_id) THEN RETURN false; END IF;

  IF d.visibility = 'protocol' THEN
    -- Anyone who can see the protocol group
    IF public.is_group_member(d.protocol_id, _user_id)
       OR public.is_group_owner(d.protocol_id, _user_id) THEN
      RETURN true;
    END IF;
    -- Or attached as participant in any task of the protocol
    IF EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_participants tp ON tp.task_id = t.id
      WHERE t.group_id = d.protocol_id AND tp.user_id = _user_id
    ) THEN RETURN true; END IF;
    -- Or any of the linked projects is visible to the user
    IF EXISTS (
      SELECT 1 FROM public.decision_projects dp
      WHERE dp.decision_id = d.id
        AND (public.is_group_member(dp.group_id, _user_id)
             OR public.is_group_owner(dp.group_id, _user_id))
    ) THEN RETURN true; END IF;
    RETURN false;
  END IF;

  IF d.visibility = 'restricted' THEN
    IF EXISTS (
      SELECT 1 FROM public.decision_viewers dv
      WHERE dv.decision_id = d.id AND dv.user_id = _user_id
    ) THEN RETURN true; END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

-- RLS
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_viewers ENABLE ROW LEVEL SECURITY;

-- decisions
CREATE POLICY "Admins full access decisions" ON public.decisions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Consultant block decisions" ON public.decisions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT is_consultant(auth.uid()))
  WITH CHECK (NOT is_consultant(auth.uid()));

CREATE POLICY "View decisions if allowed" ON public.decisions
  FOR SELECT TO authenticated
  USING (can_see_decision(id, auth.uid()));

CREATE POLICY "Authenticated insert own decision" ON public.decisions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Author updates own decision" ON public.decisions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Author deletes own decision" ON public.decisions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Generic policy generator for child tables: visibility tied to parent decision; writes only by author/admin.
-- decision_projects
CREATE POLICY "Admins full access decision_projects" ON public.decision_projects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "View decision_projects if can see decision" ON public.decision_projects
  FOR SELECT TO authenticated
  USING (can_see_decision(decision_id, auth.uid()));
CREATE POLICY "Author writes decision_projects" ON public.decision_projects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()));

-- decision_tags
CREATE POLICY "Admins full access decision_tags" ON public.decision_tags
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "View decision_tags if can see decision" ON public.decision_tags
  FOR SELECT TO authenticated
  USING (can_see_decision(decision_id, auth.uid()));
CREATE POLICY "Author writes decision_tags" ON public.decision_tags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()));

-- decision_clients
CREATE POLICY "Admins full access decision_clients" ON public.decision_clients
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "View decision_clients if can see decision" ON public.decision_clients
  FOR SELECT TO authenticated
  USING (can_see_decision(decision_id, auth.uid()));
CREATE POLICY "Author writes decision_clients" ON public.decision_clients
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()));

-- decision_viewers
CREATE POLICY "Admins full access decision_viewers" ON public.decision_viewers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Viewers see own viewer rows" ON public.decision_viewers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()));
CREATE POLICY "Author writes decision_viewers" ON public.decision_viewers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_viewers;
