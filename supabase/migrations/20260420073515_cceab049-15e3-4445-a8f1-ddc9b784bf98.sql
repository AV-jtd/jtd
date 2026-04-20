-- Отключаем защитный триггер на время миграции
ALTER TABLE public.tag_categories DISABLE TRIGGER trg_protect_system_tag_categories;

-- 1) Канонические категории
CREATE TEMP TABLE _canon_cats AS
SELECT DISTINCT ON (system_key) id AS canon_id, system_key
FROM public.tag_categories
WHERE is_system = true AND system_key IS NOT NULL
ORDER BY system_key, created_at ASC, id ASC;

CREATE TEMP TABLE _cat_remap AS
SELECT c.id AS old_id, cc.canon_id AS new_id
FROM public.tag_categories c
JOIN _canon_cats cc ON cc.system_key = c.system_key
WHERE c.is_system = true AND c.system_key IS NOT NULL AND c.id <> cc.canon_id;

UPDATE public.tag_categories tc
SET parent_id = m.new_id
FROM _cat_remap m
WHERE tc.parent_id = m.old_id;

UPDATE public.tags t
SET category_id = m.new_id
FROM _cat_remap m
WHERE t.category_id = m.old_id;

CREATE TEMP TABLE _canon_tags AS
SELECT DISTINCT ON (category_id, lower(name)) id AS canon_id, category_id, lower(name) AS lname
FROM public.tags
WHERE category_id IN (SELECT canon_id FROM _canon_cats)
ORDER BY category_id, lower(name), created_at ASC, id ASC;

CREATE TEMP TABLE _tag_remap AS
SELECT t.id AS old_id, ct.canon_id AS new_id
FROM public.tags t
JOIN _canon_tags ct ON ct.category_id = t.category_id AND ct.lname = lower(t.name)
WHERE t.category_id IN (SELECT canon_id FROM _canon_cats)
  AND t.id <> ct.canon_id;

-- task_tags
INSERT INTO public.task_tags (task_id, tag_id)
SELECT DISTINCT tt.task_id, m.new_id
FROM public.task_tags tt
JOIN _tag_remap m ON m.old_id = tt.tag_id
ON CONFLICT DO NOTHING;
DELETE FROM public.task_tags WHERE tag_id IN (SELECT old_id FROM _tag_remap);

-- group_tags
INSERT INTO public.group_tags (group_id, tag_id)
SELECT DISTINCT gt.group_id, m.new_id
FROM public.group_tags gt
JOIN _tag_remap m ON m.old_id = gt.tag_id
ON CONFLICT DO NOTHING;
DELETE FROM public.group_tags WHERE tag_id IN (SELECT old_id FROM _tag_remap);

-- tag_access
INSERT INTO public.tag_access (tag_id, user_id, granted_by)
SELECT DISTINCT ON (m.new_id, ta.user_id) m.new_id, ta.user_id, ta.granted_by
FROM public.tag_access ta
JOIN _tag_remap m ON m.old_id = ta.tag_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.tag_access ta2
  WHERE ta2.tag_id = m.new_id AND ta2.user_id = ta.user_id
);
DELETE FROM public.tag_access WHERE tag_id IN (SELECT old_id FROM _tag_remap);

-- clients
UPDATE public.clients c SET tag_id = m.new_id FROM _tag_remap m WHERE c.tag_id = m.old_id;
UPDATE public.clients c SET rank_tag_id = m.new_id FROM _tag_remap m WHERE c.rank_tag_id = m.old_id;
UPDATE public.clients c SET territory_tag_id = m.new_id FROM _tag_remap m WHERE c.territory_tag_id = m.old_id;
UPDATE public.clients c SET retail_type_tag_id = m.new_id FROM _tag_remap m WHERE c.retail_type_tag_id = m.old_id;

-- task_groups
UPDATE public.task_groups tg SET linked_tag_id = m.new_id FROM _tag_remap m WHERE tg.linked_tag_id = m.old_id;

-- удалить дубликаты
DELETE FROM public.tags WHERE id IN (SELECT old_id FROM _tag_remap);
DELETE FROM public.tag_categories WHERE id IN (SELECT old_id FROM _cat_remap);

-- Включаем триггер обратно
ALTER TABLE public.tag_categories ENABLE TRIGGER trg_protect_system_tag_categories;

-- Уникальные индексы
CREATE UNIQUE INDEX IF NOT EXISTS tag_categories_system_key_uniq
  ON public.tag_categories (system_key)
  WHERE is_system = true AND system_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tags_system_category_name_uniq
  ON public.tags (category_id, lower(name));

-- Переписать seed-функции
CREATE OR REPLACE FUNCTION public.seed_protocol_status_for_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM public.tag_categories
  WHERE is_system = true AND system_key = 'protocol_status' LIMIT 1;

  IF cat_id IS NULL THEN
    INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position)
    VALUES (_user_id, 'Статус протокола', true, 'protocol_status', '📋', '#6366f1', 0)
    RETURNING id INTO cat_id;

    INSERT INTO public.tags (user_id, name, color, category_id) VALUES
      (_user_id, '🆕 Новая',       '#3b82f6', cat_id),
      (_user_id, '📤 Отправлена',  '#8b5cf6', cat_id),
      (_user_id, '⏳ Ждём ответ',  '#eab308', cat_id),
      (_user_id, '✅ Выполнена',   '#22c55e', cat_id),
      (_user_id, '🏁 Закрыта',     '#64748b', cat_id),
      (_user_id, '❌ Отменена',    '#ef4444', cat_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_system_tag_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  existing_id uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('clients',          'Клиенты',          '🏢', '#3b82f6', 10),
      ('territory',        'Территория',       '🗺️', '#10b981', 20),
      ('site',             'Площадка',         '🏭', '#f59e0b', 30),
      ('brand',            'Бренд',            '🏷️', '#8b5cf6', 40),
      ('product_category', 'Категория продукта','📦', '#ec4899', 50),
      ('product_state',    'Состояние продукта','🧪', '#06b6d4', 60),
      ('department',       'Отдел',            '👥', '#84cc16', 70),
      ('event_topic',      'Тема встречи',     '💬', '#f97316', 80),
      ('stm',              'СТМ',              '🔖', '#a855f7', 90),
      ('contractors',      'Подрядчики',       '🤝', '#14b8a6', 100)
    ) AS t(skey, sname, sicon, scolor, spos)
  LOOP
    SELECT id INTO existing_id FROM public.tag_categories
    WHERE is_system = true AND system_key = rec.skey LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position)
      VALUES (_user_id, rec.sname, true, rec.skey, rec.sicon, rec.scolor, rec.spos);
    END IF;
  END LOOP;

  PERFORM public.seed_protocol_status_for_user(_user_id);
END;
$$;