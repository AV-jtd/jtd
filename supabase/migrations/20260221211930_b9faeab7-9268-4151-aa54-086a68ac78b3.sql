
-- Add unique username to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (username) WHERE username IS NOT NULL;

-- Table for temporary 2FA codes
CREATE TABLE public.telegram_2fa_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  telegram_username text NOT NULL,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '5 minutes'),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Allow public insert/select (no auth needed - pre-registration)
ALTER TABLE public.telegram_2fa_codes ENABLE ROW LEVEL SECURITY;

-- Service role only - edge functions use service role key
CREATE POLICY "Service role manages 2fa codes"
  ON public.telegram_2fa_codes
  FOR ALL
  USING (true)
  WITH CHECK (true);
