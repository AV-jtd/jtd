ALTER TABLE public.telegram_pending_context
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS protocol_name text,
  ADD COLUMN IF NOT EXISTS awaiting_axis text,
  ADD COLUMN IF NOT EXISTS collected_axes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parsed_payload jsonb;