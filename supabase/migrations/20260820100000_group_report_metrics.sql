-- Снимок недельных метрик проекта — чтобы отчёт в групповой чат показывал
-- динамику, а не только состояние на утро пятницы. «Просрочено 7» без
-- «неделю назад было 4» не говорит, стало лучше или хуже.
--
-- Пишется после успешной отправки отчёта. При следующей отправке берётся
-- самая свежая строка с week_start строго меньше текущей недели — так дельта
-- корректна даже если неделю пропустили (кроны стояли, проект был закрыт).
--
-- Доступ только у service_role: таблица служебная, из клиента не читается.
-- RLS включён без политик — этого достаточно, service_role её обходит.

CREATE TABLE IF NOT EXISTS public.group_report_metrics (
  group_id   UUID NOT NULL,
  week_start DATE NOT NULL,
  metrics    JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT group_report_metrics_pkey PRIMARY KEY (group_id, week_start)
);

-- Выборка предыдущего снимка идёт по (group_id, week_start DESC) —
-- первичный ключ её и обслуживает, отдельный индекс не нужен.

GRANT ALL ON public.group_report_metrics TO service_role;
ALTER TABLE public.group_report_metrics ENABLE ROW LEVEL SECURITY;
