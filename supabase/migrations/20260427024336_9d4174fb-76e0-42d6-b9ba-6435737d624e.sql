DROP FUNCTION IF EXISTS public.get_group_task_stats(uuid[]);

CREATE FUNCTION public.get_group_task_stats(_group_ids uuid[])
RETURNS TABLE (
  group_id uuid,
  total integer,
  completed integer,
  active integer,
  overdue integer,
  drift integer,
  upcoming_7d integer,
  last_completed_at timestamptz,
  earliest_start timestamptz,
  max_drift_days integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
        ORDER BY ABS(EXTRACT(EPOCH FROM (b2.deadline - b2.original_deadline))) DESC
        LIMIT 1
      ),
      0
    )::integer AS max_drift_days
  FROM base b
  GROUP BY b.group_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_task_stats(uuid[]) TO authenticated;