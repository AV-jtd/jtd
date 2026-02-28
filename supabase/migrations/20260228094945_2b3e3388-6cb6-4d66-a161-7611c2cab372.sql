
-- 1. Backfill default tag categories for all existing users who don't have them yet
DO $$
DECLARE
  _uid uuid;
  _cat_crm uuid;
  _cat_marketing uuid;
  _cat_npd uuid;
  _cat_projects uuid;
  _cat_other uuid;
BEGIN
  FOR _uid IN 
    SELECT id FROM public.profiles 
    WHERE id NOT IN (SELECT DISTINCT user_id FROM public.tag_categories)
  LOOP
    INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
      (gen_random_uuid(), 'CRM / Продажи', 0, _uid, '#ef4444') RETURNING id INTO _cat_crm;
    INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
      ('Клиенты', 0, _uid, '#ef4444', _cat_crm),
      ('Территории', 1, _uid, '#ef4444', _cat_crm),
      ('Статусы / Этапы', 2, _uid, '#ef4444', _cat_crm),
      ('Проекты', 3, _uid, '#ef4444', _cat_crm);

    INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
      (gen_random_uuid(), 'Маркетинг', 1, _uid, '#f59e0b') RETURNING id INTO _cat_marketing;
    INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
      ('ФЗ', 0, _uid, '#f59e0b', _cat_marketing),
      ('АА', 1, _uid, '#f59e0b', _cat_marketing),
      ('КМ', 2, _uid, '#f59e0b', _cat_marketing),
      ('ФС', 3, _uid, '#f59e0b', _cat_marketing),
      ('Проекты', 4, _uid, '#f59e0b', _cat_marketing);

    INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
      (gen_random_uuid(), 'NPD', 2, _uid, '#8b5cf6') RETURNING id INTO _cat_npd;
    INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
      ('ФЗ', 0, _uid, '#8b5cf6', _cat_npd),
      ('АА', 1, _uid, '#8b5cf6', _cat_npd),
      ('КМ', 2, _uid, '#8b5cf6', _cat_npd),
      ('Этапы', 3, _uid, '#8b5cf6', _cat_npd);

    INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
      (gen_random_uuid(), 'Проекты', 3, _uid, '#3b82f6') RETURNING id INTO _cat_projects;

    INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
      (gen_random_uuid(), 'Другое', 4, _uid, '#6b7280') RETURNING id INTO _cat_other;

    -- Assign existing project-linked tags to the "Проекты" root folder
    UPDATE public.tags SET category_id = _cat_projects
    WHERE user_id = _uid 
      AND id IN (SELECT linked_tag_id FROM public.task_groups WHERE user_id = _uid AND linked_tag_id IS NOT NULL)
      AND category_id IS NULL;
  END LOOP;
END $$;

-- 2. For existing users who ALREADY have categories, just assign project tags to their "Проекты" root folder
UPDATE public.tags t SET category_id = (
  SELECT tc.id FROM public.tag_categories tc 
  WHERE tc.user_id = t.user_id AND tc.name = 'Проекты' AND tc.parent_id IS NULL
  LIMIT 1
)
WHERE t.category_id IS NULL
  AND t.id IN (SELECT linked_tag_id FROM public.task_groups WHERE linked_tag_id IS NOT NULL);

-- 3. Create trigger to auto-assign project tags to "Проекты" folder on task_groups insert
CREATE OR REPLACE FUNCTION public.auto_assign_project_tag_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cat_id uuid;
BEGIN
  IF NEW.linked_tag_id IS NOT NULL THEN
    SELECT id INTO _cat_id FROM public.tag_categories
    WHERE user_id = NEW.user_id AND name = 'Проекты' AND parent_id IS NULL
    LIMIT 1;
    
    IF _cat_id IS NOT NULL THEN
      UPDATE public.tags SET category_id = _cat_id WHERE id = NEW.linked_tag_id AND category_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_assign_project_tag_category_trigger
AFTER INSERT ON public.task_groups
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_project_tag_category();
