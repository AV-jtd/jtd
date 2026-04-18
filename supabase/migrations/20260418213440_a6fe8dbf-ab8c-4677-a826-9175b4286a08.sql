-- ============================================
-- БЛОК A: Системные оси (категории тегов)
-- ============================================
ALTER TABLE public.tag_categories
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_key text,
  ADD COLUMN IF NOT EXISTS icon text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_categories_user_system_key
  ON public.tag_categories(user_id, system_key)
  WHERE system_key IS NOT NULL;

-- Защита от удаления системных категорий (только системой)
CREATE OR REPLACE FUNCTION public.protect_system_tag_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'Системные категории тегов нельзя удалять';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.is_system = false THEN
    RAISE EXCEPTION 'Нельзя снять флаг is_system с системной категории';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.system_key IS DISTINCT FROM NEW.system_key AND OLD.system_key IS NOT NULL THEN
    RAISE EXCEPTION 'Нельзя менять system_key системной категории';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_system_tag_categories ON public.tag_categories;
CREATE TRIGGER trg_protect_system_tag_categories
  BEFORE UPDATE OR DELETE ON public.tag_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_system_tag_categories();

-- ============================================
-- Сидер системных категорий для пользователя
-- ============================================
CREATE OR REPLACE FUNCTION public.seed_system_tag_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 9 системных осей контекстной модели
  INSERT INTO public.tag_categories (user_id, name, system_key, is_system, color, icon, position)
  VALUES
    (_user_id, 'Клиенты', 'clients', true, '#ef4444', '🏪', 100),
    (_user_id, 'Территория', 'territory', true, '#f97316', '🌍', 101),
    (_user_id, 'Площадка / БЕ', 'site', true, '#8b5cf6', '🏭', 102),
    (_user_id, 'Бренды', 'brand', true, '#ec4899', '🏷️', 103),
    (_user_id, 'Категории продукта', 'product_category', true, '#06b6d4', '📦', 104),
    (_user_id, 'Состояние продукта', 'product_state', true, '#3b82f6', '❄️', 105),
    (_user_id, 'Отделы', 'department', true, '#10b981', '👥', 106),
    (_user_id, 'События / Темы', 'event_topic', true, '#f59e0b', '📅', 107),
    (_user_id, 'СТМ', 'stm', true, '#6b7280', '⭐', 108)
  ON CONFLICT (user_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;
END;
$$;

-- Сидим всем существующим пользователям
DO $$
DECLARE _u uuid;
BEGIN
  FOR _u IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_system_tag_categories(_u);
  END LOOP;
END $$;

-- Хук в seed_onboarding_data — для новых пользователей
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, telegram_username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(TRIM(BOTH FROM LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'telegram_username', ''), '@', ''))), '')
  );

  PERFORM public.seed_onboarding_data(NEW.id);
  PERFORM public.seed_system_tag_categories(NEW.id);

  RETURN NEW;
END;
$$;

-- ============================================
-- БЛОК B: Связь "протокол ↔ задача ↔ проект"
-- ============================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_protocol_id uuid REFERENCES public.task_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_protocol_id
  ON public.tasks(source_protocol_id)
  WHERE source_protocol_id IS NOT NULL;

-- Валидация: source_protocol_id должен указывать на протокол
CREATE OR REPLACE FUNCTION public.validate_source_protocol()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE _ptype text;
BEGIN
  IF NEW.source_protocol_id IS NOT NULL THEN
    SELECT project_type INTO _ptype FROM public.task_groups WHERE id = NEW.source_protocol_id;
    IF _ptype IS DISTINCT FROM 'protocol' THEN
      RAISE EXCEPTION 'source_protocol_id должен указывать на проект с project_type = protocol';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_source_protocol ON public.tasks;
CREATE TRIGGER trg_validate_source_protocol
  BEFORE INSERT OR UPDATE OF source_protocol_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_source_protocol();