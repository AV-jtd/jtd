CREATE TABLE IF NOT EXISTS public.weekly_send_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL,
  chat_id BIGINT NOT NULL,
  recipient_id UUID,
  week_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT weekly_send_log_unique UNIQUE (report_type, chat_id, week_start)
);

GRANT ALL ON public.weekly_send_log TO service_role;
ALTER TABLE public.weekly_send_log ENABLE ROW LEVEL SECURITY;

-- Remove stale one-shot test cron jobs that fired during migration testing
SELECT cron.unschedule('one-shot-weekly-ai-review-0909');
SELECT cron.unschedule('one-shot-weekly-report-0909');