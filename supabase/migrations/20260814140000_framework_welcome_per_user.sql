-- Приветственное сообщение перед первой карточкой Strategy deck раньше
-- отправлялось только "самому первому получателю в истории вообще"
-- (history.length === 0 в send-weekly-framework). Это ломается для всех,
-- кто подключит Telegram ПОЗЖЕ первого запуска: они просто получат карточку
-- без объяснения, что это и откуда. Переводим на per-user отметку — тогда
-- каждый новый подписчик получит приветствие ровно один раз, при своей
-- первой карточке, независимо от того, когда он подключился.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS framework_welcome_sent_at timestamptz;

-- Бэкафилл: 38 получателей сегодняшней (2026-08-14) первой рассылки уже
-- видели приветствие в составе того же прогона — не слать им второй раз.
UPDATE public.profiles
SET framework_welcome_sent_at = fbl.sent_at
FROM public.framework_broadcast_log fbl
WHERE fbl.week_start = '2026-08-10'
  AND profiles.telegram_chat_id IS NOT NULL
  AND profiles.telegram_chat_id > 0
  AND profiles.framework_welcome_sent_at IS NULL;
