-- Триггер: при появлении/смене linked_project_id в tasks.status_meta
-- автоматически добавляем владельца linked-проекта и создателя задачи в task_participants
CREATE OR REPLACE FUNCTION public.sync_linked_project_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_linked_id uuid;
  old_linked_id uuid;
  project_owner_id uuid;
BEGIN
  new_linked_id := NULLIF(NEW.status_meta->>'linked_project_id', '')::uuid;
  old_linked_id := CASE WHEN TG_OP = 'UPDATE'
                        THEN NULLIF(OLD.status_meta->>'linked_project_id', '')::uuid
                        ELSE NULL END;

  -- Если linked_project_id не изменился — выходим
  IF new_linked_id IS NOT DISTINCT FROM old_linked_id THEN
    RETURN NEW;
  END IF;

  -- Если новый linked_project_id NULL — ничего не добавляем (старых не убираем,
  -- чтобы не сломать ручные правки участников)
  IF new_linked_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Владелец linked-проекта
  SELECT user_id INTO project_owner_id
  FROM task_groups WHERE id = new_linked_id;

  IF project_owner_id IS NOT NULL THEN
    INSERT INTO task_participants (task_id, user_id, role)
    VALUES (NEW.id, project_owner_id, 'participant')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Создатель задачи
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO task_participants (task_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'participant')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_linked_project_participants ON public.tasks;
CREATE TRIGGER trg_sync_linked_project_participants
AFTER INSERT OR UPDATE OF status_meta ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_linked_project_participants();

-- Уникальный индекс на (task_id, user_id), если ещё нет — нужен для ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='task_participants_task_user_uniq'
  ) THEN
    CREATE UNIQUE INDEX task_participants_task_user_uniq
    ON public.task_participants(task_id, user_id);
  END IF;
END$$;

-- Индекс для быстрого поиска задач, привязанных к проекту через status_meta
CREATE INDEX IF NOT EXISTS idx_tasks_linked_project
ON public.tasks ((status_meta->>'linked_project_id'))
WHERE status_meta ? 'linked_project_id';