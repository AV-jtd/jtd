-- 1. Добавляем task_type 'protocol_review' (мягкое значение, не enum — task_type это text)
-- 2. Уникальный частичный индекс: один review на (source_protocol_id, assigned_to)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_protocol_review_per_user
  ON public.tasks (source_protocol_id, assigned_to)
  WHERE task_type = 'protocol_review' AND assigned_to IS NOT NULL;

-- 3. Функция: создать задачу-ревью для конкретного пользователя по черновику
CREATE OR REPLACE FUNCTION public.ensure_protocol_review_task(
  _protocol_id uuid,
  _assignee uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _protocol record;
  _deadline timestamptz;
BEGIN
  IF _assignee IS NULL OR _protocol_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, name, user_id, draft_status, project_type
    INTO _protocol
    FROM public.task_groups
   WHERE id = _protocol_id;

  -- Только для черновых протоколов
  IF _protocol.id IS NULL
     OR _protocol.project_type <> 'protocol'
     OR _protocol.draft_status <> 'draft' THEN
    RETURN;
  END IF;

  -- Срок: завтра 18:00 локального серверного времени
  _deadline := date_trunc('day', now() + interval '1 day') + interval '18 hours';

  INSERT INTO public.tasks (
    user_id, title, description, deadline, assigned_to,
    task_type, source_protocol_id, group_id, is_draft
  )
  VALUES (
    _protocol.user_id,
    'Изучить, доработать протокол: ' || _protocol.name,
    'Черновик протокола ожидает вашего ознакомления и правок до публикации.',
    _deadline,
    _assignee,
    'protocol_review',
    _protocol.id,
    NULL,
    false
  )
  ON CONFLICT (source_protocol_id, assigned_to)
    WHERE task_type = 'protocol_review' AND assigned_to IS NOT NULL
  DO NOTHING;
END;
$$;

-- 4. Триггер: при INSERT/UPDATE строки черновика — обеспечить review для assigned_to и автора
CREATE OR REPLACE FUNCTION public.trg_protocol_draft_assignee_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grp record;
BEGIN
  -- Игнорируем сами задачи-ревью, чтобы не зациклить
  IF NEW.task_type = 'protocol_review' THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, user_id, draft_status, project_type
    INTO _grp
    FROM public.task_groups
   WHERE id = NEW.group_id;

  IF _grp.id IS NULL
     OR _grp.project_type <> 'protocol'
     OR _grp.draft_status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Review для автора протокола (всегда)
  PERFORM public.ensure_protocol_review_task(_grp.id, _grp.user_id);

  -- Review для нового ответственного (если назначен и изменился)
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    PERFORM public.ensure_protocol_review_task(_grp.id, NEW.assigned_to);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protocol_draft_assignee_review ON public.tasks;
CREATE TRIGGER protocol_draft_assignee_review
  AFTER INSERT OR UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protocol_draft_assignee_review();