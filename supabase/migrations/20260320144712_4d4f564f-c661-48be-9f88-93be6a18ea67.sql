-- Create a trigger function that prevents non-admin users from changing is_approved
CREATE OR REPLACE FUNCTION public.protect_is_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If is_approved is being changed and user is not admin, revert the change
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    IF NOT has_role(auth.uid(), 'admin') THEN
      NEW.is_approved := OLD.is_approved;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS protect_is_approved_trigger ON public.profiles;
CREATE TRIGGER protect_is_approved_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_is_approved();