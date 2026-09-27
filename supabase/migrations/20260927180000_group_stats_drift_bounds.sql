-- Дрифт в серверном агрегате: не считать сдвигом испорченную базовую дату.
--
-- В портфеле PMO проект показывал дрифт +739 251 день — около двух тысяч лет.
-- Клиентский расчёт починен (src/lib/drift.ts), но счётчик `drift` в карточках
-- портфеля и на досках НИОКР приходит ОТСЮДА, из get_group_task_stats, и здесь
-- было ровно то же условие:
--
--     original_deadline IS NOT NULL AND deadline IS NOT NULL
--       AND original_deadline <> deadline
--
-- Проверка только на непустоту. Дата с годом 0001 — непустая, условие проходит,
-- задача попадает в счётчик дрифта.
--
-- Правило теперь совпадает с клиентским, чтобы счётчик и список не расходились:
--   * обе даты в пределах 2000-2100 годов;
--   * модуль сдвига не больше 3650 дней (десять лет).
-- Всё сверх этого — ошибка данных, а не очень сильный сдвиг.
--
-- Остальное тело функции не меняется: те же фильтры черновиков и задач матриц,
-- тот же SECURITY INVOKER (политики доступа вызывающего применяются как есть).

CREATE OR REPLACE FUNCTION public.get_group_task_stats(_group_ids uuid[])
RETURNS TABLE (
  group_id uuid,
  total integer,
  completed integer,
  active integer,
  overdue integer,
  drift integer,
  upcoming_7d integer,
  last_completed_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ids AS (
    SELECT unnest(_group_ids) AS gid
  )
  SELECT
    ids.gid AS group_id,
    COALESCE(COUNT(t.id), 0)::integer AS total,
    COALESCE(COUNT(*) FILTER (WHERE t.is_completed), 0)::integer AS completed,
    COALESCE(COUNT(*) FILTER (WHERE NOT t.is_completed), 0)::integer AS active,
    COALESCE(COUNT(*) FILTER (
      WHERE NOT t.is_completed
        AND t.deadline IS NOT NULL
        AND t.deadline < now()
    ), 0)::integer AS overdue,
    COALESCE(COUNT(*) FILTER (
      WHERE t.original_deadline IS NOT NULL
        AND t.deadline IS NOT NULL
        AND t.original_deadline <> t.deadline
        -- Обе даты должны быть осмысленными: год 0001 в базовой дате давал
        -- сдвиг в две тысячи лет и попадал в счётчик.
        AND extract(year FROM t.original_deadline) BETWEEN 2000 AND 2100
        AND extract(year FROM t.deadline) BETWEEN 2000 AND 2100
        -- И сам сдвиг должен быть в пределах разумного.
        AND abs(extract(epoch FROM (t.deadline - t.original_deadline)) / 86400) <= 3650
    ), 0)::integer AS drift,
    COALESCE(COUNT(*) FILTER (
      WHERE NOT t.is_completed
        AND t.deadline IS NOT NULL
        AND t.deadline >= now()
        AND t.deadline <= (now() + interval '7 days')
    ), 0)::integer AS upcoming_7d,
    MAX(t.completed_at) FILTER (WHERE t.is_completed) AS last_completed_at
  FROM ids
  LEFT JOIN tasks t
    ON t.group_id = ids.gid
   AND COALESCE(t.is_draft, false) = false
   AND t.task_type <> 'stm_stage'
  GROUP BY ids.gid;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_task_stats(uuid[]) TO authenticated;
