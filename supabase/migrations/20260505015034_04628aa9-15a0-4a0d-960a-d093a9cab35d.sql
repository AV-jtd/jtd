CREATE OR REPLACE FUNCTION public.mark_thread_read(_thread_id text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.chat_read_status (user_id, thread_id, last_read_at)
  VALUES (auth.uid(), _thread_id, _now)
  ON CONFLICT (user_id, thread_id)
  DO UPDATE SET last_read_at = GREATEST(public.chat_read_status.last_read_at, EXCLUDED.last_read_at);
  RETURN _now;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_thread_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(text) TO authenticated;