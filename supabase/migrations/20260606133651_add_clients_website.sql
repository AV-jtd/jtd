-- Add an optional website / link field to clients for the CRM client card.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS website text;
