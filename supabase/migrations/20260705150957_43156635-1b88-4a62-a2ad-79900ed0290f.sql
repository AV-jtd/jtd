CREATE TABLE public.stm_structure_nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flow text NOT NULL CHECK (flow IN ('in','out')),
  field text NOT NULL CHECK (field IN ('retailer','brand','drop','project')),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX stm_structure_nodes_unique
  ON public.stm_structure_nodes (flow, field, lower(value));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stm_structure_nodes TO authenticated;
GRANT ALL ON public.stm_structure_nodes TO service_role;

ALTER TABLE public.stm_structure_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view stm structure nodes"
  ON public.stm_structure_nodes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create stm structure nodes"
  ON public.stm_structure_nodes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated can update stm structure nodes"
  ON public.stm_structure_nodes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete stm structure nodes"
  ON public.stm_structure_nodes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_stm_structure_nodes_updated_at
  BEFORE UPDATE ON public.stm_structure_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();