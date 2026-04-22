
-- =============================================================
-- 1. Helper functions (SECURITY DEFINER, чтобы обходить RLS внутри политик)
-- =============================================================

CREATE OR REPLACE FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_groups tg
    WHERE tg.id = _group_id
      AND tg.project_type = 'protocol'
      AND jsonb_typeof(tg.protocol_meta -> 'internal_attendees') = 'array'
      AND (tg.protocol_meta -> 'internal_attendees') @> to_jsonb(_user_id::text)
  );
$$;

COMMENT ON FUNCTION public.is_protocol_internal_attendee(uuid, uuid) IS
  'TRUE, если пользователь числится в protocol_meta.internal_attendees протокола (внутренний участник встречи).';

CREATE OR REPLACE FUNCTION public.is_protocol_draft(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_groups tg
    WHERE tg.id = _group_id
      AND tg.project_type = 'protocol'
      AND tg.draft_status = 'draft'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_task_in_protocol_attendee_scope(
  _task_id uuid,
  _user_id uuid,
  _draft_only boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- =============================================================
-- 2. RLS: task_groups — участники встречи всегда видят протокол,
--                       а пока он в draft — могут его редактировать
-- =============================================================

DROP POLICY IF EXISTS "Internal attendees can view protocol" ON public.task_groups;
CREATE POLICY "Internal attendees can view protocol"
  ON public.task_groups
  FOR SELECT
  TO authenticated
  USING (public.is_protocol_internal_attendee(id, auth.uid()));

DROP POLICY IF EXISTS "Internal attendees can edit protocol draft" ON public.task_groups;
CREATE POLICY "Internal attendees can edit protocol draft"
  ON public.task_groups
  FOR UPDATE
  TO authenticated
  USING (public.is_protocol_internal_attendee(id, auth.uid()) AND draft_status = 'draft')
  WITH CHECK (public.is_protocol_internal_attendee(id, auth.uid()));

-- =============================================================
-- 3. RLS: tasks — участники встречи видят все задачи протокола,
--                  правят и создают пока он в draft
-- =============================================================

DROP POLICY IF EXISTS "Internal attendees can view protocol tasks" ON public.tasks;
CREATE POLICY "Internal attendees can view protocol tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (group_id IS NOT NULL AND public.is_protocol_internal_attendee(group_id, auth.uid()));

DROP POLICY IF EXISTS "Internal attendees can edit draft protocol tasks" ON public.tasks;
CREATE POLICY "Internal attendees can edit draft protocol tasks"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    group_id IS NOT NULL
    AND public.is_protocol_internal_attendee(group_id, auth.uid())
    AND public.is_protocol_draft(group_id)
  )
  WITH CHECK (
    group_id IS NOT NULL
    AND public.is_protocol_internal_attendee(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "Internal attendees can insert draft protocol tasks" ON public.tasks;
CREATE POLICY "Internal attendees can insert draft protocol tasks"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    group_id IS NOT NULL
    AND public.is_protocol_internal_attendee(group_id, auth.uid())
    AND public.is_protocol_draft(group_id)
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Internal attendees can delete draft protocol tasks" ON public.tasks;
CREATE POLICY "Internal attendees can delete draft protocol tasks"
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    group_id IS NOT NULL
    AND public.is_protocol_internal_attendee(group_id, auth.uid())
    AND public.is_protocol_draft(group_id)
  );

-- =============================================================
-- 4. RLS: subtasks (шаги) — участники встречи видят/правят пока draft
-- =============================================================

DROP POLICY IF EXISTS "Internal attendees can view protocol subtasks" ON public.subtasks;
CREATE POLICY "Internal attendees can view protocol subtasks"
  ON public.subtasks
  FOR SELECT
  TO authenticated
  USING (public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), false));

DROP POLICY IF EXISTS "Internal attendees can edit draft protocol subtasks" ON public.subtasks;
CREATE POLICY "Internal attendees can edit draft protocol subtasks"
  ON public.subtasks
  FOR UPDATE
  TO authenticated
  USING (public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));

DROP POLICY IF EXISTS "Internal attendees can insert draft protocol subtasks" ON public.subtasks;
CREATE POLICY "Internal attendees can insert draft protocol subtasks"
  ON public.subtasks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));

DROP POLICY IF EXISTS "Internal attendees can delete draft protocol subtasks" ON public.subtasks;
CREATE POLICY "Internal attendees can delete draft protocol subtasks"
  ON public.subtasks
  FOR DELETE
  TO authenticated
  USING (public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));

-- =============================================================
-- 5. RLS: task_comments — участники встречи видят и могут добавлять комментарии
-- =============================================================

DROP POLICY IF EXISTS "Internal attendees can view protocol task comments" ON public.task_comments;
CREATE POLICY "Internal attendees can view protocol task comments"
  ON public.task_comments
  FOR SELECT
  TO authenticated
  USING (public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), false));

DROP POLICY IF EXISTS "Internal attendees can comment on protocol tasks" ON public.task_comments;
CREATE POLICY "Internal attendees can comment on protocol tasks"
  ON public.task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_task_in_protocol_attendee_scope(task_id, auth.uid(), false)
  );
