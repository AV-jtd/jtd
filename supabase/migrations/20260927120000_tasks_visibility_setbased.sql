-- Видимость задач: считать множество один раз, а не для каждой строки.
--
-- Проблема. Политика на public.tasks вызывала is_task_visible(id, auth.uid())
-- ПОСТРОЧНО. Внутри функции — запрос к самой tasks, четырёхветочный UNION по
-- проектам, проверка участников, отделов и вызов user_extra_visible_task_ids.
-- Всё это выполнялось заново для каждой просматриваемой строки.
--
-- Замеры 27.09.2026 (журнал, запись за вечер):
--   общий список открытых задач, владелец          7,2–7,6 с
--   он же, обычный пользователь (видит 6 задач)    4,5 с
--   тот же запрос без политик                      6 мс
--   то же условие, посчитанное множеством          36 мс
-- В плане — 1,39 млн обращений к буферам ради пятидесяти строк ответа. Цена не
-- зависела от того, сколько человеку доступно: функции вызывались для всех
-- 6801 просматриваемой строки и только потом строки отсеивались.
--
-- Решение. Та же логика, но в функции, возвращающей МНОЖЕСТВО видимых id.
-- В политике она вызывается один раз (подзапрос становится InitPlan), дальше
-- идёт проверка вхождения по хэшу.
--
-- Почему не инлайн прямо в политику. is_task_visible объявлена SECURITY
-- DEFINER, и её внутренние запросы намеренно обходят политики на task_groups,
-- group_members, task_participants, user_departments. Перенос этих запросов в
-- текст политики исполнял бы их от имени пользователя — это меняет семантику
-- и грозит рекурсией политик. Поэтому логика остаётся внутри SECURITY DEFINER
-- функции, меняется только форма вызова: множество вместо построчного да/нет.
--
-- Проверка эквивалентности. Для каждого пользователя в auth.users множество,
-- которое даёт новая функция, сверено с множеством, которое давала построчная
-- is_task_visible. Расхождений ноль в обе стороны. Скрипт сверки описан в
-- журнале; повторить его следует при любой правке условий видимости.
--
-- is_task_visible НЕ удаляется: она остаётся точкой истины для одиночной
-- проверки и опорой для сверки. Меняются только две политики, которые её
-- вызывали построчно.

-- ---------------------------------------------------------------------------
-- 1. Множество видимых задач для пользователя
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_visible_task_ids(_user_id uuid)
RETURNS TABLE (task_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Та же защита, что в is_task_visible: спрашивать можно только про себя,
  -- иначе функция превращается в способ разведать чужую видимость.
  SELECT t.id
  FROM public.tasks t
  WHERE _user_id = auth.uid()
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
      OR t.id IN (
        SELECT x.task_id FROM public.user_extra_visible_task_ids(_user_id) x(task_id)
      )
    );
$$;

COMMENT ON FUNCTION public.user_visible_task_ids(uuid) IS
  'Множество id задач, видимых пользователю. Логика совпадает с is_task_visible, но считается один раз на запрос, а не для каждой строки. Сверено по всем пользователям, расхождений нет.';

-- ---------------------------------------------------------------------------
-- 2. Политика на tasks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can see visible tasks" ON public.tasks;
CREATE POLICY "Users can see visible tasks"
  ON public.tasks FOR SELECT
  USING (
    -- (select auth.uid()) — чтобы значение вычислялось один раз как InitPlan,
    -- а не пересчитывалось из current_setting на каждой строке.
    id IN (SELECT v.task_id FROM public.user_visible_task_ids((select auth.uid())) v)
  );

-- ---------------------------------------------------------------------------
-- 3. Политика на subtasks — та же болезнь
-- ---------------------------------------------------------------------------
-- Приложение грузит задачи вместе с подзадачами одним запросом
-- (select "*, subtasks(*)"), поэтому построчная проверка здесь удваивала
-- стоимость главного экрана: ещё 5528 вызовов той же функции.
DROP POLICY IF EXISTS "Users can see subtasks of visible tasks" ON public.subtasks;
CREATE POLICY "Users can see subtasks of visible tasks"
  ON public.subtasks FOR SELECT
  USING (
    assigned_to = (select auth.uid())
    OR task_id IN (SELECT v.task_id FROM public.user_visible_task_ids((select auth.uid())) v)
  );
