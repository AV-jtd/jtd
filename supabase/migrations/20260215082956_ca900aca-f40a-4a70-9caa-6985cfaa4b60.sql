
-- Fix the security definer view issue by setting it to SECURITY INVOKER
ALTER VIEW public.vapid_public_keys SET (security_invoker = on);
