-- Журнал обращений к MCP-коннектору (этап 4в, JOURNAL.md 27.09.2026).
--
-- Каждый вызов инструмента пишется одной строкой: кто, через какой OAuth-клиент,
-- какой инструмент, с какими аргументами, чем кончилось. Пишет сама функция MCP
-- токеном пользователя, поэтому строка всегда своя (user_id = auth.uid()).
--
-- Журнал только дописывается: политик на UPDATE и DELETE нет. Видит его сам
-- пользователь и администраторы. Строки удаляются вместе с пользователем.
--
-- Срок хранения не ограничен: пока коннектор только у владельца, записей мало.
-- При расширении на команду — пересмотреть (BACKLOG, P2, «Условие пересмотра»).

CREATE TABLE IF NOT EXISTS public.mcp_audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   text,
  tool        text NOT NULL,
  args        jsonb,
  outcome     text NOT NULL CHECK (outcome IN ('ok', 'error')),
  error       text,
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS mcp_audit_log_user_created_idx
  ON public.mcp_audit_log (user_id, created_at DESC);

ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcp_audit_log_insert_own ON public.mcp_audit_log;
CREATE POLICY mcp_audit_log_insert_own ON public.mcp_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mcp_audit_log_select_own_or_admin ON public.mcp_audit_log;
CREATE POLICY mcp_audit_log_select_own_or_admin ON public.mcp_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Права по умолчанию выдают anon и authenticated всё; журнал должен быть
-- только дописываемым даже при ошибке в политиках — отзываем явно.
REVOKE ALL ON public.mcp_audit_log FROM anon, authenticated;
GRANT SELECT, INSERT ON public.mcp_audit_log TO authenticated;
