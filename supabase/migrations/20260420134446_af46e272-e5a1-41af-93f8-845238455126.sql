-- Буфер сырых сообщений для /protocol режима в Telegram
ALTER TABLE public.telegram_pending_context
  ADD COLUMN IF NOT EXISTS raw_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

-- Индекс для крон-задачи авто-завершения
CREATE INDEX IF NOT EXISTS idx_telegram_pending_context_awaiting_buffer
  ON public.telegram_pending_context (last_message_at)
  WHERE awaiting_axis = '__buffer__';