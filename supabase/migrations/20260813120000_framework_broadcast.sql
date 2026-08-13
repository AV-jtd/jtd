-- Пятничная рассылка «Strategy deck»: журнал отправленных фреймворков.
--
-- Логика выбора: случайный порядок, но БЕЗ повторов внутри цикла. Когда все 50
-- разосланы — цикл закрывается и колода начинается заново. Так за 50 недель
-- команда проходит весь набор, а порядок каждый раз новый.
--
-- Всем пользователям на неделе уходит ОДИН И ТОТ ЖЕ фреймворк — чтобы у команды
-- был общий контекст для обсуждения. Отсюда журнал глобальный, а не по юзерам.

CREATE TABLE IF NOT EXISTS public.framework_broadcast_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  framework_id text NOT NULL,
  cycle int NOT NULL DEFAULT 1,
  week_start date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipients int NOT NULL DEFAULT 0,
  -- один фреймворк не может уйти дважды в рамках одного цикла
  CONSTRAINT framework_broadcast_unique_in_cycle UNIQUE (cycle, framework_id),
  -- и не больше одной рассылки за неделю (страховка от повторного запуска крона)
  CONSTRAINT framework_broadcast_unique_week UNIQUE (week_start)
);

CREATE INDEX IF NOT EXISTS idx_framework_broadcast_cycle
  ON public.framework_broadcast_log (cycle, framework_id);

ALTER TABLE public.framework_broadcast_log ENABLE ROW LEVEL SECURITY;

-- Пишет только service_role (edge-функция). Читать может любой залогиненный —
-- пригодится, если позже покажем в UI историю рассылок.
CREATE POLICY "Authenticated can read framework broadcast log"
  ON public.framework_broadcast_log
  FOR SELECT TO authenticated
  USING (true);

GRANT ALL ON public.framework_broadcast_log TO service_role;

-- Отдельный флаг подписки. DEFAULT true — по образцу telegram_weekly_ai_review:
-- рассылка полезная и редкая (раз в неделю), но выключается одним тумблером
-- в Настройках → Telegram.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS telegram_weekly_framework boolean NOT NULL DEFAULT true;
