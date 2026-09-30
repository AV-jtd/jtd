-- Ассистент в боте без /ai (01.10.2026): продолжение ответом и кнопка
-- «Создать задачей».
--   bot_message_ids — сообщения бота в этом разговоре: ответ (reply) на любое
--                     из них продолжает разговор;
--   origin          — исходное сообщение, которое бот сам отправил ассистенту
--                     (похоже на вопрос): по кнопке «Создать задачей» оно
--                     проходит обычный путь создания задачи.
ALTER TABLE public.assistant_tg_sessions
  ADD COLUMN IF NOT EXISTS bot_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS origin jsonb;

CREATE INDEX IF NOT EXISTS assistant_tg_sessions_bot_msgs_idx
  ON public.assistant_tg_sessions USING gin (bot_message_ids);
