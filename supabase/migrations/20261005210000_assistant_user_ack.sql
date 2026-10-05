-- Пользователь-ассистент «Клавдий» (решение владельца 05.10.2026).
--
-- Люди ставят задачи на Клавдия, как на коллегу; разбирает их сессия Claude:
-- уточнения — в чате задачи, доработки — в бэклог с согласованием у владельца.
-- Сессия работает не постоянно, поэтому при назначении задачи Клавдий сразу
-- отвечает в её чате, что принял: человек не ждёт в тишине.
--
-- Кто ассистент — в system_users (key = 'assistant'), а не константой: на
-- чистой базе, восстановленной без этого пользователя, триггер просто молчит.

CREATE TABLE IF NOT EXISTS public.system_users (
  key     text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_users FROM anon, authenticated;

INSERT INTO public.system_users (key, user_id)
SELECT 'assistant', id FROM auth.users WHERE email = 'klavdiy@justtodoit.ru'
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.assistant_ack_on_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v uuid;
BEGIN
  SELECT user_id INTO v FROM public.system_users WHERE key = 'assistant';
  IF v IS NULL OR NEW.assigned_to IS DISTINCT FROM v THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN RETURN NEW; END IF;
  -- Задачи, которые ассистент ставит сам себе, и закрытые — без автоответа.
  IF NEW.user_id = v OR NEW.is_completed THEN RETURN NEW; END IF;

  INSERT INTO public.task_comments (task_id, user_id, content, meta)
  VALUES (
    NEW.id, v,
    '🤖 Принял задачу. Посмотрю и вернусь с ответом в течение рабочего дня. Если что-то будет непонятно — спрошу здесь, в чате задачи.',
    jsonb_build_object('via', 'claude', 'auto', true)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assistant_ack_on_assign ON public.tasks;
CREATE TRIGGER trg_assistant_ack_on_assign
  AFTER INSERT OR UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.assistant_ack_on_assign();
