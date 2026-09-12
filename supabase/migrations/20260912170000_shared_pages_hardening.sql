-- Усиление приватных страниц: секрет вне репозитория, история версий,
-- защита от затирания при одновременном редактировании.
--
-- Что было не так в 20260912160000:
--
-- 1. Секрет лежал в git. Идентификатор страницы совпадал с путём
--    p/eKQP3Z6BFDi_2fj64LHFLQ/ и встречался в имени каталога, vite.config.ts и
--    самой миграции. Значит секретность ссылки равнялась доступу к репозиторию,
--    а он есть и у агента Lovable. Теперь в базе хранится только SHA-256 от
--    секрета: функции принимают сам секрет и хешируют его на сервере. Секрет
--    живёт во фрагменте URL (после #) — фрагмент не уходит на сервер ни в
--    запросе, ни в заголовке Referer, поэтому не оседает в логах nginx.
--
-- 2. Любой со ссылкой мог затереть страницу без возможности отката. История
--    версий не велась, восстановление было возможно только из ночного дампа.
--    Теперь каждая перезапись складывает предыдущую версию в
--    shared_pages_history, хранится последние 20.
--
-- 3. Двое, редактирующих одновременно, молча затирали правки друг друга:
--    документ заменялся целиком, выигрывала последняя запись. Страница прямо
--    рассчитана на совместную работу («отмечайте вместе с дочерью»), так что
--    это не теоретический случай. Теперь put принимает отметку времени, которую
--    клиент видел последней, и при расхождении возвращает конфликт вместо
--    записи — клиент подтягивает чужие правки, сливает со своими и повторяет.
--
-- Откат:
--   DROP FUNCTION public.shared_page_get(text), public.shared_page_put(text, jsonb, timestamptz);
--   DROP TABLE public.shared_pages_history;
--   (таблица shared_pages и её строки остаются, id — хеш)

-- ---------- история версий ----------
CREATE TABLE IF NOT EXISTS public.shared_pages_history (
  id          BIGSERIAL PRIMARY KEY,
  page_id     TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shared_pages_history_page
  ON public.shared_pages_history (page_id, archived_at DESC);

ALTER TABLE public.shared_pages_history ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.shared_pages_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.shared_pages_history_id_seq TO service_role;

-- ---------- перенос существующей страницы на хеш ----------
-- Данные, уже введённые в трекере, сохраняются: строка переезжает на новый id.
-- Хеш ниже — SHA-256 от секрета, который в репозиторий не попадает.
INSERT INTO public.shared_pages (id, data, updated_at)
SELECT 'd3e1b8543d4fdb9fe9ef4e3e5a2e975b06dc119e397103f3cb5eb59fc45b6883',
       COALESCE((SELECT data FROM public.shared_pages WHERE id = 'eKQP3Z6BFDi_2fj64LHFLQ'), '{}'::jsonb),
       now()
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.shared_pages WHERE id = 'eKQP3Z6BFDi_2fj64LHFLQ';

-- ---------- чтение ----------
-- Принимает СЕКРЕТ, а не идентификатор строки. sha256 и encode — встроенные
-- функции pg_catalog, расширение pgcrypto не требуется.
CREATE OR REPLACE FUNCTION public.shared_page_get(p_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT jsonb_build_object('data', data, 'updated_at', updated_at)
  FROM public.shared_pages
  WHERE id = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
$function$;

-- ---------- запись ----------
-- p_expected — отметка времени, которую клиент видел последней.
-- NULL означает «пишу вслепую» и допускается только для первой записи в
-- пустую страницу: иначе клиент, открывший вкладку сутки назад, затёр бы всё.
DROP FUNCTION IF EXISTS public.shared_page_put(text, jsonb);

CREATE OR REPLACE FUNCTION public.shared_page_put(
  p_key text,
  p_data jsonb,
  p_expected timestamptz DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_id  text := encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  v_cur public.shared_pages;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'shared_page_put: data must be a JSON object';
  END IF;
  IF pg_column_size(p_data) > 65536 THEN
    RAISE EXCEPTION 'shared_page_put: data exceeds 64 KiB';
  END IF;

  -- Блокируем строку: без этого двое одновременных писателей могли бы оба
  -- пройти проверку отметки времени и второй всё равно затёр бы первого.
  SELECT * INTO v_cur FROM public.shared_pages WHERE id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;   -- неизвестный секрет: создавать страницы клиент не может
  END IF;

  -- Слепая запись разрешена только в пустую страницу.
  IF p_expected IS NULL AND v_cur.data <> '{}'::jsonb THEN
    RETURN jsonb_build_object('conflict', true, 'data', v_cur.data, 'updated_at', v_cur.updated_at);
  END IF;
  IF p_expected IS NOT NULL AND v_cur.updated_at <> p_expected THEN
    RETURN jsonb_build_object('conflict', true, 'data', v_cur.data, 'updated_at', v_cur.updated_at);
  END IF;

  -- Предыдущая версия уходит в историю до перезаписи.
  INSERT INTO public.shared_pages_history (page_id, data, updated_at)
  VALUES (v_id, v_cur.data, v_cur.updated_at);

  DELETE FROM public.shared_pages_history
  WHERE page_id = v_id
    AND id NOT IN (
      SELECT id FROM public.shared_pages_history
      WHERE page_id = v_id ORDER BY archived_at DESC LIMIT 20
    );

  UPDATE public.shared_pages
     SET data = p_data, updated_at = now()
   WHERE id = v_id
  RETURNING * INTO v_cur;

  RETURN jsonb_build_object('data', v_cur.data, 'updated_at', v_cur.updated_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.shared_page_get(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shared_page_put(text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_page_get(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shared_page_put(text, jsonb, timestamptz) TO anon, authenticated, service_role;
