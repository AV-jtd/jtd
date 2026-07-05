CREATE OR REPLACE FUNCTION public.can_see_task(_user_id uuid, _task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND public.can_see_task_row(
        _user_id, t.user_id, t.assigned_to, t.id, t.group_id, t.department_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _viewer = _target
    OR EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.profiles other ON other.id = _target
      WHERE me.id = _viewer
        AND me.contractor_id IS NOT NULL
        AND me.contractor_id = other.contractor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.task_participants tp1
      JOIN public.task_participants tp2 ON tp2.task_id = tp1.task_id
      WHERE tp1.user_id = _viewer AND tp2.user_id = _target
    )
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_profile(_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    auth.uid() = _profile_id
    OR (NOT public.is_consultant(auth.uid()))
    OR (public.is_consultant(auth.uid()) AND public.consultant_can_see_user(auth.uid(), _profile_id))
    OR public.is_supervisor_of_user(auth.uid(), _profile_id)
    OR EXISTS (
      SELECT 1 FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid() AND gm2.user_id = _profile_id
    )
    OR EXISTS (
      SELECT 1 FROM public.task_participants tp1
      JOIN public.task_participants tp2 ON tp1.task_id = tp2.task_id
      WHERE tp1.user_id = auth.uid() AND tp2.user_id = _profile_id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm1
      JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = _profile_id
    )
    OR _profile_id IN (SELECT public.delegation_profile_ids(auth.uid()));
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- User created the tag
    SELECT 1 FROM public.tags WHERE id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- User has explicit tag_access
    SELECT 1 FROM public.tag_access WHERE tag_id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- Tag is used on a task in a group the user owns or is member of
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND t.group_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.task_groups tg WHERE tg.id = t.group_id AND tg.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = _user_id)
    )
  ) OR EXISTS (
    -- Tag is used on a task owned by or assigned to the user
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND (t.user_id = _user_id OR t.assigned_to = _user_id)
  ) OR EXISTS (
    -- Tag is linked to a group the user owns or is member of
    SELECT 1 FROM public.task_groups tg
    WHERE tg.linked_tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  ) OR EXISTS (
    -- Tag is assigned to a group (group_tags) the user owns or is member of
    SELECT 1 FROM public.group_tags gt
    JOIN public.task_groups tg ON tg.id = gt.group_id
    WHERE gt.tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_company(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT contractor_id FROM public.profiles WHERE id = _user_id
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.task_participants tp
      ON tp.task_id = t.id AND tp.user_id = _user_id
    WHERE t.group_id = _group_id
      AND (
        t.user_id = _user_id
        OR t.assigned_to = _user_id
        OR tp.user_id IS NOT NULL
        OR (
          t.contractor_id IS NOT NULL
          AND t.contractor_id = public.consultant_company(_user_id)
        )
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.task_participants tp
      ON tp.task_id = t.id AND tp.user_id = _user_id
    WHERE t.id = _task_id
      AND (
        t.user_id = _user_id
        OR t.assigned_to = _user_id
        OR tp.user_id IS NOT NULL
        OR (
          t.contractor_id IS NOT NULL
          AND t.contractor_id = public.consultant_company(_user_id)
        )
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tags WHERE id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.task_tags tt
    WHERE tt.tag_id = _tag_id
      AND public.consultant_can_see_task(_user_id, tt.task_id)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_protocol_draft(_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_groups tg
    WHERE tg.id = _group_id
      AND tg.project_type = 'protocol'
      AND tg.draft_status = 'draft'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_groups tg
    WHERE tg.id = _group_id
      AND tg.project_type = 'protocol'
      AND jsonb_typeof(tg.protocol_meta -> 'internal_attendees') = 'array'
      AND (tg.protocol_meta -> 'internal_attendees') @> to_jsonb(_user_id::text)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.task_groups tg ON tg.id = t.group_id
    WHERE t.id = _task_id
      AND tg.project_type = 'protocol'
      AND jsonb_typeof(tg.protocol_meta -> 'internal_attendees') = 'array'
      AND (tg.protocol_meta -> 'internal_attendees') @> to_jsonb(_user_id::text)
      AND (NOT _draft_only OR tg.draft_status = 'draft')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_protocol_groups_arr(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT tg.id), ARRAY[]::uuid[])
  FROM public.task_groups tg
  WHERE tg.protocol_meta IS NOT NULL
    AND public.is_protocol_internal_attendee(tg.id, _user_id);
$function$
;

CREATE OR REPLACE FUNCTION public.user_visible_group_ids(_user_id uuid)
 RETURNS TABLE(group_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Owned groups
  SELECT id FROM public.task_groups WHERE user_id = _user_id
  UNION
  -- Member groups
  SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = _user_id
  UNION
  -- Subgroups of owned parent groups
  SELECT tg.id FROM public.task_groups tg
    JOIN public.task_groups parent ON parent.id = tg.parent_id
    WHERE parent.user_id = _user_id
  UNION
  -- Subgroups of member parent groups (full members)
  SELECT tg.id FROM public.task_groups tg
    JOIN public.group_members gm ON gm.group_id = tg.parent_id
    WHERE gm.user_id = _user_id AND gm.role IN ('owner', 'participant')
  UNION
  -- Protocol attendee groups
  SELECT tg.id FROM public.task_groups tg
    WHERE tg.protocol_meta IS NOT NULL
      AND public.is_protocol_internal_attendee(tg.id, _user_id);
$function$
;

