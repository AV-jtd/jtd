-- Ежедневная уборка служебных таблиц: auth.refresh_tokens,
-- auth.audit_log_entries, cron.job_run_details (журнал, 30.09.2026).
--
-- На 30.09 они занимали 946 МБ из 1064 МБ базы, дамп вырос с 13 до 95 МБ.
-- 1,6 млн записей журнала и 830 тыс. отозванных токенов — одно утро 11.09:
-- часы сервера ушли на 4,5 часа, клиенты сочли токены просроченными и
-- обновляли их без остановки. Причину тогда же устранили (check-ntp.sh), но
-- GoTrue сам эти таблицы не чистит: встроенная уборка токенов у него
-- выключена по умолчанию (GOTRUE_DB_CLEANUP_ENABLED), журнал аудита он не
-- чистит вовсе. История pg_cron растёт на 1440 строк в сутки из-за
-- protocol-buffer-flush, который идёт каждую минуту.
--
-- Правила:
--   refresh_tokens    — отозванные старше суток. Ровно то же правило, что во
--                       встроенной уборке GoTrue (internal/models/cleanup.go);
--                       живые токены и сессии не трогаются.
--   audit_log_entries — token_refreshed / token_revoked старше 14 дней (шум,
--                       по 2 записи на каждое обновление сессии); прочие
--                       события — входы, выходы, смены пароля, регистрации —
--                       хранятся год.
--   job_run_details   — старше 7 дней.
--
-- Приложение журнал аудита не читает (проверено поиском по src и функциям).

CREATE OR REPLACE FUNCTION public.housekeeping_auth_and_cron()
RETURNS TABLE (refresh_tokens integer, audit_token_events integer, audit_other integer, cron_runs integer)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  rt integer; at integer; ao integer; cr integer;
BEGIN
  DELETE FROM auth.refresh_tokens
   WHERE revoked IS TRUE AND updated_at < now() - interval '1 day';
  GET DIAGNOSTICS rt = ROW_COUNT;

  DELETE FROM auth.audit_log_entries
   WHERE created_at < now() - interval '14 days'
     AND payload->>'action' IN ('token_refreshed', 'token_revoked');
  GET DIAGNOSTICS at = ROW_COUNT;

  DELETE FROM auth.audit_log_entries
   WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS ao = ROW_COUNT;

  DELETE FROM cron.job_run_details
   WHERE end_time < now() - interval '7 days';
  GET DIAGNOSTICS cr = ROW_COUNT;

  RETURN QUERY SELECT rt, at, ao, cr;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.housekeeping_auth_and_cron() FROM public, anon, authenticated;

-- Каждый день в 23:30 UTC (02:30 МСК) — до ночных копий (00:00 и 02:00 UTC),
-- чтобы в них не попадал мусор. Повторное применение миграции задание не
-- дублирует: cron.schedule с тем же именем его обновляет.
SELECT cron.schedule(
  'housekeeping-auth-and-cron',
  '30 23 * * *',
  $$SELECT public.housekeeping_auth_and_cron()$$
);
