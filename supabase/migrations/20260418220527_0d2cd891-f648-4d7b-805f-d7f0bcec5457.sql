
-- 1. Таблица шаблонов протоколов
CREATE TABLE public.protocol_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  icon text DEFAULT '📋',
  is_system boolean NOT NULL DEFAULT false,
  system_key text,
  -- Обязательные оси тегов (массив system_key из tag_categories)
  required_axes text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Опциональные оси тегов
  optional_axes text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Колонки таблицы поручений (JSON: [{key, label, type, required}])
  default_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT protocol_templates_system_key_unique UNIQUE (user_id, system_key)
);

-- 2. RLS
ALTER TABLE public.protocol_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own protocol templates"
ON public.protocol_templates
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Триггер защиты системных шаблонов от удаления
CREATE OR REPLACE FUNCTION public.protect_system_protocol_templates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.is_system = true) THEN
    RAISE EXCEPTION 'Системные шаблоны протоколов нельзя удалить';
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.is_system = true AND NEW.system_key IS DISTINCT FROM OLD.system_key) THEN
    RAISE EXCEPTION 'Нельзя изменить system_key системного шаблона';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER protect_system_protocol_templates_trg
BEFORE UPDATE OR DELETE ON public.protocol_templates
FOR EACH ROW
EXECUTE FUNCTION public.protect_system_protocol_templates();

-- 4. Триггер обновления updated_at
CREATE TRIGGER protocol_templates_set_updated_at
BEFORE UPDATE ON public.protocol_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Сидер 4 системных шаблонов
CREATE OR REPLACE FUNCTION public.seed_protocol_templates(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Кросс-функциональный
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Кросс-функциональный',
    'Регулярная встреча команд по продукту/проекту',
    '🔀',
    true,
    'cross_functional',
    ARRAY['site', 'product_category']::text[],
    ARRAY['brand', 'department', 'event_topic']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Поручение","type":"text","required":true},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"},
      {"key":"comment","label":"Комментарий","type":"text"}
    ]'::jsonb,
    1
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Переговоры с клиентом
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Переговоры с клиентом',
    'Встреча с торговой сетью / контрагентом. КП, обязательства, цены.',
    '🤝',
    true,
    'client_negotiation',
    ARRAY['clients', 'territory']::text[],
    ARRAY['brand', 'site', 'stm', 'product_category']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Продукт / Тема","type":"text","required":true},
      {"key":"commitment","label":"Обязательство","type":"text"},
      {"key":"price","label":"Цена / Параметры","type":"text"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"},
      {"key":"comment","label":"Комментарий","type":"text"}
    ]'::jsonb,
    2
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Гейт NPD
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Гейт NPD',
    'Стандартная встреча Stage-Gate (G0–G5) по NPD-проекту',
    '🎯',
    true,
    'npd_gate',
    ARRAY['site', 'product_category']::text[],
    ARRAY['brand', 'event_topic', 'department']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Поручение","type":"text","required":true},
      {"key":"gate","label":"Гейт","type":"text"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Решение","type":"status"},
      {"key":"comment","label":"Комментарий","type":"text"}
    ]'::jsonb,
    3
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Пустой
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Пустой',
    'Свободная встреча. Назначайте проект, ответственного и оси на лету.',
    '📋',
    true,
    'blank',
    ARRAY[]::text[],
    ARRAY['site','product_category','brand','clients','territory','department','event_topic','stm','product_state']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Задача","type":"text","required":true},
      {"key":"project","label":"Проект / Тема","type":"project"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"}
    ]'::jsonb,
    4
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;
END;
$$;

-- 6. Сидим существующих пользователей
DO $$
DECLARE
  u_id uuid;
BEGIN
  FOR u_id IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_protocol_templates(u_id);
  END LOOP;
END;
$$;

-- 7. Подключаем сидер к handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_onboarding_data(NEW.id);
  PERFORM public.seed_system_tag_categories(NEW.id);
  PERFORM public.seed_protocol_templates(NEW.id);

  RETURN NEW;
END;
$$;

-- Индекс для быстрого поиска
CREATE INDEX idx_protocol_templates_user_id ON public.protocol_templates(user_id);
CREATE INDEX idx_protocol_templates_system_key ON public.protocol_templates(system_key) WHERE is_system = true;
