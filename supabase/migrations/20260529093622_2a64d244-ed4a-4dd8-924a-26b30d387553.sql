-- Allow protocol meeting attendees (internal_attendees) to see ALL tasks of the protocol
CREATE OR REPLACE FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = _task_id
        AND (
          t.user_id = _user_id
          OR t.assigned_to = _user_id
          OR (
            t.group_id IS NOT NULL AND t.group_id IN (
              SELECT tg.id FROM public.task_groups tg WHERE tg.user_id = _user_id
              UNION ALL
              SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = _user_id
              UNION ALL
              SELECT tg.id
                FROM public.task_groups tg
                JOIN public.task_groups parent ON parent.id = tg.parent_id
               WHERE parent.user_id = _user_id
              UNION ALL
              SELECT tg.id
                FROM public.task_groups tg
                JOIN public.group_members gm ON gm.group_id = tg.parent_id
               WHERE gm.user_id = _user_id
                 AND gm.role = ANY (ARRAY['owner','participant'])
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.task_participants tp
            WHERE tp.task_id = t.id AND tp.user_id = _user_id
          )
          OR (
            t.department_id IS NOT NULL AND t.department_id IN (
              SELECT ud.department_id FROM public.user_departments ud WHERE ud.user_id = _user_id
            )
          )
          OR (
            t.group_id IS NOT NULL AND public.is_protocol_internal_attendee(t.group_id, _user_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.user_extra_visible_task_ids(_user_id) x(task_id)
            WHERE x.task_id = t.id
          )
        )
    )
  ELSE false END;
$function$;

-- Allow protocol meeting attendees to see protocol-visible decisions
CREATE OR REPLACE FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
BEGIN
  SELECT id, user_id, protocol_id, visibility
    INTO d
    FROM public.decisions
   WHERE id = _decision_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF d.user_id = _user_id THEN RETURN true; END IF;
  IF public.has_role(_user_id, 'admin'::app_role) THEN RETURN true; END IF;
  IF public.is_consultant(_user_id) THEN RETURN false; END IF;

  IF d.visibility = 'protocol' THEN
    -- Anyone who can see the protocol group
    IF public.is_group_member(d.protocol_id, _user_id)
       OR public.is_group_owner(d.protocol_id, _user_id) THEN
      RETURN true;
    END IF;
    -- Or a meeting attendee of the protocol (internal_attendees)
    IF public.is_protocol_internal_attendee(d.protocol_id, _user_id) THEN
      RETURN true;
    END IF;
    -- Or attached as participant in any task of the protocol
    IF EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.task_participants tp ON tp.task_id = t.id
      WHERE t.group_id = d.protocol_id AND tp.user_id = _user_id
    ) THEN RETURN true; END IF;
    -- Or any of the linked projects is visible to the user
    IF EXISTS (
      SELECT 1 FROM public.decision_projects dp
      WHERE dp.decision_id = d.id
        AND (public.is_group_member(dp.group_id, _user_id)
             OR public.is_group_owner(dp.group_id, _user_id))
    ) THEN RETURN true; END IF;
    RETURN false;
  END IF;

  IF d.visibility = 'restricted' THEN
    IF EXISTS (
      SELECT 1 FROM public.decision_viewers dv
      WHERE dv.decision_id = d.id AND dv.user_id = _user_id
    ) THEN RETURN true; END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$function$;