-- Переименовать существующие категории "Площадка / БЕ" → "Площадка"
UPDATE public.tag_categories
SET name = 'Площадка'
WHERE system_key = 'site' AND name = 'Площадка / БЕ';

-- Обновить seed-функцию для новых пользователей
CREATE OR REPLACE FUNCTION public.seed_system_tag_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tag_categories (user_id, name, system_key, is_system, color, icon, position)
  VALUES
    (_user_id, 'Клиенты', 'clients', true, '#ef4444', '🏪', 100),
    (_user_id, 'Территория', 'territory', true, '#f97316', '🌍', 101),
    (_user_id, 'Площадка', 'site', true, '#8b5cf6', '🏭', 102),
    (_user_id, 'Бренды', 'brand', true, '#ec4899', '🏷️', 103),
    (_user_id, 'Категории продукта', 'product_category', true, '#06b6d4', '📦', 104),
    (_user_id, 'Состояние продукта', 'product_state', true, '#3b82f6', '❄️', 105),
    (_user_id, 'Отделы', 'department', true, '#10b981', '👥', 106),
    (_user_id, 'События / Темы', 'event_topic', true, '#f59e0b', '📅', 107),
    (_user_id, 'СТМ', 'stm', true, '#6b7280', '⭐', 108)
  ON CONFLICT (user_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;
END;
$$;