-- Обновление cron-заданий после миграции на self-hosted Supabase
-- Запускать на НОВОЙ базе после первого деплоя
-- Замени https://justtodoit.ru на актуальный URL сервера

-- Удаляем старые задания (они ещё указывают на nvfioycpwyzwukvokwql.supabase.co)
SELECT cron.unschedule('protocol-buffer-flush')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'protocol-buffer-flush');

SELECT cron.unschedule('send-weekly-group-report-friday')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-group-report-friday');

-- Создаём новые — теперь вызывают self-hosted edge-runtime
-- Замени ANON_KEY на актуальный ключ из .env.supabase

SELECT cron.schedule(
  'protocol-buffer-flush',
  '* * * * *',
  $$
  SELECT net.http_post(
    url      := 'https://justtodoit.ru/functions/v1/protocol-buffer-flush',
    headers  := '{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY"}'::jsonb,
    body     := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'send-weekly-group-report-friday',
  '8 5 * * 5',
  $$
  SELECT net.http_post(
    url      := 'https://justtodoit.ru/functions/v1/send-weekly-group-report',
    headers  := '{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY"}'::jsonb,
    body     := '{}'::jsonb
  );
  $$
);
