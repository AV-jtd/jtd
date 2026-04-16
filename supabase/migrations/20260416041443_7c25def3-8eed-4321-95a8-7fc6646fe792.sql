
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove old daily cron if exists
SELECT cron.unschedule('send-weekly-report-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-report-daily');

SELECT cron.unschedule('send-weekly-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-report');

-- Schedule weekly review: Friday 08:08 Moscow (05:08 UTC)
SELECT cron.schedule(
  'send-weekly-review-friday',
  '8 5 * * 5',
  $$
  SELECT net.http_post(
    url := 'https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/send-weekly-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZmlveWNwd3l6d3Vrdm9rd3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNzQzNzAsImV4cCI6MjA4NjY1MDM3MH0.sb2B0YezHqW8xsca32FS8kQ_FlT6Vgjyv_Igb4WkBqE"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
