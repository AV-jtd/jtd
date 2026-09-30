-- Видимость комментариев задач: считать множество один раз, а не для каждой строки.
-- Тот же приём, что для tasks 27.09 (20260927120000_tasks_visibility_setbased).
--
-- Проблема (журнал, 30.09). Чтение task_comments проверялось шестью
-- функциями на КАЖДУЮ строку. Вкладка «Лог» мессенджера — последние 500
-- записей журнала, `kind = 'log' order by created_at desc` — не укладывалась в
-- 60 с ни у кого: 194 тыс. записей, на каждую — до шести подзапросов. Индекс
-- по (kind, created_at) помог лишь отчасти: 12–17 с, а у пользователя, который
-- видит мало, по-прежнему больше 60 с — базе приходится проверить почти все
-- строки, чтобы найти свои.
--
-- Решение. user_comment_visible_task_ids(uid) — множество задач, комментарии к
-- которым пользователь видит по шести прежним правилам; каждое правило
-- записано соединением таблиц. В политике оно вычисляется один раз (InitPlan),
-- дальше — проверка вхождения по хэшу.
--
-- Семантика не меняется:
--   • пять политик чтения (участник, проект, руководитель, встреча протокола,
--     родительский проект) → одна политика по множеству;
--   • «Task owners can manage comments» (FOR ALL) → три политики на
--     INSERT/UPDATE/DELETE с тем же условием; чтение для владельца даёт
--     множество. Иначе FOR ALL участвовала бы в SELECT и вызывала
--     is_task_owner на каждую строку;
--   • политики автора, администратора и ограничение для консультантов — те же
--     условия, но auth.uid(), has_role и is_consultant обёрнуты в (SELECT …),
--     чтобы вычисляться один раз на запрос;
--   • политики на добавление (FOR INSERT) не трогаются.
--
-- Проверка эквивалентности: для каждого пользователя множество задач по новой
-- функции сверено с множеством по шести старым функциям — расхождений ноль в
-- обе стороны (журнал, 30.09). Старые функции не удаляются: они — точка истины
-- для сверки и используются политиками на добавление.

CREATE OR REPLACE FUNCTION public.user_comment_visible_task_ids(_user_id uuid)
RETURNS TABLE (task_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Спрашивать можно только про себя — как во всех исходных функциях.
  WITH me AS (SELECT _user_id AS uid WHERE _user_id = auth.uid())
  -- is_task_owner: постановщик или исполнитель
  SELECT t.id FROM tasks t, me WHERE t.user_id = me.uid OR t.assigned_to = me.uid
  UNION
  -- is_task_participant
  SELECT tp.task_id FROM task_participants tp, me WHERE tp.user_id = me.uid
  UNION
  -- is_task_in_member_group: участник проекта задачи (любая роль)
  SELECT t.id FROM tasks t
    JOIN group_members gm ON gm.group_id = t.group_id
    JOIN me ON gm.user_id = me.uid
  UNION
  -- is_supervisor_task_in_shared_group: руководитель (director/manager) в той
  -- же команде, что постановщик задачи (member), и сам владелец или участник
  -- проекта задачи
  SELECT t.id FROM tasks t
    JOIN me ON true
   WHERE t.group_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM team_members d JOIN team_members m ON d.team_id = m.team_id
                  WHERE d.user_id = me.uid AND d.role IN ('director', 'manager')
                    AND m.user_id = t.user_id AND m.role = 'member')
     AND (EXISTS (SELECT 1 FROM task_groups g WHERE g.id = t.group_id AND g.user_id = me.uid)
          OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = me.uid))
  UNION
  -- is_task_in_parent_member_group: полноправный участник родительского проекта
  SELECT t.id FROM tasks t
    JOIN task_groups tg ON tg.id = t.group_id
    JOIN group_members gm ON gm.group_id = tg.parent_id AND gm.role IN ('assignee', 'participant')
    JOIN me ON gm.user_id = me.uid
  UNION
  -- is_task_in_protocol_attendee_scope(…, false): внутренний участник встречи
  SELECT t.id FROM tasks t
    JOIN task_groups tg ON tg.id = t.group_id
    JOIN me ON true
   WHERE tg.project_type = 'protocol'
     AND jsonb_typeof(tg.protocol_meta -> 'internal_attendees') = 'array'
     AND (tg.protocol_meta -> 'internal_attendees') @> to_jsonb(me.uid::text)
$$;

REVOKE EXECUTE ON FUNCTION public.user_comment_visible_task_ids(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_comment_visible_task_ids(uuid) TO authenticated;

-- Индекс под «последние записи по виду»: вкладки мессенджера «Чаты» и «Лог».
CREATE INDEX IF NOT EXISTS task_comments_kind_created_idx
  ON public.task_comments (kind, created_at DESC);

BEGIN;

-- 1. Пять построчных политик чтения → одна по множеству
DROP POLICY IF EXISTS "Task participants can view comments" ON public.task_comments;
DROP POLICY IF EXISTS "Group members can view task comments" ON public.task_comments;
DROP POLICY IF EXISTS "Supervisors can view subordinate task comments in shared groups" ON public.task_comments;
DROP POLICY IF EXISTS "Internal attendees can view protocol task comments" ON public.task_comments;
DROP POLICY IF EXISTS "Parent group members can view subgroup task comments" ON public.task_comments;
DROP POLICY IF EXISTS "Visible task comments (set-based)" ON public.task_comments;
CREATE POLICY "Visible task comments (set-based)" ON public.task_comments
  FOR SELECT
  USING (task_id IN (SELECT public.user_comment_visible_task_ids((SELECT auth.uid()))));

-- 2. Владелец задачи: FOR ALL → запись/изменение/удаление с тем же условием
DROP POLICY IF EXISTS "Task owners can manage comments" ON public.task_comments;
DROP POLICY IF EXISTS "Task owners can insert comments" ON public.task_comments;
DROP POLICY IF EXISTS "Task owners can update comments" ON public.task_comments;
DROP POLICY IF EXISTS "Task owners can delete comments" ON public.task_comments;
CREATE POLICY "Task owners can insert comments" ON public.task_comments
  FOR INSERT WITH CHECK (is_task_owner(task_id, auth.uid()));
CREATE POLICY "Task owners can update comments" ON public.task_comments
  FOR UPDATE USING (is_task_owner(task_id, auth.uid())) WITH CHECK (is_task_owner(task_id, auth.uid()));
CREATE POLICY "Task owners can delete comments" ON public.task_comments
  FOR DELETE USING (is_task_owner(task_id, auth.uid()));

-- 3. Те же условия, вычисляемые один раз на запрос
ALTER POLICY "Comment authors can manage own comments" ON public.task_comments
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Admins full access to task comments" ON public.task_comments
  USING ((SELECT has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((SELECT has_role(auth.uid(), 'admin'::app_role)));

ALTER POLICY "Consultant restriction on comments" ON public.task_comments
  USING ((SELECT NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id))
  WITH CHECK ((SELECT NOT is_consultant(auth.uid())) OR ((auth.uid() = user_id) AND consultant_can_see_task(auth.uid(), task_id)));

COMMIT;
