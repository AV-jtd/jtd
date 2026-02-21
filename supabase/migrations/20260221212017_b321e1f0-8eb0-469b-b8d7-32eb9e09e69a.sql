
-- Fix: remove overly permissive policy, replace with restrictive one
-- Edge functions use service_role which bypasses RLS anyway
DROP POLICY IF EXISTS "Service role manages 2fa codes" ON public.telegram_2fa_codes;

-- No public access - only service role (which bypasses RLS)
CREATE POLICY "No public access to 2fa codes"
  ON public.telegram_2fa_codes
  FOR ALL
  USING (false)
  WITH CHECK (false);
