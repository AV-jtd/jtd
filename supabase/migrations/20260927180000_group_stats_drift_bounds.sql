-- Дрифт в серверном агрегате: не считать сдвигом испорченную базовую дату.
--
-- В портфеле PMO проект показывал дрифт около двух тысяч лет. Клиентский
-- расчёт починен (src/lib/drift.ts), но счётчики в карточках портфеля и на
-- досках НИОКР приходят отсюда, из get_group_task_stats, где проверка была
-- только на непустоту: дата с годом 0002 непустая, условие проходит.
--
-- Правило теперь совпадает с клиентским:
--   * обе даты в пределах 2000-2100 годов;
--   * модуль сдвига не больше 3650 дней (десять лет).
-- Всё сверх этого — ошибка данных, а не очень сильный сдвиг. Таких задач в
-- базе три, у всех год 0002 вместо 2026 (отчёт от 27.09 в журнале).
--
-- ---------------------------------------------------------------------------
-- ПОЧЕМУ ЭТА МИГРАЦИЯ ПЕРЕПИСАНА 27.09
--
-- Первая версия не применялась ни разу и применить её было нельзя: она
-- объявляла RETURNS TABLE без полей earliest_start и max_drift_days, а
-- CREATE OR REPLACE не умеет менять тип возврата — psql отвечал
-- "cannot change return type of existing function". deploy.sh на такой
-- ошибке пишет предупреждение и идёт дальше, поэтому сбой был незаметен.
--
-- Хуже другое: если бы она применилась (через DROP), то убрала бы из ответа
-- earliest_start и max_drift_days. Их читает PortfolioView.tsx через
-- "?? null" и "?? 0" — то есть портфель не упал бы, а молча показывал пустую
-- дату старта и нулевой максимальный сдвиг.
--
-- Поэтому здесь все десять полей сохранены. Тип возврата не меняется, DROP не
-- нужен, CREATE OR REPLACE проходит.
--
-- И границы добавлены в ДВА места, а не в одно: кроме счётчика drift их
-- требует max_drift_days — в первой версии этого подзапроса не было вовсе, и
-- он продолжал бы показывать годы.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_group_task_stats(_group_ids uuid[])
 RETURNS TABLE(group_id uuid, total integer, completed integer, active integer, overdue integer, drift integer, upcoming_7d integer, last_completed_at timestamp with time zone, earliest_start timestamp with time zone, max_drift_days integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ids AS (
    SELECT unnest(_group_ids) AS gid
  ),
  base AS (
    SELECT
      ids.gid AS group_id,
      t.id,
      t.is_completed,
      t.deadline,
      t.original_deadline,
      t.completed_at,
      t.start_at
    FROM ids
    LEFT JOIN tasks t
      ON t.group_id = ids.gid
     AND COALESCE(t.is_draft, false) = false
     AND t.task_type <> 'stm_stage'
  )
  SELECT
    b.group_id,
    COALESCE(COUNT(b.id), 0)::integer AS total,
    COALESCE(COUNT(*) FILTER (WHERE b.is_completed), 0)::integer AS completed,
    COALESCE(COUNT(*) FILTER (WHERE NOT b.is_completed), 0)::integer AS active,
    COALESCE(COUNT(*) FILTER (
      WHERE NOT b.is_completed
        AND b.deadline IS NOT NULL
        AND b.deadline < now()
    ), 0)::integer AS overdue,
    COALESCE(COUNT(*) FILTER (
      WHERE b.original_deadline IS NOT NULL
        AND b.deadline IS NOT NULL
        AND b.original_deadline <> b.deadline
        -- Границы: испорченная базовая дата не есть сдвиг. Совпадает с
        -- клиентским правилом в src/lib/drift.ts, иначе счётчик и список
        -- расходятся.
        AND extract(year FROM b.original_deadline) BETWEEN 2000 AND 2100
        AND extract(year FROM b.deadline) BETWEEN 2000 AND 2100
        AND abs(extract(epoch FROM (b.deadline - b.original_deadline)) / 86400) <= 3650
    ), 0)::integer AS drift,
    COALESCE(COUNT(*) FILTER (
      WHERE NOT b.is_completed
        AND b.deadline IS NOT NULL
        AND b.deadline >= now()
        AND b.deadline <= (now() + interval '7 days')
    ), 0)::integer AS upcoming_7d,
    MAX(b.completed_at) FILTER (WHERE b.is_completed) AS last_completed_at,
    LEAST(MIN(b.start_at), MIN(b.deadline)) AS earliest_start,
    COALESCE(
      (
        SELECT (EXTRACT(EPOCH FROM (b2.deadline - b2.original_deadline)) / 86400)::integer
        FROM base b2
        WHERE b2.group_id = b.group_id
          AND b2.original_deadline IS NOT NULL
          AND b2.deadline IS NOT NULL
          AND b2.original_deadline <> b2.deadline
          -- Те же границы. В версии из первой правки этого места не было
          -- вовсе, поэтому max_drift_days продолжал бы показывать годы.
          AND extract(year FROM b2.original_deadline) BETWEEN 2000 AND 2100
          AND extract(year FROM b2.deadline) BETWEEN 2000 AND 2100
          AND abs(extract(epoch FROM (b2.deadline - b2.original_deadline)) / 86400) <= 3650
        ORDER BY ABS(EXTRACT(EPOCH FROM (b2.deadline - b2.original_deadline))) DESC
        LIMIT 1
      ),
      0
    )::integer AS max_drift_days
  FROM base b
  GROUP BY b.group_id;
$function$
;
