
-- Add original_deadline to track the first planned deadline
ALTER TABLE public.tasks ADD COLUMN original_deadline timestamp with time zone DEFAULT NULL;

-- Backfill: set original_deadline = deadline for existing tasks that have a deadline
UPDATE public.tasks SET original_deadline = deadline WHERE deadline IS NOT NULL;

-- Trigger: auto-set original_deadline on first deadline assignment
CREATE OR REPLACE FUNCTION public.set_original_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- If original_deadline is null and a deadline is being set, capture it
  IF OLD.original_deadline IS NULL AND NEW.deadline IS NOT NULL THEN
    NEW.original_deadline = NEW.deadline;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_set_original_deadline
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_original_deadline();
