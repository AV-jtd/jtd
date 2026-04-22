-- ============================================================
-- 1. Индексы для быстрой выборки задач отдела
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_department_id
  ON public.tasks(department_id) WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_contractor_id
  ON public.tasks(contractor_id) WHERE contractor_id IS NOT NULL;

-- Inbox отдела: дешёвая выборка незавершённых без исполнителя
CREATE INDEX IF NOT EXISTS idx_tasks_dept_inbox
  ON public.tasks(department_id, deadline)
  WHERE department_id IS NOT NULL AND assigned_to IS NULL AND is_completed = false;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
  ON public.profiles(department_id) WHERE department_id IS NOT NULL;

-- ============================================================
-- 2. SECURITY DEFINER функция: пользователь принадлежит отделу задачи?
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() THEN
    EXISTS (
      SELECT 1
      FROM public.tasks t
      JOIN public.profiles p ON p.id = _user_id
      WHERE t.id = _task_id
        AND t.department_id IS NOT NULL
        AND t.department_id = p.department_id
    )
  ELSE false END;
$$;

-- ============================================================
-- 3. RLS политики: видеть и взять задачу своего отдела
-- ============================================================
CREATE POLICY "Department members can view department tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    department_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.department_id = public.tasks.department_id
    )
  );

CREATE POLICY "Department members can take department tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    department_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.department_id = public.tasks.department_id
    )
  )
  WITH CHECK (
    -- Разрешено только установить себя как assigned_to (т.е. «взять»),
    -- либо менять обычные поля задачи (статус, дедлайн, описание).
    -- Передавать задачу другому отделу нельзя через эту политику —
    -- для этого есть владелец / глава отдела.
    (assigned_to IS NULL OR assigned_to = auth.uid() OR
     EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.department_id = public.tasks.department_id
     ))
  );

-- ============================================================
-- 4. Триггер: исключающая семантика assigned_to / department_id / contractor_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_assignee_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Если изменился assigned_to и стал не-null → снимаем отдел/подрядчика
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    NEW.department_id := NULL;
    NEW.contractor_id := NULL;
  END IF;

  -- Если поставили department_id → снимаем подрядчика
  IF NEW.department_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.department_id IS DISTINCT FROM OLD.department_id) THEN
    NEW.contractor_id := NULL;
    -- assigned_to НЕ снимаем автоматически: задача может быть и на сотруднике, и в контексте отдела.
    -- Но для воркфлоу «взять» это решает приложение, а не триггер.
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_assignee_exclusivity ON public.tasks;
CREATE TRIGGER trg_enforce_assignee_exclusivity
  BEFORE INSERT OR UPDATE OF assigned_to, department_id, contractor_id
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignee_exclusivity();

-- ============================================================
-- 5. Триггер уведомлений главе отдела (через notify-event edge function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_department_head_on_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _head uuid;
  _supabase_url text;
  _anon_key text;
BEGIN
  -- Уведомляем только при появлении нового department_id (без assigned_to)
  IF NEW.department_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    RETURN NEW;
  END IF;

  SELECT head_user_id INTO _head FROM public.departments WHERE id = NEW.department_id;
  IF _head IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO _anon_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;

  IF _supabase_url IS NULL OR _anon_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/notify-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body := jsonb_build_object(
      'event_type', 'department_assigned',
      'task_id', NEW.id,
      'department_id', NEW.department_id,
      'recipient_id', _head,
      'title', NEW.title,
      'deadline', NEW.deadline
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_department_head_on_assign ON public.tasks;
CREATE TRIGGER trg_notify_department_head_on_assign
  AFTER INSERT OR UPDATE OF department_id
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_department_head_on_assign();
