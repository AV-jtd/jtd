
-- Добавляем системный шаблон "Живой документ" (living) к функции seed
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

  -- Живой документ
  INSERT INTO public.protocol_templates (user_id, name, description, icon, is_system, system_key, required_axes, optional_axes, default_columns, position)
  VALUES (
    _user_id,
    'Живой документ',
    'Протокол как living-документ: задачи разворачиваются в полноценные карточки с чатом, шагами и тегами. Темы группируются автоматически.',
    '📖',
    true,
    'living',
    ARRAY[]::text[],
    ARRAY['event_topic','site','product_category','brand','clients','department']::text[],
    '[
      {"key":"num","label":"№","type":"number"},
      {"key":"title","label":"Что обсудили / о чём договорились","type":"text","required":true},
      {"key":"topic","label":"Тема","type":"project"},
      {"key":"assignee","label":"Ответственный","type":"user"},
      {"key":"deadline","label":"Срок","type":"date"},
      {"key":"status","label":"Статус","type":"status"}
    ]'::jsonb,
    4
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;

  -- Пустой (передвигаем в конец, position=5)
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
    5
  )
  ON CONFLICT (user_id, system_key) DO NOTHING;
END;
$$;

-- Сидим всех существующих пользователей (новый шаблон 'living' добавится тем, у кого его ещё нет)
DO $$
DECLARE
  u_id uuid;
BEGIN
  FOR u_id IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_protocol_templates(u_id);
  END LOOP;
END;
$$;
