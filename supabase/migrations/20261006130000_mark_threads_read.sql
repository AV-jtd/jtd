-- Групповая отметка «прочитано» (просьба владельца 06.10.2026): «Прочитать
-- обсуждения проектов», «Прочитать всё» и быстрое «прочитано» без захода в чат.
-- То же, что mark_thread_read, но для списка веток одним вызовом: время —
-- серверное (часы клиента могут отставать), отметка не откатывается назад.

CREATE OR REPLACE FUNCTION public.mark_threads_read(_thread_ids text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now timestamptz := now();
  _n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _thread_ids IS NULL OR cardinality(_thread_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(_thread_ids) > 5000 THEN
    RAISE EXCEPTION 'too many threads';
  END IF;
  INSERT INTO public.chat_read_status (user_id, thread_id, last_read_at)
  SELECT auth.uid(), t, _now
  FROM (SELECT DISTINCT unnest(_thread_ids) AS t) x
  WHERE t ~ '^(group|task)-[0-9a-f-]{36}$'
  ON CONFLICT (user_id, thread_id)
  DO UPDATE SET last_read_at = GREATEST(public.chat_read_status.last_read_at, EXCLUDED.last_read_at);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_threads_read(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_threads_read(text[]) TO authenticated, service_role;
