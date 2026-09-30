-- Все сводные числа дашборда одним серверным запросом, с фильтрами дашборда.
--
-- До 30.09.2026 пять чисел брались у get_group_task_stats, а остальные
-- считались длиной загруженного массива, который обрывается на 2000 задач
-- (незакрытые первыми). Замер 30.09 под правами владельца: «выполнено за
-- неделю» 22 вместо 45, неделей раньше 7 вместо 13, дрифт 386 вместо 465.
-- При фильтрах по людям и тегам сервер не участвовал вовсе.
--
-- Отдельная функция, а не расширение get_group_task_stats: у той другой тип
-- возврата, его смена требует DROP FUNCTION, а её зовёт PMO.
--
-- Выборка — как у get_group_task_stats: задачи этих проектов без черновиков и
-- без stm_stage. Фильтры повторяют buildProjectStats в DashboardView.tsx:
--   люди      — исполнитель ИЛИ постановщик из списка;
--   теги      — хотя бы один тег из списка;
--   участники — хотя бы один участник из списка.
-- Дрифт — по правилу src/lib/drift.ts (hasDrift): от суток, годы 2000–2100,
-- не больше 3650 дней. Так число на карточке совпадает со списком дрифта,
-- который открывается по клику. PMO считает любое расхождение, даже в часы:
-- на 30.09 разница — 10 задач из 573.
--
-- SECURITY INVOKER (по умолчанию): считает только то, что пользователь видит.

CREATE OR REPLACE FUNCTION public.get_dashboard_counters(
  _group_ids       uuid[],
  _assignee_ids    uuid[] DEFAULT NULL,
  _tag_ids         uuid[] DEFAULT NULL,
  _participant_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  total               integer,
  completed           integer,
  overdue             integer,
  drift               integer,
  upcoming_7d         integer,
  completed_7d        integer,
  completed_prev_7d   integer,
  overdue_week_ago    integer,
  drift_week_ago      integer,
  unassigned          integer,
  no_deadline         integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT t.*,
      (t.original_deadline IS NOT NULL AND t.deadline IS NOT NULL
        AND extract(year FROM t.original_deadline) BETWEEN 2000 AND 2100
        AND extract(year FROM t.deadline) BETWEEN 2000 AND 2100
        AND abs(extract(epoch FROM (t.deadline - t.original_deadline))) >= 86400
        AND abs(extract(epoch FROM (t.deadline - t.original_deadline))) / 86400 <= 3650
      ) AS drifted
    FROM tasks t
    WHERE t.group_id = ANY(_group_ids)
      AND COALESCE(t.is_draft, false) = false
      AND t.task_type IS DISTINCT FROM 'stm_stage'
      AND (_assignee_ids IS NULL OR cardinality(_assignee_ids) = 0
           OR t.assigned_to = ANY(_assignee_ids) OR t.user_id = ANY(_assignee_ids))
      AND (_tag_ids IS NULL OR cardinality(_tag_ids) = 0
           OR EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ANY(_tag_ids)))
      AND (_participant_ids IS NULL OR cardinality(_participant_ids) = 0
           OR EXISTS (SELECT 1 FROM task_participants tp WHERE tp.task_id = t.id AND tp.user_id = ANY(_participant_ids)))
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE is_completed)::integer,
    count(*) FILTER (WHERE NOT is_completed AND deadline < now())::integer,
    count(*) FILTER (WHERE drifted)::integer,
    count(*) FILTER (WHERE NOT is_completed AND deadline >= now() AND deadline <= now() + interval '7 days')::integer,
    count(*) FILTER (WHERE is_completed AND completed_at >= now() - interval '7 days')::integer,
    count(*) FILTER (WHERE is_completed AND completed_at >= now() - interval '14 days'
                                        AND completed_at <  now() - interval '7 days')::integer,
    -- Как на клиенте: незакрытые, чей срок прошёл уже неделю назад.
    count(*) FILTER (WHERE NOT is_completed AND deadline < now() - interval '7 days')::integer,
    -- Как на клиенте (приближение): со сдвигом и созданные раньше недели назад.
    count(*) FILTER (WHERE drifted AND created_at < now() - interval '7 days')::integer,
    count(*) FILTER (WHERE NOT is_completed AND assigned_to IS NULL)::integer,
    count(*) FILTER (WHERE NOT is_completed AND deadline IS NULL)::integer
  FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_counters(uuid[], uuid[], uuid[], uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_counters(uuid[], uuid[], uuid[], uuid[]) FROM anon, public;
