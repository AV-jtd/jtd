CREATE TABLE public.messenger_list_context (
  channel text NOT NULL,
  external_id text NOT NULL,
  user_id uuid NOT NULL,
  task_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, external_id)
);

GRANT ALL ON public.messenger_list_context TO service_role;

ALTER TABLE public.messenger_list_context ENABLE ROW LEVEL SECURITY;