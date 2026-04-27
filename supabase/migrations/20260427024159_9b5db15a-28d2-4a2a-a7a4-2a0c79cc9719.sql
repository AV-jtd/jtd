-- Aggregated per-group task statistics for dashboards (PMO, NPD, project cards).
-- Replaces in-memory aggregates over the full tasks payload, so callers can stop
-- shipping completed history to the client.
--
-- Returns one row per group_id passed in `_group_ids`. Groups with no tasks are
-- still returned (with zeros) so the caller can rely on the array length.
--
-- Definition is SECURITY INVOKER (default) on STABLE SQL → the function runs
-- under the calling user's RLS, so it can only see tasks the user is allowed
-- to see (same as direct SELECT on tasks). No data-leak risk.
--
-- Why no parent_id rollup here: callers (PortfolioView / NpdBoard) already know
-- the subproject IDs and pass them as a flat array. Keeping the function flat
-- avoids re-implementing the visibility tree in SQL.

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

-- Grant execute to authenticated users (anon stays denied — analytics is
-- per-user and requires auth).
GRANT EXECUTE ON FUNCTION public.get_group_task_stats(uuid[]) TO authenticated;