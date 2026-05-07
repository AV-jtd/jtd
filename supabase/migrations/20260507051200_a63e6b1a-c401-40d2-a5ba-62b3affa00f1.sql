CREATE OR REPLACE FUNCTION public.validate_task_group_view_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.view_mode = 'lens' THEN
    IF NEW.project_type IN ('npd', 'crm', 'stm', 'protocol') THEN
      RAISE EXCEPTION 'Проекты типа % не могут быть линзой', NEW.project_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- linked_tag_id больше не обязателен: теги хранятся в task_group_linked_tags (m:n).
    -- Пустая линза допустима — она просто не покажет задач, пока не привяжут тег.
  END IF;
  RETURN NEW;
END;
$$;