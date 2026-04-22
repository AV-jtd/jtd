ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_contractor_id ON public.profiles(contractor_id);
CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON public.profiles(client_id);