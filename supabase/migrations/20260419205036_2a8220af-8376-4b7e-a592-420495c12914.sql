-- 1. Update seed function to also create "Контрагенты" system category
CREATE OR REPLACE FUNCTION public.seed_system_tag_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, position)
  VALUES
    (_user_id, 'Клиенты', true, 'clients', '🏪', 0),
    (_user_id, 'Территория', true, 'territory', '🌍', 1),
    (_user_id, 'Площадка', true, 'site', '🏭', 2),
    (_user_id, 'Бренды', true, 'brand', '🏷️', 3),
    (_user_id, 'Категория продукта', true, 'product_category', '📦', 4),
    (_user_id, 'Состояние продукта', true, 'product_state', '❄️', 5),
    (_user_id, 'Отделы', true, 'department', '👥', 6),
    (_user_id, 'События / Темы', true, 'event_topic', '📅', 7),
    (_user_id, 'СТМ', true, 'stm', '⭐', 8),
    (_user_id, 'Контрагенты', true, 'contractors', '🤝', 9)
  ON CONFLICT DO NOTHING;
END;
$$;

-- 2. Backfill "Контрагенты" for existing users that don't have it yet
INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, position)
SELECT DISTINCT tc.user_id, 'Контрагенты', true, 'contractors', '🤝', 9
FROM public.tag_categories tc
WHERE tc.is_system = true
  AND NOT EXISTS (
    SELECT 1 FROM public.tag_categories tc2
    WHERE tc2.user_id = tc.user_id AND tc2.system_key = 'contractors'
  );