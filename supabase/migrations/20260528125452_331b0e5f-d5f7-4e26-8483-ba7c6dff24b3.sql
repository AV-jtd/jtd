
-- Enum for board type
CREATE TYPE public.kanban_board_type AS ENUM ('personal', 'project', 'smart');

-- Boards
CREATE TABLE public.kanban_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'LayoutGrid',
  owner_id uuid NOT NULL,
  board_type public.kanban_board_type NOT NULL DEFAULT 'personal',
  group_id uuid REFERENCES public.task_groups(id) ON DELETE CASCADE,
  filter_json jsonb,
  group_by text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kanban_boards_project_has_group CHECK (
    (board_type <> 'project') OR (group_id IS NOT NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_boards TO authenticated;
GRANT ALL ON public.kanban_boards TO service_role;

ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access kanban_boards"
ON public.kanban_boards FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Consultant block kanban_boards"
ON public.kanban_boards AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_consultant(auth.uid()))
WITH CHECK (NOT public.is_consultant(auth.uid()));

CREATE POLICY "Owners manage personal boards"
ON public.kanban_boards FOR ALL TO authenticated
USING (board_type = 'personal' AND auth.uid() = owner_id)
WITH CHECK (board_type = 'personal' AND auth.uid() = owner_id);

CREATE POLICY "Project members view project boards"
ON public.kanban_boards FOR SELECT TO authenticated
USING (board_type = 'project' AND group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()));

CREATE POLICY "Project owners manage project boards"
ON public.kanban_boards FOR ALL TO authenticated
USING (board_type = 'project' AND group_id IS NOT NULL AND public.is_group_owner(group_id, auth.uid()))
WITH CHECK (board_type = 'project' AND group_id IS NOT NULL AND public.is_group_owner(group_id, auth.uid()));

CREATE POLICY "Owner manages smart boards"
ON public.kanban_boards FOR ALL TO authenticated
USING (board_type = 'smart' AND auth.uid() = owner_id)
WITH CHECK (board_type = 'smart' AND auth.uid() = owner_id);

CREATE INDEX idx_kanban_boards_owner ON public.kanban_boards(owner_id);
CREATE INDEX idx_kanban_boards_group ON public.kanban_boards(group_id) WHERE group_id IS NOT NULL;

-- Columns
CREATE TABLE public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  position integer NOT NULL DEFAULT 0,
  wip_limit integer,
  status_value text,
  mapping_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_columns TO authenticated;
GRANT ALL ON public.kanban_columns TO service_role;

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access kanban_columns"
ON public.kanban_columns FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Consultant block kanban_columns"
ON public.kanban_columns AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_consultant(auth.uid()))
WITH CHECK (NOT public.is_consultant(auth.uid()));

CREATE POLICY "View columns when board visible"
ON public.kanban_columns FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.kanban_boards b
  WHERE b.id = kanban_columns.board_id
    AND (
      (b.board_type IN ('personal','smart') AND b.owner_id = auth.uid())
      OR (b.board_type = 'project' AND b.group_id IS NOT NULL AND public.is_group_member(b.group_id, auth.uid()))
    )
));

CREATE POLICY "Manage columns when can manage board"
ON public.kanban_columns FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.kanban_boards b
  WHERE b.id = kanban_columns.board_id
    AND (
      (b.board_type IN ('personal','smart') AND b.owner_id = auth.uid())
      OR (b.board_type = 'project' AND b.group_id IS NOT NULL AND public.is_group_owner(b.group_id, auth.uid()))
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.kanban_boards b
  WHERE b.id = kanban_columns.board_id
    AND (
      (b.board_type IN ('personal','smart') AND b.owner_id = auth.uid())
      OR (b.board_type = 'project' AND b.group_id IS NOT NULL AND public.is_group_owner(b.group_id, auth.uid()))
    )
));

CREATE INDEX idx_kanban_columns_board ON public.kanban_columns(board_id, position);

-- Card positions
CREATE TABLE public.kanban_card_positions (
  board_id uuid NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, task_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_card_positions TO authenticated;
GRANT ALL ON public.kanban_card_positions TO service_role;

ALTER TABLE public.kanban_card_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access kanban_card_positions"
ON public.kanban_card_positions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Consultant block kanban_card_positions"
ON public.kanban_card_positions AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_consultant(auth.uid()))
WITH CHECK (NOT public.is_consultant(auth.uid()));

CREATE POLICY "Manage positions when board visible"
ON public.kanban_card_positions FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.kanban_boards b
  WHERE b.id = kanban_card_positions.board_id
    AND (
      (b.board_type IN ('personal','smart') AND b.owner_id = auth.uid())
      OR (b.board_type = 'project' AND b.group_id IS NOT NULL AND public.is_group_member(b.group_id, auth.uid()))
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.kanban_boards b
  WHERE b.id = kanban_card_positions.board_id
    AND (
      (b.board_type IN ('personal','smart') AND b.owner_id = auth.uid())
      OR (b.board_type = 'project' AND b.group_id IS NOT NULL AND public.is_group_member(b.group_id, auth.uid()))
    )
));

CREATE INDEX idx_kanban_card_positions_column ON public.kanban_card_positions(column_id, position);

-- Trigger: updated_at
CREATE TRIGGER update_kanban_boards_updated_at
BEFORE UPDATE ON public.kanban_boards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: auto-create default columns on board insert
CREATE OR REPLACE FUNCTION public.create_default_kanban_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kanban_columns (board_id, name, color, position, status_value) VALUES
    (NEW.id, 'Входящие',  '#94A3B8', 0, 'inbox'),
    (NEW.id, 'В работе',  '#3B82F6', 1, 'active'),
    (NEW.id, 'На проверке','#F59E0B', 2, 'review'),
    (NEW.id, 'Готово',    '#10B981', 3, 'done');
  RETURN NEW;
END;
$$;

CREATE TRIGGER kanban_boards_default_columns
AFTER INSERT ON public.kanban_boards
FOR EACH ROW EXECUTE FUNCTION public.create_default_kanban_columns();
