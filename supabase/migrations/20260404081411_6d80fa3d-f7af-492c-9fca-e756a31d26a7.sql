
CREATE TABLE public.dashboard_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  title text NOT NULL DEFAULT 'Отчёт по портфелю',
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE(token)
);

ALTER TABLE public.dashboard_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reports"
  ON public.dashboard_reports
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public read by token"
  ON public.dashboard_reports
  FOR SELECT
  TO anon
  USING (expires_at > now());
