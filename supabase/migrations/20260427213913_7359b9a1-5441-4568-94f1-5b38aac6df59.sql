
-- Список системных категорий, которые копируем в задачи
CREATE OR REPLACE FUNCTION public.protocol_copyable_system_keys()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['clients','brand','product_category','site','territory','event_topic']::text[]
$$;

-- Копирует системные теги протокола в task_tags задачи
CREATE OR REPLACE FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _task_id IS NULL OR _protocol_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.task_tags (task_id, tag_id)
  SELECT _task_id, gt.tag_id
  FROM public.group_tags gt
  JOIN public.tags t ON t.id = gt.tag_id
  JOIN public.tag_categories tc ON tc.id = t.category_id
  WHERE gt.group_id = _protocol_id
    AND tc.is_system = true
    AND tc.system_key = ANY (public.protocol_copyable_system_keys())
  ON CONFLICT DO NOTHING;
END;
$$;

-- Удаляет ранее скопированные системные теги конкретного протокола из задачи
CREATE OR REPLACE FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _task_id IS NULL OR _protocol_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.task_tags tt
  USING public.tags t
  JOIN public.tag_categories tc ON tc.id = t.category_id
  WHERE tt.task_id = _task_id
    AND tt.tag_id = t.id
    AND tc.is_system = true
    AND tc.system_key = ANY (public.protocol_copyable_system_keys())
    AND EXISTS (
      SELECT 1 FROM public.group_tags gt
      WHERE gt.group_id = _protocol_id AND gt.tag_id = t.id
    );
END;
$$;

-- Триггер на tasks: копируем при INSERT, при UPDATE group_id — пересинхронизируем
CREATE OR REPLACE FUNCTION public.trg_task_sync_protocol_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_is_protocol boolean := false;
  _old_is_protocol boolean := false;
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    SELECT (project_type = 'protocol') INTO _new_is_protocol
    FROM public.task_groups WHERE id = NEW.group_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(_new_is_protocol, false) THEN
      PERFORM public.copy_protocol_system_tags_to_task(NEW.id, NEW.group_id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: только если изменился group_id
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    IF OLD.group_id IS NOT NULL THEN
      SELECT (project_type = 'protocol') INTO _old_is_protocol
      FROM public.task_groups WHERE id = OLD.group_id;
      IF COALESCE(_old_is_protocol, false) THEN
        PERFORM public.remove_protocol_system_tags_from_task(NEW.id, OLD.group_id);
      END IF;
    END IF;
    IF COALESCE(_new_is_protocol, false) THEN
      PERFORM public.copy_protocol_system_tags_to_task(NEW.id, NEW.group_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_sync_protocol_context ON public.tasks;
CREATE TRIGGER task_sync_protocol_context
AFTER INSERT OR UPDATE OF group_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_task_sync_protocol_context();

-- Триггер на group_tags: при изменении тегов черновика протокола — синхронизируем все его задачи
CREATE OR REPLACE FUNCTION public.trg_group_tags_sync_protocol_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gid uuid;
  _tag_id uuid;
  _is_draft_protocol boolean;
  _is_system_copyable boolean;
  _task record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _gid := NEW.group_id;
    _tag_id := NEW.tag_id;
  ELSE
    _gid := OLD.group_id;
    _tag_id := OLD.tag_id;
  END IF;

  -- Только для draft-протоколов
  SELECT (project_type = 'protocol' AND COALESCE(draft_status, 'draft') = 'draft')
    INTO _is_draft_protocol
  FROM public.task_groups WHERE id = _gid;

  IF NOT COALESCE(_is_draft_protocol, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Только если тег относится к копируемой системной категории
  SELECT (tc.is_system = true AND tc.system_key = ANY (public.protocol_copyable_system_keys()))
    INTO _is_system_copyable
  FROM public.tags t
  JOIN public.tag_categories tc ON tc.id = t.category_id
  WHERE t.id = _tag_id;

  IF NOT COALESCE(_is_system_copyable, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Добавляем тег во все задачи протокола
    INSERT INTO public.task_tags (task_id, tag_id)
    SELECT t.id, _tag_id
    FROM public.tasks t
    WHERE t.group_id = _gid
    ON CONFLICT DO NOTHING;
  ELSE
    -- Удаляем тег из всех задач протокола
    DELETE FROM public.task_tags tt
    USING public.tasks t
    WHERE tt.task_id = t.id
      AND t.group_id = _gid
      AND tt.tag_id = _tag_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS group_tags_sync_protocol_tasks ON public.group_tags;
CREATE TRIGGER group_tags_sync_protocol_tasks
AFTER INSERT OR DELETE ON public.group_tags
FOR EACH ROW EXECUTE FUNCTION public.trg_group_tags_sync_protocol_tasks();

-- Бэкфил: копируем системные теги существующих протоколов в задачи
INSERT INTO public.task_tags (task_id, tag_id)
SELECT DISTINCT t.id, gt.tag_id
FROM public.tasks t
JOIN public.task_groups tg ON tg.id = t.group_id AND tg.project_type = 'protocol'
JOIN public.group_tags gt ON gt.group_id = tg.id
JOIN public.tags tag ON tag.id = gt.tag_id
JOIN public.tag_categories tc ON tc.id = tag.category_id
WHERE tc.is_system = true
  AND tc.system_key IN ('clients','brand','product_category','site','territory','event_topic')
ON CONFLICT DO NOTHING;
