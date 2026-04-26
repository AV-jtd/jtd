-- ============================================================
-- 1. Хелперы для consultant-режима
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_consultant(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'consultant'
  )
$$;

CREATE OR REPLACE FUNCTION public.consultant_company(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT contractor_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tags WHERE id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.task_tags tt
    WHERE tt.tag_id = _tag_id
      AND public.consultant_can_see_task(_user_id, tt.task_id)
  )
$$;

-- Видит ли consultant группу (есть хотя бы одна видимая задача в ней)
CREATE OR REPLACE FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
$$;

-- ============================================================
-- 2. Триггер: contractor_id ↔ роль consultant
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_consultant_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.contractor_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'consultant')
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.contractor_id IS NOT NULL
     AND NEW.contractor_id IS NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = NEW.id AND role = 'consultant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_consultant_role ON public.profiles;
CREATE TRIGGER trg_sync_consultant_role
AFTER INSERT OR UPDATE OF contractor_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_consultant_role();

-- Бэкфилл существующих
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'consultant'::app_role FROM public.profiles WHERE contractor_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. RLS — ужесточаем для consultant
-- Принцип: добавляем политики "Block consultant from <table>" с USING (NOT is_consultant(auth.uid()))
-- + создаём отдельные узкие политики для consultant там, где доступ должен оставаться
-- Для tasks/profiles/contractors/tags — режем существующие открытые политики
-- ============================================================

-- ---------- profiles ----------
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
CREATE POLICY "Non-consultants view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (NOT public.is_consultant(auth.uid()));

CREATE POLICY "Consultants view limited profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  public.is_consultant(auth.uid())
  AND public.consultant_can_see_user(auth.uid(), id)
);

-- ---------- contractors ----------
DROP POLICY IF EXISTS "Authenticated users can view contractors" ON public.contractors;
CREATE POLICY "Non-consultants view contractors"
ON public.contractors FOR SELECT
TO authenticated
USING (NOT public.is_consultant(auth.uid()));

CREATE POLICY "Consultants view own contractor"
ON public.contractors FOR SELECT
TO authenticated
USING (
  public.is_consultant(auth.uid())
  AND id = public.consultant_company(auth.uid())
);

-- ---------- departments — скрыть полностью ----------
DROP POLICY IF EXISTS "Authenticated users can view departments" ON public.departments;
CREATE POLICY "Non-consultants view departments"
ON public.departments FOR SELECT
TO authenticated
USING (NOT public.is_consultant(auth.uid()));

-- ---------- tags ----------
DROP POLICY IF EXISTS "Authenticated users can view all tags" ON public.tags;
CREATE POLICY "Non-consultants view all tags"
ON public.tags FOR SELECT
TO authenticated
USING (NOT public.is_consultant(auth.uid()));

CREATE POLICY "Consultants view own/visible tags"
ON public.tags FOR SELECT
TO authenticated
USING (
  public.is_consultant(auth.uid())
  AND (user_id = auth.uid() OR public.consultant_can_see_tag(auth.uid(), id))
);

-- ---------- tag_categories — закрываем для consultant ----------
DROP POLICY IF EXISTS "Authenticated users can view tag categories" ON public.tag_categories;
CREATE POLICY "Non-consultants view tag categories"
ON public.tag_categories FOR SELECT
TO authenticated
USING (NOT public.is_consultant(auth.uid()));

CREATE POLICY "Consultants view own tag categories"
ON public.tag_categories FOR SELECT
TO authenticated
USING (public.is_consultant(auth.uid()) AND user_id = auth.uid());

-- ---------- tasks — добавляем consultant-видимость как отдельную политику ----------
-- Существующие политики (owner, group_member, participant и т.д.) — остаются, они уже корректные.
-- Но "Authenticated users can view all tasks" нет, поэтому ничего не дропаем.
-- Главная задача: убедиться, что consultant видит ТОЛЬКО разрешённое.
-- Для этого блокируем consultant для всех общих SELECT-политик через дополнение:
-- Добавим RESTRICTIVE-политику, которая для consultant требует consultant_can_see_task

CREATE POLICY "Consultant restriction on tasks"
ON public.tasks AS RESTRICTIVE FOR SELECT
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_task(auth.uid(), id)
);

-- INSERT/UPDATE/DELETE для consultant — только свои задачи
CREATE POLICY "Consultant restriction on tasks write"
ON public.tasks AS RESTRICTIVE FOR INSERT
TO authenticated
WITH CHECK (
  NOT public.is_consultant(auth.uid())
  OR auth.uid() = user_id
);

CREATE POLICY "Consultant restriction on tasks update"
ON public.tasks AS RESTRICTIVE FOR UPDATE
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_task(auth.uid(), id)
);

CREATE POLICY "Consultant restriction on tasks delete"
ON public.tasks AS RESTRICTIVE FOR DELETE
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR auth.uid() = user_id
);

-- ---------- subtasks — restrictive для consultant ----------
CREATE POLICY "Consultant restriction on subtasks"
ON public.subtasks AS RESTRICTIVE FOR ALL
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_task(auth.uid(), task_id)
)
WITH CHECK (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_task(auth.uid(), task_id)
);

-- ---------- task_comments ----------
CREATE POLICY "Consultant restriction on comments"
ON public.task_comments AS RESTRICTIVE FOR ALL
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_task(auth.uid(), task_id)
)
WITH CHECK (
  NOT public.is_consultant(auth.uid())
  OR (auth.uid() = user_id AND public.consultant_can_see_task(auth.uid(), task_id))
);

-- ---------- task_participants ----------
CREATE POLICY "Consultant restriction on participants"
ON public.task_participants AS RESTRICTIVE FOR SELECT
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_task(auth.uid(), task_id)
);

-- ---------- task_tags ----------
CREATE POLICY "Consultant restriction on task_tags"
ON public.task_tags AS RESTRICTIVE FOR SELECT
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_task(auth.uid(), task_id)
);

-- ---------- task_groups ----------
CREATE POLICY "Consultant restriction on groups"
ON public.task_groups AS RESTRICTIVE FOR SELECT
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR public.consultant_can_see_group(auth.uid(), id)
  OR user_id = auth.uid()
);

-- consultant не может создавать/редактировать/удалять группы (кроме своих)
CREATE POLICY "Consultant restriction on groups write"
ON public.task_groups AS RESTRICTIVE FOR INSERT
TO authenticated
WITH CHECK (NOT public.is_consultant(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Consultant restriction on groups update"
ON public.task_groups AS RESTRICTIVE FOR UPDATE
TO authenticated
USING (NOT public.is_consultant(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Consultant restriction on groups delete"
ON public.task_groups AS RESTRICTIVE FOR DELETE
TO authenticated
USING (NOT public.is_consultant(auth.uid()) OR user_id = auth.uid());

-- ---------- group_members / group_messages / group_tags / project_milestones / project_folders / project_folder_items / npd_card_positions / report_pages / wiki_pages / wiki_structured_sections / protocol_templates / clients / team_members / teams / dashboard_reports — block ----------
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'group_members','group_messages','group_tags',
    'project_milestones','project_folders','project_folder_items',
    'npd_card_positions','report_pages',
    'wiki_pages','wiki_structured_sections',
    'protocol_templates','clients',
    'team_members','teams','dashboard_reports'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "Consultant block on %I" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_consultant(auth.uid())) WITH CHECK (NOT public.is_consultant(auth.uid()))',
      t, t
    );
  END LOOP;
END$do$;

-- ---------- task_dependencies — обе стороны должны быть видны ----------
CREATE POLICY "Consultant restriction on dependencies"
ON public.task_dependencies AS RESTRICTIVE FOR SELECT
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR (
    (predecessor_entity_type <> 'task' OR public.consultant_can_see_task(auth.uid(), predecessor_id))
    AND (successor_entity_type <> 'task' OR public.consultant_can_see_task(auth.uid(), successor_id))
    AND predecessor_entity_type IN ('task') AND successor_entity_type IN ('task')
  )
);

-- ---------- message_reactions — только на видимых сообщениях ----------
CREATE POLICY "Consultant restriction on reactions"
ON public.message_reactions AS RESTRICTIVE FOR ALL
TO authenticated
USING (
  NOT public.is_consultant(auth.uid())
  OR (
    message_type = 'task_comment'
    AND EXISTS (
      SELECT 1 FROM public.task_comments tc
      WHERE tc.id = message_reactions.message_id
        AND public.consultant_can_see_task(auth.uid(), tc.task_id)
    )
  )
)
WITH CHECK (
  NOT public.is_consultant(auth.uid())
  OR (
    user_id = auth.uid()
    AND message_type = 'task_comment'
    AND EXISTS (
      SELECT 1 FROM public.task_comments tc
      WHERE tc.id = message_reactions.message_id
        AND public.consultant_can_see_task(auth.uid(), tc.task_id)
    )
  )
);

-- ---------- ai_conversations / chat_read_status — только свои ----------
-- (политика "Users manage own" уже это обеспечивает; оставляем как есть)

-- ---------- tag_access — закрываем для consultant ----------
CREATE POLICY "Consultant block on tag_access"
ON public.tag_access AS RESTRICTIVE FOR ALL
TO authenticated
USING (NOT public.is_consultant(auth.uid()) OR user_id = auth.uid())
WITH CHECK (NOT public.is_consultant(auth.uid()));