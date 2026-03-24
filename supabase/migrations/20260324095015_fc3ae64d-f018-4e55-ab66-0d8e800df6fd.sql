
CREATE TABLE public.npd_card_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gate_key text NOT NULL,
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, gate_key, group_id)
);

ALTER TABLE public.npd_card_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own card positions"
  ON public.npd_card_positions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
