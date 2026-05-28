
CREATE OR REPLACE FUNCTION public.create_default_kanban_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kanban_columns (board_id, name, color, position, mapping_json) VALUES
    (NEW.id, 'Входящие',   '#94A3B8', 0, NULL),
    (NEW.id, 'В работе',   '#3B82F6', 1, NULL),
    (NEW.id, 'На проверке','#F59E0B', 2, NULL),
    (NEW.id, 'Готово',     '#10B981', 3, jsonb_build_object('is_completed', true));
  RETURN NEW;
END;
$$;
