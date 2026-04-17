SELECT cron.schedule(
  'send-weekly-group-report-friday',
  '8 5 * * 5',
  $$
  select net.http_post(
    url:='https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/send-weekly-group-report',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZmlveWNwd3l6d3Vrdm9rd3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNzQzNzAsImV4cCI6MjA4NjY1MDM3MH0.sb2B0YezHqW8xsca32FS8kQ_FlT6Vgjyv_Igb4WkBqE"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);