
-- Auto-set user_id from auth.uid() to avoid client/JWT mismatch causing RLS violations
CREATE OR REPLACE FUNCTION public.decisions_set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- Always force author to authenticated user (prevents spoofing)
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decisions_set_user_id ON public.decisions;
CREATE TRIGGER trg_decisions_set_user_id
BEFORE INSERT ON public.decisions
FOR EACH ROW EXECUTE FUNCTION public.decisions_set_user_id();

-- Relax INSERT policy: trigger guarantees user_id = auth.uid()
DROP POLICY IF EXISTS "Authenticated insert own decision" ON public.decisions;
CREATE POLICY "Authenticated insert own decision"
ON public.decisions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
