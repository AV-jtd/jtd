-- Обновление cron-заданий после миграции на self-hosted Supabase.
-- Уже ПРИМЕНЕНО на проде через cron.alter_job() 2026-07-06 (см. PROGRESS.md,
-- инцидент "Telegram-задачи попадали в облако Lovable"). Этот файл оставлен
-- для истории/повторного применения на новой БД (например, при аварийном
-- восстановлении с нуля).
--
-- Используем ВНУТРЕННИЙ адрес Kong (http://kong:8000), а не публичный домен:
-- вызов идёт из контейнера db в той же docker-сети, не нужен ни DNS, ни
-- внешний nginx, ни SSL — быстрее и не зависит от внешней доступности сайта.
--
-- Kong проверяет apikey ИМЕННО в заголовке/параметре "apikey" (плагин
-- key-auth), просто "Authorization: Bearer ..." без apikey не пройдёт
-- (проверено эмпирически — даёт "No API key found in request").
--
-- Перед применением подставь актуальный ANON_KEY из .env.supabase.

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'protocol-buffer-flush'),
  command := $$
  SELECT net.http_post(
    url     := 'http://kong:8000/functions/v1/protocol-buffer-flush',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY","apikey":"ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'send-weekly-group-report-friday'),
  command := $$
  SELECT net.http_post(
    url     := 'http://kong:8000/functions/v1/send-weekly-group-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY","apikey":"ANON_KEY"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
