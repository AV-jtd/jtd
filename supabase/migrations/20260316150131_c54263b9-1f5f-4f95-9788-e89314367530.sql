
-- Add SUPABASE_URL and SUPABASE_ANON_KEY to vault so the trigger can access them
SELECT vault.create_secret(
  'https://nvfioycpwyzwukvokwql.supabase.co',
  'SUPABASE_URL'
);

SELECT vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZmlveWNwd3l6d3Vrdm9rd3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNzQzNzAsImV4cCI6MjA4NjY1MDM3MH0.sb2B0YezHqW8xsca32FS8kQ_FlT6Vgjyv_Igb4WkBqE',
  'SUPABASE_ANON_KEY'
);
