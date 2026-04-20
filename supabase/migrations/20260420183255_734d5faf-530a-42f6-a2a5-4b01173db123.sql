
CREATE OR REPLACE FUNCTION public.resolve_dependency_violations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  iter integer := 0;
  changes integer := 0;
  total_changes integer := 0;
  rec record;
  pred_end timestamptz;
  succ_anchor timestamptz;
  new_start timestamptz;
  new_deadline timestamptz;
  duration_seconds double precision;
BEGIN
  LOOP
    iter := iter + 1;
    changes := 0;

    FOR rec IN
      SELECT
        d.predecessor_id,
        d.successor_id,
        d.successor_entity_type,
        d.lag_days,
        COALESCE(tp.deadline, mp.planned_date) AS pred_deadline,
        ts.start_at AS succ_start,
        ts.deadline AS succ_task_deadline,
        ms.planned_date AS succ_milestone_date
      FROM task_dependencies d
      LEFT JOIN tasks tp ON tp.id = d.predecessor_id
      LEFT JOIN project_milestones mp ON mp.id = d.predecessor_id
      LEFT JOIN tasks ts ON ts.id = d.successor_id AND d.successor_entity_type = 'task'
      LEFT JOIN project_milestones ms ON ms.id = d.successor_id AND d.successor_entity_type = 'milestone'
    LOOP
      IF rec.pred_deadline IS NULL THEN CONTINUE; END IF;
      pred_end := rec.pred_deadline + (rec.lag_days || ' days')::interval;

      IF rec.successor_entity_type = 'milestone' THEN
        IF rec.succ_milestone_date IS NULL OR rec.succ_milestone_date >= pred_end THEN CONTINUE; END IF;
        UPDATE project_milestones SET planned_date = pred_end WHERE id = rec.successor_id;
        changes := changes + 1;
      ELSE
        succ_anchor := COALESCE(rec.succ_start, rec.succ_task_deadline);
        IF succ_anchor IS NULL OR succ_anchor >= pred_end THEN CONTINUE; END IF;
        new_start := pred_end;
        IF rec.succ_start IS NOT NULL AND rec.succ_task_deadline IS NOT NULL THEN
          duration_seconds := EXTRACT(EPOCH FROM (rec.succ_task_deadline - rec.succ_start));
          new_deadline := new_start + (duration_seconds || ' seconds')::interval;
        ELSIF rec.succ_task_deadline IS NOT NULL THEN
          new_deadline := rec.succ_task_deadline + (pred_end - succ_anchor);
        ELSE
          new_deadline := new_start;
        END IF;
        UPDATE tasks SET start_at = new_start, deadline = new_deadline WHERE id = rec.successor_id;
        changes := changes + 1;
      END IF;
    END LOOP;

    total_changes := total_changes + changes;
    EXIT WHEN changes = 0 OR iter >= 50;
  END LOOP;

  RETURN total_changes;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_resolve_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent recursion: only run at top-level statement, not when invoked by another trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  PERFORM public.resolve_dependency_violations();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_deps_on_dep_change ON public.task_dependencies;
CREATE TRIGGER trg_resolve_deps_on_dep_change
AFTER INSERT OR UPDATE OR DELETE ON public.task_dependencies
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_resolve_dependencies();

DROP TRIGGER IF EXISTS trg_resolve_deps_on_task_change ON public.tasks;
CREATE TRIGGER trg_resolve_deps_on_task_change
AFTER UPDATE OF start_at, deadline ON public.tasks
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_resolve_dependencies();

DROP TRIGGER IF EXISTS trg_resolve_deps_on_ms_change ON public.project_milestones;
CREATE TRIGGER trg_resolve_deps_on_ms_change
AFTER UPDATE OF planned_date ON public.project_milestones
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_resolve_dependencies();

SELECT public.resolve_dependency_violations();
