-- Триггер: автозаполнение source_protocol_id, если задача создаётся внутри протокола
CREATE OR REPLACE FUNCTION public.auto_set_source_protocol()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Только если source_protocol_id ещё не задан и есть group_id
  IF NEW.source_protocol_id IS NULL AND NEW.group_id IS NOT NULL THEN
    -- Проверяем, является ли группа протоколом
    IF EXISTS (
      SELECT 1 FROM public.task_groups
      WHERE id = NEW.group_id AND project_type = 'protocol'
    ) THEN
      NEW.source_protocol_id := NEW.group_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_source_protocol ON public.tasks;
CREATE TRIGGER trg_auto_set_source_protocol
  BEFORE INSERT OR UPDATE OF group_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_source_protocol();

-- Бэкфилл существующих задач из протоколов
UPDATE public.tasks t
SET source_protocol_id = t.group_id
FROM public.task_groups g
WHERE t.group_id = g.id
  AND g.project_type = 'protocol'
  AND t.source_protocol_id IS NULL;