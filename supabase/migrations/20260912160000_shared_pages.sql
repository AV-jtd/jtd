-- Общие страницы по приватной ссылке, без регистрации.
--
-- Сценарий: статическая страница (например, трекер поступления в p/<token>/)
-- хранит своё состояние на сервере, чтобы его видели все, у кого есть ссылка.
-- Секрет — сам идентификатор страницы в URL, как у dashboard_reports.token.
--
-- Почему не таблица с anon-политикой: политика USING (true) позволила бы
-- anon-клиенту перечислить все строки (та самая дыра, закрытая в миграции
-- 20260612212619). Поэтому таблица закрыта RLS без политик, а доступ идёт
-- только через две SECURITY DEFINER функции с явным id — перечислить
-- страницы через них нельзя.
--
-- Создавать страницы anon-клиент не может (put обновляет только существующую
-- строку): новые страницы заводятся миграцией или из-под service_role.
-- Иначе любой с anon-ключом мог бы забивать таблицу мусором.
--
-- Откат: DROP FUNCTION public.shared_page_get(text), public.shared_page_put(text, jsonb);
--        DROP TABLE public.shared_pages;

CREATE TABLE IF NOT EXISTS public.shared_pages (
  id         TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{16,64}$'),
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_pages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.shared_pages TO service_role;

CREATE OR REPLACE FUNCTION public.shared_page_get(p_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT jsonb_build_object('data', data, 'updated_at', updated_at)
  FROM public.shared_pages
  WHERE id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.shared_page_put(p_id text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  r public.shared_pages;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'shared_page_put: data must be a JSON object';
  END IF;
  IF pg_column_size(p_data) > 65536 THEN
    RAISE EXCEPTION 'shared_page_put: data exceeds 64 KiB';
  END IF;

  UPDATE public.shared_pages
     SET data = p_data, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO r;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('data', r.data, 'updated_at', r.updated_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.shared_page_get(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shared_page_put(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_page_get(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shared_page_put(text, jsonb) TO anon, authenticated, service_role;

-- Страница трекера поступления: p/eKQP3Z6BFDi_2fj64LHFLQ/
INSERT INTO public.shared_pages (id, data)
VALUES ('eKQP3Z6BFDi_2fj64LHFLQ', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
