-- Состояние разговоров с ИИ-ассистентом в Telegram-боте (01.10.2026).
--
-- Бот получает каждое сообщение отдельным запросом, поэтому переписка и
-- действия, ждущие кнопки «Выполнить / Отмена», хранятся здесь. Доступ — только
-- у сервера (служебный ключ функции telegram-webhook): RLS включён, политик нет.
-- Старше 7 дней — удаляются ночной уборкой (housekeeping_auth_and_cron).

CREATE TABLE IF NOT EXISTS public.assistant_tg_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id        bigint NOT NULL,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  history        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- текст реплик для продолжения разговора
  agent_messages jsonb,                                -- переписка с вызовами, пока ждёт решения
  pending        jsonb,                                -- действия на подтверждение
  card_message_id bigint,                              -- сообщение с кнопками
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_tg_sessions_chat_idx
  ON public.assistant_tg_sessions (chat_id, updated_at DESC);

ALTER TABLE public.assistant_tg_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_tg_sessions FROM anon, authenticated;

-- Уборка: разговоры старше недели.
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

  DELETE FROM public.assistant_tg_sessions
   WHERE updated_at < now() - interval '7 days';

  RETURN QUERY SELECT rt, at, ao, cr;
END;
$$;
