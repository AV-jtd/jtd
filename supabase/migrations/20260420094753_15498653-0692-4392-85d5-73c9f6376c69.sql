-- 1. Отключаем триггер защиты системных категорий
ALTER TABLE public.tag_categories DISABLE TRIGGER trg_protect_system_tag_categories;

-- 2. Создаём недостающие глобальные системные категории
DO $$
DECLARE
  _sys_user uuid;
BEGIN
  SELECT user_id INTO _sys_user FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF _sys_user IS NULL THEN
    SELECT id INTO _sys_user FROM public.profiles ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position) VALUES
    (_sys_user, 'Гейты NPD',       true, 'npd_gates',       '🎯', '#8b5cf6', 100),
    (_sys_user, 'Стримы NPD',      true, 'npd_streams',     '🌊', '#0ea5e9', 101),
    (_sys_user, 'Этапы CRM',       true, 'crm_stages',      '🛒', '#ef4444', 102),
    (_sys_user, 'Ранг клиента',    true, 'crm_rank',        '⭐', '#f59e0b', 103),
    (_sys_user, 'Тип ретейла',     true, 'crm_retail_type', '🏬', '#10b981', 104)
  ON CONFLICT DO NOTHING;
END $$;

-- 3. Универсальная процедура: для каждой пары (имя пользовательской категории → system_key)
--    схлопываем все одноимённые теги в один канонический и переносим его в глобальную системную категорию.
DO $$
DECLARE
  _mapping record;
  _canonical_cat_id uuid;
  _tag_name_group record;
  _canonical_tag uuid;
  _dup_id uuid;
BEGIN
  -- Маппинг «зонтичных» пользовательских категорий → глобальные system_key
  FOR _mapping IN
    SELECT * FROM (VALUES
      ('Гейты',           'npd_gates'),
      ('Стримы',          'npd_streams'),
      ('Этапы',           'crm_stages'),
      ('Этапы CRM',       'crm_stages'),
      ('Статусы / Этапы', 'crm_stages'),
      ('Территория',      'territory'),
      ('Территории',      'territory'),
      ('Клиенты',         'clients'),
      ('Бренды',          'brand'),
      ('Бренд',           'brand'),
      ('Площадка',        'site'),
      ('Площадки',        'site')
    ) AS t(cat_name, sys_key)
  LOOP
    SELECT id INTO _canonical_cat_id
    FROM public.tag_categories
    WHERE system_key = _mapping.sys_key AND is_system = true
    LIMIT 1;
    CONTINUE WHEN _canonical_cat_id IS NULL;

    -- Группируем все теги (по имени) во ВСЕХ одноимённых не-канонических категориях
    FOR _tag_name_group IN
      SELECT lower(t.name) AS lname
      FROM public.tags t
      JOIN public.tag_categories c ON c.id = t.category_id
      WHERE lower(c.name) = lower(_mapping.cat_name)
        AND c.id != _canonical_cat_id
      GROUP BY lower(t.name)
    LOOP
      -- Канонический = самый старый существующий тег с этим именем
      -- (приоритет — уже находящимся в канонической категории)
      SELECT t.id INTO _canonical_tag
      FROM public.tags t
      WHERE lower(t.name) = _tag_name_group.lname
        AND (
          t.category_id = _canonical_cat_id
          OR EXISTS (
            SELECT 1 FROM public.tag_categories c
            WHERE c.id = t.category_id AND lower(c.name) = lower(_mapping.cat_name)
          )
        )
      ORDER BY (t.category_id = _canonical_cat_id) DESC, t.created_at ASC
      LIMIT 1;

      -- Переносим канонический в системную категорию (если ещё не там)
      UPDATE public.tags
      SET category_id = _canonical_cat_id
      WHERE id = _canonical_tag AND category_id IS DISTINCT FROM _canonical_cat_id;

      -- Схлопываем все остальные одноимённые в _canonical_tag
      FOR _dup_id IN
        SELECT t.id
        FROM public.tags t
        WHERE lower(t.name) = _tag_name_group.lname
          AND t.id != _canonical_tag
          AND (
            EXISTS (
              SELECT 1 FROM public.tag_categories c
              WHERE c.id = t.category_id AND lower(c.name) = lower(_mapping.cat_name)
            )
            OR t.category_id = _canonical_cat_id
          )
      LOOP
        UPDATE public.task_tags SET tag_id = _canonical_tag
          WHERE tag_id = _dup_id
          AND NOT EXISTS (SELECT 1 FROM public.task_tags x WHERE x.task_id = task_tags.task_id AND x.tag_id = _canonical_tag);
        DELETE FROM public.task_tags WHERE tag_id = _dup_id;

        UPDATE public.group_tags SET tag_id = _canonical_tag
          WHERE tag_id = _dup_id
          AND NOT EXISTS (SELECT 1 FROM public.group_tags x WHERE x.group_id = group_tags.group_id AND x.tag_id = _canonical_tag);
        DELETE FROM public.group_tags WHERE tag_id = _dup_id;

        UPDATE public.tag_access SET tag_id = _canonical_tag
          WHERE tag_id = _dup_id
          AND NOT EXISTS (SELECT 1 FROM public.tag_access x WHERE x.user_id = tag_access.user_id AND x.tag_id = _canonical_tag);
        DELETE FROM public.tag_access WHERE tag_id = _dup_id;

        UPDATE public.clients SET tag_id            = _canonical_tag WHERE tag_id            = _dup_id;
        UPDATE public.clients SET territory_tag_id  = _canonical_tag WHERE territory_tag_id  = _dup_id;
        UPDATE public.clients SET retail_type_tag_id= _canonical_tag WHERE retail_type_tag_id= _dup_id;
        UPDATE public.clients SET rank_tag_id       = _canonical_tag WHERE rank_tag_id       = _dup_id;
        UPDATE public.task_groups SET linked_tag_id = _canonical_tag WHERE linked_tag_id     = _dup_id;

        DELETE FROM public.tags WHERE id = _dup_id;
      END LOOP;
    END LOOP;

    -- Все теги перенесены — пустые НЕ-системные одноимённые категории удаляем
    DELETE FROM public.tag_categories
    WHERE lower(name) = lower(_mapping.cat_name)
      AND is_system = false
      AND id != _canonical_cat_id
      AND NOT EXISTS (SELECT 1 FROM public.tags WHERE category_id = tag_categories.id);
  END LOOP;
END $$;

-- 4. Внутри уже-канонических глобальных системных категорий доглопываем
--    случайные дубли тегов по lower(name)
DO $$
DECLARE
  _cat record;
  _grp record;
  _canonical uuid;
  _dup_id uuid;
BEGIN
  FOR _cat IN
    SELECT id FROM public.tag_categories WHERE is_system = true
  LOOP
    FOR _grp IN
      SELECT lower(name) AS lname
      FROM public.tags
      WHERE category_id = _cat.id
      GROUP BY lower(name)
      HAVING COUNT(*) > 1
    LOOP
      SELECT id INTO _canonical
      FROM public.tags
      WHERE category_id = _cat.id AND lower(name) = _grp.lname
      ORDER BY created_at ASC
      LIMIT 1;

      FOR _dup_id IN
        SELECT id FROM public.tags
        WHERE category_id = _cat.id AND lower(name) = _grp.lname AND id != _canonical
      LOOP
        UPDATE public.task_tags SET tag_id = _canonical
          WHERE tag_id = _dup_id
          AND NOT EXISTS (SELECT 1 FROM public.task_tags x WHERE x.task_id = task_tags.task_id AND x.tag_id = _canonical);
        DELETE FROM public.task_tags WHERE tag_id = _dup_id;

        UPDATE public.group_tags SET tag_id = _canonical
          WHERE tag_id = _dup_id
          AND NOT EXISTS (SELECT 1 FROM public.group_tags x WHERE x.group_id = group_tags.group_id AND x.tag_id = _canonical);
        DELETE FROM public.group_tags WHERE tag_id = _dup_id;

        UPDATE public.tag_access SET tag_id = _canonical
          WHERE tag_id = _dup_id
          AND NOT EXISTS (SELECT 1 FROM public.tag_access x WHERE x.user_id = tag_access.user_id AND x.tag_id = _canonical);
        DELETE FROM public.tag_access WHERE tag_id = _dup_id;

        UPDATE public.clients SET tag_id            = _canonical WHERE tag_id            = _dup_id;
        UPDATE public.clients SET territory_tag_id  = _canonical WHERE territory_tag_id  = _dup_id;
        UPDATE public.clients SET retail_type_tag_id= _canonical WHERE retail_type_tag_id= _dup_id;
        UPDATE public.clients SET rank_tag_id       = _canonical WHERE rank_tag_id       = _dup_id;
        UPDATE public.task_groups SET linked_tag_id = _canonical WHERE linked_tag_id     = _dup_id;

        DELETE FROM public.tags WHERE id = _dup_id;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- 5. Включаем триггер защиты обратно
ALTER TABLE public.tag_categories ENABLE TRIGGER trg_protect_system_tag_categories;

-- 6. Обновлённый сидер: знает про новые глобальные ключи и не создаёт копий
CREATE OR REPLACE FUNCTION public.seed_system_tag_categories(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  existing_id uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('clients',          'Клиенты',           '🏢', '#3b82f6', 10),
      ('territory',        'Территория',        '📍', '#10b981', 11),
      ('site',             'Площадка',          '🏪', '#8b5cf6', 12),
      ('brand',            'Бренды',            '🏷️', '#ef4444', 13),
      ('product_category', 'Категории продукта','📦', '#f59e0b', 14),
      ('product_state',    'Состояние продукта','🔄', '#06b6d4', 15),
      ('department',       'Отделы',            '👥', '#64748b', 16),
      ('event_topic',      'События / Темы',    '📅', '#a855f7', 17),
      ('stm',              'СТМ',               '🏷️', '#ec4899', 18),
      ('contractors',      'Контрагенты',       '🤝', '#0ea5e9', 19),
      ('npd_gates',        'Гейты NPD',         '🎯', '#8b5cf6', 100),
      ('npd_streams',      'Стримы NPD',        '🌊', '#0ea5e9', 101),
      ('crm_stages',       'Этапы CRM',         '🛒', '#ef4444', 102),
      ('crm_rank',         'Ранг клиента',      '⭐', '#f59e0b', 103),
      ('crm_retail_type',  'Тип ретейла',       '🏬', '#10b981', 104)
    ) AS t(sys_key, cat_name, ico, col, pos)
  LOOP
    SELECT id INTO existing_id FROM public.tag_categories
    WHERE system_key = rec.sys_key AND is_system = true LIMIT 1;
    IF existing_id IS NULL THEN
      INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position)
      VALUES (_user_id, rec.cat_name, true, rec.sys_key, rec.ico, rec.col, rec.pos)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$function$;